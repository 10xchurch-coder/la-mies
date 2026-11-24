-- Pruebas de la demostración (iglesia de ejemplo). Se corren sobre la base con los datos de ejemplo cargados.
-- No dejan nada: todo el bloque termina en un error "ROLLBACK_OK" a propósito y la base lo deshace.
--   1. Las cuentas de ejemplo no ven nada de otra iglesia.
--   2. Una cuenta real no ve nada de la iglesia de ejemplo (y la red tampoco la lista).
--   3. Candado: una cuenta de ejemplo no puede insertar ni cambiar en NINGUNA tabla de public.
--   4. Las funciones de lectura de las pantallas principales devuelven datos (la demostración se ve viva).
--   5. Las funciones que guardan rebotan con DM001 (o antes).
--   6. Archivos: una cuenta de ejemplo no puede subir.
do $$
declare
  ch uuid := public.demo_c(); pastor uuid := public.demo_p(1); member uuid := public.demo_p(2); sec uuid := public.demo_p(3);
  g1 uuid := public.demo_id('g1'); s1 uuid := public.demo_id('s1'); c6 uuid := public.demo_id('c6'); c5 uuid := public.demo_id('c5');
  ev5 uuid := public.demo_id('ev5'); ev6 uuid := public.demo_id('ev6'); z1 uuid := public.demo_id('z1'); m2 uuid := public.demo_id('m2');
  h2 uuid := public.demo_id('h2'); pr0 uuid := public.demo_id('pr0'); fa2 uuid := public.demo_id('fa2');
  sun date := current_date - extract(dow from current_date)::int;
  real_admin uuid; real_church uuid; net uuid; r record; n bigint; v text; who uuid; call text;
  leak text := ''; leak2 text := ''; g_ok int := 0; g_priv int := 0; g_quiet int := 0; g_bad text := ''; bits_bad int;
  reads text := ''; writes text := ''; passed text := ''; quiet_delta text; files text := ''; netres text := '';
  before_n bigint; after_n bigint;
  claims_demo text;
begin
  select p.id, p.church_id into real_admin, real_church from public.profiles p
    where p.role::text = 'admin' and p.church_id is distinct from ch and p.church_id is not null and p.disabled_at is null order by p.created_at limit 1;
  select count(*) into before_n from (select 1 from public.chat_reads where church_id = ch union all select 1 from public.app_errors where church_id = ch
    union all select 1 from public.reading_log where user_id = pastor union all select 1 from public.notifications where church_id = ch and read_at is not null) x;

  -- 1. Las cuentas de ejemplo no ven nada de otra iglesia
  foreach who in array array[pastor, member] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated', 'app_metadata', json_build_object('lamies_demo', true))::text, true);
    set local role authenticated;
    for r in select c.relname from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'church_id' and not a.attisdropped
             where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1 loop
      begin
        execute format('select count(*) from public.%I where church_id is not null and church_id <> $1', r.relname) into n using ch;
        if n > 0 then leak := leak || r.relname || ':' || n || ' '; end if;
      exception when insufficient_privilege then null;
      end;
    end loop;
    -- Tablas sin la columna de la iglesia: no tiene que verse ninguna fila que no sea de la iglesia de ejemplo (o propia).
    for call in select unnest(array[
      'profiles k where k.church_id is distinct from $1',
      'contact_children k where not exists (select 1 from public.contacts c where c.id = k.contact_id and c.church_id = $1)',
      'household_members k where not exists (select 1 from public.households c where c.id = k.household_id and c.church_id = $1)',
      'class_students k where not exists (select 1 from public.classes c where c.id = k.class_id and c.church_id = $1)',
      'class_teachers k where not exists (select 1 from public.classes c where c.id = k.class_id and c.church_id = $1)',
      'ministry_people k where not exists (select 1 from public.ministries c where c.id = k.ministry_id and c.church_id = $1)',
      'ministry_members k where not exists (select 1 from public.ministries c where c.id = k.ministry_id and c.church_id = $1)',
      'prayer_prayed k where not exists (select 1 from public.prayer_requests c where c.id = k.request_id and c.church_id = $1)',
      'reading_log k where k.user_id not in (select id from public.profiles where church_id = $1)',
      'bible_plans k where k.profile_id not in (select id from public.profiles where church_id = $1)',
      'event_rsvps k where k.user_id not in (select id from public.profiles where church_id = $1)',
      'profile_permissions k where k.profile_id not in (select id from public.profiles where church_id = $1)',
      'sermon_notes k where k.user_id <> $2', 'bible_marks k where k.profile_id <> $2', 'study_notes k where k.profile_id <> $2', 'live_notes k where k.user_id <> $2',
      'contact_shares k where $1 is not null', 'chat_poll_votes k where $1 is not null', 'chat_poll_options k where $1 is not null', 'chat_settings k where k.user_id <> $2',
      'loc_viewers k where $1 is not null', 'dm_blocks k where $1 is not null', 'user_blocks k where $1 is not null', 'bus_run_points k where $1 is not null', 'bus_run_stops k where $1 is not null',
      'culto_reminders_sent k where k.user_id not in (select id from public.profiles where church_id = $1)']) loop
      begin
        execute 'select count(*) from public.' || call into n using ch, who;
        if n > 0 then leak := leak || split_part(call, ' ', 1) || ':' || n || ' '; end if;
      exception when insufficient_privilege then null;  -- ni siquiera se puede leer la tabla
        when others then leak := leak || split_part(call, ' ', 1) || ':ERROR(' || left(sqlerrm, 40) || ') ';
      end;
    end loop;
    reset role;
  end loop;

  -- 2. Una cuenta real (el pastor de la iglesia real) no ve nada de la iglesia de ejemplo
  perform set_config('request.jwt.claims', json_build_object('sub', real_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for r in select c.relname from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'church_id' and not a.attisdropped
           where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1 loop
    begin
      execute format('select count(*) from public.%I where church_id = $1', r.relname) into n using ch;
      if n > 0 then leak2 := leak2 || r.relname || ':' || n || ' '; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    select (select count(*) from public.profiles where church_id = ch)
         + (select count(*) from public.contact_children k where k.contact_id in (select id from public.contacts where church_id = ch))
         + (select count(*) from public.reading_log k where k.user_id in (pastor, member, sec))
         + (select count(*) from public.sermon_notes k where k.user_id = member) + (select count(*) from public.bible_plans k where k.profile_id in (pastor, member))
      into n;
    if n > 0 then leak2 := leak2 || 'tablas_sin_church_id:' || n || ' '; end if;
  exception when others then leak2 := leak2 || 'ERROR(' || sqlerrm || ') ';
  end;
  if public.is_demo_user() then leak2 := leak2 || 'la_cuenta_real_quedo_marcada_como_ejemplo '; end if;
  reset role;

  -- La red: el administrador de la red no ve la iglesia de ejemplo en su lista ni en el resumen
  select id into net from public.profiles where is_network_admin and church_id is distinct from ch and disabled_at is null limit 1;
  if net is null then
    perform set_config('request.jwt.claims', '', true);
    update public.profiles set is_network_admin = true where id = sec;  -- una cuenta de ejemplo, solo para esta prueba (se deshace)
    net := sec;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', net, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*), count(*) filter (where t::text like '%' || ch::text || '%') into n, after_n from public.admin_network_churches() t;
    netres := netres || 'lista: ' || n || ' iglesias, de ejemplo ' || after_n || '; ';
    select count(*), count(*) filter (where t::text like '%' || ch::text || '%') into n, after_n from public.network_summary(now() - interval '30 days', now()) t;
    netres := netres || 'resumen: ' || n || ' iglesias, de ejemplo ' || after_n;
  exception when others then netres := netres || 'ERROR ' || sqlerrm;
  end;
  reset role;

  -- 3. Candado en todas las tablas, como el pastor de ejemplo (la cuenta con más permisos)
  claims_demo := json_build_object('sub', pastor, 'role', 'authenticated', 'app_metadata', json_build_object('lamies_demo', true))::text;
  perform set_config('request.jwt.claims', claims_demo, true);
  set local role authenticated;
  for r in select c.relname,
                  (select a.attname from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a' order by a.attnum limit 1) as col,
                  exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'aaa_demo_guard_row') as quiet
           from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1 loop
    for call in select unnest(array[format('update public.%I set %I = %I where false', r.relname, r.col, r.col), format('insert into public.%I default values', r.relname)]) loop
      begin
        execute call;
        if r.quiet then g_quiet := g_quiet + 1; else g_bad := g_bad || r.relname || '(' || left(call, 6) || ' PASÓ) '; end if;
      exception
        when sqlstate 'DM001' then g_ok := g_ok + 1;
        when insufficient_privilege then g_priv := g_priv + 1;
        when others then if r.quiet then g_quiet := g_quiet + 1; else g_bad := g_bad || r.relname || '(' || left(call, 6) || ' ' || sqlstate || ') '; end if;
      end;
    end loop;
  end loop;
  reset role;
  select count(*) into bits_bad from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname in ('aaa_demo_guard', 'aaa_demo_guard_row') and t.tgtype & 28 = 28 and t.tgenabled = 'O');

  -- 4. Lecturas de las pantallas principales (filas/letras). Como pastor y, algunas, como miembro.
  foreach who in array array[pastor, member] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated', 'app_metadata', json_build_object('lamies_demo', true))::text, true);
    set local role authenticated;
    reads := reads || case when who = pastor then '[PASTOR] ' else ' [MIEMBRO] ' end;
    for call in select unnest(case when who = pastor then array[
      'my_profile()', 'my_permissions()', 'daily_for(null)', 'reading_streak()', 'my_upcoming(21)', 'today_birthdays()', 'upcoming_birthdays(30)', 'people_engagement(12)',
      format('weekend_absences(%L)', sun - 1), format('attendance_sheet(%L, %L)', sun, s1), 'church_report(now() - interval ''30 days'', now())', 'pipeline_report(6)',
      'team_totals(''month'')', 'scoreboard(''month'')', 'prayer_list()', 'directory_list()', 'directory_families()', 'bus_live_routes()', format('bus_stops_list(%L)', g1),
      format('route_riders(%L)', g1), 'coverage_in_bbox(-37.46, -66.61, -37.44, -66.59)', 'roads_in_bbox(-37.46, -66.61, -37.44, -66.59)', 'fin_monthly(6)',
      'fin_by_category(current_date - 30, current_date)', 'fin_account_balances(current_date)', 'fin_balances(null, null)', 'personas_care_list()', 'personas_disc_list()',
      'personas_mclass_list()', 'personas_decisions_recent()', 'list_outings(60, null)', 'dm_inbox()', 'pastor_inbox()', 'church_chat_list(null, 50)',
      format('ministry_chat_list(%L, null, 50)', m2), 'reading_board()', 'my_follow_ups()', 'my_followups()', 'suggestions_list()', 'culto_questions_list()', 'culto_answered_prayers()',
      'inactive_list(null, 50, 0)', 'admin_giving_people(null)', format('zone_progress(%L)', z1), 'church_progress(6)', 'my_progress()', format('person_journey(%L)', c6),
      format('personas_person(%L)', c6), 'daily_range(7)', 'daily_social(current_date)', 'daily_comments_list(current_date)', format('event_plan_registrations_v2(%L, null, 0, 50)', ev5),
      format('event_plan_stats(%L)', ev6), format('event_session_counts(%L)', ev5), format('household_family(%L)', c6), 'accounts_overview()', format('ministry_people_list(%L)', m2),
      'team_live()', 'weekly_report(null, null)', 'checkins_today()', 'search_people(''Ben'')', 'church_join_code()', 'account_deletion_requests()']
      else array['my_profile()', 'my_permissions()', 'daily_for(null)', 'reading_streak()', 'my_upcoming(21)', 'prayer_list()', 'directory_list()', 'dm_inbox()',
      format('pastor_thread(%L)', member), 'church_chat_list(null, 50)', format('ministry_chat_list(%L, null, 50)', m2), 'admin_my_giving(null)', 'my_progress()', 'daily_range(7)',
      'reading_board()', format('household_family(%L)', c6), 'people_engagement(12)', 'fin_monthly(6)', format('weekend_absences(%L)', sun - 1), 'accounts_overview()', 'personas_care_list()'] end) loop
      begin
        execute 'select count(*) || ''/'' || coalesce(sum(length(t::text)), 0) from public.' || call || ' t' into v;
        reads := reads || split_part(call, '(', 1) || '=' || v || ' ';
      exception when others then reads := reads || split_part(call, '(', 1) || '=ERROR(' || left(sqlerrm, 60) || ') ';
      end;
    end loop;
    -- tablas que las pantallas leen directo
    for call in select unnest(array['contacts', 'attendances', 'events', 'sermons', 'songs', 'service_plans', 'duties', 'announcements', 'fin_entries', 'fin_funds', 'admin_giving', 'missionaries',
      'missionary_reports', 'zones', 'sessions', 'materials', 'memory_verses', 'class_schedule', 'classes', 'ministries', 'notifications', 'event_registrations', 'bible_questions', 'households', 'decisions', 'groups', 'church_services', 'daily_content']) loop
      begin
        execute format('select count(*) from public.%I', call) into n;
        reads := reads || call || ':' || n || ' ';
      exception when others then reads := reads || call || ':ERROR ';
      end;
    end loop;
    reset role;
  end loop;

  -- 5. Funciones que guardan: como pastor de ejemplo, todas tienen que rebotar
  perform set_config('request.jwt.claims', claims_demo, true);
  set local role authenticated;
  for call in select unnest(array[
    'accept_community_rules()', 'rotate_join_code()', 'set_my_birthdate(''1980-01-01'')', format('record_attendance(%L, current_date, ''sun'')', c6), format('set_attendance(%L, current_date, %L, true)', c6, s1),
    format('send_pastor_message(''hola'', %L)', member), format('dm_send(%L, ''hola'', ''text'', null, null, null)', member), 'start_session(''soulwinning'')', 'request_account_deletion()', 'delete_my_account()',
    'set_feature(''chat'', false)', 'set_live(''abc'', ''x'')', 'admin_set_my_giving(false)', format('household_rename(%L, ''Otra'')', h2), 'loc_set(true, false, false)',
    'import_people(''[{"name":"Persona De Prueba"}]''::jsonb, ''member'', null, true)', format('personas_decision(%L, ''saved'', current_date, null)', c6), 'set_inactive_months(6)', format('unlink_account(%L)', c6),
    'create_chat_poll(''pregunta'', array[''a'', ''b''], false, null)', format('start_bus_run(%L, 0, 0)', g1), format('event_post_update(%L, ''x'')', ev6), format('culto_prayer_answered(%L, ''x'')', pr0),
    'save_study_note(''article'', ''x'', ''t'', ''b'')', format('person_chip_new(%L, ''x'')', c6), 'personas_visit_link(false)', format('event_set_public(%L, true)', ev6), format('set_contact_inactive(%L, true)', c6),
    format('set_member_role(%L, ''admin'', null)', member), format('set_permission(%L, ''fin.ver'', ''on'')', member), format('promote_to_visitor(%L)', c6), format('event_door_walkin(%L, current_date, ''X'', null, 1, null)', ev6),
    'set_baseline(current_date)', format('set_cancelled(%L, null, current_date, true, ''x'')', s1), format('personas_care_mark(%L, ''gift'', current_date, false)', c6), format('personas_disc_start(%L, null, current_date)', c6),
    format('set_bus_rider(%L, true)', c6), format('set_account_disabled(%L, true)', member), format('set_church_recipients(array[%L::uuid], array[%L::uuid])', pastor, pastor), format('fin_save_bank_snapshot(%L, 1000, null, null)', fa2),
    'chat_send_location(''church'', null, 0, 0, 0, null)', 'loc_push(0, 0, 1, 0, 0, 50, now())', 'admin_create_church(''X'', ''Y'', ''America/Argentina/Buenos_Aires'', ''CODIGO99'', ''AR'')', 'join_church(''NOEXISTE'', ''Alguien'')',
    format('fin_ensure_defaults(%L)', ch), format('merge_contacts(%L, %L, null)', c6, c5), format('admin_create_pastor_invite(%L, 7)', ch), format('export_church_backup(%L)', ch), 'admin_log_export(1, 1)',
    'chat_mark_read(''church'', null)', 'log_app_error(''prueba'', null, null, ''web'', ''1'')', 'mark_reading()']) loop
    begin
      execute 'select count(*) from public.' || call || ' t' into n;
      passed := passed || split_part(call, '(', 1) || ' ';
    exception
      when sqlstate 'DM001' then writes := writes || split_part(call, '(', 1) || '=DM001 ';
      when others then writes := writes || split_part(call, '(', 1) || '=' || sqlstate || ' ';
    end;
  end loop;
  -- 6. Archivos: la cuenta de ejemplo no puede subir; una cuenta real sí (a su propia carpeta)
  begin
    insert into storage.objects (bucket_id, name, owner, owner_id) values ('photos', ch::text || '/prueba-demo.png', pastor, pastor::text);
    files := files || 'ejemplo: SUBIÓ (mal) ';
  exception when others then files := files || 'ejemplo: rechazado (' || sqlstate || ') ';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', real_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, owner, owner_id) values ('photos', real_church::text || '/prueba-demo.png', real_admin, real_admin::text);
    files := files || '· real: puede subir';
  exception when others then files := files || '· real: rechazado (' || sqlstate || ' ' || left(sqlerrm, 50) || ')';
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into after_n from (select 1 from public.chat_reads where church_id = ch union all select 1 from public.app_errors where church_id = ch
    union all select 1 from public.reading_log where user_id = pastor union all select 1 from public.notifications where church_id = ch and read_at is not null) x;
  quiet_delta := (after_n - before_n)::text;

  raise exception E'ROLLBACK_OK\n1 FUGAS ejemplo->otras: [%]\n2 FUGAS real->ejemplo: [%] RED: %\n3 CANDADO: DM001=% sin_permiso=% silenciosas=% MAL=[%] tablas_sin_disparador_completo=%\n4 LECTURAS: %\n5 GUARDAR rebotó: % || PASARON SIN ERROR: [%] (filas nuevas en tablas silenciosas: %)\n6 ARCHIVOS: %',
    leak, leak2, netres, g_ok, g_priv, g_quiet, g_bad, bits_bad, reads, writes, passed, quiet_delta, files;
end $$;
