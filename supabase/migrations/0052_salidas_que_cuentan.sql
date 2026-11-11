-- 0052: solo cuentan las salidas de verdad.
-- Antes, cualquier salida terminada sumaba (aunque durara 20 segundos de prueba). Ahora una salida cuenta si:
--   · duró 10 minutos o más, o
--   · recorrió 300 metros o más, o
--   · se registró a alguien (contacto, presentación o promesa), o
--   · se cargó a mano.
-- Las que no cuentan no se borran: siguen en "Mis salidas" marcadas "No cuenta" y se pueden borrar desde ahí.
-- Una salida en curso se ve en los informes en vivo; cuando termina, queda solo si cuenta.
alter table public.sessions add column if not exists counts boolean generated always as (
  ended_at is not null and (
    manual
    or ended_at - started_at >= interval '10 minutes'
    or distance_m >= 300
    or contacts + presentations + promises > 0
  )) stored;

drop function if exists public.list_outings(integer, uuid);

create or replace function public.my_progress()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  v_streak integer := 0;
  v_week date;
  v_has boolean;
begin
  -- Racha: semanas seguidas (contando esta o la anterior) con al menos una salida terminada.
  v_week := date_trunc('week', (now() at time zone v_tz))::date;
  loop
    select exists (
      select 1 from public.sessions s
      where s.user_id = v_uid and s.counts
        and date_trunc('week', (s.started_at at time zone v_tz))::date = v_week
    ) into v_has;
    if not v_has then
      if v_streak = 0 and v_week = date_trunc('week', (now() at time zone v_tz))::date then
        v_week := v_week - 7; continue; -- esta semana todavía no salió: mirá la anterior
      end if;
      exit;
    end if;
    v_streak := v_streak + 1;
    v_week := v_week - 7;
    exit when v_streak > 520;
  end loop;

  return jsonb_build_object(
    'sessions',      (select count(*) from public.sessions s where s.user_id = v_uid and s.counts),
    'minutes',       (select coalesce(sum(extract(epoch from (s.ended_at - s.started_at)) / 60), 0)::integer from public.sessions s where s.user_id = v_uid and s.counts),
    'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s where s.user_id = v_uid and s.counts),
    'presentations', (select count(*) from public.contact_visits v where v.user_id = v_uid and v.gospel_presented),
    'promises',      (select count(*) from public.contact_visits v where v.user_id = v_uid and v.promise_day is not null),
    'came',          (select count(*) from public.attendances a join public.contacts c on c.id = a.contact_id where c.created_by = v_uid),
    'discipleship',  (select count(*) from public.contacts c where c.created_by = v_uid and c.discipleship_since is not null),
    'baptisms',      (select count(*) from public.contacts c where c.created_by = v_uid and c.baptized_on is not null),
    'streak_weeks',  v_streak,
    'last_session',  (select max(s.started_at) from public.sessions s where s.user_id = v_uid and s.counts)
  );
end $$;

create or replace function public.church_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_captain_or_admin() then null else jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'sessions',      (select count(*) from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'members',       (select count(distinct s.user_id) from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'minutes',       (select coalesce(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60), 0)::integer from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'blocks',        (select coalesce(sum(s.blocks), 0) from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'presentations', (select count(*) from public.contact_visits v where v.church_id = public.current_church_id() and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
      'promises',      (select count(*) from public.contact_visits v where v.church_id = public.current_church_id() and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
      'came',          (select count(*) from public.attendances a where a.church_id = public.current_church_id() and a.attended_on >= p_from::date and a.attended_on < p_to::date),
      'discipleship',  (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.discipleship_since >= p_from::date and c.discipleship_since < p_to::date),
      'baptisms',      (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.baptized_on >= p_from::date and c.baptized_on < p_to::date),
      'contacts',      (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.created_at >= p_from and c.created_at < p_to),
      'pending_pickups', (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.pickup and c.promise_day is not null and not c.archived
                           and not exists (select 1 from public.attendances a where a.contact_id = c.id))
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'display_name', p.display_name,
        'sessions', (select count(*) from public.sessions s where (s.ended_at is null or s.counts) and s.user_id = p.id and s.started_at >= p_from and s.started_at < p_to),
        'presentations', (select count(*) from public.contact_visits v where v.user_id = p.id and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
        'promises', (select count(*) from public.contact_visits v where v.user_id = p.id and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
        'last_session', (select max(s.started_at) from public.sessions s where s.user_id = p.id and s.counts)
      ) order by p.display_name), '[]'::jsonb)
      from public.profiles p where p.church_id = public.current_church_id()
    ),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'user_id', s.user_id, 'display_name', p.display_name,
        'started_at', s.started_at, 'ended_at', s.ended_at, 'distance_m', s.distance_m, 'blocks', s.blocks,
        'presentations', s.presentations, 'promises', s.promises, 'contacts', s.contacts,
        'auto_stopped', s.auto_stopped, 'trimmed_at', s.trimmed_at
      ) order by s.started_at desc), '[]'::jsonb)
      from public.sessions s join public.profiles p on p.id = s.user_id
      where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to
    )
  ) end
$$;

create or replace function public.network_summary(p_from timestamptz, p_to timestamptz)
returns table (church_id uuid, church_name text, city text, country text,
               sessions integer, members integer, presentations integer, promises integer, came integer,
               discipleship integer, baptisms integer)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.country,
    (select count(*)::integer from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = c.id and s.started_at >= p_from and s.started_at < p_to),
    (select count(distinct s.user_id)::integer from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = c.id and s.started_at >= p_from and s.started_at < p_to),
    (select count(*)::integer from public.contact_visits v where v.church_id = c.id and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
    (select count(*)::integer from public.contact_visits v where v.church_id = c.id and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
    (select count(*)::integer from public.attendances a where a.church_id = c.id and a.attended_on >= p_from::date and a.attended_on < p_to::date),
    (select count(*)::integer from public.contacts k where k.church_id = c.id and k.discipleship_since >= p_from::date and k.discipleship_since < p_to::date),
    (select count(*)::integer from public.contacts k where k.church_id = c.id and k.baptized_on >= p_from::date and k.baptized_on < p_to::date)
  from public.churches c
  where public.is_network_admin()
  order by c.country, c.name
$$;

create or replace function public.team_totals(p_period text)
returns jsonb language sql stable security definer set search_path = public as $$
  with since as (select public.period_start(p_period) as t),
  ss as (select s.* from public.sessions s, since where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= since.t)
  select jsonb_build_object(
    'sessions',      (select count(*) from ss),
    'members',       (select count(distinct user_id) from ss),
    'minutes',       (select coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 60), 0)::integer from ss),
    'km',            (select round((coalesce(sum(distance_m), 0) / 1000)::numeric, 1) from ss),
    'blocks',        (select coalesce(sum(blocks), 0) from ss),
    'houses',        public.houses_for_sessions((select coalesce(array_agg(id), '{}') from ss)),
    'presentations', (select count(*) from public.contact_visits v, since where v.church_id = public.current_church_id() and v.visited_at >= since.t and v.gospel_presented),
    'promises',      (select count(*) from public.contact_visits v, since where v.church_id = public.current_church_id() and v.visited_at >= since.t and v.promise_day is not null),
    'came',          (select count(*) from public.attendances a, since where a.church_id = public.current_church_id() and a.attended_on >= (since.t)::date),
    'discipleship',  (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.discipleship_since >= (since.t)::date),
    'baptisms',      (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.baptized_on >= (since.t)::date),
    'contacts',      (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.created_at >= since.t)
  )
$$;

create or replace function public.weekly_report(p_church uuid default null, p_monday date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    'outings', coalesce(array_length(ss, 1), 0),
    'people_out', (select count(distinct user_id) from public.sessions where id = any(ss)),
    'minutes', (select coalesce(sum(extract(epoch from (coalesce(ended_at, started_at) - started_at)) / 60), 0)::int from public.sessions where id = any(ss)),
    'km', (select round((coalesce(sum(distance_m), 0) / 1000)::numeric, 1) from public.sessions where id = any(ss)),
    'houses', public.houses_for_sessions(ss),
    'contacts', (select count(*) from public.contacts where church_id = v_church and created_at >= v_from and created_at < v_to),
    'gospel', (select count(*) from public.contact_visits where church_id = v_church and gospel_presented and visited_at >= v_from and visited_at < v_to),
    'promises', (select count(*) from public.contact_visits where church_id = v_church and promise_day is not null and visited_at >= v_from and visited_at < v_to),
    'visits', (select count(*) from public.contact_visits where church_id = v_church and session_id is null and visited_at >= v_from and visited_at < v_to),
    'attendance', (select count(distinct (contact_id, attended_on)) from public.attendances where church_id = v_church and attended_on >= v_mon - 7 and attended_on < v_mon),
    'first_time', (select count(*) from (select contact_id, min(attended_on) f from public.attendances where church_id = v_church group by contact_id) x where x.f >= v_mon - 7 and x.f < v_mon),
    'saved', (select count(*) from public.contacts where church_id = v_church and saved_on >= v_mon - 7 and saved_on < v_mon),
    'baptisms', (select count(*) from public.contacts where church_id = v_church and baptized_on >= v_mon - 7 and baptized_on < v_mon),
    'new_members', (select count(*) from public.contacts where church_id = v_church and member_since >= v_mon - 7 and member_since < v_mon),
    'absent', (select count(*) from public.contacts c where c.church_id = v_church and not c.archived and c.status = 'member'
               and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on >= v_mon - 2 and a.attended_on < v_mon)),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'dow', s.dow, 'count', x.n, 'visitors', x.v) order by s.dow, s.sort_order, s.time)
      from public.church_services s
      cross join lateral (
        select count(*)::int n, count(*) filter (where c.status <> 'member')::int v
        from public.attendances a join public.contacts c on c.id = a.contact_id
        where a.service_id = s.id and a.attended_on >= v_mon - 7 and a.attended_on < v_mon
      ) x
      where s.church_id = v_church and (s.active or x.n > 0)), '[]'::jsonb),
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

create or replace function public.church_progress(p_months integer default null) returns table (
  month date,
  avg_attendance numeric,    -- promedio de personas por reunión principal
  people int,                -- personas distintas que vinieron en el mes
  first_time int,
  members int,               -- miembros al final del mes
  new_members int,
  saved int,
  baptisms int,
  class_present int,         -- asistencias a clases
  contacts int,
  gospel int,
  promises int,
  outings int,
  people_out int,
  hours numeric,
  km numeric,
  houses int
)
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_tz text; v_start date; v_end date;
begin
  if not public.is_captain_or_admin() then raise exception 'Solo líderes, secretaría y pastor'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;
  v_end := date_trunc('month', now() at time zone v_tz)::date;
  select least(
    coalesce((select min(attended_on) from public.attendances where church_id = v_church), v_end),
    coalesce((select min(started_at at time zone v_tz)::date from public.sessions where church_id = v_church), v_end),
    coalesce((select min(created_at at time zone v_tz)::date from public.contacts where church_id = v_church), v_end),
    coalesce((select min(member_since) from public.contacts where church_id = v_church), v_end))
  into v_start;
  v_start := date_trunc('month', v_start)::date;
  if p_months is not null then v_start := greatest(v_start, (v_end - make_interval(months => p_months - 1))::date); end if;

  return query
  with m as (select g::date m0, (g + interval '1 month')::date m1 from generate_series(v_start, v_end, interval '1 month') g),
  firsts as (select contact_id, min(attended_on) f from public.attendances where church_id = v_church group by contact_id)
  select m.m0,
    coalesce((select round(avg(n), 1) from (
      select count(*) n from public.attendances a join public.church_services s on s.id = a.service_id and s.main
      where a.church_id = v_church and a.attended_on >= m.m0 and a.attended_on < m.m1 group by a.attended_on, a.service_id) q), 0),
    (select count(distinct contact_id)::int from public.attendances where church_id = v_church and attended_on >= m.m0 and attended_on < m.m1),
    (select count(*)::int from firsts where f >= m.m0 and f < m.m1),
    (select count(*)::int from public.contacts c where c.church_id = v_church and c.status = 'member' and not c.archived
       and coalesce(c.member_since, (c.created_at at time zone v_tz)::date) < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and member_since >= m.m0 and member_since < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and saved_on >= m.m0 and saved_on < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and baptized_on >= m.m0 and baptized_on < m.m1),
    (select count(*)::int from public.class_attendance where church_id = v_church and present and on_date >= m.m0 and on_date < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and (created_at at time zone v_tz)::date >= m.m0 and (created_at at time zone v_tz)::date < m.m1),
    (select count(*)::int from public.contact_visits where church_id = v_church and gospel_presented and (visited_at at time zone v_tz)::date >= m.m0 and (visited_at at time zone v_tz)::date < m.m1),
    (select count(*)::int from public.contact_visits where church_id = v_church and promise_day is not null and (visited_at at time zone v_tz)::date >= m.m0 and (visited_at at time zone v_tz)::date < m.m1),
    x.n, x.p, x.h, x.k,
    public.houses_for_sessions(x.ids)
  from m
  cross join lateral (
    select count(*)::int n, count(distinct user_id)::int p,
           round((coalesce(sum(extract(epoch from (coalesce(ended_at, started_at) - started_at))), 0) / 3600)::numeric, 1) h,
           round((coalesce(sum(distance_m), 0) / 1000)::numeric, 1) k,
           coalesce(array_agg(id), '{}') ids
    from public.sessions where (ended_at is null or counts) and church_id = v_church and (started_at at time zone v_tz)::date >= m.m0 and (started_at at time zone v_tz)::date < m.m1
  ) x
  order by m.m0;
end $$;

create or replace function public.list_outings(p_days integer default 14, p_user uuid default null)
returns table (id uuid, user_id uuid, display_name text, kind text, started_at timestamptz, ended_at timestamptz,
               distance_m float8, contacts integer, presentations integer, promises integer, auto_stopped boolean,
               trimmed_at timestamptz, last_point timestamptz, counts boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.user_id, p.display_name, s.kind, s.started_at, s.ended_at, s.distance_m,
         (select count(*)::integer from public.contacts c where c.session_id = s.id),
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.promise_day is not null),
         s.auto_stopped, s.trimmed_at,
         (select max(t.recorded_at) from public.track_points t where t.session_id = s.id),
         s.counts
  from public.sessions s join public.profiles p on p.id = s.user_id
  where s.church_id = public.current_church_id()
    and (public.is_staff() or s.user_id = auth.uid())
    and (p_user is null or s.user_id = p_user)
    and (s.ended_at is null or s.started_at > now() - make_interval(days => greatest(1, least(p_days, 120))))
  order by (s.ended_at is null) desc, s.started_at desc
  limit 200
$$;
grant execute on function public.list_outings(integer, uuid) to authenticated;
