\set ON_ERROR_STOP on
-- 0055: paradas del colectivo. c1 = secretaría (arma), c5 = miembro común (no puede).
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.bus_stops;
do $$
declare g uuid; ch uuid; k uuid;
begin
  select church_id into ch from public.profiles where id = '00000000-0000-0000-0000-0000000000c1';
  insert into public.groups (church_id, name) values (ch, 'Ruta prueba 47') returning id into g;
  insert into public.contacts (church_id, created_by, name, lat, lng, group_id, bus_rider, pickup_time)
  values (ch, '00000000-0000-0000-0000-0000000000c1', 'Pasajero Uno', -27.40, -55.90, g, true, '09:10'),
         (ch, '00000000-0000-0000-0000-0000000000c1', 'Pasajero Dos', -27.41, -55.91, g, true, '09:00');
  perform set_config('test.g', g::text, false);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$
declare g uuid := current_setting('test.g')::uuid; ids uuid[];
begin
  if public.bus_stops_from_riders(g) <> 2 then raise exception 'FALLO: no sumó a los 2 pasajeros'; end if;
  if public.bus_stops_from_riders(g) <> 0 then raise exception 'FALLO: los sumó dos veces'; end if;
  insert into public.bus_stops (group_id, sort, label, lat, lng) values (g, 5, 'Plaza', -27.39, -55.89);
  if (select label from public.bus_route_stops(g) limit 1) <> 'Plaza' then raise exception 'FALLO: orden'; end if;
  if (select array_agg(label order by sort) from public.bus_route_stops(g)) <> array['Plaza', 'Pasajero Dos', 'Pasajero Uno'] then raise exception 'FALLO: no ordenó por hora de pasada'; end if;
  if (select lat from public.bus_route_stops(g) where label = 'Pasajero Uno') <> -27.40 then raise exception 'FALLO: no tomó el punto de la ficha'; end if;
  select array_agg(id order by sort desc) into ids from public.bus_route_stops(g);
  perform public.bus_stops_reorder(g, ids);
  if (select label from public.bus_route_stops(g) limit 1) <> 'Pasajero Uno' then raise exception 'FALLO: no reordenó'; end if;
  begin insert into public.bus_stops (group_id, label) values (g, 'Sin punto'); raise exception 'FALLO: aceptó una parada sin punto';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$
declare g uuid := current_setting('test.g')::uuid;
begin
  if exists (select 1 from public.bus_route_stops(g)) or exists (select 1 from public.bus_stops) then raise exception 'FALLO: un miembro común ve las paradas (y las casas)'; end if;
  begin insert into public.bus_stops (group_id, label, lat, lng) values (g, 'X', 0, 0); raise exception 'FALLO: un miembro común agregó una parada';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.bus_stops_from_riders(g); raise exception 'FALLO: un miembro común armó el recorrido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.contacts where name in ('Pasajero Uno', 'Pasajero Dos');
delete from public.groups where name = 'Ruta prueba 47';
\echo 'rls_test_47 OK'
