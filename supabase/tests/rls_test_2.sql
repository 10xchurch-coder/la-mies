-- ============================================================================
-- Pruebas de la Parte 2 (corren después de rls_test.sql y de 0004_church.sql,
-- así se prueba también que los datos viejos se migren bien).
-- ============================================================================
\set ON_ERROR_STOP on

-- La asistencia vieja quedó unida a una reunión
do $$ begin
  if exists (select 1 from public.attendances where service_id is null) then raise exception 'FALLO: asistencias sin reunión'; end if;
  if (select count(*) from public.church_services where church_id = '10000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FALLO: faltan las reuniones de fábrica';
  end if;
end $$;

-- Usuarios nuevos: secretaria, maestra, recepcionista, y alguien que se une con teléfono
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'secre@test'),
  ('00000000-0000-0000-0000-0000000000c2', 'maestra@test'),
  ('00000000-0000-0000-0000-0000000000c3', 'recepcion@test'),
  ('00000000-0000-0000-0000-0000000000c4', 'nueva@test'),
  ('00000000-0000-0000-0000-0000000000c5', 'sinficha@test');
insert into public.profiles (id, church_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'secretary', 'Secretaria'),
  ('00000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000001', 'member', 'Maestra Ana'),
  ('00000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000001', 'member', 'Recepción Juan');

create temp table t2 (k text primary key, v text);
grant all on t2 to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Secretaría: carga miembros (sin app), no puede nombrar administradores
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$
declare v uuid; w uuid;
begin
  insert into public.contacts (church_id, created_by, name, phone, status, member_since, group_id)
  values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Rosa Gómez', '+54 9 376 455-1234', 'member', current_date,
          '20000000-0000-0000-0000-000000000001')
  returning id into v;
  insert into t2 values ('rosa', v);
  insert into public.contacts (church_id, created_by, name, phone, status, member_since)
  values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Pedro Ruiz', '3764 000111', 'member', current_date)
  returning id into w;
  insert into t2 values ('pedro', w);
  if (select status from public.contacts where id = v) <> 'member' then raise exception 'FALLO: la secretaria no pudo marcar miembro'; end if;
  begin
    perform public.set_member_role('00000000-0000-0000-0000-000000000003', 'admin', null);
    raise exception 'FALLO: la secretaria nombró un administrador';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform public.set_member_role('00000000-0000-0000-0000-000000000003', 'captain', '20000000-0000-0000-0000-000000000002');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Un miembro común: ve el directorio de miembros, no puede marcar miembros
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
declare v uuid;
begin
  if not exists (select 1 from public.contacts where name = 'Rosa Gómez') then raise exception 'FALLO: un miembro no ve el directorio'; end if;
  insert into public.contacts (church_id, created_by, name, status, member_since)
  values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Intento', 'member', current_date) returning id into v;
  if (select status from public.contacts where id = v) <> 'contact' then raise exception 'FALLO: un miembro marcó a alguien como miembro'; end if;
  update public.contacts set status = 'member' where id = v;
  if (select status from public.contacts where id = v) <> 'contact' then raise exception 'FALLO: un miembro cambió el estado'; end if;
  -- Sin GPS (agregado desde la iglesia, no en la calle): se permite
  insert into public.contacts (church_id, created_by, name, status) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Visita sin mapa', 'visitor');
  -- No ve las visitas (notas privadas) de una ficha que no es suya
  if exists (select 1 from public.contact_visits v join public.contacts c on c.id = v.contact_id where c.name = 'Rosa Gómez') then
    raise exception 'FALLO: ve notas privadas';
  end if;
  -- No puede tomar asistencia
  begin
    perform public.set_attendance((select v::uuid from t2 where k = 'rosa'), current_date,
      (select id from public.church_services where main order by sort_order limit 1), true);
    raise exception 'FALLO: un miembro tomó asistencia';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- Cuenta vieja sin ficha: ensure_my_card la crea una sola vez
do $$
declare a uuid; b uuid;
begin
  a := public.ensure_my_card();
  b := public.ensure_my_card();
  if a is null or a <> b then raise exception 'FALLO: ensure_my_card'; end if;
  if (select status from public.contacts where id = a) <> 'contact' then raise exception 'FALLO: un miembro común se autocreó como miembro'; end if;
end $$;

-- La iglesia B no ve a los miembros de A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if exists (select 1 from public.contacts where name = 'Rosa Gómez') then raise exception 'FALLO: B ve miembros de A'; end if;
  if exists (select 1 from public.church_services where church_id = '10000000-0000-0000-0000-000000000001') then raise exception 'FALLO: B ve reuniones de A'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cuenta nueva con el mismo teléfono que su ficha → se vincula sola
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
do $$
declare p public.profiles;
begin
  p := public.join_church('CODIGO-A', 'Rosa', '3764551234');
  if (select profile_id from public.contacts where id = (select v::uuid from t2 where k = 'rosa')) is distinct from auth.uid() then
    raise exception 'FALLO: no se vinculó la cuenta con la ficha por teléfono';
  end if;
  if (select count(*) from public.contacts where profile_id = auth.uid()) <> 1 then raise exception 'FALLO: ficha duplicada'; end if;
  -- Ve sus propios datos privados
  if not exists (select 1 from public.contacts where profile_id = auth.uid() and status = 'member') then raise exception 'FALLO: no ve su ficha'; end if;
end $$;

reset role;
do $$ begin
  if not exists (select 1 from public.notifications where kind = 'link' and user_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FALLO: la secretaria no recibió el aviso de vinculación';
  end if;
end $$;
set role authenticated;

-- Sin ficha previa → se crea una automática; la secretaria la une a la real después
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  perform public.join_church('CODIGO-A', 'Pedrito', '3765000000');
  if not exists (select 1 from public.contacts where profile_id = auth.uid() and auto_created) then raise exception 'FALLO: no se creó la ficha automática'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  perform public.link_account((select v::uuid from t2 where k = 'pedro'), '00000000-0000-0000-0000-0000000000c5');
  if (select count(*) from public.contacts where profile_id = '00000000-0000-0000-0000-0000000000c5') <> 1 then raise exception 'FALLO: link_account dejó duplicados'; end if;
  if (select profile_id from public.contacts where id = (select v::uuid from t2 where k = 'pedro')) <> '00000000-0000-0000-0000-0000000000c5' then
    raise exception 'FALLO: link_account no vinculó';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Ministerios: recepción toma asistencia; chat solo para integrantes
-- ---------------------------------------------------------------------------
do $$
declare m uuid; k uuid; mat uuid;
begin
  insert into public.ministries (church_id, name, can_take_attendance, leader_id)
  values ('10000000-0000-0000-0000-000000000001', 'Recepción', true, '00000000-0000-0000-0000-0000000000c3') returning id into m;
  insert into t2 values ('recepcion', m);
  insert into public.ministry_members (ministry_id, profile_id, is_leader) values (m, '00000000-0000-0000-0000-0000000000c3', true);
  insert into public.ministry_members (ministry_id, profile_id) values (m, '00000000-0000-0000-0000-000000000002');
  insert into public.duties (church_id, ministry_id, on_date, profile_id, task, arrive_time)
  values ('10000000-0000-0000-0000-000000000001', m, current_date + 2, '00000000-0000-0000-0000-000000000002', 'recepción en la puerta', '18:00');
  -- Clase con maestra y material
  insert into public.classes (church_id, name, age_min, age_max) values ('10000000-0000-0000-0000-000000000001', 'Niños 6 a 12', 6, 12) returning id into k;
  insert into t2 values ('clase', k);
  insert into public.class_teachers (class_id, profile_id) values (k, '00000000-0000-0000-0000-0000000000c2');
  insert into public.materials (church_id, series, title, chapter_order, body) values ('10000000-0000-0000-0000-000000000001', 'Vida de Jesús', 'Capítulo 1: El nacimiento', 1, 'Lucas 2') returning id into mat;
  insert into public.class_schedule (church_id, class_id, on_date, teacher_id, material_id)
  values ('10000000-0000-0000-0000-000000000001', k, current_date + 3, '00000000-0000-0000-0000-0000000000c2', mat);
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$
declare s uuid;
begin
  select id into s from public.church_services where church_id = '10000000-0000-0000-0000-000000000001' and dow = 0;
  perform public.set_attendance((select v::uuid from t2 where k = 'rosa'), current_date, s, true);
  perform public.set_attendance((select v::uuid from t2 where k = 'rosa'), current_date, s, true);  -- doble toque no duplica
  if (select count(*) from public.attendances where contact_id = (select v::uuid from t2 where k = 'rosa')) <> 1 then raise exception 'FALLO: asistencia duplicada'; end if;
  perform public.set_attendance((select v::uuid from t2 where k = 'rosa'), current_date, s, false);
  if exists (select 1 from public.attendances where contact_id = (select v::uuid from t2 where k = 'rosa')) then raise exception 'FALLO: no se pudo desmarcar'; end if;
  perform public.set_attendance((select v::uuid from t2 where k = 'rosa'), current_date, s, true);
  if not exists (select 1 from public.attendance_sheet(current_date, s) where present and name = 'Rosa Gómez') then raise exception 'FALLO: attendance_sheet'; end if;
  insert into public.ministry_messages (church_id, ministry_id, user_id, kind, body)
  values ('10000000-0000-0000-0000-000000000001', (select v::uuid from t2 where k = 'recepcion'), auth.uid(), 'announcement', 'Este sábado llegamos a las 18');
end $$;

-- Lucía (integrante) recibió el aviso del líder y ve el chat; Nico (no integrante) no ve nada
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  if not exists (select 1 from public.notifications where kind = 'ministry') then raise exception 'FALLO: no llegó el aviso del líder'; end if;
  if (select count(*) from public.ministry_messages) <> 1 then raise exception 'FALLO: integrante no ve el chat'; end if;
  begin
    insert into public.ministry_messages (church_id, ministry_id, user_id, kind, body)
    values ('10000000-0000-0000-0000-000000000001', (select v::uuid from t2 where k = 'recepcion'), auth.uid(), 'announcement', 'yo mando');
    raise exception 'FALLO: un integrante mandó un anuncio';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  insert into public.ministry_messages (church_id, ministry_id, user_id, body)
  values ('10000000-0000-0000-0000-000000000001', (select v::uuid from t2 where k = 'recepcion'), auth.uid(), 'Yo llevo café');
  if not exists (select 1 from public.my_upcoming(21) where kind = 'duty') then raise exception 'FALLO: my_upcoming sin turno'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if exists (select 1 from public.ministry_messages) then raise exception 'FALLO: no integrante ve el chat'; end if;
  if exists (select 1 from public.notifications) then raise exception 'FALLO: ve avisos ajenos'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Maestra: toma asistencia de su clase, no de otra; Lucía no puede
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$
declare child uuid;
begin
  insert into public.contacts (church_id, created_by, name, age) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Tomás', 8) returning id into child;
  insert into t2 values ('tomas', child);
  insert into public.class_students (class_id, contact_id) values ((select v::uuid from t2 where k = 'clase'), child);
  insert into public.class_attendance (church_id, class_id, on_date, contact_id, present, note)
  values ('10000000-0000-0000-0000-000000000001', (select v::uuid from t2 where k = 'clase'), current_date, child, true, 'Recitó el versículo');
  if not exists (select 1 from public.my_upcoming(21) where kind = 'class' and material_id is not null) then raise exception 'FALLO: la maestra no ve su clase con material'; end if;
  if (select count(*) from public.class_attendance) <> 1 then raise exception 'FALLO: la maestra no ve su asistencia'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  if exists (select 1 from public.class_attendance) then raise exception 'FALLO: un miembro ve notas de alumnos'; end if;
  begin
    insert into public.class_attendance (church_id, class_id, on_date, contact_id)
    values ('10000000-0000-0000-0000-000000000001', (select v::uuid from t2 where k = 'clase'), current_date - 7, (select v::uuid from t2 where k = 'tomas'));
    raise exception 'FALLO: un miembro tomó asistencia de clase';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Pastor: fidelidad, camino, ausencias; salidas de volantes con su propio mapa
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare j jsonb; n int; s uuid;
begin
  if not exists (select 1 from public.people_engagement(12) where name = 'Rosa Gómez') then raise exception 'FALLO: people_engagement'; end if;
  j := public.person_journey((select v::uuid from t2 where k = 'rosa'));
  if not (j @> '[{"step":"vino"}]' and j @> '[{"step":"miembro"}]') then raise exception 'FALLO: person_journey %', j; end if;
  select count(*) into n from public.weekend_absences(current_date - 30);
  if n < 1 then raise exception 'FALLO: weekend_absences'; end if;
  -- Salida de volantes
  s := public.start_session('flyers');
  perform public.upsert_coverage(s, '[{"road_id":900001,"seg":0,"side":1,"at":"2026-01-01T10:00:00Z"}]');
  if not exists (select 1 from public.coverage_in_bbox(-27.41, -55.91, -27.39, -55.89) where kind = 'flyers') then raise exception 'FALLO: cobertura de volantes'; end if;
  if not exists (select 1 from public.coverage_in_bbox(-27.41, -55.91, -27.39, -55.89) where kind = 'soulwinning') then raise exception 'FALLO: se perdió la cobertura de evangelismo'; end if;
  if (select count(*) from public.side_history(900001, 0, 1::smallint, 'flyers')) <> 1 then raise exception 'FALLO: historial de volantes'; end if;
  -- Datos para ofrendar
  update public.churches set giving = '{"alias":"victoria.ofrenda","cbu":"0000003100000000000000"}' where id = public.current_church_id();
  -- La función de tareas programadas no la puede llamar la app
  begin
    perform public.run_scheduled_jobs();
    raise exception 'FALLO: la app pudo correr las tareas programadas';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- Lucía no puede cambiar los datos para ofrendar
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  update public.churches set giving = '{"alias":"ladron"}' where id = public.current_church_id();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: un miembro cambió los datos para ofrendar'; end if;
  if (select giving->>'alias' from public.churches) <> 'victoria.ofrenda' then raise exception 'FALLO: no ve los datos para ofrendar'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Tareas programadas (como el servidor): recordatorios y reporte de ausencias
-- ---------------------------------------------------------------------------
reset role;
do $$
declare n int;
begin
  n := public.run_weekly_reminders('10000000-0000-0000-0000-000000000001', current_date);
  if n < 2 then raise exception 'FALLO: recordatorios semanales: %', n; end if;
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000c2' and kind = 'class' and body like '%Vida de Jesús%') then
    raise exception 'FALLO: el recordatorio de la maestra no nombra el material';
  end if;
  update public.groups set captain_id = '00000000-0000-0000-0000-000000000004' where id = '20000000-0000-0000-0000-000000000001';
  n := public.run_absence_report('10000000-0000-0000-0000-000000000001', current_date + 60);
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'absences') then
    raise exception 'FALLO: el pastor no recibió el reporte de ausencias';
  end if;
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000004' and kind = 'absences') then
    raise exception 'FALLO: el capitán no recibió el reporte de su colectivo';
  end if;
  if not public.job_once('10000000-0000-0000-0000-000000000001', 'x', 'k') then raise exception 'FALLO job_once 1'; end if;
  if public.job_once('10000000-0000-0000-0000-000000000001', 'x', 'k') then raise exception 'FALLO: job_once repitió'; end if;
  perform public.run_scheduled_jobs();
  -- Borrado del GPS crudo: las veredas quedan
  update public.sessions set ended_at = now() - interval '40 days', started_at = now() - interval '40 days' where ended_at is not null;
  perform public.purge_old_track_points(30);
  if exists (select 1 from public.track_points t join public.sessions s on s.id = t.session_id where s.ended_at < now() - interval '30 days') then
    raise exception 'FALLO: no se borró el GPS viejo';
  end if;
  if not exists (select 1 from public.coverage) then raise exception 'FALLO: se borraron las veredas'; end if;
end $$;

select 'PARTE 2: TODAS LAS PRUEBAS PASARON' as resultado;
