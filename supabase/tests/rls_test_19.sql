\set ON_ERROR_STOP on
-- 0025: puntos sobre el eje no marcan las dos veredas.
reset role;
insert into public.sessions (id, church_id, user_id, started_at, ended_at) values
  ('c0000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', now() - interval '20 minutes', now());
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng, accuracy_m)
select 'c0000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2',
       now() - interval '20 minutes' + make_interval(secs => i * 5),
       case when i % 3 = 0 then -27.6000 - 5 / 111320.0 else -27.6000 + (case when i % 2 = 1 then 0.5 else -0.5 end) / 111320.0 end,
       -55.8999 + i * 0.00005, 5
from generate_series(0, 17) i;
do $$ begin
  perform public.recompute_session_coverage('c0000000-0000-0000-0000-0000000000e2');
  if (select count(*) from public.coverage_events where session_id = 'c0000000-0000-0000-0000-0000000000e2') <> 1
     or exists (select 1 from public.coverage_events where session_id = 'c0000000-0000-0000-0000-0000000000e2' and side <> -1) then
    raise exception 'FALLO: los puntos sobre el eje marcaron la vereda equivocada o las dos (%)',
      (select string_agg(road_id || ':' || seg || ':' || side, ', ') from public.coverage_events where session_id = 'c0000000-0000-0000-0000-0000000000e2');
  end if;
end $$;
