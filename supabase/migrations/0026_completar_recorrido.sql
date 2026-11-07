-- 0026: si el teléfono guardó pocos puntos (el iPhone a veces guarda uno por minuto), se completa el camino
-- entre dos puntos cercanos (≤ 90 s y ≤ 120 m) con un punto cada 5 m antes de marcar veredas. Igual que track.ts → densify.

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
  with raw as (
    select t.recorded_at, t.lat, t.lng,
           lead(t.recorded_at) over w nt, lead(t.lat) over w nlat0, lead(t.lng) over w nlng0
    from public.track_points t
    where t.session_id = p_session and coalesce(t.accuracy_m, 0) <= 25 and coalesce(t.speed_mps, 0) <= 5.5
    window w as (order by t.recorded_at)
  ), gaps as (
    select r.*, public.haversine_m(r.lat, r.lng, r.nlat0, r.nlng0) d, extract(epoch from (r.nt - r.recorded_at)) dt from raw r where r.nt is not null
  ), pts as (
    -- con pocos puntos (uno por minuto), se completa el camino entre dos puntos cercanos con uno cada 5 m
    select recorded_at, lat, lng from raw
    union all
    select g.recorded_at + (g.nt - g.recorded_at) * (k::float8 / floor(g.d / 5)),
           g.lat + (g.nlat0 - g.lat) * (k::float8 / floor(g.d / 5)),
           g.lng + (g.nlng0 - g.lng) * (k::float8 / floor(g.d / 5))
    from gaps g cross join lateral generate_series(1, greatest(floor(g.d / 5)::int - 1, 0)) k
    where g.d > 10 and g.d <= 120 and g.dt > 0 and g.dt <= 90 and g.d / g.dt <= 3
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
  ), seg_ok as (
    -- ¿se recorrió el tramo? (todos los puntos)
    select road_id, seg, count(*) n, max(along) - min(along) span, max(len) len, max(recorded_at) at
    from best group by road_id, seg
    having count(*) >= case when max(len) < 20 then 2 else 3 end and max(along) - min(along) >= least(25, max(len) * 0.5)
  ), known as (
    -- de qué vereda: solo puntos a 2,5 m o más del eje
    select b.*, lag(side) over w ps, lead(side) over w ns from best b where b.m >= 2.5 window w as (partition by road_id, seg order by recorded_at)
  ), kept as (
    select * from known where (ps is null and ns is null) or ps = side or ns = side
  ), agg as (
    select road_id, seg, side, count(*) n, max(along) - min(along) span,
           sum(count(*)) over (partition by road_id, seg) total
    from kept group by road_id, seg, side
  )
  select a.road_id, a.seg, a.side, s2.at from agg a join seg_ok s2 on s2.road_id = a.road_id and s2.seg = a.seg
  where a.n >= 2 and a.n::float8 / a.total >= 0.3
    and (a.n = a.total or a.span >= least(25, s2.len * 0.5))
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

