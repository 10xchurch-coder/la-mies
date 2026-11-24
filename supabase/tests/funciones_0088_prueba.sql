-- Prueba de la migración 0088 (funciones por iglesia en el servidor).
-- Usa cuentas reales de la iglesia anfitriona pero NO deja nada: todo corre dentro de un bloque que termina en error
-- a propósito ("ROLLBACK_OK: ..."), y eso deshace todo. Lo que hay que mirar es el texto del error.
-- Esperado: rutas=ofrendas_persona,evento_puerta,clase_lecciones,eventos,nulo,nulo padre_apaga=false
--   miembro_set_features=no miembro_set_bible=no ofrenda_apagada=no ofrenda_prendida=1 lee_prendida=1 lee_apagada=0
--   sigue_en_la_base=1 anular_apagada=no mis_ofrendas_apagada=no vuelve_al_prender=1
--   aviso_cumple_apagado=0 aviso_enlace_apagado=0 aviso_hijo_de_apagado=0 aviso_clase_apagada=0 aviso_normal=1 aviso_cumple_prendido=1
--   pase_automatico_apagado=0 pase_automatico_prendido=1 ubicacion_apagada=no
--   tarjeta_apagada=nulo/false/no tarjeta_prendida=ok/true/ok biblia_vacia=no biblia_ok={"default": "kjv", "versions": ["kjv"]}
--   set_features=cumples,vivo
do $$
declare
  v_church uuid := '2c35b2a1-494d-475d-8a87-b7df18974838'; v_admin uuid; v_member uuid; v_fund uuid; v_fund2 uuid; v_contact uuid; v_g uuid; v_n int; v_off text[];
  out text := ''; t text; v_tok text := 'zzpruebatoken0088zzzz'; v_j jsonb;
  claims_admin text; claims_member text;
begin
  select p.id into v_admin from public.profiles p where p.church_id = v_church and p.role::text = 'admin' and p.disabled_at is null limit 1;
  select p.id into v_member from public.profiles p where p.church_id = v_church and p.role::text = 'member' and coalesce(array_length(p.extra_roles,1),0) = 0 and p.disabled_at is null
    and not ('admin.permisos' = any(public.perms_of(p.id))) order by p.created_at limit 1;
  select id into v_fund from public.fin_funds where church_id = v_church order by sort_order limit 1;
  select id into v_fund2 from public.fin_funds where church_id = v_church and id <> v_fund order by sort_order limit 1;
  select id into v_contact from public.contacts where church_id = v_church and merged_into is null limit 1;
  if v_admin is null or v_member is null or v_fund is null or v_fund2 is null or v_contact is null then raise exception 'faltan datos de prueba'; end if;
  claims_admin := json_build_object('sub', v_admin, 'role', 'authenticated')::text;
  claims_member := json_build_object('sub', v_member, 'role', 'authenticated')::text;
  select disabled_features into v_off from public.churches where id = v_church;
  if not ('ofrendas_persona' = any(v_off)) then raise exception 'se esperaba la iglesia anfitriona con ofrendas_persona apagada'; end if;

  -- A qué función pertenece cada enlace
  out := out || ' rutas=' || concat_ws(',', public.feature_of_link('/finanzas/ofrendas?x=1'), public.feature_of_link('/evento/puerta'), public.feature_of_link('/clase/leccion?id=3'),
    public.feature_of_link('/evento/abc-123'), coalesce(public.feature_of_link('/contacto/abc'), 'nulo'), coalesce(public.feature_of_link(null), 'nulo'));
  update public.churches set disabled_features = disabled_features || array['eventos'] where id = v_church;
  out := out || ' padre_apaga=' || public.feature_on(v_church, 'evento_puerta');

  -- Solo el pastor cambia funciones y Biblia
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims_member, true);
  begin perform public.set_features(array['chat']); out := out || ' miembro_set_features=SI(MAL)'; exception when others then out := out || ' miembro_set_features=no'; end;
  begin perform public.set_bible(array['kjv'], 'kjv'); out := out || ' miembro_set_bible=SI(MAL)'; exception when others then out := out || ' miembro_set_bible=no'; end;

  -- Ofrendas por persona
  perform set_config('request.jwt.claims', claims_admin, true);
  begin insert into public.admin_giving (contact_id, fund_id, on_date, amount, method) values (v_contact, v_fund, current_date, 100, 'cash'); out := out || ' ofrenda_apagada=SI(MAL)';
  exception when others then out := out || ' ofrenda_apagada=no'; end;
  perform public.set_feature('ofrendas_persona', true);
  insert into public.admin_giving (contact_id, fund_id, on_date, amount, method) values (v_contact, v_fund, current_date, 100, 'cash') returning id into v_g;
  out := out || ' ofrenda_prendida=1';
  select count(*) into v_n from public.admin_giving where id = v_g; out := out || ' lee_prendida=' || v_n;
  perform public.set_feature('ofrendas_persona', false);
  select count(*) into v_n from public.admin_giving where id = v_g; out := out || ' lee_apagada=' || v_n;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.admin_giving where id = v_g; out := out || ' sigue_en_la_base=' || v_n;
  begin update public.admin_giving set voided_at = now(), void_reason = 'prueba' where id = v_g; out := out || ' anular_apagada=SI(MAL)'; exception when others then out := out || ' anular_apagada=no'; end;
  insert into public.admin_church_settings (church_id, my_giving_on) values (v_church, true) on conflict (church_id) do update set my_giving_on = true;
  perform set_config('role', 'authenticated', true);
  begin perform * from public.admin_my_giving(null); out := out || ' mis_ofrendas_apagada=SI(MAL)'; exception when others then out := out || ' mis_ofrendas_apagada=no'; end;
  perform public.set_feature('ofrendas_persona', true);
  select count(*) into v_n from public.admin_giving where id = v_g; out := out || ' vuelve_al_prender=' || v_n;
  perform public.set_feature('ofrendas_persona', false);

  -- Avisos
  perform public.set_feature('cumples', false);
  perform public.set_feature('clases', false);
  perform set_config('role', 'postgres', true);
  perform public.notify(v_admin, 'birthday', 'zz0088 a', 'x', null);
  select count(*) into v_n from public.notifications where title = 'zz0088 a'; out := out || ' aviso_cumple_apagado=' || v_n;
  perform public.notify(v_admin, 'report', 'zz0088 b', 'x', '/finanzas/ofrendas');
  select count(*) into v_n from public.notifications where title = 'zz0088 b'; out := out || ' aviso_enlace_apagado=' || v_n;
  perform public.notify(v_admin, 'link', 'zz0088 c', 'x', '/evento/puerta?id=1');
  select count(*) into v_n from public.notifications where title = 'zz0088 c'; out := out || ' aviso_hijo_de_apagado=' || v_n;
  perform public.notify(v_admin, 'class', 'zz0088 d', 'x', '/material/abc');
  select count(*) into v_n from public.notifications where title = 'zz0088 d'; out := out || ' aviso_clase_apagada=' || v_n;
  perform public.notify(v_admin, 'announcement', 'zz0088 e', 'x', '/anuncios');
  select count(*) into v_n from public.notifications where title = 'zz0088 e'; out := out || ' aviso_normal=' || v_n;
  update public.churches set disabled_features = array_remove(disabled_features, 'cumples') where id = v_church;
  perform public.notify(v_admin, 'birthday', 'zz0088 f', 'x', null);
  select count(*) into v_n from public.notifications where title = 'zz0088 f'; out := out || ' aviso_cumple_prendido=' || v_n;

  -- Tareas programadas: el pase automático de finanzas no corre con finanzas apagada.
  -- (Corre la tarea de verdad, run_v07_jobs, para todas las iglesias; todo se deshace al final. Hay que probarlo después de las 8 de la mañana de la iglesia.)
  insert into public.fin_recurring (church_id, from_fund_id, to_fund_id, amount, day, active, description, created_by)
    values (v_church, v_fund, v_fund2, 123, 1, true, 'zz0088 pase', v_admin);
  update public.churches set disabled_features = disabled_features || array['finanzas'] where id = v_church;
  perform public.run_v07_jobs();
  select count(*) into v_n from public.fin_entries where church_id = v_church and description = 'zz0088 pase'; out := out || ' pase_automatico_apagado=' || v_n;
  update public.churches set disabled_features = array_remove(disabled_features, 'finanzas') where id = v_church;
  perform public.run_v07_jobs();
  select count(*) into v_n from public.fin_entries where church_id = v_church and description = 'zz0088 pase'; out := out || ' pase_automatico_prendido=' || v_n;

  -- Ubicación en familia
  update public.churches set disabled_features = disabled_features || array['ubicacion_familia'] where id = v_church;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims_member, true);
  begin perform public.loc_set(true, true, false); out := out || ' ubicacion_apagada=SI(MAL)'; exception when others then out := out || ' ubicacion_apagada=no'; end;

  -- Tarjeta de visita (página pública)
  perform set_config('role', 'postgres', true);
  -- Cada iglesia tiene un solo enlace: si ya existe se usa ese; si no, se crea uno de prueba.
  select token into t from public.visit_card_links where church_id = v_church;
  if t is null then insert into public.visit_card_links (church_id, token, created_by) values (v_church, v_tok, v_admin); else v_tok := t; end if;
  update public.churches set disabled_features = disabled_features || array['tarjeta_visita'] where id = v_church;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  out := out || ' tarjeta_apagada=' || case when public.visit_card_public(v_tok) is null then 'nulo' else 'SI(MAL)' end || '/' || public.public_part_on('visita', v_tok);
  begin perform public.visit_card_submit(v_tok, 'Visita De Prueba Zz', '+5493764000000', null, null); out := out || '/SI(MAL)'; exception when others then out := out || '/no'; end;
  perform set_config('role', 'postgres', true);
  update public.churches set disabled_features = array_remove(disabled_features, 'tarjeta_visita') where id = v_church;
  perform set_config('role', 'anon', true);
  out := out || ' tarjeta_prendida=' || case when public.visit_card_public(v_tok) is null then 'NULO(MAL)' else 'ok' end || '/' || public.public_part_on('visita', v_tok);
  begin perform public.visit_card_submit(v_tok, 'Visita De Prueba Zz', '+5493764000000', null, null); out := out || '/ok'; exception when others then out := out || '/NO(MAL): ' || sqlerrm; end;

  -- La Biblia de la iglesia y guardar varias funciones juntas
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims_admin, true);
  begin perform public.set_bible('{}', null); out := out || ' biblia_vacia=SI(MAL)'; exception when others then out := out || ' biblia_vacia=no'; end;
  v_j := public.set_bible(array['kjv', 'kjv', 'MAL!'], 'rv1909');
  out := out || ' biblia_ok=' || (select bible::text from public.churches where id = v_church);
  out := out || ' set_features=' || array_to_string(public.set_features(array['vivo', 'cumples', 'cumples', 'MAL!']), ',');

  raise exception 'ROLLBACK_OK:%', out;
end $$;
