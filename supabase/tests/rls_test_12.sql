\set ON_ERROR_STOP on
-- 0017: recalcular las cuadras de una salida desde el recorrido.
reset role;
insert into public.roads (id, name, highway, coords, min_lat, min_lng, max_lat, max_lng) values
  (990001, 'Calle de prueba', 'residential', '[[-27.5000, -55.9000], [-27.5000, -55.8990], [-27.5000, -55.8980]]', -27.5000, -55.9000, -27.5000, -55.8980);
insert into public.sessions (id, church_id, user_id, started_at, ended_at) values
  ('c0000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', now() - interval '30 minutes', now());
-- camina por el lado norte (8 m) toda la cuadra, y un punto suelto lejos
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng, accuracy_m)
select 'c0000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2',
       now() - interval '30 minutes' + make_interval(secs => i * 20), -27.49993, -55.89995 + i * 0.0001, 10
from generate_series(0, 18) i;
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng, accuracy_m) values
  ('c0000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', now(), -27.49, -55.89, 10);

set role authenticated;
-- otro miembro no puede
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  begin perform public.recompute_session_coverage('c0000000-0000-0000-0000-00000000000d'); raise exception 'FALLO: un miembro recalculó la salida de otro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
-- el dueño sí, y dos veces da lo mismo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
select public.recompute_session_coverage('c0000000-0000-0000-0000-00000000000d');
select public.recompute_session_coverage('c0000000-0000-0000-0000-00000000000d');
reset role;
do $$ declare n int; b int; begin
  select count(*) into n from public.coverage_events where session_id = 'c0000000-0000-0000-0000-00000000000d';
  if n <> 2 then raise exception 'FALLO: esperaba 2 tramos cubiertos, hay %', n; end if;
  if exists (select 1 from public.coverage_events where session_id = 'c0000000-0000-0000-0000-00000000000d' and side <> 1) then
    raise exception 'FALLO: marcó la vereda equivocada'; end if;
  select blocks into b from public.sessions where id = 'c0000000-0000-0000-0000-00000000000d';
  if b <> 2 then raise exception 'FALLO: la salida no cuenta 2 cuadras (%)', b; end if;
  if (select count(*) from public.coverage where road_id = 990001) <> 2 then raise exception 'FALLO: no quedó pintado en el mapa'; end if;
end $$;
