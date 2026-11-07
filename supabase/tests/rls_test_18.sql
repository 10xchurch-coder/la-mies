\set ON_ERROR_STOP on
-- 0024: marcado más preciso y corrección a mano.
reset role;
insert into public.roads (id, name, highway, coords, min_lat, min_lng, max_lat, max_lng) values
  (990101, 'Calle este-oeste', 'residential', '[[-27.6000, -55.9000], [-27.6000, -55.8990]]', -27.6000, -55.9000, -27.6000, -55.8990),
  (990102, 'Calle que cruza', 'residential', '[[-27.5995, -55.8995], [-27.6005, -55.8995]]', -27.6005, -55.8995, -27.5995, -55.8995);
insert into public.sessions (id, church_id, user_id, started_at, ended_at) values
  ('c0000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', now() - interval '30 minutes', now());
-- camina por la vereda sur (5 m) de oeste a este; cada 5 puntos el GPS lo tira 6 m al norte; pasa por la esquina de la que cruza
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng, accuracy_m)
select 'c0000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2',
       now() - interval '30 minutes' + make_interval(secs => i * 5),
       case when i % 5 = 2 then -27.6000 + 6 / 111320.0 else -27.6000 - 5 / 111320.0 end,
       -55.8999 + i * 0.00005, 8
from generate_series(0, 17) i;

do $$ declare n int; begin
  perform public.recompute_session_coverage('c0000000-0000-0000-0000-0000000000e1');
  select count(*) into n from public.coverage_events where session_id = 'c0000000-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'FALLO: esperaba 1 vereda (la sur), hay %', n; end if;
  if exists (select 1 from public.coverage_events where session_id = 'c0000000-0000-0000-0000-0000000000e1' and (road_id = 990102 or side <> -1)) then
    raise exception 'FALLO: marcó la calle que cruza o la vereda de enfrente'; end if;
end $$;

set role authenticated;
-- otro miembro no la puede quitar
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  begin perform public.set_side_coverage(990101, 0, -1::smallint, 'soulwinning', false, null); raise exception 'FALLO: un miembro quitó la vereda de otro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- pero sí puede marcar una como hecha
  perform public.set_side_coverage(990101, 0, 1::smallint, 'soulwinning', true, null);
end $$;
-- el dueño la quita de su salida, y al recalcular no vuelve
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
select public.set_side_coverage(990101, 0, -1::smallint, 'soulwinning', false, 'c0000000-0000-0000-0000-0000000000e1');
select public.recompute_session_coverage('c0000000-0000-0000-0000-0000000000e1');
reset role;
do $$ begin
  if exists (select 1 from public.coverage where road_id = 990101 and side = -1) then raise exception 'FALLO: la vereda quitada volvió'; end if;
  if not exists (select 1 from public.coverage where road_id = 990101 and side = 1) then raise exception 'FALLO: no quedó la marcada a mano'; end if;
end $$;
-- casas: un capitán no existe acá; el pastor agrega y saca
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare h bigint; begin
  h := public.edit_house('add', null, -27.60008, -55.8996);
  if not exists (select 1 from public.houses where id = h and road_id = 990101) then raise exception 'FALLO: la casa nueva no quedó en su cuadra'; end if;
  perform public.edit_house('hide', h);
  if exists (select 1 from public.houses where id = h) then raise exception 'FALLO: no se sacó la casa'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  begin perform public.edit_house('add', null, -27.6, -55.9); raise exception 'FALLO: un miembro agregó una casa';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
