-- Prueba de la migración 0081 (permiso "presentar.usar" del Modo presentación).
-- Usa cuentas reales de la iglesia pero NO deja nada: todo corre dentro de un bloque que termina en error a propósito
-- ("ROLLBACK_OK: ..."), y eso deshace todo (también la migración, si este archivo la aplicó). Lo que hay que mirar es el texto del error.
-- Esperado: admin_puede=true admin_crea=si miembro_puede=false miembro_ve=0 miembro_crea=no miembro_cambia=0
--   capitan_puede=false (o "sin capitan") permiso_desconocido_antes... con_permiso_puede=true con_permiso_ve=1 con_permiso_crea=si
--   con_permiso_cambia=1 otra_iglesia=no quitado_puede=false quitado_ve=0
-- Para probar ANTES de aplicar la migración, pegar su contenido donde dice __MIGRACION__ dentro de: execute $mig0081$ ... $mig0081$;
do $test$
declare
  v_church uuid; v_admin uuid; v_member uuid; v_captain uuid; v_other uuid; v_set uuid; v_n int;
  out text := '';
begin
  -- __MIGRACION__
  select p.church_id, p.id into v_church, v_admin from public.profiles p where p.role::text = 'admin' and p.disabled_at is null and p.church_id is not null limit 1;
  select p.id into v_member from public.profiles p where p.church_id = v_church and p.role::text = 'member' and coalesce(array_length(p.extra_roles,1),0) = 0 and p.disabled_at is null
    and not exists (select 1 from public.profile_permissions pp where pp.profile_id = p.id) order by p.created_at limit 1;
  select p.id into v_captain from public.profiles p where p.church_id = v_church and p.role::text = 'captain' and p.disabled_at is null
    and not exists (select 1 from public.profile_permissions pp where pp.profile_id = p.id and pp.perm = 'presentar.usar') limit 1;
  select c.id into v_other from public.churches c where c.id <> v_church limit 1;
  if v_admin is null or v_member is null then raise exception 'faltan usuarios de prueba'; end if;

  -- El pastor: siempre puede.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  out := out || ' admin_puede=' || public.presentar2_can_present();
  begin
    insert into public.present_sets (name) values ('Lista de prueba zz') returning id into v_set;
    out := out || ' admin_crea=si';
  exception when others then out := out || ' admin_crea=no'; end;

  -- Un miembro sin el permiso: no ve, no crea, no cambia.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  out := out || ' miembro_puede=' || public.presentar2_can_present();
  select count(*) into v_n from public.present_sets; out := out || ' miembro_ve=' || v_n;
  begin
    insert into public.present_sets (name) values ('No debería zz');
    out := out || ' miembro_crea=SI(MAL)';
  exception when others then out := out || ' miembro_crea=no'; end;
  update public.present_sets set name = 'Cambiada zz' where id = v_set; get diagnostics v_n = row_count; out := out || ' miembro_cambia=' || v_n;

  -- Un capitán (antes entraba por ser líder): ya no, salvo que se lo den.
  if v_captain is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_captain, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.present_sets;
    out := out || ' capitan_puede=' || public.presentar2_can_present() || ' capitan_ve=' || v_n;
  else out := out || ' sin_capitan'; end if;

  -- El miembro no se lo puede dar solo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  begin
    perform public.set_permission(v_member, 'presentar.usar', 'grant');
    out := out || ' miembro_se_lo_da_solo=SI(MAL)';
  exception when others then out := out || ' miembro_se_lo_da_solo=no'; end;

  -- El pastor se lo da desde Roles y permisos (public.set_permission).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.set_permission(v_member, 'presentar.usar', 'grant');
    out := out || ' pastor_lo_da=si';
  exception when others then out := out || ' pastor_lo_da=NO(' || sqlerrm || ')'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  out := out || ' con_permiso_puede=' || public.presentar2_can_present();
  select count(*) into v_n from public.present_sets where id = v_set; out := out || ' con_permiso_ve=' || v_n;
  begin
    insert into public.present_sets (name) values ('Lista del que maneja zz');
    out := out || ' con_permiso_crea=si';
  exception when others then out := out || ' con_permiso_crea=NO(' || sqlerrm || ')'; end;
  update public.present_sets set name = 'Cambiada zz' where id = v_set; get diagnostics v_n = row_count; out := out || ' con_permiso_cambia=' || v_n;
  -- Pero no en otra iglesia.
  if v_other is not null then
    begin
      insert into public.present_sets (church_id, name) values (v_other, 'Otra iglesia zz');
      out := out || ' otra_iglesia=SI(MAL)';
    exception when others then out := out || ' otra_iglesia=no'; end;
  end if;
  -- Sigue sin los otros permisos de líder.
  out := out || ' no_gana_otros=' || (not public.has_perm('personas.ver_todas') and not public.has_perm('inf.panel'));

  -- El pastor se lo saca: vuelve a quedar afuera.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.set_permission(v_member, 'presentar.usar', 'revoke');
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.present_sets;
  out := out || ' quitado_puede=' || public.presentar2_can_present() || ' quitado_ve=' || v_n;

  perform set_config('role', 'postgres', true);
  -- Los roles: solo pastor y administrador lo traen.
  out := out || ' roles_con_permiso=' || (select string_agg(r, ',') from unnest(array['app_admin','admin','assistant_pastor','secretary','deacon','captain','evangelism','member']) r where 'presentar.usar' = any(public.role_perms(r)));
  raise exception 'ROLLBACK_OK:%', out;
end $test$;
