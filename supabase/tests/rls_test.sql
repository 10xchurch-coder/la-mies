-- ============================================================================
-- Pruebas de seguridad (RLS) y de las funciones. Corre con:
--   npm run test:sql   (usa un Postgres local, ver scripts/test-sql.mjs)
-- Cada bloque "do" falla con una excepción si algo no es como debe ser.
-- ============================================================================
\set ON_ERROR_STOP on

-- Datos base, como "service role" (sin usuario logueado).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test'),
  ('00000000-0000-0000-0000-000000000001', 'm1@test'),
  ('00000000-0000-0000-0000-000000000002', 'm2@test'),
  ('00000000-0000-0000-0000-000000000003', 'm3@test'),
  ('00000000-0000-0000-0000-000000000004', 'cap@test'),
  ('00000000-0000-0000-0000-00000000000b', 'mb@test'),
  ('00000000-0000-0000-0000-00000000000e', 'nadie@test');

insert into public.churches (id, name, city, join_code) values
  ('10000000-0000-0000-0000-000000000001', 'Iglesia A', 'Posadas', 'CODIGO-A'),
  ('10000000-0000-0000-0000-000000000002', 'Iglesia B', 'Oberá', 'CODIGO-B');

insert into public.groups (id, church_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Colectivo 1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Colectivo 2');

insert into public.profiles (id, church_id, group_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', null, 'admin', 'Pastor A'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'member', 'Lucía'),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'member', 'Nico'),
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'captain', 'Caro'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002', null, 'member', 'Hermano B');

-- Una calle de ejemplo: va de oeste a este a lo largo de la latitud -27.40
insert into public.roads (id, name, highway, coords, min_lat, min_lng, max_lat, max_lng) values
  (900001, 'Calle Prueba', 'residential',
   '[[-27.4000, -55.9000], [-27.4000, -55.8990], [-27.4000, -55.8980]]'::jsonb,
   -27.4000, -55.9000, -27.4000, -55.8980);

-- ---------------------------------------------------------------------------
-- 1. Un hermano nuevo (m1) se une a la iglesia A con el código
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

do $$
declare p public.profiles;
begin
  begin
    perform public.join_church('codigo-malo', 'Marcos');
    raise exception 'FALLO: un código incorrecto no debería unir';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  p := public.join_church('codigo-a', 'Marcos');
  if p.church_id <> '10000000-0000-0000-0000-000000000001' then raise exception 'FALLO: join_church no asignó la iglesia'; end if;
  if p.role <> 'member' then raise exception 'FALLO: el rol inicial debe ser member'; end if;
end $$;

-- m1 no puede hacerse admin
do $$
begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FALLO: un miembro pudo cambiarse el rol';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- m1 no puede tocar el perfil de otro (RLS: 0 filas)
do $$
declare n int;
begin
  update public.profiles set display_name = 'hackeado' where id = '00000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: un miembro editó el perfil de otro'; end if;
end $$;

-- m1 no ve a la iglesia B ni a sus hermanos
do $$
begin
  if exists (select 1 from public.churches where id = '10000000-0000-0000-0000-000000000002') then raise exception 'FALLO: ve otra iglesia'; end if;
  if exists (select 1 from public.profiles where church_id = '10000000-0000-0000-0000-000000000002') then raise exception 'FALLO: ve hermanos de otra iglesia'; end if;
  if (select count(*) from public.profiles) <> 5 then raise exception 'FALLO: debería ver 5 perfiles de su iglesia (vio %)', (select count(*) from public.profiles); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Una salida completa: puntos, cobertura, contacto, visita, fin
-- ---------------------------------------------------------------------------
reset role;
-- el pastor pone a m1 en el Colectivo 1 (como admin)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.set_member_role('00000000-0000-0000-0000-000000000001', 'member', '20000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
create temp table t (k text primary key, v text);
insert into t values ('session', public.start_session()::text);

do $$
declare sid uuid := (select v::uuid from t where k = 'session');
declare n int;
begin
  n := public.upload_track_points(sid, jsonb_build_array(
    jsonb_build_object('t', now() - interval '30 minutes', 'lat', -27.40005, 'lng', -55.8999, 'acc', 6, 'spd', 1.2, 'hdg', 90),
    jsonb_build_object('t', now() - interval '29 minutes', 'lat', -27.40005, 'lng', -55.8995, 'acc', 6, 'spd', 1.2, 'hdg', 90),
    jsonb_build_object('t', now() - interval '28 minutes', 'lat', -27.40005, 'lng', -55.8991, 'acc', 6, 'spd', 1.2, 'hdg', 90)
  ));
  if n <> 3 then raise exception 'FALLO: se esperaban 3 puntos, hubo %', n; end if;
  if not exists (select 1 from public.live_positions where user_id = auth.uid()) then raise exception 'FALLO: no hay posición en vivo'; end if;

  n := public.upsert_coverage(sid, jsonb_build_array(
    jsonb_build_object('road_id', 900001, 'seg', 0, 'side', 1, 'at', now() - interval '28 minutes')
  ));
  if n <> 1 then raise exception 'FALLO: cobertura no insertada'; end if;
  -- repetir el mismo evento no duplica
  n := public.upsert_coverage(sid, jsonb_build_array(
    jsonb_build_object('road_id', 900001, 'seg', 0, 'side', 1, 'at', now() - interval '27 minutes')
  ));
  if n <> 0 then raise exception 'FALLO: evento duplicado'; end if;
  if (select times from public.coverage where road_id = 900001 and seg = 0 and side = 1) <> 1 then raise exception 'FALLO: times debería ser 1'; end if;
end $$;

-- contacto + visita (church_id y created_by los pone el trigger)
insert into public.contacts (name, age, sex, lat, lng, interest, promise_day, pickup, pickup_time, gospel_presented, share_mode, session_id)
values ('Brian', 22, 'm', -27.40006, -55.8993, 'very', 'sat', true, '14:30', true, 'group', (select v::uuid from t where k = 'session'))
returning id as contact_id \gset
insert into t values ('contact', :'contact_id');
insert into public.contact_visits (contact_id, session_id, note, gospel_presented, promise_day)
values (:'contact_id', (select v::uuid from t where k = 'session'), 'Primera visita', true, 'sat');

do $$
declare c public.contacts;
begin
  select * into c from public.contacts where name = 'Brian';
  if c.church_id <> '10000000-0000-0000-0000-000000000001' or c.created_by <> auth.uid() then raise exception 'FALLO: el trigger no completó iglesia/autor'; end if;
  -- no puede "regalar" el contacto a otra iglesia
  update public.contacts set church_id = '10000000-0000-0000-0000-000000000002' where id = c.id;
  if (select church_id from public.contacts where id = c.id) <> '10000000-0000-0000-0000-000000000001' then raise exception 'FALLO: cambió la iglesia del contacto'; end if;
end $$;

do $$
declare s public.sessions;
begin
  s := public.end_session((select v::uuid from t where k = 'session'), 1234.5, 4, false);
  if s.ended_at is null then raise exception 'FALLO: la salida no terminó'; end if;
  if s.presentations <> 1 or s.promises <> 1 or s.contacts <> 1 then raise exception 'FALLO: contadores de la salida: % % %', s.presentations, s.promises, s.contacts; end if;
  if exists (select 1 from public.live_positions where user_id = auth.uid()) then raise exception 'FALLO: la posición en vivo no se borró'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Quién ve el contacto de Brian
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false); -- Lucía, mismo grupo
do $$ begin
  if not exists (select 1 from public.contacts where name = 'Brian') then raise exception 'FALLO: Lucía (mismo grupo) no ve a Brian'; end if;
  if (select count(*) from public.scoreboard('all') where display_name = 'Marcos') <> 1 then raise exception 'FALLO: Marcos no aparece en el tablero'; end if;
  if (select points from public.scoreboard('all') where display_name = 'Marcos') <> 4 then raise exception 'FALLO: puntos de Marcos deberían ser 4 (1 presentación + 1 promesa)'; end if;
  if (public.team_totals('all') ->> 'presentations')::int <> 1 then raise exception 'FALLO: team_totals'; end if;
  if (select count(*) from public.coverage_in_bbox(-27.41, -55.91, -27.39, -55.89)) <> 1 then raise exception 'FALLO: Lucía no ve la cobertura'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false); -- Nico, otro grupo
do $$ begin
  if exists (select 1 from public.contacts where name = 'Brian') then raise exception 'FALLO: Nico (otro grupo) ve a Brian'; end if;
  if exists (select 1 from public.contact_visits) then raise exception 'FALLO: Nico ve visitas que no debería'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); -- Pastor A
do $$ begin
  if not exists (select 1 from public.contacts where name = 'Brian') then raise exception 'FALLO: el admin no ve a Brian'; end if;
  if public.church_report(now() - interval '1 day', now() + interval '1 day') is null then raise exception 'FALLO: church_report vacío para el admin'; end if;
  if ((public.church_report(now() - interval '1 day', now() + interval '1 day')) -> 'totals' ->> 'promises')::int <> 1 then raise exception 'FALLO: reporte sin la promesa'; end if;
  if exists (select 1 from public.network_summary(now() - interval '1 day', now())) then raise exception 'FALLO: un admin común ve la red'; end if;
end $$;

-- asistencia la carga el capitán; "vino" le suma 10 a quien marcó la casa
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false); -- Caro
select public.record_attendance(:'contact_id', current_date, 'sat');
do $$ begin
  if (select came from public.scoreboard('all') where display_name = 'Marcos') <> 1 then raise exception 'FALLO: asistencia no acreditada'; end if;
  if (select points from public.scoreboard('all') where display_name = 'Marcos') <> 14 then raise exception 'FALLO: puntos con asistencia deberían ser 14'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false); -- Hermano B
do $$ begin
  if exists (select 1 from public.contacts) then raise exception 'FALLO: la iglesia B ve contactos de A'; end if;
  if exists (select 1 from public.sessions) then raise exception 'FALLO: la iglesia B ve salidas de A'; end if;
  if exists (select 1 from public.coverage) then raise exception 'FALLO: la iglesia B ve cobertura de A'; end if;
  if exists (select 1 from public.coverage_in_bbox(-27.41, -55.91, -27.39, -55.89)) then raise exception 'FALLO: coverage_in_bbox cruza iglesias'; end if;
  if exists (select 1 from public.profiles where church_id <> '10000000-0000-0000-0000-000000000002') then raise exception 'FALLO: B ve perfiles de A'; end if;
  if (select count(*) from public.roads_in_bbox(-27.41, -55.91, -27.39, -55.89)) <> 1 then raise exception 'FALLO: las calles son públicas'; end if;
  if exists (select 1 from public.track_points) then raise exception 'FALLO: B ve puntos de A'; end if;
  begin
    perform public.record_attendance((select v::uuid from t where k = 'contact'), current_date, 'sun');
    raise exception 'FALLO: un miembro de B cargó asistencia en A';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- un usuario sin iglesia no puede crear contactos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$ begin
  begin
    insert into public.contacts (name, lat, lng) values ('X', 0, 0);
    raise exception 'FALLO: creó un contacto sin iglesia';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Recortar una salida (me olvidé de apagarla / velocidad de vehículo)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false); -- Marcos otra vez
insert into t values ('s2', public.start_session()::text);
-- (en la prueba la salida "empezó" hace 25 minutos)
reset role;
update public.sessions set started_at = now() - interval '25 minutes' where id = (select v::uuid from t where k = 's2');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$
declare sid uuid := (select v::uuid from t where k = 's2');
declare s public.sessions;
declare n int;
begin
  perform public.upload_track_points(sid, jsonb_build_array(
    jsonb_build_object('t', now() - interval '20 minutes', 'lat', -27.40005, 'lng', -55.8999, 'acc', 6),
    jsonb_build_object('t', now() - interval '19 minutes', 'lat', -27.40005, 'lng', -55.8995, 'acc', 6),
    jsonb_build_object('t', now() - interval '10 minutes', 'lat', -27.45, 'lng', -55.95, 'acc', 6),   -- ya en el auto
    jsonb_build_object('t', now() - interval '5 minutes', 'lat', -27.50, 'lng', -56.00, 'acc', 6)
  ));
  perform public.upsert_coverage(sid, jsonb_build_array(
    jsonb_build_object('road_id', 900001, 'seg', 0, 'side', 1, 'at', now() - interval '19 minutes'),
    jsonb_build_object('road_id', 900001, 'seg', 1, 'side', 1, 'at', now() - interval '10 minutes')   -- falso, en el auto
  ));
  if (select times from public.coverage where road_id = 900001 and seg = 0 and side = 1) <> 2 then raise exception 'FALLO: times debería ser 2 (segunda salida)'; end if;

  s := public.trim_session(sid, now() - interval '15 minutes', true);
  if s.ended_at <> now() - interval '15 minutes' then raise exception 'FALLO: el fin no quedó en el corte'; end if;
  if not s.auto_stopped then raise exception 'FALLO: auto_stopped'; end if;
  select count(*) into n from public.track_points where session_id = sid;
  if n <> 2 then raise exception 'FALLO: deberían quedar 2 puntos, quedaron %', n; end if;
  if exists (select 1 from public.coverage where road_id = 900001 and seg = 1) then raise exception 'FALLO: la cobertura falsa no se borró'; end if;
  if (select times from public.coverage where road_id = 900001 and seg = 0 and side = 1) <> 2 then raise exception 'FALLO: la cobertura buena se perdió'; end if;
  if s.distance_m < 30 or s.distance_m > 60 then raise exception 'FALLO: distancia recalculada rara: %', s.distance_m; end if;
  if s.blocks <> 1 then raise exception 'FALLO: cuadras recalculadas: %', s.blocks; end if;
end $$;

-- Nico no puede recortar la salida de Marcos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  begin
    perform public.trim_session((select v::uuid from t where k = 's2'), now(), false);
    raise exception 'FALLO: otro miembro recortó una salida ajena';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Capacitación: lo general lo ven todos, lo de una iglesia solo esa iglesia
-- ---------------------------------------------------------------------------
reset role;
insert into public.training_items (church_id, category, title, kind, body) values
  (null, 'Al tocar la puerta', 'Cómo presentarte', 'article', 'Sonreí, decí tu nombre y el de la iglesia...'),
  ('10000000-0000-0000-0000-000000000001', 'Nuestra iglesia', 'Horarios del colectivo', 'article', '...');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.training_items) <> 1 then raise exception 'FALLO: B debería ver solo el material general'; end if;
  begin
    insert into public.training_items (church_id, category, title) values (null, 'x', 'y');
    raise exception 'FALLO: un miembro cargó capacitación general';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  if (select count(*) from public.training_items) <> 2 then raise exception 'FALLO: A debería ver 2 materiales'; end if;
end $$;

reset role;
select 'TODAS LAS PRUEBAS PASARON' as resultado;
