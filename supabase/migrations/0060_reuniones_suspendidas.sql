-- Reuniones que no se hicieron: marcar una fecha de una reunión (culto, jóvenes, oración…) o de una
-- actividad semanal del calendario (por ejemplo Evangelismo personal) como "no hubo".
-- Una fecha marcada así no cuenta para la fidelidad, ni para las ausencias del fin de semana,
-- y el informe semanal la muestra como "no hubo" en vez de un 0.

create table if not exists public.cancellations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  on_date date not null,
  service_id uuid references public.church_services(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  note text check (note is null or length(note) <= 200),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((service_id is null) <> (event_id is null))
);
create unique index if not exists cancellations_service_day on public.cancellations (service_id, on_date) where service_id is not null;
create unique index if not exists cancellations_event_day on public.cancellations (event_id, on_date) where event_id is not null;
create index if not exists cancellations_church_day on public.cancellations (church_id, on_date);
alter table public.cancellations enable row level security;

drop policy if exists cancellations_select on public.cancellations;
create policy cancellations_select on public.cancellations for select to authenticated
  using (church_id = public.current_church_id());
-- Se escribe solo con set_cancelled(), que revisa permisos y fechas.
revoke all on table public.cancellations from anon, public;
grant select on table public.cancellations to authenticated;

-- Marcar o desmarcar una fecha. Reuniones: quien toma asistencia o maneja el calendario.
-- Actividades semanales del calendario: quien maneja el calendario.
create or replace function public.set_cancelled(p_service uuid, p_event uuid, p_date date, p_cancelled boolean, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_tz text; v_dow int; v_weekly boolean; v_n int;
begin
  if (p_service is null) = (p_event is null) then raise exception 'Elegí una reunión o una actividad'; end if;
  if p_date is null then raise exception 'Falta la fecha'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;

  if p_service is not null then
    if not (public.can_take_attendance() or public.has_perm('cal.editar')) then raise exception 'No tenés permiso para marcar reuniones'; end if;
    select dow into v_dow from public.church_services where id = p_service and church_id = v_church;
    if v_dow is null then raise exception 'Reunión inválida'; end if;
    if v_dow <> extract(dow from p_date)::int then raise exception 'Esa reunión no es ese día de la semana'; end if;
    if p_cancelled then
      select count(*) into v_n from public.attendances where service_id = p_service and attended_on = p_date;
      if v_n > 0 then
        raise exception 'Ya hay % presentes cargados en esa reunión. Si de verdad no hubo, sacalos primero.', v_n;
      end if;
      insert into public.cancellations (church_id, on_date, service_id, note)
      values (v_church, p_date, p_service, nullif(trim(p_note), ''))
      on conflict (service_id, on_date) where service_id is not null do update set note = excluded.note;
    else
      delete from public.cancellations where service_id = p_service and on_date = p_date;
    end if;
  else
    if not public.has_perm('cal.editar') then raise exception 'Solo quien maneja el calendario puede suspender actividades'; end if;
    select extract(dow from starts_at at time zone v_tz)::int, weekly into v_dow, v_weekly from public.events where id = p_event and church_id = v_church;
    if v_dow is null then raise exception 'Actividad inválida'; end if;
    if not v_weekly then raise exception 'Solo se suspenden fechas de actividades semanales. Una fecha especial se borra o se cambia.'; end if;
    if v_dow <> extract(dow from p_date)::int then raise exception 'Esa actividad no es ese día de la semana'; end if;
    if p_cancelled then
      insert into public.cancellations (church_id, on_date, event_id, note)
      values (v_church, p_date, p_event, nullif(trim(p_note), ''))
      on conflict (event_id, on_date) where event_id is not null do update set note = excluded.note;
    else
      delete from public.cancellations where event_id = p_event and on_date = p_date;
    end if;
  end if;
end $$;
revoke all on function public.set_cancelled(uuid, uuid, date, boolean, text) from public, anon;
grant execute on function public.set_cancelled(uuid, uuid, date, boolean, text) to authenticated;

-- ¿No hubo ninguna reunión principal ese fin de semana? (todas las del sábado y del domingo suspendidas)
create or replace function public.weekend_cancelled(p_church uuid, p_saturday date)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.church_services s where s.church_id = p_church and s.main and s.active and s.dow in (6, 0))
     and not exists (
       select 1 from public.church_services s
       where s.church_id = p_church and s.main and s.active and s.dow in (6, 0)
         and not exists (select 1 from public.cancellations x where x.service_id = s.id
                           and x.on_date = case s.dow when 6 then p_saturday else p_saturday + 1 end))
$$;

-- Fines de semana sin reunión entre dos fechas (sin contar las puntas): no cuentan como semanas que alguien faltó.
create or replace function public.cancelled_weekends_between(p_church uuid, p_after date, p_before date)
returns integer language sql stable security definer set search_path to 'public' as $$
  select case when p_after is null or p_before is null or p_before - p_after < 2 then 0 else (
    select count(*)::int from generate_series(p_after + 1, p_before - 1, interval '1 day') g(d)
    where extract(dow from g.d) = 6 and public.weekend_cancelled(p_church, g.d::date)) end
$$;
revoke all on function public.weekend_cancelled(uuid, date) from public, anon, authenticated;
revoke all on function public.cancelled_weekends_between(uuid, date, date) from public, anon, authenticated;

-- No se puede tomar asistencia en una reunión marcada como que no hubo.
create or replace function public.set_attendance(p_contact uuid, p_date date, p_service uuid, p_present boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_dow integer;
begin
  if not public.can_take_attendance() then raise exception 'No tenés permiso para tomar asistencia'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then raise exception 'Persona inválida'; end if;
  select dow into v_dow from public.church_services where id = p_service and church_id = public.current_church_id();
  if v_dow is null then raise exception 'Reunión inválida'; end if;
  if p_present then
    if exists (select 1 from public.cancellations where service_id = p_service and on_date = p_date) then
      raise exception 'Esa reunión está marcada como que no hubo. Desmarcala primero.';
    end if;
    insert into public.attendances (church_id, contact_id, attended_on, service, service_id, recorded_by)
    values (public.current_church_id(), p_contact, p_date,
            case extract(dow from p_date)::int when 6 then 'sat' when 0 then 'sun' else 'other' end, p_service, auth.uid())
    on conflict (contact_id, attended_on, service_id) do nothing;
    perform public.promote_to_visitor(p_contact);
  else
    delete from public.attendances where contact_id = p_contact and attended_on = p_date and service_id = p_service;
  end if;
end $$;

-- Fidelidad: las reuniones que no se hicieron no cuentan como "podía venir".
create or replace function public.people_engagement(p_weeks integer default 12)
returns table(contact_id uuid, name text, photo_path text, status text, group_id uuid, attended integer, possible integer, pct numeric, category text, last_attended date, class_days integer)
language sql stable security definer set search_path to 'public' as $$
  with tz as (
    select coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires') as tz
  ),
  bounds as (
    select greatest((now() at time zone tz.tz)::date - (p_weeks * 7),
                    coalesce((select tracking_since - 1 from public.churches where id = public.current_church_id()), date '-infinity')) as d0,
           (now() at time zone tz.tz)::date as d1 from tz
  ),
  occ as (
    select g.d::date as d, s.id as service_id
    from bounds b, generate_series(b.d0 + 1, b.d1, interval '1 day') g(d)
    join public.church_services s on s.church_id = public.current_church_id() and s.main and s.active
                                 and s.dow = extract(dow from g.d)::int
    where not exists (select 1 from public.cancellations x where x.service_id = s.id and x.on_date = g.d::date)
  ),
  people as (
    select c.* from public.contacts c
    where c.church_id = public.current_church_id() and not c.archived
      and (c.status in ('member', 'visitor') or exists (select 1 from public.attendances a where a.contact_id = c.id))
  )
  select p.id, p.name, p.photo_path, p.status, p.group_id,
         x.attended, x.possible,
         case when x.possible = 0 then 0 else round(x.attended::numeric / x.possible, 2) end,
         case
           when x.possible = 0 then 'nuevo'
           when x.attended::numeric / x.possible >= 0.95 then 'fiel'
           when x.attended::numeric / x.possible >= 0.80 then 'constante'
           when x.attended::numeric / x.possible >= 0.45 then 'frecuente'
           when x.attended::numeric / x.possible >= 0.20 then 'ocasional'
           when x.attended > 0 then 'esporadico'
           when (select max(a.attended_on) from public.attendances a where a.contact_id = p.id) is not null then 'inactivo'
           else 'sin_asistencia'
         end,
         (select max(a.attended_on) from public.attendances a where a.contact_id = p.id),
         (select count(*)::integer from public.class_attendance ca, bounds b where ca.contact_id = p.id and ca.present and ca.on_date > b.d0)
  from people p
  cross join lateral (
    select
      (select count(*)::integer from occ o where o.d >= greatest((select d0 from bounds) + 1, (p.created_at at time zone (select tz from tz))::date)) as possible,
      (select count(*)::integer from public.attendances a join occ o on o.d = a.attended_on and o.service_id = a.service_id
        where a.contact_id = p.id) as attended
  ) x
  where public.has_perm('inf.panel')
  order by x.attended desc, p.name
$$;

-- Ausencias del fin de semana: si no hubo reunión, no faltó nadie; y los fines de semana sin reunión
-- no se suman a las semanas que alguien lleva sin venir.
create or replace function public.weekend_absences(p_saturday date)
returns table(contact_id uuid, name text, photo_path text, phone text, status text, group_id uuid, group_name text, last_attended date, weeks_missed integer, last_visit timestamp with time zone)
language sql stable security definer set search_path to 'public' as $$
  with ch as (select tracking_since as ts from public.churches where id = public.current_church_id())
  select c.id, c.name, c.photo_path, c.phone, c.status, c.group_id, g.name,
         la.d,
         case when coalesce(la.d, (select ts - 7 from ch)) is null then 3
              else least(3, greatest(1, ((p_saturday - coalesce(la.d, (select ts - 7 from ch)))
                     - 7 * public.cancelled_weekends_between(public.current_church_id(), coalesce(la.d, (select ts - 7 from ch)), p_saturday) + 6) / 7)) end,
         (select max(v.visited_at) from public.contact_visits v where v.contact_id = c.id)
  from public.contacts c
  left join public.groups g on g.id = c.group_id
  left join lateral (select max(a.attended_on) d from public.attendances a where a.contact_id = c.id and a.attended_on < p_saturday) la on true
  where c.church_id = public.current_church_id() and not c.archived
    and ((select ts from ch) is null or p_saturday + 1 >= (select ts from ch))
    and not public.weekend_cancelled(public.current_church_id(), p_saturday)
    and (
      ((public.has_perm('inf.panel') or auth.uid() = any(coalesce((select absence_recipients from public.churches where id = public.current_church_id()), '{}'::uuid[])))
        and c.status in ('member', 'visitor'))
      or (public.i_have_role('captain') and c.group_id = public.current_group_id())
    )
    and (c.status = 'member' or exists (select 1 from public.attendances a where a.contact_id = c.id))
    and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (p_saturday, p_saturday + 1))
  order by 9 desc, g.name nulls first, c.name
$$;

create or replace function public.run_absence_report(p_church uuid, p_sunday date)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_sat date := p_sunday - 1;
  v1 int := 0; v2 int := 0; v3 int := 0;
  r record; v_to uuid; v_n integer := 0; v_body text; v_gap int;
begin
  -- Fin de semana sin reunión: no hay ausencias que avisar.
  if public.weekend_cancelled(p_church, v_sat) then return 0; end if;
  for r in
    select c.id, coalesce((select max(a.attended_on) from public.attendances a where a.contact_id = c.id and a.attended_on < v_sat), (select tracking_since - 7 from public.churches where id = p_church)) d
    from public.contacts c
    where c.church_id = p_church and not c.archived and c.status in ('member', 'visitor')
      and (c.status = 'member' or exists (select 1 from public.attendances a where a.contact_id = c.id))
      and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (v_sat, p_sunday))
  loop
    v_gap := case when r.d is null then null else (v_sat - r.d) - 7 * public.cancelled_weekends_between(p_church, r.d, v_sat) end;
    if v_gap is null or v_gap >= 15 then v3 := v3 + 1;
    elsif v_gap >= 8 then v2 := v2 + 1;
    else v1 := v1 + 1; end if;
  end loop;
  if v1 + v2 + v3 > 0 then
    v_body := concat_ws(' · ',
      case when v1 > 0 then v1 || ' faltó 1 semana (escribirles)' end,
      case when v2 > 0 then v2 || ' faltaron 2 semanas (coordinar visita)' end,
      case when v3 > 0 then v3 || ' faltaron 3 o más (orar y visitar)' end);
    for v_to in select unnest(coalesce((select absence_recipients from public.churches where id = p_church), array(select public.staff_ids(p_church)))) loop
      perform public.notify(v_to, 'absences', (v1 + v2 + v3) || ' no vinieron este fin de semana', v_body, '/ausencias?fecha=' || v_sat);
      v_n := v_n + 1;
    end loop;
  end if;
  -- cada capitán, su gente
  for r in
    select g.id, g.name, g.captain_id, count(c.id) as n
    from public.groups g join public.contacts c on c.group_id = g.id and not c.archived
    where g.church_id = p_church and g.captain_id is not null
      and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (v_sat, p_sunday))
      and exists (select 1 from public.attendances a where a.contact_id = c.id)
    group by g.id, g.name, g.captain_id
  loop
    perform public.notify(r.captain_id, 'absences',
      r.n || ' de ' || r.name || case when r.n = 1 then ' no vino' else ' no vinieron' end || ' este fin de semana',
      'Tocá para ver la lista y escribirles por WhatsApp.', '/ausencias?fecha=' || v_sat);
    v_n := v_n + 1;
  end loop;
  for r in
    select c.id, c.church_id,
           coalesce(c.follow_up_user_id,
                    (select g.captain_id from public.groups g where g.id = c.group_id),
                    (select p.id from public.profiles p where p.church_id = c.church_id and p.role::text = 'admin' and p.disabled_at is null order by p.created_at limit 1)) as who
    from public.contacts c
    cross join lateral (select coalesce((select max(a.attended_on) from public.attendances a where a.contact_id = c.id and a.attended_on < v_sat),
                                        (select tracking_since - 7 from public.churches where id = p_church)) as last) l
    where c.church_id = p_church and not c.archived and c.status in ('member', 'visitor')
      and (c.status = 'member' or exists (select 1 from public.attendances a where a.contact_id = c.id))
      and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (v_sat, p_sunday))
      and ((v_sat - l.last) - 7 * public.cancelled_weekends_between(p_church, l.last, v_sat) + 6) / 7
          = public.followup_num(p_church, 'absent_visit_weeks', 2, 1, 8)
  loop
    insert into public.follow_up_tasks (church_id, contact_id, assigned_to, kind, due_at)
    values (r.church_id, r.id, r.who, 'absent_visit', now() + make_interval(days => public.followup_num(p_church, 'visit_days', 7, 1, 60)))
    on conflict (contact_id, kind) do update
      set done_at = null, done_by = null, due_at = excluded.due_at, assigned_to = excluded.assigned_to
      where public.follow_up_tasks.done_at is not null;
  end loop;
  return v_n;
end $$;

-- Informe semanal: cada reunión dice si no hubo, y aparece la lista de lo que se suspendió.
create or replace function public.weekly_report(p_church uuid default null, p_monday date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_church uuid := coalesce(p_church, public.current_church_id()); v_mon date; v_from timestamptz; v_to timestamptz; v_tz text; ss uuid[];
begin
  if p_church is null and not public.is_staff() then raise exception 'Solo la secretaría o el pastor'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;
  v_mon := coalesce(p_monday, date_trunc('week', (now() at time zone v_tz))::date);
  v_from := (v_mon - 7)::timestamp at time zone v_tz;
  v_to := v_mon::timestamp at time zone v_tz;
  select coalesce(array_agg(id), '{}') into ss from public.sessions where (ended_at is null or counts) and church_id = v_church and started_at >= v_from and started_at < v_to;
  return jsonb_build_object(
    'from', v_mon - 7, 'to', v_mon - 1,
    'outings', public.extra_outings_between(v_church, v_from, v_to) + (select count(*) from (
                  select s.started_at,
                         max(coalesce(s.ended_at, now())) over (order by s.started_at rows between unbounded preceding and 1 preceding) as prev_end
                  from public.sessions s where s.id = any(ss)) o
                where o.prev_end is null or o.started_at > o.prev_end + interval '1 hour'),
    'people_out', public.people_out_between(v_church, v_from, v_to),
    'minutes', (select coalesce(sum(extract(epoch from (coalesce(ended_at, started_at) - started_at)) / 60), 0)::int from public.sessions where id = any(ss)),
    'km', (select round((coalesce(sum(distance_m), 0) / 1000)::numeric, 1) from public.sessions where id = any(ss)),
    'houses', public.houses_for_sessions(ss),
    'contacts', (select count(distinct contact_id) from public.contact_visits where church_id = v_church and visited_at >= v_from and visited_at < v_to),
    'gospel', (select count(*) from public.contact_visits where church_id = v_church and gospel_presented and visited_at >= v_from and visited_at < v_to),
    'promises', (select count(*) from public.contact_visits where church_id = v_church and promise_day is not null and visited_at >= v_from and visited_at < v_to),
    'visits', (select count(*) from public.contact_visits where church_id = v_church and session_id is null and visited_at >= v_from and visited_at < v_to),
    'attendance', (select count(distinct (contact_id, attended_on)) from public.attendances where church_id = v_church and attended_on >= v_mon - 7 and attended_on < v_mon),
    'first_time', (select count(*) from (select a.contact_id, min(a.attended_on) f from public.attendances a join public.contacts c on c.id = a.contact_id where a.church_id = v_church and c.baseline is null group by a.contact_id) x
                     where x.f >= v_mon - 7 and x.f < v_mon and x.f >= coalesce((select tracking_since from public.churches where id = v_church), date '-infinity')),
    'saved', (select count(*) from public.contacts where church_id = v_church and saved_on >= v_mon - 7 and saved_on < v_mon),
    'baptisms', (select count(*) from public.contacts where church_id = v_church and baptized_on >= v_mon - 7 and baptized_on < v_mon
                   and baptized_on >= coalesce((select tracking_since from public.churches where id = v_church), date '-infinity')),
    'new_members', (select count(*) from public.contacts where church_id = v_church and member_since >= v_mon - 7 and member_since < v_mon and baseline is distinct from 'member'
                      and member_since >= coalesce((select tracking_since from public.churches where id = v_church), date '-infinity')),
    'weekend_cancelled', public.weekend_cancelled(v_church, v_mon - 2),
    'absent', case when public.weekend_cancelled(v_church, v_mon - 2) then 0 else
              (select count(*) from public.contacts c where c.church_id = v_church and not c.archived and c.status = 'member' and coalesce((select tracking_since from public.churches where id = v_church), date '-infinity') <= v_mon - 1
               and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on >= v_mon - 2 and a.attended_on < v_mon)) end,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'dow', s.dow, 'count', x.n, 'visitors', x.v, 'cancelled', x.cancelled) order by s.dow, s.sort_order, s.time)
      from public.church_services s
      cross join lateral (
        select count(*)::int n, count(*) filter (where c.status <> 'member')::int v,
               exists (select 1 from public.cancellations k where k.service_id = s.id and k.on_date >= v_mon - 7 and k.on_date < v_mon) cancelled
        from public.attendances a join public.contacts c on c.id = a.contact_id
        where a.service_id = s.id and a.attended_on >= v_mon - 7 and a.attended_on < v_mon
      ) x
      where s.church_id = v_church and (s.active or x.n > 0)), '[]'::jsonb),
    'cancelled', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(s.name, e.title), 'date', k.on_date, 'kind', case when k.service_id is not null then 'service' else 'event' end, 'note', k.note)
                       order by k.on_date, coalesce(s.name, e.title))
      from public.cancellations k
      left join public.church_services s on s.id = k.service_id
      left join public.events e on e.id = k.event_id
      where k.church_id = v_church and k.on_date >= v_mon - 7 and k.on_date < v_mon), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('name', k.name, 'present', x.p, 'absent', x.a, 'enrolled', x.e, 'days', x.d) order by k.sort_order, k.name)
      from public.classes k
      cross join lateral (
        select count(*) filter (where ca.present)::int p, count(*) filter (where not ca.present)::int a, count(distinct ca.on_date)::int d,
               (select count(*)::int from public.class_students cs where cs.class_id = k.id) e
        from public.class_attendance ca
        where ca.class_id = k.id and ca.on_date >= v_mon - 7 and ca.on_date < v_mon
      ) x
      where k.church_id = v_church and (k.active or x.p > 0)), '[]'::jsonb)
  );
end $$;
