-- 0021: el informe semanal sale el domingo a la tarde (cuando ya se tomó la asistencia) e incluye
-- finanzas para quien tiene acceso; e informes escritos (mensuales y anuales, con consejos) guardados
-- para verlos en la app.

create or replace function public.finance_level_of(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.role::text = 'admin' or p.finance_role = 'manager' then 4
      when p.finance_role = 'treasurer' then 3
      when p.finance_role = 'secretary' then 2
      when p.finance_role = 'viewer' then 1
      when p.finance_role = 'none' then 0
      when p.role::text = 'secretary' then 2
      else 0 end
    from public.profiles p where p.id = p_user), 0)
$$;
revoke all on function public.finance_level_of(uuid) from public, anon, authenticated;

-- Resumen de finanzas de un período (para el aviso semanal y los informes).
create or replace function public.fin_period(p_church uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'income', coalesce(sum(amount) filter (where kind = 'income'), 0),
    'expense', coalesce(sum(amount) filter (where kind = 'expense'), 0),
    'entries', count(*),
    'missing_receipts', count(*) filter (where kind <> 'transfer' and method <> 'cash'
                                           and not exists (select 1 from public.fin_attachments a where a.entry_id = e.id)),
    'funds', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.name, 'balance',
        f.opening_balance + coalesce((select sum(case when x.kind = 'income' and x.fund_id = f.id then x.amount
                                                      when x.kind in ('expense', 'transfer') and x.fund_id = f.id then -x.amount
                                                      when x.kind = 'transfer' and x.to_fund_id = f.id then x.amount else 0 end)
                                     from public.fin_entries x where x.church_id = p_church and x.voided_at is null and x.on_date <= p_to
                                       and (x.fund_id = f.id or x.to_fund_id = f.id)), 0)) order by f.sort_order)
      from public.fin_funds f where f.church_id = p_church and f.active), '[]'::jsonb)
  )
  from public.fin_entries e
  where e.church_id = p_church and e.voided_at is null and e.on_date between p_from and p_to
$$;
revoke all on function public.fin_period(uuid, date, date) from public, anon, authenticated;

-- Domingo desde las 14: sale apenas hay asistencia del domingo cargada; si nadie la cargó, sale a las 20 igual.
-- Cubre de lunes a domingo (la semana que termina hoy).
create or replace function public.run_weekly_report(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare r jsonb; f jsonb; v_to uuid; n integer := 0; v_cls text; v_body text; v_fin text; v_day date := p_local::date;
begin
  if extract(dow from p_local)::int <> 0 or extract(hour from p_local)::int < 14 then return 0; end if;
  if extract(hour from p_local)::int < 20 and not exists (
       select 1 from public.attendances a join public.church_services s on s.id = a.service_id
       where a.church_id = p_church and a.attended_on = v_day and s.dow = 0) then
    return 0;
  end if;
  if not public.job_once(p_church, 'weekly_report', v_day::text) then return 0; end if;
  r := public.weekly_report(p_church, v_day + 1);
  f := public.fin_period(p_church, v_day - 6, v_day);
  select string_agg((x->>'name') || ' ' || (x->>'present'), ', ') into v_cls from jsonb_array_elements(r->'classes') x where (x->>'days')::int > 0;
  v_body := (r->>'attendance') || ' asistencias · ' || (r->>'first_time') || ' por primera vez · '
    || (r->>'outings') || ' salidas · ' || (r->>'houses') || ' casas · ' || (r->>'contacts') || ' contactos · ' || (r->>'gospel') || ' con el evangelio'
    || coalesce(' · Clases: ' || v_cls, '');
  v_fin := ' · Finanzas: entró $' || to_char((f->>'income')::numeric, 'FM999G999G999') || ', salió $' || to_char((f->>'expense')::numeric, 'FM999G999G999')
    || coalesce(' · ' || (select string_agg((x->>'name') || ' $' || to_char((x->>'balance')::numeric, 'FM999G999G999'), ', ') from jsonb_array_elements(f->'funds') x), '');
  for v_to in select distinct unnest(coalesce((select report_recipients from public.churches where id = p_church), array(select public.staff_ids(p_church)))) loop
    perform public.notify(v_to, 'report', 'Informe de la semana',
      v_body || case when public.finance_level_of(v_to) >= 1 then v_fin else '' end, '/reporte');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_weekly_report(uuid, timestamp) from public, anon, authenticated;

-- Informes escritos (los arma Claude cada mes y cada año, con observaciones y consejos).
create table if not exists public.pastor_reports (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  kind       text not null check (kind in ('weekly', 'monthly', 'yearly')),
  period     text not null,                     -- '2026-W45', '2026-11', '2026'
  title      text not null,
  body       text not null,                     -- texto con títulos simples (## …) y viñetas (- …)
  finance    boolean not null default false,    -- trae finanzas: solo lo ven quienes tienen acceso
  created_at timestamptz not null default now(),
  unique (church_id, kind, period)
);
alter table public.pastor_reports enable row level security;
drop policy if exists pastor_reports_read on public.pastor_reports;
create policy pastor_reports_read on public.pastor_reports for select to authenticated
  using (church_id = public.current_church_id() and public.is_staff() and (not finance or public.finance_level() >= 1));
grant select on public.pastor_reports to authenticated;

-- Para guardar un informe y avisar a los destinatarios (lo usa la tarea programada).
create or replace function public.post_pastor_report(p_church uuid, p_kind text, p_period text, p_title text, p_body text, p_finance boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_to uuid;
begin
  insert into public.pastor_reports (church_id, kind, period, title, body, finance)
  values (p_church, p_kind, p_period, p_title, p_body, p_finance)
  on conflict (church_id, kind, period) do update set title = excluded.title, body = excluded.body, finance = excluded.finance, created_at = now()
  returning id into v_id;
  for v_to in select distinct unnest(coalesce((select report_recipients from public.churches where id = p_church), array(select public.staff_ids(p_church)))) loop
    if not p_finance or public.finance_level_of(v_to) >= 1 then
      perform public.notify(v_to, 'report', p_title, left(regexp_replace(p_body, '[#*_>-]+', '', 'g'), 180) || '…', '/informes/' || v_id);
    end if;
  end loop;
  return v_id;
end $$;
revoke all on function public.post_pastor_report(uuid, text, text, text, text, boolean) from public, anon, authenticated;
