-- 0039: una persona puede tener varios roles a la vez (por ejemplo, pastor asistente y jefe de ruta).
--  profiles.role sigue siendo el rol principal (el más alto); profiles.extra_roles guarda los demás.
--  Los permisos son la suma de todos sus roles. Pastor y administrador de la app siempre quedan como principal.
alter table public.profiles add column if not exists extra_roles text[] not null default '{}';
grant select (extra_roles) on public.profiles to authenticated;

-- Orden de los roles: el primero es el más alto.
create or replace function public.role_rank(p_role text) returns integer
language sql immutable as $$
  select coalesce(array_position(array['admin', 'app_admin', 'assistant_pastor', 'secretary', 'deacon', 'captain', 'evangelism', 'member'], p_role), 99)
$$;

create or replace function public.has_role(p_profile uuid, p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text = p_role or p_role = any(extra_roles) from public.profiles where id = p_profile), false)
$$;
create or replace function public.i_have_role(p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), p_role)
$$;
grant execute on function public.has_role(uuid, text), public.i_have_role(text) to authenticated;

-- Permisos efectivos: la suma de todos sus roles, después finanzas y los permisos sueltos.
create or replace function public.perms_of(p_profile uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare p record; v text[]; r text;
begin
  select role::text as role, extra_roles, finance_role, disabled_at into p from public.profiles where id = p_profile;
  if not found or p.disabled_at is not null then return array[]::text[]; end if;
  v := public.role_perms(p.role);
  foreach r in array coalesce(p.extra_roles, '{}') loop
    v := v || public.role_perms(r);
  end loop;
  if p.role not in ('admin', 'app_admin') and p.finance_role is not null then
    v := array(select x from unnest(v) x where x not like 'fin.%');
    v := v || case p.finance_role
      when 'manager'   then array['fin.ver', 'fin.cargar', 'fin.tesoreria', 'fin.roles']
      when 'treasurer' then array['fin.ver', 'fin.cargar', 'fin.tesoreria']
      when 'secretary' then array['fin.ver', 'fin.cargar']
      when 'viewer'    then array['fin.ver']
      else array[]::text[] end;
  end if;
  v := array(select x from unnest(v) x where not exists (select 1 from public.profile_permissions pp where pp.profile_id = p_profile and pp.perm = x and not pp.granted))
       || array(select pp.perm from public.profile_permissions pp where pp.profile_id = p_profile and pp.granted);
  return array(select distinct x from unnest(v) x order by 1);
end $$;

-- Lo que antes miraba "¿es jefe de ruta?" ahora mira todos sus roles.
do $$
declare f text; d text;
begin
  foreach f in array array['can_edit_contact', 'can_see_contact_private', 'contacts_people_guard', 'is_captain_or_admin', 'weekend_absences', 'announcement_recipients'] loop
    for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f loop
      d := replace(d, 'coalesce(public.current_role_name()::text = ''captain'', false)', 'public.i_have_role(''captain'')');
      d := replace(d, 'public.current_role_name()::text = ''captain''', 'public.i_have_role(''captain'')');
      d := replace(d, 'public.current_role_name()::text <> ''captain''', 'not public.i_have_role(''captain'')');
      d := replace(d, 'p.role::text in (''admin'', ''secretary'', ''captain'')', '(p.role::text in (''admin'', ''secretary'', ''captain'') or p.extra_roles && array[''admin'', ''secretary'', ''captain''])');
      execute d;
    end loop;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'
             and pg_get_functiondef(p.oid) ~ 'current_role_name\(\)::text (=|<>) ''captain''') then
    raise exception 'Quedó alguna función mirando un solo rol';
  end if;
end $$;

-- Cuidar que nadie se cambie sus propios roles extra.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('lamies.bypass_guard', true) = 'on' then return new; end if;
  if new.id <> old.id then raise exception 'No se puede cambiar el id'; end if;
  if (new.group_id is distinct from old.group_id or new.takes_attendance is distinct from old.takes_attendance)
     and not public.has_perm('personas.editar') then
    raise exception 'No tenés permiso para cambiar la ruta o la asistencia de alguien';
  end if;
  if (new.role is distinct from old.role or new.extra_roles is distinct from old.extra_roles or new.church_id is distinct from old.church_id
      or new.disabled_at is distinct from old.disabled_at or new.finance_role is distinct from old.finance_role)
     and not public.has_perm('admin.permisos') then
    raise exception 'Solo el pastor o el administrador de la app cambian roles';
  end if;
  if public.is_top_role(old.id) and old.id <> auth.uid() and not public.is_top_role(auth.uid())
     and (new.role is distinct from old.role or new.extra_roles is distinct from old.extra_roles or new.disabled_at is distinct from old.disabled_at or new.finance_role is distinct from old.finance_role) then
    raise exception 'Al pastor o al administrador de la app solo los cambia otro pastor o administrador';
  end if;
  if new.church_id is distinct from old.church_id then raise exception 'No se puede cambiar la iglesia'; end if;
  if new.is_network_admin is distinct from old.is_network_admin then
    raise exception 'El administrador de la red se asigna desde la base de datos';
  end if;
  return new;
end $$;

-- Sumar un rol sin quitar los que ya tiene. El más alto queda como principal.
create or replace function public.add_member_role(p_user uuid, p_role member_role) returns void
language plpgsql security definer set search_path = public as $$
declare v_old text; v_extra text[]; v_all text[];
begin
  if not public.has_perm('admin.permisos') then raise exception 'Solo el pastor o el administrador de la app dan roles'; end if;
  select role::text, extra_roles into v_old, v_extra from public.profiles where id = p_user and church_id = public.current_church_id();
  if v_old is null then raise exception 'Esa persona no es de tu iglesia'; end if;
  if p_role::text = 'member' then return; end if;
  if (p_role::text in ('admin', 'app_admin') or v_old in ('admin', 'app_admin')) and not public.is_top_role(auth.uid()) then
    raise exception 'Solo el pastor o el administrador de la app nombran pastores y administradores, o les cambian los roles';
  end if;
  v_all := array(select distinct x from unnest(array_append(array_append(v_extra, v_old), p_role::text)) x where x <> 'member' order by 1);
  v_all := array(select x from unnest(v_all) x order by public.role_rank(x));
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set role = v_all[1]::member_role, extra_roles = v_all[2:] where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'add_member_role', p_user::text, jsonb_build_object('role', p_role));
end $$;

-- Quitar un solo rol; si era el principal, sube el siguiente (o queda como miembro).
create or replace function public.remove_member_role(p_user uuid, p_role member_role) returns void
language plpgsql security definer set search_path = public as $$
declare v_old text; v_extra text[]; v_all text[];
begin
  if not public.has_perm('admin.permisos') then raise exception 'Solo el pastor o el administrador de la app quitan roles'; end if;
  select role::text, extra_roles into v_old, v_extra from public.profiles where id = p_user and church_id = public.current_church_id();
  if v_old is null then raise exception 'Esa persona no es de tu iglesia'; end if;
  if (p_role::text in ('admin', 'app_admin') or v_old in ('admin', 'app_admin')) and not public.is_top_role(auth.uid()) then
    raise exception 'Solo el pastor o el administrador de la app cambian los roles de un pastor o administrador';
  end if;
  if p_user = auth.uid() and p_role::text in ('admin', 'app_admin') and v_old = p_role::text then
    raise exception 'No te podés quitar a vos mismo el rol de pastor o administrador';
  end if;
  v_all := array(select x from unnest(array_append(v_extra, v_old)) x where x <> p_role::text and x <> 'member' order by public.role_rank(x));
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set role = coalesce(v_all[1], 'member')::member_role, extra_roles = coalesce(v_all[2:], '{}') where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'remove_member_role', p_user::text, jsonb_build_object('role', p_role));
end $$;
revoke all on function public.add_member_role(uuid, member_role), public.remove_member_role(uuid, member_role) from public, anon;
grant execute on function public.add_member_role(uuid, member_role), public.remove_member_role(uuid, member_role) to authenticated;

-- Cambiar el rol principal desde la ficha: el nuevo deja de figurar entre los extra.
create or replace function public.set_member_role(p_user uuid, p_role member_role, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.has_perm('admin.permisos') then raise exception 'Solo el pastor o el administrador de la app dan roles'; end if;
  select role::text into v_old from public.profiles where id = p_user and church_id = public.current_church_id();
  if v_old is null then raise exception 'Esa persona no es de tu iglesia'; end if;
  if (p_role::text in ('admin', 'app_admin') or v_old in ('admin', 'app_admin')) and p_role::text <> v_old and not public.is_top_role(auth.uid()) then
    raise exception 'Solo el pastor o el administrador de la app nombran o quitan pastores y administradores';
  end if;
  if p_user = auth.uid() and v_old in ('admin', 'app_admin') and p_role::text not in ('admin', 'app_admin') then
    raise exception 'No te podés quitar a vos mismo el rol de pastor o administrador';
  end if;
  if p_group is not null and not exists (select 1 from public.groups where id = p_group and church_id = public.current_church_id()) then
    raise exception 'Esa ruta no es de tu iglesia';
  end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set role = p_role, group_id = p_group, extra_roles = array_remove(extra_roles, p_role::text) where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_member_role', p_user::text, jsonb_build_object('role', p_role, 'group', p_group));
end $$;
