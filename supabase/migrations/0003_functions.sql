-- ============================================================================
-- La Mies · Fase 1 · Funciones que usa la app (RPC)
-- Todas corren como "security definer" con search_path fijo y verifican por
-- su cuenta quién las llama. La app solo recibe lo que estas funciones devuelven.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Unirse a una iglesia con su código
-- ---------------------------------------------------------------------------
create or replace function public.join_church(p_code text, p_display_name text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_church public.churches;
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 then raise exception 'Falta el nombre'; end if;

  select * into v_church from public.churches where upper(join_code) = upper(trim(p_code));
  if v_church.id is null then raise exception 'Código de iglesia incorrecto'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is not null and v_profile.church_id is not null and v_profile.church_id <> v_church.id then
    raise exception 'Ya pertenecés a otra iglesia. Pedile al administrador que te cambie.';
  end if;

  perform set_config('lamies.bypass_guard', 'on', true);
  insert into public.profiles (id, church_id, display_name)
  values (v_uid, v_church.id, trim(p_display_name))
  on conflict (id) do update
    set church_id = excluded.church_id,
        display_name = excluded.display_name
  returning * into v_profile;

  insert into public.audit_log (church_id, actor_id, action, target)
  values (v_church.id, v_uid, 'join_church', v_uid::text);
  return v_profile;
end $$;

-- ---------------------------------------------------------------------------
-- Salidas
-- ---------------------------------------------------------------------------
create or replace function public.start_session()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_church uuid := public.current_church_id();
  v_id uuid;
begin
  if v_uid is null or v_church is null then raise exception 'No pertenecés a ninguna iglesia'; end if;
  -- Cierra cualquier salida que haya quedado abierta (el teléfono se apagó, etc.)
  update public.sessions set ended_at = coalesce(
      (select max(recorded_at) from public.track_points t where t.session_id = sessions.id), started_at)
    where user_id = v_uid and ended_at is null;
  delete from public.live_positions where user_id = v_uid;

  insert into public.sessions (church_id, user_id) values (v_church, v_uid) returning id into v_id;
  return v_id;
end $$;

-- p_points: [{"t": "2026-10-31T17:05:00Z", "lat": -27.4, "lng": -55.9, "acc": 8, "spd": 1.2, "hdg": 90}, ...]
create or replace function public.upload_track_points(p_session uuid, p_points jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_count integer;
  v_last record;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.user_id <> v_uid then raise exception 'Salida inválida'; end if;
  if v_session.ended_at is not null then raise exception 'La salida ya terminó'; end if;

  insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng, accuracy_m, speed_mps, heading)
  select v_session.id, v_session.church_id, v_uid, x.t, x.lat, x.lng, x.acc, x.spd, x.hdg
  from jsonb_to_recordset(p_points)
    as x(t timestamptz, lat double precision, lng double precision, acc real, spd real, hdg real)
  where x.t is not null and x.lat between -90 and 90 and x.lng between -180 and 180;
  get diagnostics v_count = row_count;

  select x.lat, x.lng, x.hdg, x.t into v_last
  from jsonb_to_recordset(p_points) as x(t timestamptz, lat double precision, lng double precision, hdg real)
  where x.t is not null order by x.t desc limit 1;

  if v_last.lat is not null then
    insert into public.live_positions (user_id, church_id, session_id, lat, lng, heading, updated_at)
    values (v_uid, v_session.church_id, v_session.id, v_last.lat, v_last.lng, v_last.hdg, now())
    on conflict (user_id) do update
      set lat = excluded.lat, lng = excluded.lng, heading = excluded.heading,
          session_id = excluded.session_id, updated_at = now();
  end if;
  return v_count;
end $$;

-- p_events: [{"road_id": 123, "seg": 4, "side": -1, "at": "2026-10-31T17:05:00Z"}, ...]
create or replace function public.upsert_coverage(p_session uuid, p_events jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_count integer;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.user_id <> v_uid then raise exception 'Salida inválida'; end if;

  insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at)
  select v_session.church_id, e.road_id, e.seg, e.side, v_uid, v_session.id, e.at
  from jsonb_to_recordset(p_events) as e(road_id bigint, seg integer, side smallint, at timestamptz)
  join public.roads r on r.id = e.road_id
  where e.side in (-1, 1) and e.at is not null
  on conflict (session_id, road_id, seg, side) do nothing;
  get diagnostics v_count = row_count;

  insert into public.coverage (church_id, road_id, seg, side, last_covered_at, last_user_id, last_session_id, times)
  select v_session.church_id, e.road_id, e.seg, e.side, max(e.at), v_uid, v_session.id, 1
  from jsonb_to_recordset(p_events) as e(road_id bigint, seg integer, side smallint, at timestamptz)
  join public.roads r on r.id = e.road_id
  where e.side in (-1, 1) and e.at is not null
  group by e.road_id, e.seg, e.side
  on conflict (church_id, road_id, seg, side) do update
    set last_covered_at = greatest(coverage.last_covered_at, excluded.last_covered_at),
        last_user_id = case when excluded.last_covered_at >= coverage.last_covered_at then excluded.last_user_id else coverage.last_user_id end,
        last_session_id = case when excluded.last_covered_at >= coverage.last_covered_at then excluded.last_session_id else coverage.last_session_id end,
        times = coverage.times + case when coverage.last_session_id is distinct from excluded.last_session_id then 1 else 0 end;
  return v_count;
end $$;

create or replace function public.end_session(p_session uuid, p_distance_m double precision, p_blocks integer,
                                              p_auto_stopped boolean default false)
returns public.sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.user_id <> v_uid then raise exception 'Salida inválida'; end if;

  update public.sessions s set
    ended_at = coalesce(s.ended_at, now()),
    distance_m = greatest(0, coalesce(p_distance_m, 0)),
    blocks = greatest(0, coalesce(p_blocks, 0)),
    auto_stopped = coalesce(p_auto_stopped, false),
    contacts = (select count(*) from public.contacts c where c.session_id = s.id),
    presentations = (select count(*) from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
    promises = (select count(*) from public.contact_visits v where v.session_id = s.id and v.promise_day is not null)
  where s.id = p_session
  returning * into v_session;

  delete from public.live_positions where user_id = v_uid;
  return v_session;
end $$;

-- Recortar una salida: "me olvidé de apagarla". Todo lo que pasó después de
-- p_cutoff se borra (puntos y cobertura) y la salida termina en ese momento.
-- También lo usa la app cuando detecta velocidad de vehículo (p_auto_stopped).
create or replace function public.trim_session(p_session uuid, p_cutoff timestamptz, p_auto_stopped boolean default false)
returns public.sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_affected record;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null then raise exception 'Salida inválida'; end if;
  if v_session.user_id <> v_uid and not (public.is_admin() and v_session.church_id = public.current_church_id()) then
    raise exception 'Solo el dueño de la salida o un administrador pueden recortarla';
  end if;
  if p_cutoff < v_session.started_at then raise exception 'El corte es anterior al inicio'; end if;

  -- 1. Borrar puntos y eventos de cobertura posteriores al corte.
  delete from public.track_points where session_id = p_session and recorded_at > p_cutoff;

  create temp table if not exists _trim_affected (road_id bigint, seg integer, side smallint) on commit drop;
  delete from _trim_affected;
  insert into _trim_affected
    select distinct road_id, seg, side from public.coverage_events
    where session_id = p_session and covered_at > p_cutoff;
  delete from public.coverage_events where session_id = p_session and covered_at > p_cutoff;

  -- 2. Rehacer la cobertura de las veredas afectadas con lo que quedó.
  for v_affected in select * from _trim_affected loop
    if exists (select 1 from public.coverage_events e
               where e.church_id = v_session.church_id and e.road_id = v_affected.road_id
                 and e.seg = v_affected.seg and e.side = v_affected.side) then
      update public.coverage c set
        last_covered_at = x.last_at, last_user_id = x.user_id, last_session_id = x.session_id, times = x.times
      from (
        select e.covered_at as last_at, e.user_id, e.session_id,
               (select count(distinct e2.session_id) from public.coverage_events e2
                 where e2.church_id = v_session.church_id and e2.road_id = v_affected.road_id
                   and e2.seg = v_affected.seg and e2.side = v_affected.side)::integer as times
        from public.coverage_events e
        where e.church_id = v_session.church_id and e.road_id = v_affected.road_id
          and e.seg = v_affected.seg and e.side = v_affected.side
        order by e.covered_at desc limit 1
      ) x
      where c.church_id = v_session.church_id and c.road_id = v_affected.road_id
        and c.seg = v_affected.seg and c.side = v_affected.side;
    else
      delete from public.coverage c
      where c.church_id = v_session.church_id and c.road_id = v_affected.road_id
        and c.seg = v_affected.seg and c.side = v_affected.side;
    end if;
  end loop;

  -- 3. Cerrar la salida en el corte y recalcular distancia y cuadras.
  update public.sessions s set
    ended_at = p_cutoff,
    trimmed_at = now(),
    auto_stopped = s.auto_stopped or coalesce(p_auto_stopped, false),
    distance_m = coalesce((
      select sum(public.haversine_m(prev_lat, prev_lng, lat, lng))
      from (select lat, lng, lag(lat) over (order by recorded_at) as prev_lat,
                   lag(lng) over (order by recorded_at) as prev_lng
            from public.track_points t where t.session_id = p_session) q
      where prev_lat is not null), 0),
    blocks = (select count(distinct (road_id, seg)) from public.coverage_events e where e.session_id = p_session),
    contacts = (select count(*) from public.contacts c where c.session_id = s.id),
    presentations = (select count(*) from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
    promises = (select count(*) from public.contact_visits v where v.session_id = s.id and v.promise_day is not null)
  where s.id = p_session
  returning * into v_session;

  delete from public.live_positions where session_id = p_session;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (v_session.church_id, v_uid, 'trim_session', p_session::text,
          jsonb_build_object('cutoff', p_cutoff, 'auto', p_auto_stopped));
  return v_session;
end $$;

-- ---------------------------------------------------------------------------
-- Mapa: calles y cobertura en un rectángulo
-- ---------------------------------------------------------------------------
create or replace function public.roads_in_bbox(p_min_lat double precision, p_min_lng double precision,
                                                p_max_lat double precision, p_max_lng double precision)
returns setof public.roads
language sql stable security definer set search_path = public as $$
  select * from public.roads
  where auth.uid() is not null
    and (p_max_lat - p_min_lat) <= 0.2 and (p_max_lng - p_min_lng) <= 0.2
    and max_lat >= p_min_lat and min_lat <= p_max_lat
    and max_lng >= p_min_lng and min_lng <= p_max_lng
  limit 4000
$$;

create or replace function public.coverage_in_bbox(p_min_lat double precision, p_min_lng double precision,
                                                   p_max_lat double precision, p_max_lng double precision)
returns table (road_id bigint, seg integer, side smallint, last_covered_at timestamptz,
               last_user_name text, times integer)
language sql stable security definer set search_path = public as $$
  select c.road_id, c.seg, c.side, c.last_covered_at, p.display_name, c.times
  from public.coverage c
  join public.roads r on r.id = c.road_id
  left join public.profiles p on p.id = c.last_user_id
  where c.church_id = public.current_church_id()
    and (p_max_lat - p_min_lat) <= 0.2 and (p_max_lng - p_min_lng) <= 0.2
    and r.max_lat >= p_min_lat and r.min_lat <= p_max_lat
    and r.max_lng >= p_min_lng and r.min_lng <= p_max_lng
  limit 20000
$$;

-- Historial de una vereda: quién pasó y cuándo.
create or replace function public.side_history(p_road bigint, p_seg integer, p_side smallint)
returns table (covered_at timestamptz, user_name text, session_id uuid, presentations integer, promises integer)
language sql stable security definer set search_path = public as $$
  select e.covered_at, p.display_name, e.session_id,
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.promise_day is not null)
  from public.coverage_events e
  left join public.profiles p on p.id = e.user_id
  where e.church_id = public.current_church_id()
    and e.road_id = p_road and e.seg = p_seg and e.side = p_side
  order by e.covered_at desc
  limit 50
$$;

-- ---------------------------------------------------------------------------
-- Equipo en vivo y tablero
-- ---------------------------------------------------------------------------
create or replace function public.team_live()
returns table (user_id uuid, display_name text, session_id uuid, started_at timestamptz,
               lat double precision, lng double precision, heading real, updated_at timestamptz,
               presentations integer, promises integer, contacts integer)
language sql stable security definer set search_path = public as $$
  select s.user_id, p.display_name, s.id, s.started_at, l.lat, l.lng, l.heading, l.updated_at,
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.promise_day is not null),
         (select count(*)::integer from public.contacts c where c.session_id = s.id)
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  left join public.live_positions l on l.user_id = s.user_id
  where s.church_id = public.current_church_id()
    and s.ended_at is null
    and s.started_at > now() - interval '12 hours'
  order by s.started_at
$$;

-- Inicio del período ("day", "week", "month") en la zona horaria de la iglesia.
create or replace function public.period_start(p_period text)
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  v_local timestamp := (now() at time zone v_tz);
begin
  return case p_period
    when 'week'  then (date_trunc('week', v_local)) at time zone v_tz
    when 'month' then (date_trunc('month', v_local)) at time zone v_tz
    when 'all'   then '1970-01-01'::timestamptz
    else (date_trunc('day', v_local)) at time zone v_tz
  end;
end $$;

-- Puntos: presentación 1 · promesa 3 · vino a la iglesia 10.
-- "Vino" se le acredita a quien marcó la casa. Bautismos y discipulado se
-- muestran como totales pero no suman puntos (cambiar acá si se quiere).
create or replace function public.scoreboard(p_period text)
returns table (user_id uuid, display_name text, group_id uuid, group_name text,
               presentations integer, promises integer, came integer, points integer)
language sql stable security definer set search_path = public as $$
  with since as (select public.period_start(p_period) as t),
  visits as (
    select v.user_id,
           count(*) filter (where v.gospel_presented) as presentations,
           count(*) filter (where v.promise_day is not null) as promises
    from public.contact_visits v, since
    where v.church_id = public.current_church_id() and v.visited_at >= since.t
    group by v.user_id
  ),
  came as (
    select c.created_by as user_id, count(*) as came
    from public.attendances a
    join public.contacts c on c.id = a.contact_id, since
    where a.church_id = public.current_church_id() and a.attended_on >= (since.t)::date
    group by c.created_by
  )
  select p.id, p.display_name, p.group_id, g.name,
         coalesce(v.presentations, 0)::integer, coalesce(v.promises, 0)::integer, coalesce(k.came, 0)::integer,
         (coalesce(v.presentations, 0) * 1 + coalesce(v.promises, 0) * 3 + coalesce(k.came, 0) * 10)::integer as points
  from public.profiles p
  left join public.groups g on g.id = p.group_id
  left join visits v on v.user_id = p.id
  left join came k on k.user_id = p.id
  where p.church_id = public.current_church_id()
    and (coalesce(v.presentations, 0) + coalesce(v.promises, 0) + coalesce(k.came, 0)) > 0
  order by points desc, p.display_name
$$;

-- Totales del equipo para el período (lo que muestra "Salida de hoy").
create or replace function public.team_totals(p_period text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select public.period_start(p_period) as t)
  select jsonb_build_object(
    'sessions',      (select count(*) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'members',       (select count(distinct s.user_id) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'minutes',       (select coalesce(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60), 0)::integer
                        from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'blocks',        (select coalesce(sum(s.blocks), 0) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'presentations', (select count(*) from public.contact_visits v, since where v.church_id = public.current_church_id() and v.visited_at >= since.t and v.gospel_presented),
    'promises',      (select count(*) from public.contact_visits v, since where v.church_id = public.current_church_id() and v.visited_at >= since.t and v.promise_day is not null),
    'came',          (select count(*) from public.attendances a, since where a.church_id = public.current_church_id() and a.attended_on >= (since.t)::date),
    'discipleship',  (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.discipleship_since >= (since.t)::date),
    'baptisms',      (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.baptized_on >= (since.t)::date),
    'contacts',      (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.created_at >= since.t)
  )
$$;

-- ---------------------------------------------------------------------------
-- Mi progreso (niveles e insignias se calculan en la app con estos números)
-- ---------------------------------------------------------------------------
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
      where s.user_id = v_uid and s.ended_at is not null
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
    'sessions',      (select count(*) from public.sessions s where s.user_id = v_uid and s.ended_at is not null),
    'minutes',       (select coalesce(sum(extract(epoch from (s.ended_at - s.started_at)) / 60), 0)::integer from public.sessions s where s.user_id = v_uid and s.ended_at is not null),
    'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s where s.user_id = v_uid),
    'presentations', (select count(*) from public.contact_visits v where v.user_id = v_uid and v.gospel_presented),
    'promises',      (select count(*) from public.contact_visits v where v.user_id = v_uid and v.promise_day is not null),
    'came',          (select count(*) from public.attendances a join public.contacts c on c.id = a.contact_id where c.created_by = v_uid),
    'discipleship',  (select count(*) from public.contacts c where c.created_by = v_uid and c.discipleship_since is not null),
    'baptisms',      (select count(*) from public.contacts c where c.created_by = v_uid and c.baptized_on is not null),
    'streak_weeks',  v_streak,
    'last_session',  (select max(s.started_at) from public.sessions s where s.user_id = v_uid)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Panel del pastor
-- ---------------------------------------------------------------------------
create or replace function public.church_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_captain_or_admin() then null else jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'sessions',      (select count(*) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'members',       (select count(distinct s.user_id) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'minutes',       (select coalesce(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60), 0)::integer from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'blocks',        (select coalesce(sum(s.blocks), 0) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
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
        'sessions', (select count(*) from public.sessions s where s.user_id = p.id and s.started_at >= p_from and s.started_at < p_to),
        'presentations', (select count(*) from public.contact_visits v where v.user_id = p.id and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
        'promises', (select count(*) from public.contact_visits v where v.user_id = p.id and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
        'last_session', (select max(s.started_at) from public.sessions s where s.user_id = p.id)
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
      where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to
    )
  ) end
$$;

-- Red de iglesias (Fase 3): solo totales, nunca contactos ni recorridos.
create or replace function public.network_summary(p_from timestamptz, p_to timestamptz)
returns table (church_id uuid, church_name text, city text, country text,
               sessions integer, members integer, presentations integer, promises integer, came integer,
               discipleship integer, baptisms integer)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.country,
    (select count(*)::integer from public.sessions s where s.church_id = c.id and s.started_at >= p_from and s.started_at < p_to),
    (select count(distinct s.user_id)::integer from public.sessions s where s.church_id = c.id and s.started_at >= p_from and s.started_at < p_to),
    (select count(*)::integer from public.contact_visits v where v.church_id = c.id and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
    (select count(*)::integer from public.contact_visits v where v.church_id = c.id and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
    (select count(*)::integer from public.attendances a where a.church_id = c.id and a.attended_on >= p_from::date and a.attended_on < p_to::date),
    (select count(*)::integer from public.contacts k where k.church_id = c.id and k.discipleship_since >= p_from::date and k.discipleship_since < p_to::date),
    (select count(*)::integer from public.contacts k where k.church_id = c.id and k.baptized_on >= p_from::date and k.baptized_on < p_to::date)
  from public.churches c
  where public.is_network_admin()
  order by c.country, c.name
$$;

-- ---------------------------------------------------------------------------
-- Administración
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(p_user uuid, p_role public.member_role, p_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  if not exists (select 1 from public.profiles where id = p_user and church_id = public.current_church_id()) then
    raise exception 'Esa persona no es de tu iglesia';
  end if;
  if p_group is not null and not exists (select 1 from public.groups where id = p_group and church_id = public.current_church_id()) then
    raise exception 'Ese grupo no es de tu iglesia';
  end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set role = p_role, group_id = p_group where id = p_user;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_member_role', p_user::text,
          jsonb_build_object('role', p_role, 'group', p_group));
end $$;

create or replace function public.rotate_join_code()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  v_code := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8));
  update public.churches set join_code = v_code where id = public.current_church_id();
  insert into public.audit_log (church_id, actor_id, action) values (public.current_church_id(), auth.uid(), 'rotate_join_code');
  return v_code;
end $$;

create or replace function public.record_attendance(p_contact uuid, p_date date, p_service text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_captain_or_admin() then raise exception 'Solo capitanes y administradores'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then
    raise exception 'Contacto inválido';
  end if;
  insert into public.attendances (church_id, contact_id, attended_on, service, recorded_by)
  values (public.current_church_id(), p_contact, p_date, p_service, auth.uid())
  on conflict (contact_id, attended_on, service) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from anon, public;
grant execute on function
  public.join_church(text, text), public.start_session(), public.upload_track_points(uuid, jsonb),
  public.upsert_coverage(uuid, jsonb), public.end_session(uuid, double precision, integer, boolean),
  public.trim_session(uuid, timestamptz, boolean), public.haversine_m(double precision, double precision, double precision, double precision),
  public.roads_in_bbox(double precision, double precision, double precision, double precision),
  public.coverage_in_bbox(double precision, double precision, double precision, double precision),
  public.side_history(bigint, integer, smallint), public.team_live(), public.period_start(text),
  public.scoreboard(text), public.team_totals(text), public.my_progress(),
  public.church_report(timestamptz, timestamptz), public.network_summary(timestamptz, timestamptz),
  public.set_member_role(uuid, public.member_role, uuid), public.rotate_join_code(),
  public.record_attendance(uuid, date, text),
  public.current_church_id(), public.current_group_id(), public.current_role_name(),
  public.is_admin(), public.is_captain_or_admin(), public.is_network_admin(),
  public.can_see_contact(public.contacts), public.can_edit_contact(public.contacts)
to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real: la app se suscribe a estos cambios (RLS sigue aplicando).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_positions, public.sessions, public.contacts;
  end if;
end $$;
