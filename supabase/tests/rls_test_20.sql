\set ON_ERROR_STOP on
-- 0026: recorrido con pocos puntos.
reset role;
insert into public.sessions (id, church_id, user_id, started_at, ended_at) values
  ('c0000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', now() - interval '20 minutes', now());
-- 3 puntos a 40 m y 40 s de distancia por la vereda sur
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng, accuracy_m)
select 'c0000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2',
       now() - interval '20 minutes' + make_interval(secs => i * 40), -27.6000 - 5 / 111320.0, -55.8999 + i * 0.0004, 5
from generate_series(0, 2) i;
do $$ begin
  perform public.recompute_session_coverage('c0000000-0000-0000-0000-0000000000e3');
  if not exists (select 1 from public.coverage_events where session_id = 'c0000000-0000-0000-0000-0000000000e3' and road_id = 990101 and side = -1) then
    raise exception 'FALLO: con pocos puntos no marcó la cuadra'; end if;
end $$;
