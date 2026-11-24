-- Prueba de la migración 0079 (orden del culto, oraciones respondidas, lecciones, versículos, preguntas, avisos).
-- Usa cuentas reales de la iglesia pero NO deja nada: todo corre dentro de un bloque que termina en error a propósito
-- ("ROLLBACK_OK: ..."), y eso deshace todo. Lo que hay que mirar es el texto del error.
-- Esperado: plan_people=1 asignado_ve=1 asignado_edita=0 miembro_crea=no suplantar=no autoresponder=no miembro_lista=1
--   lee_user_id=no miembro_responde=0 leccion_misma=true leccion_en_turno=1 link_malo=no maestro_versiculo_iglesia=no
--   maestro_tilda=1 respondida=1 otro_ve_plan=0 otro_ve_preguntas=0 otro_leccion=no otro_tilda=no otro_versiculo=no
--   otro_marca_oracion=no otro_ve_respondida=1 otro_ve_tildes=(0 o 1, según pueda ver la ficha) admin_lista=false/true,true/false
--   admin_responde=1 admin_pone_nombre=no otro_ve_preguntas_despues=1 anon_sin_user=1 recordatorios_2=0
-- No prueba destildar un versículo (borrar una fila): en el entorno de trabajo esa sentencia pide confirmación.
do $$
declare
  v_church uuid; v_admin uuid; v_member uuid; v_member2 uuid; v_plan uuid; v_n int; v_class uuid; v_kid uuid; v_verse uuid; v_mat uuid; v_mat2 uuid; v_pr uuid; v_tom date; v_min uuid;
  out text := ''; t text;
begin
  select p.church_id, p.id into v_church, v_admin from public.profiles p where p.role::text = 'admin' and p.disabled_at is null and p.church_id is not null limit 1;
  select p.id into v_member from public.profiles p where p.church_id = v_church and p.role::text = 'member' and coalesce(array_length(p.extra_roles,1),0) = 0 and p.disabled_at is null
    and not ('personas.ver_todas' = any(public.perms_of(p.id))) and not ('com.moderar' = any(public.perms_of(p.id))) and not ('ens.editar' = any(public.perms_of(p.id))) order by p.created_at limit 1;
  select p.id into v_member2 from public.profiles p where p.church_id = v_church and p.role::text = 'member' and p.id <> v_member and coalesce(array_length(p.extra_roles,1),0) = 0 and p.disabled_at is null
    and not ('personas.ver_todas' = any(public.perms_of(p.id))) and not ('com.moderar' = any(public.perms_of(p.id))) and not ('ens.editar' = any(public.perms_of(p.id))) order by p.created_at desc limit 1;
  if v_admin is null or v_member is null or v_member2 is null then raise exception 'faltan usuarios de prueba'; end if;
  select coalesce(timezone,'America/Argentina/Buenos_Aires') into t from public.churches where id = v_church;
  v_tom := (now() at time zone t)::date + 1;
  select id into v_min from public.ministries where church_id = v_church limit 1;

  insert into public.classes (church_id, name, days) values (v_church, 'Clase de prueba zz', '{sun}') returning id into v_class;
  insert into public.class_teachers (class_id, profile_id, is_helper) values (v_class, v_member, false);
  insert into public.contacts (church_id, created_by, name, interest, status) values (v_church, v_admin, 'Chico De Prueba Zz', 'some', 'visitor') returning id into v_kid;
  insert into public.class_students (class_id, contact_id) values (v_class, v_kid);
  insert into public.prayer_requests (church_id, user_id, body, visibility) values (v_church, v_member, 'Pedido de prueba zz', 'church') returning id into v_pr;
  if v_min is not null then insert into public.duties (church_id, ministry_id, on_date, profile_id, task) values (v_church, v_min, v_tom, v_member, 'tarea de prueba'); end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.service_plans (service_date, title, items) values (v_tom, 'Culto de prueba',
    jsonb_build_array(jsonb_build_object('id','a','type','song','title','Canción de prueba','whoId', v_member::text),
                      jsonb_build_object('id','b','type','sermon','title','Prédica','whoId', v_member::text),
                      jsonb_build_object('id','c','type','other','title','Otro','whoId', gen_random_uuid()::text))) returning id into v_plan;
  select array_length(people,1) into v_n from public.service_plans where id = v_plan;
  out := out || ' plan_people=' || v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.service_plans where id = v_plan; out := out || ' asignado_ve=' || v_n;
  update public.service_plans set title = 'x' where id = v_plan; get diagnostics v_n = row_count; out := out || ' asignado_edita=' || v_n;
  begin insert into public.service_plans (service_date, title) values (current_date, 'no'); out := out || ' miembro_crea=SI(MAL)'; exception when others then out := out || ' miembro_crea=no'; end;
  insert into public.bible_questions (body, user_id) values ('¿Pregunta anónima de prueba?', null);
  insert into public.bible_questions (body, user_id) values ('¿Pregunta con nombre de prueba?', v_member);
  begin insert into public.bible_questions (body, user_id) values ('¿Haciéndome pasar por otro?', v_member2); out := out || ' suplantar=SI(MAL)'; exception when others then out := out || ' suplantar=no'; end;
  begin insert into public.bible_questions (body, status, answer) values ('¿Respondida de entrada?', 'answered', 'x'); out := out || ' autoresponder=SI(MAL)'; exception when others then out := out || ' autoresponder=no'; end;
  select count(*) into v_n from public.culto_questions_list() where body like '%de prueba%'; out := out || ' miembro_lista=' || v_n;
  begin perform user_id from public.bible_questions limit 1; out := out || ' lee_user_id=SI(MAL)'; exception when insufficient_privilege then out := out || ' lee_user_id=no'; end;
  update public.bible_questions set status = 'answered', answer = 'x' where body like '%con nombre de prueba%'; get diagnostics v_n = row_count; out := out || ' miembro_responde=' || v_n;
  v_mat := public.culto_save_class_lesson(v_class, v_tom, 'Lección de prueba', 'Texto', 'https://ejemplo.com/x', null, null);
  v_mat2 := public.culto_save_class_lesson(v_class, v_tom, 'Lección de prueba 2', null, null, null, null);
  out := out || ' leccion_misma=' || (v_mat = v_mat2)::text;
  select count(*) into v_n from public.class_schedule where class_id = v_class and on_date = v_tom and material_id = v_mat; out := out || ' leccion_en_turno=' || v_n;
  begin perform public.culto_save_class_lesson(v_class, v_tom, 'Mala', null, 'javascript:alert(1)', null, null); out := out || ' link_malo=SI(MAL)'; exception when others then out := out || ' link_malo=no'; end;
  insert into public.memory_verses (class_id, reference, body) values (v_class, 'Juan 3:16', 'Porque de tal manera amó Dios al mundo') returning id into v_verse;
  begin insert into public.memory_verses (class_id, reference) values (null, 'Salmos 23:1'); out := out || ' maestro_versiculo_iglesia=SI(MAL)'; exception when others then out := out || ' maestro_versiculo_iglesia=no'; end;
  insert into public.memory_verse_done (verse_id, contact_id) values (v_verse, v_kid);
  select count(*) into v_n from public.memory_verse_done where contact_id = v_kid; out := out || ' maestro_tilda=' || v_n;
  perform public.culto_prayer_answered(v_pr, '  Dios lo hizo  ');
  select count(*) into v_n from public.culto_answered_prayers() where id = v_pr and answer_note = 'Dios lo hizo'; out := out || ' respondida=' || v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_member2, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.service_plans where id = v_plan; out := out || ' otro_ve_plan=' || v_n;
  select count(*) into v_n from public.culto_questions_list() where body like '%de prueba%'; out := out || ' otro_ve_preguntas=' || v_n;
  begin perform public.culto_save_class_lesson(v_class, v_tom, 'No debería', null, null, null, null); out := out || ' otro_leccion=SI(MAL)'; exception when others then out := out || ' otro_leccion=no'; end;
  begin insert into public.memory_verse_done (verse_id, contact_id) values (v_verse, v_kid) on conflict do nothing; out := out || ' otro_tilda=SI(MAL)'; exception when others then out := out || ' otro_tilda=no'; end;
  begin insert into public.memory_verses (class_id, reference) values (v_class, 'Gn 1:1'); out := out || ' otro_versiculo=SI(MAL)'; exception when others then out := out || ' otro_versiculo=no'; end;
  begin perform public.culto_prayer_answered(v_pr, 'no'); out := out || ' otro_marca_oracion=SI(MAL)'; exception when others then out := out || ' otro_marca_oracion=no'; end;
  select count(*) into v_n from public.culto_answered_prayers() where id = v_pr; out := out || ' otro_ve_respondida=' || v_n;
  select count(*) into v_n from public.memory_verse_done where contact_id = v_kid; out := out || ' otro_ve_tildes=' || v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select string_agg((author is not null)::text || '/' || anonymous::text, ',' order by body) into t from public.culto_questions_list() where body like '%de prueba%';
  out := out || ' admin_lista(autor/anon)=' || t;
  update public.bible_questions set status = 'answered', answer = 'Respuesta de prueba', answered_by = v_admin, answered_at = now() where body like '%anónima de prueba%'; get diagnostics v_n = row_count; out := out || ' admin_responde=' || v_n;
  begin update public.bible_questions set user_id = v_member where body like '%anónima de prueba%'; out := out || ' admin_pone_nombre=SI(MAL)'; exception when insufficient_privilege then out := out || ' admin_pone_nombre=no'; end;
  perform public.culto_prayer_answered(v_pr, null);
  insert into public.memory_verses (class_id, reference) values (null, 'Salmos 23:1');
  perform set_config('request.jwt.claims', json_build_object('sub', v_member2, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.culto_questions_list() where body like '%de prueba%'; out := out || ' otro_ve_preguntas_despues=' || v_n;

  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.bible_questions where user_id is null and body like '%anónima de prueba%'; out := out || ' anon_sin_user=' || v_n;
  select count(*) into v_n from public.notifications where kind = 'question' and created_at > now() - interval '1 minute'; out := out || ' avisos_pregunta=' || v_n;
  v_n := public.culto_duty_reminders(); out := out || ' recordatorios_1=' || v_n;
  select count(*) into v_n from public.notifications where user_id = v_member and created_at > now() - interval '1 minute' and title like 'Mañana%'; out := out || ' avisos_miembro=' || v_n;
  select string_agg(title || ' :: ' || body || ' :: ' || coalesce(link,''), ' | ') into t from public.notifications where user_id = v_member and created_at > now() - interval '1 minute' and title like 'Mañana%' and (title ilike '%prueba%' or body ilike '%prueba%');
  v_n := public.culto_duty_reminders(); out := out || ' recordatorios_2=' || v_n;
  raise exception 'ROLLBACK_OK: % ## %', out, t;
end $$;
