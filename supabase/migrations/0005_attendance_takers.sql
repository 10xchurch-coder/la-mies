-- ============================================================================
-- La Mies · Parte 2b · Quién toma asistencia
-- La secretaría o el pastor pueden marcar a cualquier persona con cuenta como
-- "toma asistencia" (además de capitanes, recepción y el propio staff).
-- ============================================================================
alter table public.profiles add column if not exists takes_attendance boolean not null default false;

create or replace function public.can_take_attendance() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_captain_or_admin()
      or coalesce((select takes_attendance from public.profiles where id = auth.uid()), false)
      or exists (select 1 from public.ministry_members mm join public.ministries m on m.id = mm.ministry_id
                 where mm.profile_id = auth.uid() and m.can_take_attendance)
$$;

-- Solo el staff cambia esa marca (el guard de perfiles ya impide tocar rol/iglesia/grupo).
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('lamies.bypass_guard', true) = 'on' then
    return new;
  end if;
  if new.id <> old.id then
    raise exception 'No se puede cambiar el id';
  end if;
  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id
      or new.group_id is distinct from old.group_id
      or new.is_network_admin is distinct from old.is_network_admin
      or new.takes_attendance is distinct from old.takes_attendance)
     and not public.is_staff() then
    raise exception 'Solo un administrador puede cambiar rol, iglesia, grupo o permisos';
  end if;
  if (new.role::text = 'admin' or old.role::text = 'admin') and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Solo el pastor (administrador) puede nombrar o quitar administradores';
  end if;
  if new.church_id is distinct from old.church_id and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar la iglesia';
  end if;
  if new.is_network_admin is distinct from old.is_network_admin then
    raise exception 'El administrador de la red se asigna desde la base de datos';
  end if;
  return new;
end $$;

create or replace function public.set_takes_attendance(p_user uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Solo administradores o secretaría'; end if;
  if not exists (select 1 from public.profiles where id = p_user and church_id = public.current_church_id()) then
    raise exception 'Esa persona no es de tu iglesia';
  end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set takes_attendance = p_value where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_takes_attendance', p_user::text, jsonb_build_object('value', p_value));
end $$;
grant execute on function public.set_takes_attendance(uuid, boolean) to authenticated;
