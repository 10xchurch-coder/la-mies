-- 0066: lista de inactivos. Los miembros que no vienen hace X meses salen de la lista de miembros y pasan a "Inactivos".
-- Cada iglesia elige cuántos meses (o lo apaga). Si la persona vuelve y se le toma asistencia, vuelve sola a su lista.

-- 1. El estado nuevo y lo que hace falta recordar de cada persona
alter table public.contacts drop constraint if exists contacts_status_check;
alter table public.contacts add constraint contacts_status_check check (status in ('contact', 'visitor', 'member', 'inactive'));
alter table public.contacts
  add column if not exists inactive_since      timestamptz,
  add column if not exists inactive_prev       text check (inactive_prev in ('contact', 'visitor', 'member')),
  add column if not exists inactive_auto       boolean not null default false,   -- lo movió la app (no a mano)
  add column if not exists inactive_cleared_at timestamptz,                      -- cuándo volvió a su lista (el reloj empieza de nuevo)
  add column if not exists inactive_exempt     boolean not null default false;   -- nunca moverlo solo (enfermos, misioneros, etc.)
create index if not exists contacts_inactive_idx on public.contacts (church_id, inactive_since desc) where status = 'inactive';

-- 2. La regla de cada iglesia: cuántos meses sin venir. Vacío = apagado.
alter table public.churches add column if not exists inactive_months integer check (inactive_months between 1 and 120);
update public.churches set inactive_months = 3 where id = '2c35b2a1-494d-475d-8a87-b7df18974838' and inactive_months is null;

-- 3. Última vez que vino cada persona (culto, clase, colectivo o chicos)
create or replace function public.contact_last_seen(p_contact uuid) returns date
language sql stable security definer set search_path = public as $$
  select max(d) from (
    select max(attended_on) d from public.attendances where contact_id = p_contact
    union all select max(on_date) from public.class_attendance where contact_id = p_contact and present
    union all select max(on_date) from public.bus_pickups where contact_id = p_contact
    union all select max(on_date) from public.child_checkins where child_id = p_contact
  ) x
$$;
revoke all on function public.contact_last_seen(uuid) from public, anon, authenticated;

-- Quiénes pasarían a inactivos hoy en una iglesia. El reloj de cada uno empieza en lo más nuevo entre:
-- la última vez que vino, cuándo se cargó, desde cuándo es miembro, cuándo volvió de inactivos, y desde cuándo la iglesia toma asistencia.
create or replace function public.inactive_candidates(p_church uuid, p_months integer)
returns table (id uuid, name text, last_seen date)
language sql stable security definer set search_path = public as $$
  with start as (
    select greatest(ch.tracking_since, (select min(a.attended_on) from public.attendances a where a.church_id = ch.id)) s
    from public.churches ch where ch.id = p_church
  )
  select c.id, c.name, public.contact_last_seen(c.id)
  from public.contacts c, start
  where c.church_id = p_church and c.status = 'member' and not c.archived and not c.inactive_exempt
    and start.s is not null
    -- a los que tienen un cargo en la iglesia no se los mueve solos
    and not exists (select 1 from public.profiles p where p.id = c.profile_id and (p.role::text <> 'member' or cardinality(coalesce(p.extra_roles, '{}')) > 0))
    and greatest(
          coalesce(public.contact_last_seen(c.id), '-infinity'::date),
          start.s,
          coalesce(c.created_at::date, '-infinity'::date),
          coalesce(c.member_since, '-infinity'::date),
          coalesce(c.inactive_cleared_at::date, '-infinity'::date)
        ) < (public.church_today() - make_interval(months => p_months))::date
$$;
revoke all on function public.inactive_candidates(uuid, integer) from public, anon, authenticated;

-- Mover a una persona a inactivos o devolverla. Sin chequeos de permiso: la llaman las funciones de abajo.
create or replace function public._set_inactive(p_contact uuid, p_inactive boolean, p_auto boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('lamies.bypass_guard', 'on', true);
  if p_inactive then
    update public.contacts set inactive_prev = case when status = 'inactive' then inactive_prev else status end,
        status = 'inactive', inactive_since = now(), inactive_auto = p_auto
      where id = p_contact and status <> 'inactive';
  else
    update public.contacts set status = coalesce(inactive_prev, 'member'), inactive_prev = null, inactive_since = null,
        inactive_auto = false, inactive_cleared_at = now()
      where id = p_contact and status = 'inactive';
  end if;
  perform set_config('lamies.bypass_guard', 'off', true);
end $$;
revoke all on function public._set_inactive(uuid, boolean, boolean) from public, anon, authenticated;

-- La revisión de una iglesia: mueve a todos los que correspondan. Devuelve cuántos movió.
create or replace function public.run_inactive_sweep(p_church uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_months integer; r record; n integer := 0;
begin
  select inactive_months into v_months from public.churches where id = p_church;
  if v_months is null then return 0; end if;
  for r in select id from public.inactive_candidates(p_church, v_months) loop
    perform public._set_inactive(r.id, true, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_inactive_sweep(uuid) from public, anon, authenticated;

-- Todas las iglesias, una vez por día (lo llama el reloj del servidor).
create or replace function public.run_inactive_sweeps() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from public.churches where inactive_months is not null loop
    if public.job_once(r.id, 'inactive_sweep', public.church_today()::text) then
      n := n + public.run_inactive_sweep(r.id);
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.run_inactive_sweeps() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'lamies-inactivos';
    perform cron.schedule('lamies-inactivos', '23 * * * *', 'select public.run_inactive_sweeps()');
  end if;
end $$;

-- 4. Si vuelve, vuelve solo: al tomarle asistencia (culto, clase, colectivo o chicos) sale de inactivos.
create or replace function public.inactive_comeback() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb := to_jsonb(new); v_id uuid;
begin
  -- to_jsonb: cada tabla tiene su columna (contact_id o child_id); leerla así no falla en ninguna.
  v_id := coalesce(v_row->>'contact_id', v_row->>'child_id')::uuid;
  if tg_table_name = 'class_attendance' and not coalesce((v_row->>'present')::boolean, false) then return null; end if;
  if v_id is not null and exists (select 1 from public.contacts where id = v_id and status = 'inactive') then
    perform public._set_inactive(v_id, false, false);
  end if;
  return null;
end $$;
revoke all on function public.inactive_comeback() from public, anon, authenticated;
drop trigger if exists inactive_comeback on public.attendances;
create trigger inactive_comeback after insert on public.attendances for each row execute function public.inactive_comeback();
drop trigger if exists inactive_comeback on public.class_attendance;
create trigger inactive_comeback after insert or update of present on public.class_attendance for each row execute function public.inactive_comeback();
drop trigger if exists inactive_comeback on public.bus_pickups;
create trigger inactive_comeback after insert on public.bus_pickups for each row execute function public.inactive_comeback();
drop trigger if exists inactive_comeback on public.child_checkins;
create trigger inactive_comeback after insert on public.child_checkins for each row execute function public.inactive_comeback();

-- 5. Lo que usa la app
-- Ajuste: cuántos meses (null = apagado). Solo el pastor o el administrador de la app.
create or replace function public.set_inactive_months(p_months integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id();
begin
  if not public.has_perm('admin.permisos') then raise exception 'Solo el pastor o el administrador de la app'; end if;
  if p_months is not null and (p_months < 1 or p_months > 120) then raise exception 'Elegí entre 1 y 120 meses'; end if;
  update public.churches set inactive_months = p_months where id = v_church;
  insert into public.audit_log (church_id, actor_id, action) values (v_church, auth.uid(), 'inactive_months:' || coalesce(p_months::text, 'off'));
  return p_months;
end $$;

-- Cuántos pasarían hoy con esa cantidad de meses (para ver antes de cambiar).
create or replace function public.inactive_preview(p_months integer) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.has_perm('admin.permisos') and p_months between 1 and 120
    then (select count(*)::int from public.inactive_candidates(public.current_church_id(), p_months)) else 0 end
$$;

-- Revisar ahora mismo (sin esperar al reloj).
create or replace function public.inactive_sweep_now() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('admin.permisos') then raise exception 'Solo el pastor o el administrador de la app'; end if;
  return public.run_inactive_sweep(public.current_church_id());
end $$;

-- Mover a mano o devolver a su lista (pastor y secretaría).
create or replace function public.set_contact_inactive(p_contact uuid, p_inactive boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('personas.editar') then raise exception 'No tenés permiso para cambiar el estado de las personas'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then raise exception 'Esa persona no es de tu iglesia'; end if;
  perform public._set_inactive(p_contact, p_inactive, false);
end $$;

-- Nunca moverlo solo (sí se puede a mano).
create or replace function public.set_inactive_exempt(p_contact uuid, p_exempt boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('personas.editar') then raise exception 'No tenés permiso'; end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.contacts set inactive_exempt = p_exempt where id = p_contact and church_id = public.current_church_id();
  perform set_config('lamies.bypass_guard', 'off', true);
end $$;

-- La lista de inactivos, con búsqueda y de a páginas (va a ser larga). El teléfono solo a quien puede ver teléfonos.
create or replace function public.inactive_list(p_q text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, name text, phone text, photo_path text, inactive_since timestamptz, inactive_auto boolean, prev_status text, last_seen date, total integer)
language sql stable security definer set search_path = public as $$
  with base as (
    select c.* from public.contacts c
    where (public.has_perm('personas.editar') or public.has_perm('personas.ver_todas'))
      and c.church_id = public.current_church_id() and c.status = 'inactive' and not c.archived
      and (coalesce(btrim(p_q), '') = ''
           or translate(lower(c.name), 'áéíóúñü', 'aeiounu') like '%' || translate(lower(btrim(p_q)), 'áéíóúñü', 'aeiounu') || '%'
           or (length(regexp_replace(p_q, '\D', '', 'g')) >= 3 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_q, '\D', '', 'g') || '%'))
  )
  select b.id, b.name, case when public.has_perm('personas.privados') then b.phone end, b.photo_path, b.inactive_since, b.inactive_auto,
         b.inactive_prev, public.contact_last_seen(b.id), (select count(*)::int from base)
  from base b
  order by b.inactive_since desc nulls last, b.name
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Para la asistencia: encontrar a alguien de inactivos que volvió (solo nombre y foto).
create or replace function public.inactive_search(p_q text)
returns table (id uuid, name text, photo_path text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.photo_path from public.contacts c
  where public.can_take_attendance() and c.church_id = public.current_church_id() and c.status = 'inactive' and not c.archived
    and length(btrim(coalesce(p_q, ''))) >= 2
    and translate(lower(c.name), 'áéíóúñü', 'aeiounu') like '%' || translate(lower(btrim(p_q)), 'áéíóúñü', 'aeiounu') || '%'
  order by c.name limit 10
$$;

revoke all on function public.set_inactive_months(integer), public.inactive_preview(integer), public.inactive_sweep_now(),
  public.set_contact_inactive(uuid, boolean), public.set_inactive_exempt(uuid, boolean), public.inactive_list(text, integer, integer),
  public.inactive_search(text) from public, anon;
grant execute on function public.set_inactive_months(integer), public.inactive_preview(integer), public.inactive_sweep_now(),
  public.set_contact_inactive(uuid, boolean), public.set_inactive_exempt(uuid, boolean), public.inactive_list(text, integer, integer),
  public.inactive_search(text) to authenticated;

-- 6. La planilla de asistencia ya no muestra a los inactivos (salvo que hayan venido ese día): se buscan aparte.
create or replace function public.attendance_sheet(p_date date, p_service uuid)
returns table (contact_id uuid, name text, photo_path text, status text, group_id uuid, present boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.photo_path, c.status, c.group_id,
         exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on = p_date and a.service_id = p_service)
  from public.contacts c
  where public.can_take_attendance()
    and c.church_id = public.current_church_id()
    and not c.archived
    and (c.status <> 'inactive' or exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on = p_date and a.service_id = p_service))
    and (c.status in ('member', 'visitor')
         or exists (select 1 from public.attendances a where a.contact_id = c.id)
         or c.promise_day is not null)
  order by case c.status when 'member' then 0 when 'visitor' then 1 else 2 end, c.name
$$;
