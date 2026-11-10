\set ON_ERROR_STOP on
-- 0046: el recorrido del colectivo.
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.bus_runs;
update public.groups set captain_id = '00000000-0000-0000-0000-000000000004' where id = '20000000-0000-0000-0000-000000000001';
update public.profiles set group_id = '20000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set group_id = '20000000-0000-0000-0000-000000000002' where id = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
select public.start_bus_run('20000000-0000-0000-0000-000000000001', -27.3600, -55.8900);
do $$ declare v uuid; begin
  select run_id into v from public.bus_live_routes() where group_id = '20000000-0000-0000-0000-000000000001';
  perform public.update_bus_run(v, -27.3601, -55.8901, 0);   -- ~15 m: no suma punto
  perform public.update_bus_run(v, -27.3620, -55.8920, 0);   -- lejos: suma
  perform public.update_bus_run(v, -27.3650, -55.8950, 0);   -- lejos: suma
  if (select count(*) from public.bus_run_trail(v)) <> 3 then raise exception 'FALLO: puntos del recorrido (%)', (select count(*) from public.bus_run_trail(v)); end if;
end $$;
-- Lucía (ruta 1) ve la línea en orden; Nico (ruta 2) no.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ declare v uuid; begin
  select run_id into v from public.bus_live_routes() where group_id = '20000000-0000-0000-0000-000000000001';
  if (select count(*) from public.bus_run_trail(v)) <> 3 then raise exception 'FALLO: Lucía no ve el recorrido'; end if;
  if (select lat from public.bus_run_trail(v) order by at, lat desc limit 1) is null then raise exception 'FALLO: orden'; end if;
  begin
    perform * from public.bus_run_points;
    raise exception 'FALLO: lee los puntos directo';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('test.run', (select id::text from public.bus_runs limit 1), false);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ declare v uuid; begin
  v := current_setting('test.run')::uuid;
  if (select count(*) from public.bus_run_trail(v)) <> 0 then raise exception 'FALLO: Nico ve el recorrido de otra ruta'; end if;
end $$;
reset role;
delete from public.bus_runs;
do $$ begin
  if exists (select 1 from public.bus_run_points) then raise exception 'FALLO: quedaron puntos sueltos'; end if;
end $$;
