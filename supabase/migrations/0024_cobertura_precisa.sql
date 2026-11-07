-- 0024: marcado de veredas más preciso, y corregirlo a mano.
-- Reglas nuevas (iguales a src/lib/track.ts → coverageFromTrack):
--   - puntos con precisión ≤ 25 m, a ≤ 20 m del eje y DENTRO del tramo (no en la esquina: así no se marca la calle que se cruza),
--   - caminando a lo largo de la calle (rumbo ± 35°),
--   - un punto suelto del otro lado (distinto de sus dos vecinos) es el GPS saltando y no cuenta,
--   - por vereda: al menos 3 puntos, el 30% de los puntos del tramo, y recorrer la mitad del tramo (o 25 m).
-- A mano: tocar una vereda en el mapa → "No se hizo" (la quita de esa salida, o de todas) o "Marcar como hecha".
-- Lo que se quitó a mano no vuelve a aparecer al recalcular.

alter table public.coverage_events alter column session_id drop not null;
alter table public.coverage_events add column if not exists manual boolean not null default false;

create table if not exists public.coverage_exclusions (
  id         bigserial primary key,
  church_id  uuid not null references public.churches(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  road_id    bigint not null references public.roads(id) on delete cascade,
  seg        integer not null,
  side       smallint not null,
  by_user    uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, road_id, seg, side)
);
alter table public.coverage_exclusions enable row level security;
grant select on public.coverage_exclusions to authenticated;
drop policy if exists coverage_exclusions_read on public.coverage_exclusions;
create policy coverage_exclusions_read on public.coverage_exclusions for select to authenticated using (church_id = public.current_church_id());

-- Lo que manda el teléfono durante la salida: se saltea lo que se quitó a mano.
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

  create temporary table if not exists _up (road_id bigint, seg integer, side smallint, at timestamptz) on commit drop;
  truncate _up;
  insert into _up
  select e.road_id, e.seg, e.side, e.at
  from jsonb_to_recordset(p_events) as e(road_id bigint, seg integer, side smallint, at timestamptz)
  join public.roads r on r.id = e.road_id
  where e.side in (-1, 1) and e.at is not null
    and not exists (select 1 from public.coverage_exclusions x where x.session_id = p_session and x.road_id = e.road_id and x.seg = e.seg and x.side = e.side);

  insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at, kind)
  select v_session.church_id, u.road_id, u.seg, u.side, v_uid, v_session.id, u.at, v_session.kind from _up u
  on conflict (session_id, road_id, seg, side) do nothing;
  get diagnostics v_count = row_count;

  insert into public.coverage (church_id, road_id, seg, side, kind, last_covered_at, last_user_id, last_session_id, times)
  select v_session.church_id, u.road_id, u.seg, u.side, v_session.kind, max(u.at), v_uid, v_session.id, 1
  from _up u group by u.road_id, u.seg, u.side
  on conflict (church_id, road_id, seg, side, kind) do update set
    last_covered_at = greatest(public.coverage.last_covered_at, excluded.last_covered_at),
    last_user_id = case when excluded.last_covered_at >= public.coverage.last_covered_at then excluded.last_user_id else public.coverage.last_user_id end,
    last_session_id = case when excluded.last_covered_at >= public.coverage.last_covered_at then excluded.last_session_id else public.coverage.last_session_id end,
    times = (select count(distinct coalesce(e.session_id::text, e.id::text)) from public.coverage_events e
             where e.church_id = excluded.church_id and e.road_id = excluded.road_id and e.seg = excluded.seg and e.side = excluded.side and e.kind = excluded.kind);
  return v_count;
end $$;
grant execute on function public.upsert_coverage(uuid, jsonb) to authenticated;

-- Recalcular una salida con las reglas nuevas.
create or replace function public.recompute_session_coverage(p_session uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_keys jsonb;
  v_n integer;
begin
  select * into s from public.sessions where id = p_session;
  if s.id is null then raise exception 'No existe la salida'; end if;
  if auth.uid() is not null and not public.can_fix_session(p_session) then
    raise exception 'No tenés permiso para esta salida';
  end if;

  create temporary table if not exists _cov (road_id bigint, seg int, side smallint, at timestamptz) on commit drop;
  truncate _cov;

  insert into _cov
  with pts as (
    select t.recorded_at, t.lat, t.lng
    from public.track_points t
    where t.session_id = p_session and coalesce(t.accuracy_m, 0) <= 25 and coalesce(t.speed_mps, 0) <= 5.5
  ), nb as (
    select p.*, lag(lat) over w plat, lag(lng) over w plng, lead(lat) over w nlat, lead(lng) over w nlng
    from pts p window w as (order by recorded_at)
  ), hd as (
    select nb.*,
      case when plat is not null and nlat is not null and public.haversine_m(plat, plng, nlat, nlng) >= 8
           then degrees(atan2((nlng - plng) * cos(radians(lat)), nlat - plat)) end hdg
    from nb
  ), box as (
    select min(lat) - 0.001 a, max(lat) + 0.001 b, min(lng) - 0.001 c, max(lng) + 0.001 d from pts
  ), segs as (
    select r.id road_id, (e.ord - 1)::int seg,
           (e.v->>0)::float8 alat, (e.v->>1)::float8 alng, (n.v->>0)::float8 blat, (n.v->>1)::float8 blng
    from public.roads r, box
    cross join lateral jsonb_array_elements(r.coords) with ordinality e(v, ord)
    join lateral (select x.v from jsonb_array_elements(r.coords) with ordinality x(v, o) where x.o = e.ord + 1) n on true
    where r.max_lat > box.a and r.min_lat < box.b and r.max_lng > box.c and r.min_lng < box.d
  ), cand as (
    select p.recorded_at, p.hdg, sg.road_id, sg.seg,
      (sg.blng - sg.alng) * pi() / 180 * 6371008.8 * cos(radians(sg.alat)) bx,
      (sg.blat - sg.alat) * pi() / 180 * 6371008.8 by_,
      (p.lng - sg.alng) * pi() / 180 * 6371008.8 * cos(radians(sg.alat)) px,
      (p.lat - sg.alat) * pi() / 180 * 6371008.8 py,
      degrees(atan2((sg.blng - sg.alng) * cos(radians(sg.alat)), sg.blat - sg.alat)) sbear
    from hd p join segs sg
      on p.lat between least(sg.alat, sg.blat) - 0.0002 and greatest(sg.alat, sg.blat) + 0.0002
     and p.lng between least(sg.alng, sg.blng) - 0.0003 and greatest(sg.alng, sg.blng) + 0.0003
  ), d as (
    select c.*, case when bx * bx + by_ * by_ = 0 then 0 else (px * bx + py * by_) / (bx * bx + by_ * by_) end tt,
           sqrt(bx * bx + by_ * by_) len
    from cand c
  ), dist as (
    select d.recorded_at, d.road_id, d.seg, d.len, d.tt * d.len along,
           sqrt((px - tt * bx) ^ 2 + (py - tt * by_) ^ 2) m,
           (case when bx * py - by_ * px >= 0 then 1 else -1 end)::smallint side,
           d.hdg, d.sbear
    from d where d.tt > 0.03 and d.tt < 0.97
  ), ok as (
    select * from dist
    where m <= 20 and (hdg is null or (case when mod(abs(hdg - sbear)::numeric, 180) > 90 then 180 - mod(abs(hdg - sbear)::numeric, 180) else mod(abs(hdg - sbear)::numeric, 180) end) <= 35)
  ), best as (
    select distinct on (recorded_at) * from ok order by recorded_at, m
  ), seq as (
    select b.*, lag(side) over w ps, lead(side) over w ns from best b window w as (partition by road_id, seg order by recorded_at)
  ), kept as (
    select * from seq where (ps is null and ns is null) or ps = side or ns = side
  ), agg as (
    select road_id, seg, side, count(*) n, max(along) - min(along) span, max(recorded_at) at, max(len) len,
           sum(count(*)) over (partition by road_id, seg) total
    from kept group by road_id, seg, side
  )
  select a.road_id, a.seg, a.side, a.at from agg a
  where a.n >= case when a.len < 20 then 2 else 3 end
    and a.n::float8 / a.total >= 0.3
    and a.span >= least(25, a.len * 0.5)
    and not exists (select 1 from public.coverage_exclusions x where x.session_id = p_session and x.road_id = a.road_id and x.seg = a.seg and x.side = a.side);

  select coalesce(jsonb_agg(jsonb_build_object('road_id', road_id, 'seg', seg, 'side', side, 'kind', kind)), '[]'::jsonb)
    into v_keys from public.coverage_events where session_id = p_session;
  delete from public.coverage_events where session_id = p_session;

  insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at, kind)
  select s.church_id, road_id, seg, side, s.user_id, p_session, at, s.kind from _cov;
  get diagnostics v_n = row_count;

  insert into public.coverage (church_id, road_id, seg, side, kind, last_covered_at, last_user_id, last_session_id, times)
  select s.church_id, road_id, seg, side, s.kind, at, s.user_id, p_session, 1 from _cov
  on conflict (church_id, road_id, seg, side, kind) do nothing;

  select v_keys || coalesce(jsonb_agg(jsonb_build_object('road_id', road_id, 'seg', seg, 'side', side, 'kind', s.kind)), '[]'::jsonb)
    into v_keys from _cov;
  perform public.refresh_coverage_keys(s.church_id, v_keys);
  perform public.recount_session(p_session);
  return v_n;
end $$;
revoke all on function public.recompute_session_coverage(uuid) from public, anon;
grant execute on function public.recompute_session_coverage(uuid) to authenticated;

-- refresh_coverage_keys: cuenta también las marcas a mano (sin salida).
create or replace function public.refresh_coverage_keys(p_church uuid, p_keys jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  for k in select distinct (x->>'road_id')::bigint road_id, (x->>'seg')::int seg, (x->>'side')::smallint side, x->>'kind' kind
           from jsonb_array_elements(p_keys) x loop
    if exists (select 1 from public.coverage_events e where e.church_id = p_church and e.road_id = k.road_id and e.seg = k.seg and e.side = k.side and e.kind = k.kind) then
      insert into public.coverage (church_id, road_id, seg, side, kind, last_covered_at, last_user_id, last_session_id, times)
      select p_church, k.road_id, k.seg, k.side, k.kind, x.covered_at, x.user_id, x.session_id, x.times
      from (
        select e.covered_at, e.user_id, e.session_id,
               (select count(distinct coalesce(e2.session_id::text, e2.id::text)) from public.coverage_events e2
                 where e2.church_id = p_church and e2.road_id = k.road_id and e2.seg = k.seg and e2.side = k.side and e2.kind = k.kind)::integer as times
        from public.coverage_events e
        where e.church_id = p_church and e.road_id = k.road_id and e.seg = k.seg and e.side = k.side and e.kind = k.kind
        order by e.covered_at desc limit 1
      ) x
      on conflict (church_id, road_id, seg, side, kind) do update set
        last_covered_at = excluded.last_covered_at, last_user_id = excluded.last_user_id, last_session_id = excluded.last_session_id, times = excluded.times;
    else
      delete from public.coverage c where c.church_id = p_church and c.road_id = k.road_id and c.seg = k.seg and c.side = k.side and c.kind = k.kind;
    end if;
  end loop;
end $$;
revoke all on function public.refresh_coverage_keys(uuid, jsonb) from public, anon, authenticated;

-- Marcar o quitar una vereda a mano.
--   p_done = false, p_session dada → se quita de esa salida.
--   p_done = false, p_session null  → se quita de todas (nadie la hizo).
--   p_done = true                    → se marca como hecha hoy por mí (sin salida).
-- Quitar: el pastor, la secretaría, los capitanes, o el dueño de esa salida. Marcar: cualquiera de la iglesia.
create or replace function public.set_side_coverage(p_road bigint, p_seg integer, p_side smallint, p_kind text, p_done boolean, p_session uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_staff boolean := public.is_captain_or_admin(); e record;
begin
  if v_church is null then raise exception 'Sin iglesia'; end if;
  if p_kind not in ('soulwinning', 'flyers') or p_side not in (-1, 1) then raise exception 'Datos inválidos'; end if;
  if p_done then
    insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at, kind, manual)
    values (v_church, p_road, p_seg, p_side, auth.uid(), null, now(), p_kind, true);
  else
    for e in select * from public.coverage_events
             where church_id = v_church and road_id = p_road and seg = p_seg and side = p_side and kind = p_kind
               and (p_session is null or session_id = p_session) loop
      if not v_staff and e.user_id <> auth.uid() then raise exception 'Solo el pastor, la secretaría, un capitán o quien hizo la salida'; end if;
      if e.session_id is not null then
        insert into public.coverage_exclusions (church_id, session_id, road_id, seg, side, by_user)
        values (v_church, e.session_id, p_road, p_seg, p_side, auth.uid()) on conflict do nothing;
      end if;
      delete from public.coverage_events where id = e.id;
      if e.session_id is not null then perform public.recount_session(e.session_id); end if;
    end loop;
  end if;
  perform public.refresh_coverage_keys(v_church, jsonb_build_array(jsonb_build_object('road_id', p_road, 'seg', p_seg, 'side', p_side, 'kind', p_kind)));
end $$;
grant execute on function public.set_side_coverage(bigint, integer, smallint, text, boolean, uuid) to authenticated;

-- El mapa necesita la última salida de cada vereda, para "ver la salida" y quitarla de esa salida.
drop function if exists public.coverage_in_bbox(double precision, double precision, double precision, double precision);
create or replace function public.coverage_in_bbox(p_min_lat double precision, p_min_lng double precision,
                                                   p_max_lat double precision, p_max_lng double precision)
returns table (road_id bigint, seg integer, side smallint, kind text, last_covered_at timestamptz,
               last_user_name text, times integer, last_session_id uuid, last_user_id uuid)
language sql stable security definer set search_path = public as $$
  select c.road_id, c.seg, c.side, c.kind, c.last_covered_at, p.display_name, c.times, c.last_session_id, c.last_user_id
  from public.coverage c
  join public.roads r on r.id = c.road_id
  left join public.profiles p on p.id = c.last_user_id
  where c.church_id = public.current_church_id()
    and (p_max_lat - p_min_lat) <= 0.2 and (p_max_lng - p_min_lng) <= 0.2
    and r.max_lat >= p_min_lat and r.min_lat <= p_max_lat
    and r.max_lng >= p_min_lng and r.min_lng <= p_max_lng
  limit 20000
$$;
grant execute on function public.coverage_in_bbox(double precision, double precision, double precision, double precision) to authenticated;

drop function if exists public.side_history(bigint, integer, smallint, text);
create or replace function public.side_history(p_road bigint, p_seg integer, p_side smallint, p_kind text default null)
returns table (covered_at timestamptz, user_name text, session_id uuid, kind text, presentations integer, promises integer, manual boolean, user_id uuid)
language sql stable security definer set search_path = public as $$
  select e.covered_at, p.display_name, e.session_id, e.kind,
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.promise_day is not null),
         e.manual, e.user_id
  from public.coverage_events e
  left join public.profiles p on p.id = e.user_id
  where e.church_id = public.current_church_id()
    and e.road_id = p_road and e.seg = p_seg and e.side = p_side
    and (p_kind is null or e.kind = p_kind)
  order by e.covered_at desc
  limit 100
$$;
grant execute on function public.side_history(bigint, integer, smallint, text) to authenticated;

-- Casas: el pastor, la secretaría o un capitán sacan un punto que no es casa o agregan una que falta.
alter table public.houses add column if not exists manual boolean not null default false;
create table if not exists public.house_hidden (
  church_id uuid not null references public.churches(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  by_user uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.house_hidden enable row level security;

create or replace function public.edit_house(p_action text, p_house bigint default null, p_lat double precision default null, p_lng double precision default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare h record; m record; v_id bigint;
begin
  if not public.is_captain_or_admin() then raise exception 'Solo el pastor, la secretaría o un capitán'; end if;
  if p_action = 'hide' then
    select * into h from public.houses where id = p_house;
    if h.id is null then raise exception 'No existe'; end if;
    insert into public.house_hidden (church_id, lat, lng, by_user) values (public.current_church_id(), h.lat, h.lng, auth.uid());
    delete from public.houses where id = p_house;
    return p_house;
  elsif p_action = 'add' then
    -- se asigna a la vereda más cercana (hasta 45 m)
    with segs as (
      select r.id road_id, (e.ord - 1)::int seg, (e.v->>0)::float8 alat, (e.v->>1)::float8 alng, (n.v->>0)::float8 blat, (n.v->>1)::float8 blng
      from public.roads r
      cross join lateral jsonb_array_elements(r.coords) with ordinality e(v, ord)
      join lateral (select x.v from jsonb_array_elements(r.coords) with ordinality x(v, o) where x.o = e.ord + 1) n on true
      where r.max_lat > p_lat - 0.0006 and r.min_lat < p_lat + 0.0006 and r.max_lng > p_lng - 0.0007 and r.min_lng < p_lng + 0.0007
    ), c as (
      select road_id, seg,
        (blng - alng) * pi() / 180 * 6371008.8 * cos(radians(alat)) bx, (blat - alat) * pi() / 180 * 6371008.8 by_,
        (p_lng - alng) * pi() / 180 * 6371008.8 * cos(radians(alat)) px, (p_lat - alat) * pi() / 180 * 6371008.8 py
      from segs
    ), d as (
      select c.*, greatest(0, least(1, case when bx * bx + by_ * by_ = 0 then 0 else (px * bx + py * by_) / (bx * bx + by_ * by_) end)) tt from c
    )
    select road_id, seg, sqrt((px - tt * bx) ^ 2 + (py - tt * by_) ^ 2) dist, (case when bx * py - by_ * px >= 0 then 1 else -1 end)::smallint side
      into m from d order by 3 limit 1;
    insert into public.houses (lat, lng, area, road_id, seg, side, manual)
    values (p_lat, p_lng, null, case when m.dist <= 45 then m.road_id end, case when m.dist <= 45 then m.seg end, case when m.dist <= 45 then m.side end, true)
    returning id into v_id;
    return v_id;
  end if;
  raise exception 'Acción inválida';
end $$;
grant execute on function public.edit_house(text, bigint, double precision, double precision) to authenticated;

-- Al volver a cargar las casas del satélite: no reaparecen las que se sacaron ni se pierden las agregadas a mano.
create or replace function public.load_houses(p_response bigint) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  delete from public.houses where not manual;
  insert into public.houses (lat, lng, area, road_id, seg, side)
  select x.lat, x.lng, x.area, x.road_id, x.seg, x.side from (
    select split_part(l, ',', 1)::float8 lat, split_part(l, ',', 2)::float8 lng, nullif(split_part(l, ',', 3), '')::integer area,
           nullif(split_part(l, ',', 4), '')::bigint road_id, nullif(split_part(l, ',', 5), '')::integer seg, nullif(split_part(l, ',', 6), '')::smallint side
    from net._http_response r, unnest(string_to_array(r.content, E'\n')) with ordinality as t(l, i)
    where r.id = p_response and r.status_code = 200 and i > 1 and l like '-%'
  ) x
  where not exists (select 1 from public.house_hidden hh where abs(hh.lat - x.lat) < 0.00004 and abs(hh.lng - x.lng) < 0.00004);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.load_houses(bigint) from public, anon, authenticated;
