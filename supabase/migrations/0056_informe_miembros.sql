-- 0056: informe de finanzas de la iglesia para los miembros mayores de 18 años.
-- Es de toda la iglesia, nunca personal: cuánto entró y cuánto salió por categoría. No muestra quién dio, ni cada movimiento, ni cuentas.
-- La iglesia lo enciende (apagado al principio). Encendido, cada trimestre y cada año les llega el aviso solos.
alter table public.churches add column if not exists fin_report_members boolean not null default false;

-- Miembro mayor de 18: su ficha dice "miembro" y tiene fecha de nacimiento con 18 años cumplidos.
create or replace function public.is_adult_member(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contacts c join public.profiles p on p.id = c.profile_id
     where c.profile_id = p_user and c.church_id = p.church_id and not c.archived and c.status = 'member'
       and c.birthdate is not null and c.birthdate <= (current_date - interval '18 years')::date)
$$;
revoke all on function public.is_adult_member(uuid) from public, anon, authenticated;

create or replace function public.fin_member_report_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enabled', coalesce((select fin_report_members from public.churches where id = public.current_church_id()), false),
    'eligible', public.is_adult_member(auth.uid()) or public.finance_level() >= 1,
    'can_switch', public.has_perm('admin.iglesia') or public.finance_level() >= 4)
$$;
revoke all on function public.fin_member_report_state() from public, anon;
grant execute on function public.fin_member_report_state() to authenticated;

create or replace function public.set_fin_member_report(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('admin.iglesia') or public.finance_level() >= 4) then raise exception 'Solo el pastor o el encargado de finanzas puede cambiar esto.'; end if;
  update public.churches set fin_report_members = p_on where id = public.current_church_id();
end $$;
revoke all on function public.set_fin_member_report(boolean) from public, anon;
grant execute on function public.set_fin_member_report(boolean) to authenticated;

create or replace function public.fin_member_report(p_from date, p_to date)
returns table (direction text, category text, total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.finance_level() < 1 then
    if not coalesce((select fin_report_members from public.churches where id = public.current_church_id()), false) then raise exception 'La iglesia todavía no comparte este informe.'; end if;
    if not public.is_adult_member(auth.uid()) then raise exception 'Este informe es para los miembros mayores de 18 años.'; end if;
  end if;
  if p_to < p_from or p_to - p_from > 370 then raise exception 'Período no válido.'; end if;
  if p_to >= public.church_today() and public.finance_level() < 1 then raise exception 'Ese período todavía no terminó.'; end if;
  return query
  select case e.kind when 'income' then 'in' else 'out' end, coalesce(c.name, 'Sin categoría'), sum(e.amount)
    from public.fin_entries e left join public.fin_categories c on c.id = e.category_id
   where e.church_id = public.current_church_id() and e.voided_at is null and e.kind <> 'transfer' and e.on_date between p_from and p_to
   group by 1, 2 order by 1, 3 desc;
end $$;
revoke all on function public.fin_member_report(date, date) from public, anon;
grant execute on function public.fin_member_report(date, date) to authenticated;

-- El día 10 de enero, abril, julio y octubre a las 10 h: aviso del trimestre que cerró (y en enero, también del año).
create or replace function public.run_fin_member_reports(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0; v_q int; v_year int; v_from date; v_to date; v_link text;
begin
  if extract(day from p_local)::int <> 10 or extract(hour from p_local)::int <> 10 or extract(month from p_local)::int not in (1, 4, 7, 10) then return 0; end if;
  if not coalesce((select fin_report_members from public.churches where id = p_church), false) then return 0; end if;
  v_to := date_trunc('month', p_local)::date - 1;
  v_from := (date_trunc('month', v_to) - interval '2 months')::date;
  v_q := ((extract(month from v_to)::int - 1) / 3) + 1; v_year := extract(year from v_to)::int;
  if not public.job_once(p_church, 'fin_members', v_year || '-T' || v_q) then return 0; end if;
  if not exists (select 1 from public.fin_entries e where e.church_id = p_church and e.voided_at is null and e.on_date between v_from and v_to) then return 0; end if;
  v_link := '/informe-iglesia?desde=' || v_from || '&hasta=' || v_to;
  for u in select p.id from public.profiles p where p.church_id = p_church and p.disabled_at is null and public.is_adult_member(p.id) loop
    perform public.notify(u, 'fin_report', 'Informe de finanzas de la iglesia',
      case when v_q = 4 then 'Ya está el informe del 4.º trimestre y de todo el año ' || v_year || '.' else 'Ya está el informe del ' || v_q || '.º trimestre de ' || v_year || '.' end, v_link);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_fin_member_reports(uuid, timestamp) from public, anon, authenticated;

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
    n := n + public.run_follow_up_reminders(c.id, v_local);
    n := n + public.run_birthday_reminders(c.id, v_local);
    n := n + public.run_birthday_today(c.id, v_local);
    n := n + public.run_fin_member_reports(c.id, v_local);
  end loop;
  n := n + public.run_bus_cleanup();
  return n;
end $$;
