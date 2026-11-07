-- 0028: pases automáticos entre fondos (por ejemplo, cada mes una parte de General al fondo del Vehículo).
-- El día elegido del mes, a las 8, la app carga el pase sola y avisa a quien lo programó.

create table if not exists public.fin_recurring (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  from_fund_id uuid not null references public.fin_funds(id),
  to_fund_id   uuid not null references public.fin_funds(id),
  amount       numeric(14, 2) not null check (amount > 0),
  day          smallint not null check (day between 1 and 28),
  description  text,
  active       boolean not null default true,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (from_fund_id <> to_fund_id)
);
alter table public.fin_recurring enable row level security;
grant select, insert, update on public.fin_recurring to authenticated;
drop policy if exists fin_recurring_read on public.fin_recurring;
create policy fin_recurring_read on public.fin_recurring for select to authenticated
  using (church_id = public.current_church_id() and public.finance_level() >= 1);
drop policy if exists fin_recurring_insert on public.fin_recurring;
create policy fin_recurring_insert on public.fin_recurring for insert to authenticated
  with check (church_id = public.current_church_id() and public.finance_level() >= 3);
drop policy if exists fin_recurring_update on public.fin_recurring;
create policy fin_recurring_update on public.fin_recurring for update to authenticated
  using (church_id = public.current_church_id() and public.finance_level() >= 3) with check (church_id = public.current_church_id());

create or replace function public.run_fin_recurring(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; v_day int := extract(day from p_local)::int; v_id uuid;
begin
  if extract(hour from p_local)::int < 8 then return 0; end if;
  for r in select * from public.fin_recurring where church_id = p_church and active and day <= v_day loop
    if not public.job_once(p_church, 'fin_recurring', r.id::text || ':' || to_char(p_local, 'YYYY-MM')) then continue; end if;
    insert into public.fin_entries (church_id, on_date, kind, fund_id, to_fund_id, amount, currency, method, description, source, created_by)
    values (p_church, make_date(extract(year from p_local)::int, extract(month from p_local)::int, r.day), 'transfer', r.from_fund_id, r.to_fund_id,
            r.amount, 'ARS', 'other', coalesce(r.description, 'Pase automático del mes'), 'automatico', r.created_by)
    returning id into v_id;
    if r.created_by is not null then
      perform public.notify(r.created_by, 'report', 'Pase automático cargado',
        '$' || to_char(r.amount, 'FM999G999G999') || ' de ' || (select name from public.fin_funds where id = r.from_fund_id)
          || ' a ' || (select name from public.fin_funds where id = r.to_fund_id) || '.', '/finanzas/' || v_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_fin_recurring(uuid, timestamp) from public, anon, authenticated;

create or replace function public.run_v07_jobs() returns integer
language plpgsql security definer set search_path = public as $$
declare c record; v_local timestamp; n integer := 0;
begin
  for c in select * from public.churches loop
    v_local := now() at time zone coalesce(c.timezone, 'America/Argentina/Buenos_Aires');
    n := n + public.run_promise_reminders(c.id, v_local);
    n := n + public.run_event_reminders(c.id, v_local);
    n := n + public.run_weekly_report(c.id, v_local);
    n := n + public.run_fin_recurring(c.id, v_local);
  end loop;
  return n;
end $$;
revoke all on function public.run_v07_jobs() from public, anon, authenticated;
