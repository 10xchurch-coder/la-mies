\set ON_ERROR_STOP on
-- 0039: varios roles por persona.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare r text; x text[]; begin
  perform public.add_member_role('00000000-0000-0000-0000-0000000000c4', 'captain');
  perform public.add_member_role('00000000-0000-0000-0000-0000000000c4', 'assistant_pastor');
  select role::text, extra_roles into r, x from public.profiles where id = '00000000-0000-0000-0000-0000000000c4';
  if r <> 'assistant_pastor' or x <> array['captain'] then raise exception 'FALLO: roles % %', r, x; end if;
  if not public.has_role('00000000-0000-0000-0000-0000000000c4', 'captain') then raise exception 'FALLO: has_role'; end if;
  perform public.remove_member_role('00000000-0000-0000-0000-0000000000c4', 'assistant_pastor');
  select role::text, extra_roles into r, x from public.profiles where id = '00000000-0000-0000-0000-0000000000c4';
  if r <> 'captain' or x <> '{}'::text[] then raise exception 'FALLO: al quitar % %', r, x; end if;
  perform public.add_member_role('00000000-0000-0000-0000-0000000000c4', 'evangelism');
  perform public.remove_member_role('00000000-0000-0000-0000-0000000000c4', 'captain');
  perform public.remove_member_role('00000000-0000-0000-0000-0000000000c4', 'evangelism');
  select role::text into r from public.profiles where id = '00000000-0000-0000-0000-0000000000c4';
  if r <> 'member' then raise exception 'FALLO: no volvió a miembro (%)', r; end if;
end $$;
-- un miembro no se pone roles extra
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  begin update public.profiles set extra_roles = array['captain'] where id = auth.uid(); raise exception 'FALLO: se puso un rol';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.add_member_role(auth.uid(), 'captain'); raise exception 'FALLO: add_member_role sin permiso';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
-- los permisos son la suma de los roles
do $$ declare a text[]; b text[]; u text[]; begin
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set role = 'captain', extra_roles = '{}' where id = '00000000-0000-0000-0000-0000000000c4';
  a := public.perms_of('00000000-0000-0000-0000-0000000000c4');
  update public.profiles set role = 'evangelism', extra_roles = '{}' where id = '00000000-0000-0000-0000-0000000000c4';
  b := public.perms_of('00000000-0000-0000-0000-0000000000c4');
  update public.profiles set role = 'captain', extra_roles = array['evangelism'] where id = '00000000-0000-0000-0000-0000000000c4';
  u := public.perms_of('00000000-0000-0000-0000-0000000000c4');
  if not (u @> a and u @> b) then raise exception 'FALLO: no suma permisos'; end if;
  update public.profiles set role = 'member', extra_roles = '{}' where id = '00000000-0000-0000-0000-0000000000c4';
end $$;
