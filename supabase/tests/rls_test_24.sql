\set ON_ERROR_STOP on
-- 0032: permisos por persona.
set role authenticated;
-- la secretaría ya no da roles ni permisos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  begin perform public.set_member_role('00000000-0000-0000-0000-0000000000c4', 'captain', null); raise exception 'FALLO: la secretaría dio un rol';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.set_permission('00000000-0000-0000-0000-0000000000c4', 'cal.editar', 'grant'); raise exception 'FALLO: la secretaría dio un permiso';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if not public.has_perm('personas.editar') then raise exception 'FALLO: la secretaría perdió personas'; end if;
  if public.finance_level() <> 2 then raise exception 'FALLO: la secretaría debería cargar finanzas'; end if;
end $$;
-- el pastor da un permiso suelto a un miembro y se lo saca a la secretaría
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.set_permission('00000000-0000-0000-0000-0000000000c4', 'cal.editar', 'grant');
select public.set_permission('00000000-0000-0000-0000-0000000000c1', 'cal.editar', 'revoke');
select public.set_member_role('00000000-0000-0000-0000-0000000000c5', 'app_admin', null);
do $$ begin
  if not exists (select 1 from public.church_permissions() where profile_id = '00000000-0000-0000-0000-0000000000c4' and 'cal.editar' = any(perms)) then raise exception 'FALLO: no quedó el permiso suelto'; end if;
  begin perform public.set_permission(auth.uid(), 'admin.permisos', 'revoke'); raise exception 'FALLO: el pastor se sacó dar permisos';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
do $$ begin
  if not public.has_perm('cal.editar') then raise exception 'FALLO: el miembro no puede editar el calendario'; end if;
  if public.has_perm('personas.editar') then raise exception 'FALLO: el miembro tiene de más'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  if public.has_perm('cal.editar') then raise exception 'FALLO: a la secretaría no se le sacó el calendario'; end if;
end $$;
-- el administrador de la app tiene todo y puede tocar al pastor; nadie más
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  if not public.has_perm('admin.permisos') or public.finance_level() <> 4 then raise exception 'FALLO: el administrador de la app no tiene todo'; end if;
end $$;
reset role;
select set_config('lamies.bypass_guard', 'on', false);
update public.profiles set role = 'secretary' where id = '00000000-0000-0000-0000-0000000000c4';
insert into public.profile_permissions (profile_id, perm, granted) values ('00000000-0000-0000-0000-0000000000c4', 'admin.permisos', true) on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
do $$ begin
  begin perform public.set_member_role('00000000-0000-0000-0000-00000000000a', 'member', null); raise exception 'FALLO: una secretaría con permisos le quitó el rol al pastor';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.set_permission('00000000-0000-0000-0000-00000000000a', 'fin.ver', 'revoke'); raise exception 'FALLO: le sacaron un permiso al pastor';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
select set_config('lamies.bypass_guard', 'on', false);
delete from public.profile_permissions where profile_id in ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c1');
update public.profiles set role = 'member' where id in ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c5');
select set_config('lamies.bypass_guard', 'off', false);
