-- ============================================================================
-- La Mies · v0.7
--   Salidas: panel de administración (terminar, recortar, quitar un tramo, borrar), aviso si el teléfono deja de marcar,
--            resumen para compartir, zonas asignadas, casas (Google Open Buildings).
--   Seguimiento: mis contactos, recordatorio el día de la promesa, "prometió y no vino", camino del contacto (salvo),
--                faltas de 1, 2 y 3 semanas (miembros y visitas) a las personas elegidas.
--   Iglesia: eventos, pedidos de oración (a quién), anuncios por grupo, apuntes de la prédica, directorio,
--            sugerencias, roles y títulos, informe semanal, logo, resumen y audio de prédicas.
-- Se puede correr más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.churches add column if not exists logo_path text;
alter table public.churches add column if not exists absence_recipients uuid[];   -- null = pastor y secretaría
alter table public.churches add column if not exists report_recipients uuid[];    -- null = pastor y secretaría
alter table public.profiles add column if not exists title text;                  -- Pastor, Pastor asistente, Diácono, Líder…
alter table public.profiles add column if not exists directory_visible boolean not null default false;
alter table public.contacts add column if not exists saved_on date;               -- recibió a Cristo
alter table public.sessions add column if not exists alerted_at timestamptz;      -- aviso "no está marcando"
alter table public.sermons add column if not exists summary text;
alter table public.sermons add column if not exists notes_outline text;           -- apuntes con ___ para completar

create or replace function public.staff_ids(p_church uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where church_id = p_church and role::text in ('admin', 'secretary') and disabled_at is null
$$;
revoke all on function public.staff_ids(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Casas (Google Open Buildings: edificios detectados en imágenes satelitales)
-- ---------------------------------------------------------------------------
create table if not exists public.houses (
  id      bigserial primary key,
  lat     double precision not null,
  lng     double precision not null,
  area    integer,
  road_id bigint,
  seg     integer,
  side    smallint
);
create index if not exists houses_seg_idx on public.houses (road_id, seg, side);
create index if not exists houses_pos_idx on public.houses (lat, lng);
alter table public.houses enable row level security;
drop policy if exists houses_select on public.houses;
create policy houses_select on public.houses for select to authenticated using (true);
grant select on public.houses to authenticated;

create or replace function public.houses_in_bbox(p_min_lat float8, p_min_lng float8, p_max_lat float8, p_max_lng float8)
returns table (id bigint, lat float8, lng float8, road_id bigint, seg integer, side smallint)
language sql stable security definer set search_path = public as $$
  select h.id, h.lat, h.lng, h.road_id, h.seg, h.side from public.houses h
  where h.lat between p_min_lat and p_max_lat and h.lng between p_min_lng and p_max_lng
  limit 6000
$$;
grant execute on function public.houses_in_bbox(float8, float8, float8, float8) to authenticated;

-- Carga el CSV (lat,lng,area,road_id,seg,side) bajado con pg_net.
create or replace function public.load_houses(p_response bigint) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  truncate public.houses;
  insert into public.houses (lat, lng, area, road_id, seg, side)
  select split_part(l, ',', 1)::float8, split_part(l, ',', 2)::float8, nullif(split_part(l, ',', 3), '')::integer,
         split_part(l, ',', 4)::bigint, split_part(l, ',', 5)::integer, split_part(l, ',', 6)::smallint
  from net._http_response r, unnest(string_to_array(r.content, E'\n')) with ordinality as t(l, i)
  where r.id = p_response and r.status_code = 200 and i > 1 and l like '-%';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.load_houses(bigint) from public, anon, authenticated;

-- Casas frente a las veredas de un conjunto de salidas.
create or replace function public.houses_for_sessions(p_sessions uuid[]) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.houses h
  where exists (select 1 from public.coverage_events e
                where e.session_id = any(p_sessions) and e.road_id = h.road_id and e.seg = h.seg and e.side = h.side)
$$;
revoke all on function public.houses_for_sessions(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Totales del equipo: + casas
-- ---------------------------------------------------------------------------
create or replace function public.team_totals(p_period text)
returns jsonb language sql stable security definer set search_path = public as $$
  with since as (select public.period_start(p_period) as t),
  ss as (select s.* from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t)
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

-- ---------------------------------------------------------------------------
-- Salidas: resumen, lista para administradores, terminar, recortar, quitar tramo, borrar
-- ---------------------------------------------------------------------------
create or replace function public.can_fix_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sessions s where s.id = p_session
                 and (s.user_id = auth.uid() or (public.is_staff() and s.church_id = public.current_church_id())))
$$;

create or replace function public.session_summary(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.sessions; v_name text;
begin
  select * into s from public.sessions where id = p_session and church_id = public.current_church_id();
  if s.id is null then raise exception 'Salida inválida'; end if;
  select display_name into v_name from public.profiles where id = s.user_id;
  return jsonb_build_object(
    'id', s.id, 'user_id', s.user_id, 'name', v_name, 'kind', s.kind,
    'started_at', s.started_at, 'ended_at', s.ended_at,
    'minutes', (extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60)::integer,
    'distance_m', s.distance_m,
    'sidewalks', (select count(distinct (road_id, seg, side)) from public.coverage_events e where e.session_id = s.id),
    'blocks', (select count(distinct (road_id, seg)) from public.coverage_events e where e.session_id = s.id),
    'houses', public.houses_for_sessions(array[s.id]),
    'contacts', (select count(*) from public.contacts c where c.session_id = s.id),
    'presentations', (select count(*) from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
    'promises', (select count(*) from public.contact_visits v where v.session_id = s.id and v.promise_day is not null)
  );
end $$;
grant execute on function public.session_summary(uuid) to authenticated;

create or replace function public.list_outings(p_days integer default 14, p_user uuid default null)
returns table (id uuid, user_id uuid, display_name text, kind text, started_at timestamptz, ended_at timestamptz,
               distance_m float8, contacts integer, presentations integer, promises integer, auto_stopped boolean,
               trimmed_at timestamptz, last_point timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.user_id, p.display_name, s.kind, s.started_at, s.ended_at, s.distance_m,
         (select count(*)::integer from public.contacts c where c.session_id = s.id),
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.promise_day is not null),
         s.auto_stopped, s.trimmed_at,
         (select max(t.recorded_at) from public.track_points t where t.session_id = s.id)
  from public.sessions s join public.profiles p on p.id = s.user_id
  where s.church_id = public.current_church_id()
    and (public.is_staff() or s.user_id = auth.uid())
    and (p_user is null or s.user_id = p_user)
    and (s.ended_at is null or s.started_at > now() - make_interval(days => greatest(1, least(p_days, 120))))
  order by (s.ended_at is null) desc, s.started_at desc
  limit 200
$$;
grant execute on function public.list_outings(integer, uuid) to authenticated;

-- Rehace la tabla "coverage" para las veredas que tocaba una salida (después de borrar eventos).
create or replace function public.refresh_coverage_keys(p_church uuid, p_keys jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  for k in select (x->>'road_id')::bigint road_id, (x->>'seg')::int seg, (x->>'side')::smallint side, x->>'kind' kind
           from jsonb_array_elements(p_keys) x loop
    if exists (select 1 from public.coverage_events e where e.church_id = p_church and e.road_id = k.road_id and e.seg = k.seg and e.side = k.side and e.kind = k.kind) then
      update public.coverage c set
        last_covered_at = x.covered_at, last_user_id = x.user_id, last_session_id = x.session_id, times = x.times
      from (
        select e.covered_at, e.user_id, e.session_id,
               (select count(distinct e2.session_id) from public.coverage_events e2
                 where e2.church_id = p_church and e2.road_id = k.road_id and e2.seg = k.seg and e2.side = k.side and e2.kind = k.kind)::integer as times
        from public.coverage_events e
        where e.church_id = p_church and e.road_id = k.road_id and e.seg = k.seg and e.side = k.side and e.kind = k.kind
        order by e.covered_at desc limit 1
      ) x
      where c.church_id = p_church and c.road_id = k.road_id and c.seg = k.seg and c.side = k.side and c.kind = k.kind;
    else
      delete from public.coverage c where c.church_id = p_church and c.road_id = k.road_id and c.seg = k.seg and c.side = k.side and c.kind = k.kind;
    end if;
  end loop;
end $$;
revoke all on function public.refresh_coverage_keys(uuid, jsonb) from public, anon, authenticated;

create or replace function public.recount_session(p_session uuid) returns void
language sql security definer set search_path = public as $$
  update public.sessions s set
    distance_m = coalesce((
      select sum(public.haversine_m(prev_lat, prev_lng, lat, lng))
      from (select lat, lng, lag(lat) over (order by recorded_at) prev_lat, lag(lng) over (order by recorded_at) prev_lng
            from public.track_points t where t.session_id = p_session) q
      where prev_lat is not null), 0),
    blocks = (select count(distinct (road_id, seg)) from public.coverage_events e where e.session_id = p_session),
    contacts = (select count(*) from public.contacts c where c.session_id = p_session),
    presentations = (select count(*) from public.contact_visits v where v.session_id = p_session and v.gospel_presented),
    promises = (select count(*) from public.contact_visits v where v.session_id = p_session and v.promise_day is not null)
  where s.id = p_session
$$;
revoke all on function public.recount_session(uuid) from public, anon, authenticated;

create or replace function public.notify_outing_fixed(p_session uuid, p_what text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.sessions; v_me text;
begin
  select * into s from public.sessions where id = p_session;
  if s.id is null or s.user_id = auth.uid() then return; end if;
  select display_name into v_me from public.profiles where id = auth.uid();
  perform public.notify(s.user_id, 'outing', 'Tu salida fue corregida',
    coalesce(v_me, 'Un administrador') || ' ' || p_what || ' tu salida del ' || to_char(s.started_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || '.',
    '/salidas');
end $$;
revoke all on function public.notify_outing_fixed(uuid, text) from public, anon, authenticated;

-- Terminar una salida (propia o, si sos secretaría/pastor, de cualquiera). Corta en el último punto o en p_cutoff.
create or replace function public.finish_outing(p_session uuid, p_cutoff timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.sessions; v_cut timestamptz; v_keys jsonb;
begin
  if not public.can_fix_session(p_session) then raise exception 'No podés cambiar esta salida'; end if;
  select * into s from public.sessions where id = p_session;
  v_cut := coalesce(p_cutoff, (select max(recorded_at) from public.track_points where session_id = p_session), now());
  v_cut := greatest(v_cut, s.started_at);
  select coalesce(jsonb_agg(distinct jsonb_build_object('road_id', road_id, 'seg', seg, 'side', side, 'kind', kind)), '[]') into v_keys
  from public.coverage_events where session_id = p_session and covered_at > v_cut;
  delete from public.track_points where session_id = p_session and recorded_at > v_cut;
  delete from public.coverage_events where session_id = p_session and covered_at > v_cut;
  perform public.refresh_coverage_keys(s.church_id, v_keys);
  update public.sessions set ended_at = v_cut, trimmed_at = case when p_cutoff is null then trimmed_at else now() end where id = p_session;
  perform public.recount_session(p_session);
  delete from public.live_positions where session_id = p_session;
  perform public.notify_outing_fixed(p_session, case when s.ended_at is null then 'terminó' else 'recortó' end);
end $$;
grant execute on function public.finish_outing(uuid, timestamptz) to authenticated;

-- Quitar un tramo del medio (por ejemplo, un viaje en auto o una parada).
create or replace function public.cut_outing_range(p_session uuid, p_from timestamptz, p_to timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare s public.sessions; v_keys jsonb;
begin
  if not public.can_fix_session(p_session) then raise exception 'No podés cambiar esta salida'; end if;
  if p_to <= p_from then raise exception 'El tramo no es válido'; end if;
  select * into s from public.sessions where id = p_session;
  select coalesce(jsonb_agg(distinct jsonb_build_object('road_id', road_id, 'seg', seg, 'side', side, 'kind', kind)), '[]') into v_keys
  from public.coverage_events where session_id = p_session and covered_at between p_from and p_to;
  delete from public.track_points where session_id = p_session and recorded_at between p_from and p_to;
  delete from public.coverage_events where session_id = p_session and covered_at between p_from and p_to;
  perform public.refresh_coverage_keys(s.church_id, v_keys);
  update public.sessions set trimmed_at = now() where id = p_session;
  perform public.recount_session(p_session);
  perform public.notify_outing_fixed(p_session, 'quitó un tramo de');
end $$;
grant execute on function public.cut_outing_range(uuid, timestamptz, timestamptz) to authenticated;

-- Borrar una salida equivocada (las casas marcadas quedan, sin salida).
create or replace function public.delete_outing(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.sessions; v_keys jsonb;
begin
  if not public.can_fix_session(p_session) then raise exception 'No podés cambiar esta salida'; end if;
  select * into s from public.sessions where id = p_session;
  perform public.notify_outing_fixed(p_session, 'borró');
  select coalesce(jsonb_agg(distinct jsonb_build_object('road_id', road_id, 'seg', seg, 'side', side, 'kind', kind)), '[]') into v_keys
  from public.coverage_events where session_id = p_session;
  delete from public.coverage_events where session_id = p_session;
  perform public.refresh_coverage_keys(s.church_id, v_keys);
  delete from public.track_points where session_id = p_session;
  delete from public.live_positions where session_id = p_session;
  update public.contacts set session_id = null where session_id = p_session;
  update public.contact_visits set session_id = null where session_id = p_session;
  delete from public.sessions where id = p_session;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (s.church_id, auth.uid(), 'delete_outing', p_session::text, jsonb_build_object('user', s.user_id, 'started', s.started_at));
end $$;
grant execute on function public.delete_outing(uuid) to authenticated;

-- Puntos de una salida (también para administradores).
create or replace function public.outing_points(p_session uuid)
returns table (recorded_at timestamptz, lat float8, lng float8, accuracy_m real, speed_mps real)
language sql stable security definer set search_path = public as $$
  select t.recorded_at, t.lat, t.lng, t.accuracy_m, t.speed_mps from public.track_points t
  where t.session_id = p_session and public.can_fix_session(p_session)
  order by t.recorded_at
$$;
grant execute on function public.outing_points(uuid) to authenticated;

-- Aviso si el teléfono deja de mandar la ubicación durante una salida.
create or replace function public.alert_silent_sessions() returns integer
language plpgsql security definer set search_path = public as $$
declare s record; v_last timestamptz; n integer := 0;
begin
  for s in select * from public.sessions where ended_at is null loop
    select max(recorded_at) into v_last from public.track_points where session_id = s.id;
    v_last := coalesce(v_last, s.started_at);
    if s.alerted_at is not null and v_last > s.alerted_at then
      update public.sessions set alerted_at = null where id = s.id;   -- volvió a marcar
      continue;
    end if;
    if s.alerted_at is null and v_last < now() - interval '6 minutes' and v_last > now() - interval '55 minutes' then
      perform public.notify(s.user_id, 'outing', 'Tu salida no está marcando',
        'Hace unos minutos que el teléfono no manda tu ubicación. Abrí La Mies para que siga marcando. En iPhone: Ajustes → La Mies → Ubicación → "Siempre".',
        '/salida');
      update public.sessions set alerted_at = now() where id = s.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.alert_silent_sessions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Zonas asignadas
-- ---------------------------------------------------------------------------
create table if not exists public.zones (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  name        text not null,
  color       text not null default '#2F8F5B',
  polygon     jsonb not null,                 -- [[lat,lng], ...]
  assigned    uuid[] not null default '{}',
  on_date     date,
  note        text,
  archived    boolean not null default false,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.zones enable row level security;
drop policy if exists zones_select on public.zones;
create policy zones_select on public.zones for select to authenticated using (church_id = public.current_church_id());
drop policy if exists zones_write on public.zones;
create policy zones_write on public.zones for all to authenticated
  using (church_id = public.current_church_id() and public.is_captain_or_admin())
  with check (church_id = public.current_church_id() and public.is_captain_or_admin());
grant select, insert, update, delete on public.zones to authenticated;

create or replace function public.point_in_poly(p_lat float8, p_lng float8, p_poly jsonb) returns boolean
language plpgsql immutable as $$
declare n int := jsonb_array_length(p_poly); i int; j int; yi float8; xi float8; yj float8; xj float8; inside boolean := false;
begin
  j := n - 1;
  for i in 0 .. n - 1 loop
    yi := (p_poly->i->>0)::float8; xi := (p_poly->i->>1)::float8;
    yj := (p_poly->j->>0)::float8; xj := (p_poly->j->>1)::float8;
    if ((yi > p_lat) <> (yj > p_lat)) and (p_lng < (xj - xi) * (p_lat - yi) / nullif(yj - yi, 0) + xi) then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end $$;

-- Avance de una zona: veredas (tramo + lado) cuyo punto medio cae adentro, cubiertas desde que se creó la zona.
create or replace function public.zone_progress(p_zone uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare z public.zones; v_min_lat float8; v_max_lat float8; v_min_lng float8; v_max_lng float8; v_total int; v_done int; v_houses int; v_houses_done int;
begin
  select * into z from public.zones where id = p_zone and church_id = public.current_church_id();
  if z.id is null then return null; end if;
  select min((p->>0)::float8), max((p->>0)::float8), min((p->>1)::float8), max((p->>1)::float8)
    into v_min_lat, v_max_lat, v_min_lng, v_max_lng from jsonb_array_elements(z.polygon) p;
  with segs as (
    select r.id road_id, (i - 1)::int seg,
           ((r.coords->(i-1)->>0)::float8 + (r.coords->i->>0)::float8) / 2 mlat,
           ((r.coords->(i-1)->>1)::float8 + (r.coords->i->>1)::float8) / 2 mlng
    from public.roads r, generate_series(1, jsonb_array_length(r.coords) - 1) i
    where r.max_lat >= v_min_lat and r.min_lat <= v_max_lat and r.max_lng >= v_min_lng and r.min_lng <= v_max_lng
  ), inside as (
    select road_id, seg from segs where public.point_in_poly(mlat, mlng, z.polygon)
  ), sides as (
    select road_id, seg, sd::smallint side from inside, unnest(array[1, -1]) sd
  )
  select count(*),
         count(*) filter (where exists (select 1 from public.coverage_events e where e.church_id = z.church_id and e.road_id = sides.road_id
                                         and e.seg = sides.seg and e.side = sides.side and e.covered_at >= z.created_at)),
         (select count(*) from public.houses h join sides s2 on s2.road_id = h.road_id and s2.seg = h.seg and s2.side = h.side),
         (select count(*) from public.houses h join sides s2 on s2.road_id = h.road_id and s2.seg = h.seg and s2.side = h.side
            where exists (select 1 from public.coverage_events e where e.church_id = z.church_id and e.road_id = h.road_id
                          and e.seg = h.seg and e.side = h.side and e.covered_at >= z.created_at))
    into v_total, v_done, v_houses, v_houses_done
  from sides;
  return jsonb_build_object('sidewalks', v_total, 'done', v_done, 'houses', v_houses, 'houses_done', v_houses_done);
end $$;
grant execute on function public.zone_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Seguimiento de contactos
-- ---------------------------------------------------------------------------
create or replace function public.my_followups()
returns table (id uuid, name text, phone text, photo_path text, status text, interest text, promise_day text,
               created_at timestamptz, last_visit timestamptz, last_attended date, address_hint text, saved_on date)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.phone, c.photo_path, c.status, c.interest, c.promise_day, c.created_at,
         (select max(v.visited_at) from public.contact_visits v where v.contact_id = c.id),
         (select max(a.attended_on) from public.attendances a where a.contact_id = c.id),
         coalesce(c.address, c.address_hint), c.saved_on
  from public.contacts c
  where c.church_id = public.current_church_id() and not c.archived and c.status in ('contact', 'visitor')
    and coalesce(c.interest, 'some') <> 'none'
    and (c.follow_up_user_id = auth.uid() or (c.follow_up_user_id is null and c.created_by = auth.uid()))
  order by (c.promise_day is not null) desc, case c.interest when 'very' then 0 when 'some' then 1 else 2 end,
           (select max(v.visited_at) from public.contact_visits v where v.contact_id = c.id) nulls first
  limit 300
$$;
grant execute on function public.my_followups() to authenticated;

-- Día de la promesa (a la mañana) y "prometió y no vino" (el lunes).
create or replace function public.run_promise_reminders(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; v_dow int := extract(dow from p_local)::int; v_day text; v_sat date;
begin
  v_day := case v_dow when 6 then 'sat' when 0 then 'sun' else null end;
  if v_day is not null and extract(hour from p_local)::int = 9 and public.job_once(p_church, 'promise_' || v_day, p_local::date::text) then
    for r in select c.id, c.name, coalesce(c.follow_up_user_id, c.created_by) uid from public.contacts c
             where c.church_id = p_church and not c.archived and c.promise_day = v_day and c.status in ('contact', 'visitor')
               and coalesce(c.follow_up_user_id, c.created_by) is not null
               and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on >= p_local::date - 1) loop
      perform public.notify(r.uid, 'promise', 'Hoy prometió venir ' || r.name,
        'Tocá para mandarle un WhatsApp de recordatorio o ver su ficha.', '/contacto/' || r.id || '?wa=promise');
      n := n + 1;
    end loop;
  end if;
  if v_dow = 1 and extract(hour from p_local)::int = 10 and public.job_once(p_church, 'promise_missed', p_local::date::text) then
    v_sat := p_local::date - 2;
    for r in select c.id, c.name, coalesce(c.follow_up_user_id, c.created_by) uid from public.contacts c
             where c.church_id = p_church and not c.archived and c.promise_day is not null and c.status in ('contact', 'visitor')
               and coalesce(c.follow_up_user_id, c.created_by) is not null
               and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (v_sat, v_sat + 1))
               and exists (select 1 from public.contact_visits v where v.contact_id = c.id and v.promise_day is not null and v.visited_at < v_sat::timestamptz)
               and not exists (select 1 from public.notifications x where x.kind = 'promise_missed' and x.link like '/contacto/' || c.id || '%' and x.created_at > now() - interval '20 days') loop
      perform public.notify(r.uid, 'promise_missed', r.name || ' prometió venir y no vino',
        'Volvé a visitarlo esta semana o escribile.', '/contacto/' || r.id || '?wa=visit');
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;
revoke all on function public.run_promise_reminders(uuid, timestamp) from public, anon, authenticated;

-- Camino del contacto mes a mes.
create or replace function public.pipeline_report(p_months integer default 6)
returns table (month date, contacts integer, gospel integer, visited integer, came integer, saved integer, baptized integer, members integer)
language sql stable security definer set search_path = public as $$
  with m as (select generate_series(date_trunc('month', now() - make_interval(months => greatest(1, least(p_months, 24)) - 1)), date_trunc('month', now()), interval '1 month')::date as month)
  select m.month,
    (select count(*)::int from public.contacts c where c.church_id = public.current_church_id() and date_trunc('month', c.created_at)::date = m.month),
    (select count(distinct v.contact_id)::int from public.contact_visits v where v.church_id = public.current_church_id() and v.gospel_presented and date_trunc('month', v.visited_at)::date = m.month),
    (select count(distinct v.contact_id)::int from public.contact_visits v where v.church_id = public.current_church_id() and date_trunc('month', v.visited_at)::date = m.month),
    (select count(*)::int from (select a.contact_id, min(a.attended_on) f from public.attendances a where a.church_id = public.current_church_id() group by a.contact_id) x where date_trunc('month', x.f)::date = m.month),
    (select count(*)::int from public.contacts c where c.church_id = public.current_church_id() and date_trunc('month', c.saved_on)::date = m.month),
    (select count(*)::int from public.contacts c where c.church_id = public.current_church_id() and date_trunc('month', c.baptized_on)::date = m.month),
    (select count(*)::int from public.contacts c where c.church_id = public.current_church_id() and date_trunc('month', c.member_since)::date = m.month)
  from m where public.is_staff() or public.is_captain_or_admin()
  order by m.month desc
$$;
grant execute on function public.pipeline_report(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Faltas: miembros y visitas, cuántos fines de semana seguidos (1, 2, 3+)
-- ---------------------------------------------------------------------------
drop function if exists public.weekend_absences(date);
create or replace function public.weekend_absences(p_saturday date)
returns table (contact_id uuid, name text, photo_path text, phone text, status text, group_id uuid, group_name text,
               last_attended date, weeks_missed integer, last_visit timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.photo_path, c.phone, c.status, c.group_id, g.name,
         la.d,
         -- fines de semana seguidos sin venir, contando este (máximo 3; si nunca vino, 3)
         case when la.d is null then 3 else least(3, greatest(1, ((p_saturday - la.d) / 7)::int + (case when la.d < p_saturday then 0 else 1 end))) end,
         (select max(v.visited_at) from public.contact_visits v where v.contact_id = c.id)
  from public.contacts c
  left join public.groups g on g.id = c.group_id
  left join lateral (select max(a.attended_on) d from public.attendances a where a.contact_id = c.id and a.attended_on < p_saturday) la on true
  where c.church_id = public.current_church_id() and not c.archived
    and (
      (public.is_staff() and c.status in ('member', 'visitor'))
      or (public.current_role_name()::text = 'captain' and c.group_id = public.current_group_id())
    )
    -- una visita que nunca vino no es una falta
    and (c.status = 'member' or exists (select 1 from public.attendances a where a.contact_id = c.id))
    and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (p_saturday, p_saturday + 1))
  order by 9 desc, g.name nulls first, c.name
$$;
grant execute on function public.weekend_absences(date) to authenticated;

create or replace function public.run_absence_report(p_church uuid, p_sunday date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_sat date := p_sunday - 1;
  v1 int := 0; v2 int := 0; v3 int := 0;
  r record; v_to uuid; v_n integer := 0; v_body text;
begin
  for r in
    select c.id, (select max(a.attended_on) from public.attendances a where a.contact_id = c.id and a.attended_on < v_sat) d
    from public.contacts c
    where c.church_id = p_church and not c.archived and c.status in ('member', 'visitor')
      and (c.status = 'member' or exists (select 1 from public.attendances a where a.contact_id = c.id))
      and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (v_sat, p_sunday))
  loop
    if r.d is null or v_sat - r.d >= 21 then v3 := v3 + 1;
    elsif v_sat - r.d >= 14 then v2 := v2 + 1;
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
  return v_n;
end $$;
revoke all on function public.run_absence_report(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  title      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  all_day    boolean not null default false,
  place      text,
  description text,
  weekly     boolean not null default false,       -- se repite cada semana
  source_id  text,                                 -- id del calendario de donde vino
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (church_id, source_id)
);
create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  occurs_on  date not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, occurs_on)
);
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (church_id = public.current_church_id());
drop policy if exists events_write on public.events;
create policy events_write on public.events for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());
drop policy if exists rsvps_select on public.event_rsvps;
create policy rsvps_select on public.event_rsvps for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.church_id = public.current_church_id()));
drop policy if exists rsvps_own on public.event_rsvps;
create policy rsvps_own on public.event_rsvps for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.events, public.event_rsvps to authenticated;

-- Recordatorio la víspera a las 19:00 para quienes dijeron "voy".
create or replace function public.run_event_reminders(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if extract(hour from p_local)::int <> 19 or not public.job_once(p_church, 'event_reminders', p_local::date::text) then return 0; end if;
  for r in select e.id, e.title, x.user_id from public.events e join public.event_rsvps x on x.event_id = e.id and x.occurs_on = p_local::date + 1
           where e.church_id = p_church loop
    perform public.notify(r.user_id, 'event', 'Mañana: ' || r.title, 'Te anotaste para ir. ¡Te esperamos!', '/eventos');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_event_reminders(uuid, timestamp) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos de oración
-- ---------------------------------------------------------------------------
create table if not exists public.prayer_requests (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body       text not null check (length(body) between 2 and 2000),
  visibility text not null default 'church' check (visibility in ('church', 'pastor', 'people')),
  people     uuid[] not null default '{}',
  anonymous  boolean not null default false,
  answered_at timestamptz,
  answer_note text,
  created_at timestamptz not null default now()
);
create table if not exists public.prayer_prayed (
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
alter table public.prayer_requests enable row level security;
alter table public.prayer_prayed enable row level security;

create or replace function public.can_see_prayer(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.prayer_requests p where p.id = p_id and p.church_id = public.current_church_id()
    and (p.user_id = auth.uid() or p.visibility = 'church'
         or (p.visibility = 'pastor' and public.current_role_name()::text = 'admin')
         or (p.visibility = 'people' and auth.uid() = any(p.people))))
$$;

drop policy if exists prayer_select on public.prayer_requests;
create policy prayer_select on public.prayer_requests for select to authenticated using (public.can_see_prayer(id));
drop policy if exists prayer_insert on public.prayer_requests;
create policy prayer_insert on public.prayer_requests for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid());
drop policy if exists prayer_update on public.prayer_requests;
create policy prayer_update on public.prayer_requests for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists prayer_delete on public.prayer_requests;
create policy prayer_delete on public.prayer_requests for delete to authenticated
  using (user_id = auth.uid() or (public.is_staff() and church_id = public.current_church_id()));
drop policy if exists prayed_select on public.prayer_prayed;
create policy prayed_select on public.prayer_prayed for select to authenticated using (public.can_see_prayer(request_id));
drop policy if exists prayed_own on public.prayer_prayed;
create policy prayed_own on public.prayer_prayed for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_prayer(request_id));
grant select, insert, update, delete on public.prayer_requests, public.prayer_prayed to authenticated;

create or replace function public.prayer_list()
returns table (id uuid, user_id uuid, author text, body text, visibility text, people uuid[], anonymous boolean,
               answered_at timestamptz, answer_note text, created_at timestamptz, prayed integer, i_prayed boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id,
         case when p.anonymous and p.user_id <> auth.uid() then null else pr.display_name end,
         p.body, p.visibility, case when p.user_id = auth.uid() then p.people else '{}'::uuid[] end, p.anonymous,
         p.answered_at, p.answer_note, p.created_at,
         (select count(*)::int from public.prayer_prayed x where x.request_id = p.id),
         exists (select 1 from public.prayer_prayed x where x.request_id = p.id and x.user_id = auth.uid()),
         p.user_id = auth.uid()
  from public.prayer_requests p join public.profiles pr on pr.id = p.user_id
  where public.can_see_prayer(p.id) and (p.answered_at is null or p.answered_at > now() - interval '30 days')
  order by p.created_at desc limit 200
$$;
grant execute on function public.prayer_list() to authenticated;

create or replace function public.prayer_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_name text;
begin
  select display_name into v_name from public.profiles where id = new.user_id;
  if new.visibility = 'pastor' then
    for v_to in select id from public.profiles where church_id = new.church_id and role::text = 'admin' loop
      perform public.notify(v_to, 'prayer', 'Pedido de oración para el pastor', coalesce(v_name, 'Alguien') || ': ' || left(new.body, 140), '/oracion');
    end loop;
  elsif new.visibility = 'people' then
    foreach v_to in array new.people loop
      perform public.notify(v_to, 'prayer', 'Te pidieron oración', coalesce(case when new.anonymous then null else v_name end, 'Alguien') || ': ' || left(new.body, 140), '/oracion');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists prayer_notify on public.prayer_requests;
create trigger prayer_notify after insert on public.prayer_requests for each row execute function public.prayer_notify();

-- ---------------------------------------------------------------------------
-- Anuncios por grupo
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  author_id   uuid default auth.uid() references public.profiles(id) on delete set null,
  title       text not null,
  body        text not null,
  audience    text not null default 'all' check (audience in ('all', 'staff', 'leaders', 'teachers', 'ministry', 'group')),
  ministry_id uuid,
  group_id    uuid,
  sent_to     integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.announcements enable row level security;

create or replace function public.announcement_recipients(p_aud text, p_church uuid, p_ministry uuid, p_group uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where p.church_id = p_church and p.disabled_at is null
    and case p_aud
      when 'all' then true
      when 'staff' then p.role::text in ('admin', 'secretary')
      when 'leaders' then p.role::text in ('admin', 'secretary', 'captain')
      when 'teachers' then exists (select 1 from public.class_teachers t where t.profile_id = p.id)
      when 'ministry' then exists (select 1 from public.ministry_members m where m.ministry_id = p_ministry and m.profile_id = p.id)
      when 'group' then p.group_id = p_group
      else false end
$$;
revoke all on function public.announcement_recipients(text, uuid, uuid, uuid) from public, anon, authenticated;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (church_id = public.current_church_id()
         and (public.is_staff() or author_id = auth.uid()
              or auth.uid() in (select public.announcement_recipients(audience, church_id, ministry_id, group_id))));
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
  with check (church_id = public.current_church_id() and author_id = auth.uid() and public.is_captain_or_admin());
drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete to authenticated
  using (church_id = public.current_church_id() and (author_id = auth.uid() or public.is_staff()));
grant select, insert, delete on public.announcements to authenticated;

create or replace function public.announcement_send() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to uuid; n int := 0;
begin
  for v_to in select public.announcement_recipients(new.audience, new.church_id, new.ministry_id, new.group_id) loop
    continue when v_to = new.author_id;
    perform public.notify(v_to, 'announcement', new.title, left(new.body, 180), '/anuncios');
    n := n + 1;
  end loop;
  update public.announcements set sent_to = n where id = new.id;
  return new;
end $$;
drop trigger if exists announcement_send on public.announcements;
create trigger announcement_send after insert on public.announcements for each row execute function public.announcement_send();

-- ---------------------------------------------------------------------------
-- Apuntes de la prédica
-- ---------------------------------------------------------------------------
create table if not exists public.sermon_notes (
  sermon_id  uuid not null references public.sermons(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  answers    jsonb not null default '[]',
  notes      text,
  updated_at timestamptz not null default now(),
  primary key (sermon_id, user_id)
);
alter table public.sermon_notes enable row level security;
drop policy if exists sermon_notes_own on public.sermon_notes;
create policy sermon_notes_own on public.sermon_notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.sermon_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Sugerencias
-- ---------------------------------------------------------------------------
create table if not exists public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  user_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  body       text not null check (length(body) between 2 and 3000),
  anonymous  boolean not null default false,
  status     text not null default 'new' check (status in ('new', 'seen', 'done')),
  reply      text,
  created_at timestamptz not null default now()
);
alter table public.suggestions enable row level security;
drop policy if exists suggestions_select on public.suggestions;
create policy suggestions_select on public.suggestions for select to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_staff()));
drop policy if exists suggestions_insert on public.suggestions;
create policy suggestions_insert on public.suggestions for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid());
drop policy if exists suggestions_update on public.suggestions;
create policy suggestions_update on public.suggestions for update to authenticated
  using (church_id = public.current_church_id() and public.is_staff()) with check (church_id = public.current_church_id());
grant select, insert, update on public.suggestions to authenticated;

create or replace function public.suggestions_list()
returns table (id uuid, author text, mine boolean, body text, anonymous boolean, status text, reply text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, case when s.anonymous and s.user_id is distinct from auth.uid() then null else p.display_name end,
         s.user_id = auth.uid(), s.body, s.anonymous, s.status, s.reply, s.created_at
  from public.suggestions s left join public.profiles p on p.id = s.user_id
  where s.church_id = public.current_church_id() and (s.user_id = auth.uid() or public.is_staff())
  order by s.created_at desc limit 300
$$;
grant execute on function public.suggestions_list() to authenticated;

create or replace function public.suggestion_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to uuid;
begin
  for v_to in select id from public.profiles where church_id = new.church_id and role::text = 'admin' loop
    perform public.notify(v_to, 'suggestion', 'Nueva sugerencia para la iglesia', left(new.body, 160), '/sugerencias');
  end loop;
  return new;
end $$;
drop trigger if exists suggestion_notify on public.suggestions;
create trigger suggestion_notify after insert on public.suggestions for each row execute function public.suggestion_notify();

-- ---------------------------------------------------------------------------
-- Directorio (solo quienes eligen aparecer)
-- ---------------------------------------------------------------------------
create or replace function public.directory_list()
returns table (id uuid, display_name text, phone text, title text, photo_path text, contact_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.phone, p.title, c.photo_path, c.id
  from public.profiles p left join public.contacts c on c.profile_id = p.id
  where p.church_id = public.current_church_id() and p.directory_visible and p.disabled_at is null
  order by p.display_name
$$;
grant execute on function public.directory_list() to authenticated;

-- ---------------------------------------------------------------------------
-- Roles y títulos (solo el pastor/administrador)
-- ---------------------------------------------------------------------------
create or replace function public.set_profile_title(p_profile uuid, p_title text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.current_role_name()::text <> 'admin' then raise exception 'Solo el pastor o un administrador'; end if;
  update public.profiles set title = nullif(trim(p_title), '') where id = p_profile and church_id = public.current_church_id();
end $$;
grant execute on function public.set_profile_title(uuid, text) to authenticated;

create or replace function public.set_church_recipients(p_absence uuid[], p_report uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Solo la secretaría o el pastor'; end if;
  update public.churches set absence_recipients = p_absence, report_recipients = p_report where id = public.current_church_id();
end $$;
grant execute on function public.set_church_recipients(uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Informe semanal (lunes 8:00)
-- ---------------------------------------------------------------------------
create or replace function public.weekly_report(p_church uuid default null, p_monday date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := coalesce(p_church, public.current_church_id()); v_mon date; v_from timestamptz; v_to timestamptz; v_tz text; ss uuid[];
begin
  if p_church is null and not public.is_staff() then raise exception 'Solo la secretaría o el pastor'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;
  v_mon := coalesce(p_monday, date_trunc('week', (now() at time zone v_tz))::date);
  v_from := (v_mon - 7)::timestamp at time zone v_tz;
  v_to := v_mon::timestamp at time zone v_tz;
  select coalesce(array_agg(id), '{}') into ss from public.sessions where church_id = v_church and started_at >= v_from and started_at < v_to;
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
               and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on >= v_mon - 2 and a.attended_on < v_mon))
  );
end $$;
grant execute on function public.weekly_report(uuid, date) to authenticated;

create or replace function public.run_weekly_report(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_to uuid; n integer := 0;
begin
  if extract(dow from p_local)::int <> 1 or extract(hour from p_local)::int <> 8 or not public.job_once(p_church, 'weekly_report', p_local::date::text) then return 0; end if;
  r := public.weekly_report(p_church, p_local::date);
  for v_to in select unnest(coalesce((select report_recipients from public.churches where id = p_church), array(select public.staff_ids(p_church)))) loop
    perform public.notify(v_to, 'report', 'Informe de la semana',
      (r->>'outings') || ' salidas · ' || (r->>'houses') || ' casas · ' || (r->>'contacts') || ' contactos · ' || (r->>'gospel') || ' con el evangelio · '
        || (r->>'attendance') || ' asistencias · ' || (r->>'first_time') || ' vinieron por primera vez',
      '/reporte');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_weekly_report(uuid, timestamp) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tareas automáticas nuevas (cada 5 min salidas; cada hora lo demás)
-- ---------------------------------------------------------------------------
create or replace function public.run_v07_jobs() returns integer
language plpgsql security definer set search_path = public as $$
declare c record; v_local timestamp; n integer := 0;
begin
  for c in select * from public.churches loop
    v_local := now() at time zone coalesce(c.timezone, 'America/Argentina/Buenos_Aires');
    n := n + public.run_promise_reminders(c.id, v_local);
    n := n + public.run_event_reminders(c.id, v_local);
    n := n + public.run_weekly_report(c.id, v_local);
  end loop;
  return n;
end $$;
revoke all on function public.run_v07_jobs() from public, anon, authenticated;

create or replace function public.outings_watch() returns integer
language plpgsql security definer set search_path = public as $$
begin
  return public.alert_silent_sessions() + public.close_idle_sessions();
end $$;
revoke all on function public.outings_watch() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('lamies-salidas-olvidadas', 'lamies-v07');
    perform cron.schedule('lamies-salidas-olvidadas', '*/5 * * * *', 'select public.outings_watch()');
    perform cron.schedule('lamies-v07', '3 * * * *', 'select public.run_v07_jobs()');
  end if;
end $$;
