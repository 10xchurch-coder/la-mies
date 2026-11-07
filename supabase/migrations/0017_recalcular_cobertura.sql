-- 0017: recalcular en el servidor las cuadras de una salida a partir de su recorrido GPS.
-- Sirve para salidas cuyo teléfono no llegó a mandar las cuadras (por ejemplo, cuando todavía
-- no estaban cargadas las calles). Mismo criterio que la app (src/lib/track.ts y geo.ts):
-- puntos con precisión de 50 m o mejor y a menos de 20 km/h, cada punto al tramo de calle más
-- cercano a 25 m o menos, la vereda según el lado del tramo, y al menos 2 puntos por tramo y vereda.
-- Las calles guardan coords como [[lat, lng], ...].

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
    where t.session_id = p_session and coalesce(t.accuracy_m, 0) <= 50 and coalesce(t.speed_mps, 0) <= 5.5
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
    select p.recorded_at, sg.road_id, sg.seg,
      (sg.blng - sg.alng) * pi() / 180 * 6371008.8 * cos(radians(sg.alat)) bx,
      (sg.blat - sg.alat) * pi() / 180 * 6371008.8 by_,
      (p.lng - sg.alng) * pi() / 180 * 6371008.8 * cos(radians(sg.alat)) px,
      (p.lat - sg.alat) * pi() / 180 * 6371008.8 py
    from pts p join segs sg
      on p.lat between least(sg.alat, sg.blat) - 0.0003 and greatest(sg.alat, sg.blat) + 0.0003
     and p.lng between least(sg.alng, sg.blng) - 0.0003 and greatest(sg.alng, sg.blng) + 0.0003
  ), d as (
    select c.*, greatest(0, least(1, case when bx * bx + by_ * by_ = 0 then 0 else (px * bx + py * by_) / (bx * bx + by_ * by_) end)) tt
    from cand c
  ), dist as (
    select d.recorded_at, d.road_id, d.seg,
           sqrt((px - tt * bx) ^ 2 + (py - tt * by_) ^ 2) m,
           (case when bx * py - by_ * px >= 0 then 1 else -1 end)::smallint side
    from d
  ), best as (
    select distinct on (recorded_at) * from dist where m <= 25 order by recorded_at, m
  )
  select road_id, seg, side, max(recorded_at) from best group by 1, 2, 3 having count(*) >= 2;

  -- Lo que esta salida ya tenía se reemplaza por lo recalculado.
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
