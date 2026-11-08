-- 0032: permisos por persona.
-- Cada rol es un paquete inicial de permisos. Al pastor y al administrador de la app les toca todo.
-- A cualquier persona se le puede dar o sacar un permiso suelto (profile_permissions).
-- Solo quien tiene "admin.permisos" (pastor y administrador de la app) da roles y permisos,
-- y nadie que no sea pastor o administrador de la app puede tocar a un pastor o administrador.
-- Roles nuevos: app_admin (Administrador de la app), assistant_pastor (Pastor asistente),
-- deacon (Diácono), evangelism (Coordinador de evangelismo). "captain" se muestra como Jefe de ruta.
-- Finanzas: treasurer (Tesorero), secretary (Auxiliar de tesorería), viewer (Revisor de cuentas).

alter type public.member_role add value if not exists 'app_admin';
alter type public.member_role add value if not exists 'assistant_pastor';
alter type public.member_role add value if not exists 'deacon';
alter type public.member_role add value if not exists 'evangelism';

create or replace function public.all_perms() returns text[]
language sql immutable as $$
  select array['personas.ver_todas', 'personas.editar', 'personas.asistencia', 'personas.privados',
               'com.anuncios', 'com.moderar', 'cal.editar', 'predicas.subir', 'devocional.editar',
               'ens.ver', 'ens.editar', 'ens.material',
               'evang.corregir', 'evang.marcar_otros', 'evang.ver_salidas', 'evang.zonas',
               'inf.panel', 'fin.ver', 'fin.cargar', 'fin.tesoreria', 'fin.roles',
               'admin.permisos', 'admin.iglesia']
$$;

-- Paquete de cada rol.
create or replace function public.role_perms(p_role text) returns text[]
language sql immutable set search_path = public as $$
  select case p_role
    when 'app_admin' then public.all_perms()
    when 'admin' then public.all_perms()
    when 'assistant_pastor' then array(select x from unnest(public.all_perms()) x where x not like 'fin.%' and x <> 'admin.permisos')
    when 'secretary' then array(select x from unnest(public.all_perms()) x where x not in ('admin.permisos', 'fin.tesoreria', 'fin.roles'))
    when 'deacon' then array['personas.ver_todas', 'personas.asistencia', 'personas.privados', 'ens.ver', 'inf.panel']
    when 'evangelism' then array['evang.corregir', 'evang.marcar_otros', 'evang.ver_salidas', 'evang.zonas']
    when 'captain' then array['com.anuncios', 'ens.ver', 'personas.asistencia', 'inf.panel', 'evang.corregir', 'personas.privados', 'evang.zonas']
    else array[]::text[]
  end
$$;

-- Permisos sueltos: granted = true lo da, false lo saca.
create table if not exists public.profile_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  perm       text not null,
  granted    boolean not null,
  set_by     uuid references public.profiles(id) on delete set null,
  set_at     timestamptz not null default now(),
  primary key (profile_id, perm)
);
alter table public.profile_permissions enable row level security;

-- Permisos efectivos de una persona.
create or replace function public.perms_of(p_profile uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare p record; v text[];
begin
  select role::text as role, finance_role, disabled_at into p from public.profiles where id = p_profile;
  if not found or p.disabled_at is not null then return array[]::text[]; end if;
  v := public.role_perms(p.role);
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

create or replace function public.has_perm(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_perm = any(public.perms_of(auth.uid()))
$$;

create or replace function public.my_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select public.perms_of(auth.uid())
$$;

create or replace function public.is_top_role(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('admin', 'app_admin') from public.profiles where id = p_profile), false)
$$;

-- Dar o sacar un permiso suelto. p_state: 'grant', 'revoke' o 'default' (vuelve a lo del rol).
create or replace function public.set_permission(p_profile uuid, p_perm text, p_state text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('admin.permisos') then raise exception 'Solo el pastor o el administrador de la app dan permisos'; end if;
  if not (p_perm = any(public.all_perms())) then raise exception 'Permiso desconocido'; end if;
  if not exists (select 1 from public.profiles where id = p_profile and church_id = public.current_church_id()) then
    raise exception 'Esa persona no es de tu iglesia';
  end if;
  if public.is_top_role(p_profile) and not public.is_top_role(auth.uid()) then
    raise exception 'Al pastor o al administrador de la app solo los cambia otro pastor o administrador';
  end if;
  if p_profile = auth.uid() and p_perm = 'admin.permisos' and p_state = 'revoke' then
    raise exception 'No te podés sacar a vos mismo el permiso de dar permisos';
  end if;
  if p_state = 'default' then
    delete from public.profile_permissions where profile_id = p_profile and perm = p_perm;
  elsif p_state in ('grant', 'revoke') then
    insert into public.profile_permissions (profile_id, perm, granted, set_by)
    values (p_profile, p_perm, p_state = 'grant', auth.uid())
    on conflict (profile_id, perm) do update set granted = excluded.granted, set_by = excluded.set_by, set_at = now();
  else
    raise exception 'Estado inválido';
  end if;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_permission', p_profile::text, jsonb_build_object('perm', p_perm, 'state', p_state));
end $$;

-- Lo que tiene cada persona de la iglesia (para la pantalla de permisos).
create or replace function public.church_permissions()
returns table (profile_id uuid, perms text[], overrides jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, public.perms_of(p.id),
         coalesce((select jsonb_object_agg(pp.perm, pp.granted) from public.profile_permissions pp where pp.profile_id = p.id), '{}'::jsonb)
  from public.profiles p
  where p.church_id = public.current_church_id() and public.has_perm('admin.permisos')
$$;

drop policy if exists profile_permissions_read on public.profile_permissions;
create policy profile_permissions_read on public.profile_permissions for select to authenticated
  using (profile_id = auth.uid() or (public.has_perm('admin.permisos')
         and exists (select 1 from public.profiles p where p.id = profile_id and p.church_id = public.current_church_id())));
grant select on public.profile_permissions to authenticated;

-- Nivel de finanzas a partir de los permisos.
create or replace function public.finance_level() returns integer
language sql stable security definer set search_path = public as $$
  select case when public.has_perm('fin.roles') then 4
              when public.has_perm('fin.tesoreria') then 3
              when public.has_perm('fin.cargar') then 2
              when public.has_perm('fin.ver') then 1 else 0 end
$$;

create or replace function public.finance_level_of(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when 'fin.roles' = any(v) then 4 when 'fin.tesoreria' = any(v) then 3
              when 'fin.cargar' = any(v) then 2 when 'fin.ver' = any(v) then 1 else 0 end
  from (select public.perms_of(p_user) v) s
$$;

create or replace function public.can_take_attendance() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('personas.asistencia')
      or coalesce((select takes_attendance from public.profiles where id = auth.uid()), false)
      or exists (select 1 from public.ministry_members mm join public.ministries m on m.id = mm.ministry_id
                 where mm.profile_id = auth.uid() and m.can_take_attendance)
$$;

-- Las funciones viejas quedan como atajos (por si algo las sigue usando).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_perm('admin.permisos') $$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_perm('personas.editar') $$;
create or replace function public.is_captain_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('personas.ver_todas') or public.has_perm('inf.panel') or coalesce(public.current_role_name()::text = 'captain', false)
$$;
create or replace function public.staff_ids(p_church uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where church_id = p_church and disabled_at is null and role::text in ('admin', 'app_admin', 'secretary', 'assistant_pastor')
$$;

-- Cada política usa el permiso de su área.
do $pol$
declare r record; m record; q text; c text; n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_staff|is_admin|is_captain_or_admin)\(\)'
  loop
    q := r.qual; c := r.with_check;
    for m in
      select * from (values
        ('announcements', 'is_staff', 'com.anuncios'), ('announcements', 'is_captain_or_admin', 'com.anuncios'),
        ('audit_log', 'is_admin', 'admin.permisos'),
        ('church_services', 'is_staff', 'cal.editar'), ('events', 'is_staff', 'cal.editar'),
        ('churches', 'is_staff', 'admin.iglesia'),
        ('class_attendance', 'is_captain_or_admin', 'ens.ver'), ('class_attendance', 'is_staff', 'ens.editar'),
        ('class_schedule', 'is_staff', 'ens.editar'),
        ('class_students', 'is_captain_or_admin', 'ens.ver'), ('class_students', 'is_staff', 'ens.editar'),
        ('class_teachers', 'is_staff', 'ens.editar'), ('classes', 'is_staff', 'ens.editar'),
        ('contact_visits', 'is_admin', 'personas.editar'), ('contacts', 'is_staff', 'personas.editar'),
        ('content_reports', 'is_staff', 'com.moderar'), ('daily_comments', 'is_staff', 'com.moderar'),
        ('prayer_requests', 'is_staff', 'com.moderar'), ('suggestions', 'is_staff', 'com.moderar'),
        ('daily_content', 'is_staff', 'devocional.editar'), ('growth_articles', 'is_staff', 'devocional.editar'),
        ('training_items', 'is_admin', 'devocional.editar'),
        ('groups', 'is_staff', 'evang.zonas'), ('zones', 'is_captain_or_admin', 'evang.zonas'),
        ('materials', 'is_captain_or_admin', 'ens.ver'), ('materials', 'is_staff', 'ens.material'),
        ('ministries', 'is_captain_or_admin', 'ens.ver'), ('ministries', 'is_staff', 'ens.editar'),
        ('ministry_members', 'is_captain_or_admin', 'ens.ver'),
        ('pastor_reports', 'is_staff', 'inf.panel'),
        ('profiles', 'is_staff', 'personas.editar'),
        ('sermons', 'is_staff', 'predicas.subir'),
        ('sessions', 'is_admin', 'evang.ver_salidas'), ('track_points', 'is_admin', 'evang.ver_salidas')
      ) t(tbl, helper, perm)
      where t.tbl = r.tablename
    loop
      q := replace(q, m.helper || '()', format('has_perm(%L)', m.perm));
      c := replace(c, m.helper || '()', format('has_perm(%L)', m.perm));
    end loop;
    if r.schemaname = 'storage' then
      if r.policyname like '%materials%' then q := replace(q, 'is_staff()', 'public.has_perm(''ens.material'')'); c := replace(c, 'is_staff()', 'public.has_perm(''ens.material'')'); end if;
      if r.policyname like '%sermons%' then q := replace(q, 'is_staff()', 'public.has_perm(''predicas.subir'')'); c := replace(c, 'is_staff()', 'public.has_perm(''predicas.subir'')'); end if;
    end if;
    if q is distinct from r.qual or c is distinct from r.with_check then
      execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
        || case when q is not null then format(' using (%s)', q) else '' end
        || case when c is not null then format(' with check (%s)', c) else '' end;
      n := n + 1;
    end if;
  end loop;
  raise notice 'políticas actualizadas: %', n;
end $pol$;

-- Cada función usa el permiso de su área.
do $fn$
declare m record; d text; n int := 0;
begin
  for m in
    select * from (values
      ('account_deletion_requests', 'is_staff', 'personas.editar'), ('accounts_overview', 'is_staff', 'personas.editar'),
      ('can_edit_contact', 'is_staff', 'personas.editar'), ('contacts_people_guard', 'is_staff', 'personas.editar'),
      ('link_account', 'is_staff', 'personas.editar'), ('unlink_account', 'is_staff', 'personas.editar'),
      ('set_takes_attendance', 'is_staff', 'personas.editar'),
      ('can_see_contact_private', 'is_staff', 'personas.ver_todas'),
      ('can_fix_session', 'is_staff', 'evang.ver_salidas'), ('list_outings', 'is_staff', 'evang.ver_salidas'),
      ('trim_session', 'is_staff', 'evang.ver_salidas'),
      ('can_see_class', 'is_captain_or_admin', 'ens.ver'), ('is_ministry_leader', 'is_staff', 'ens.editar'),
      ('church_progress', 'is_captain_or_admin', 'inf.panel'), ('church_report', 'is_captain_or_admin', 'inf.panel'),
      ('people_engagement', 'is_captain_or_admin', 'inf.panel'),
      ('pipeline_report', 'is_staff', 'inf.panel'), ('pipeline_report', 'is_captain_or_admin', 'inf.panel'),
      ('weekly_report', 'is_staff', 'inf.panel'),
      ('edit_house', 'is_captain_or_admin', 'evang.corregir'), ('set_side_coverage', 'is_captain_or_admin', 'evang.corregir'),
      ('profiles_private', 'is_captain_or_admin', 'personas.privados'),
      ('resolve_report', 'is_staff', 'com.moderar'), ('suggestions_list', 'is_staff', 'com.moderar'),
      ('rotate_join_code', 'is_admin', 'admin.iglesia'),
      ('set_account_disabled', 'is_admin', 'admin.permisos'), ('set_church_recipients', 'is_staff', 'admin.permisos')
    ) t(fn, helper, perm)
  loop
    for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'public' and p.proname = m.fn
    loop
      d := replace(replace(d, 'public.' || m.helper || '()', format('public.has_perm(%L)', m.perm)), m.helper || '()', format('public.has_perm(%L)', m.perm));
      d := replace(d, 'public.public.has_perm', 'public.has_perm');
      execute d;
      n := n + 1;
    end loop;
  end loop;
  raise notice 'funciones actualizadas: %', n;
end $fn$;

-- Faltas: las ve quien tiene el panel y quien recibe el informe; cada jefe de ruta, su gente.
create or replace function public.weekend_absences(p_saturday date)
returns table (contact_id uuid, name text, photo_path text, phone text, status text, group_id uuid, group_name text, last_attended date, weeks_missed integer, last_visit timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.photo_path, c.phone, c.status, c.group_id, g.name,
         la.d,
         case when la.d is null then 3 else least(3, greatest(1, ((p_saturday - la.d) / 7)::int + (case when la.d < p_saturday then 0 else 1 end))) end,
         (select max(v.visited_at) from public.contact_visits v where v.contact_id = c.id)
  from public.contacts c
  left join public.groups g on g.id = c.group_id
  left join lateral (select max(a.attended_on) d from public.attendances a where a.contact_id = c.id and a.attended_on < p_saturday) la on true
  where c.church_id = public.current_church_id() and not c.archived
    and (
      ((public.has_perm('inf.panel') or auth.uid() = any(coalesce((select absence_recipients from public.churches where id = public.current_church_id()), '{}'::uuid[])))
        and c.status in ('member', 'visitor'))
      or (public.current_role_name()::text = 'captain' and c.group_id = public.current_group_id())
    )
    and (c.status = 'member' or exists (select 1 from public.attendances a where a.contact_id = c.id))
    and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (p_saturday, p_saturday + 1))
  order by 9 desc, g.name nulls first, c.name
$$;

-- Pedidos de oración "solo para el pastor": también el pastor asistente y el administrador.
create or replace function public.can_see_prayer(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.prayer_requests p where p.id = p_id and p.church_id = public.current_church_id()
    and (p.user_id = auth.uid() or p.visibility = 'church'
         or (p.visibility = 'pastor' and public.current_role_name()::text in ('admin', 'app_admin', 'assistant_pastor'))
         or (p.visibility = 'people' and auth.uid() = any(p.people))))
$$;

-- Roles: solo quien da permisos; al pastor y al administrador los toca solo otro pastor o administrador.
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
  update public.profiles set role = p_role, group_id = p_group where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_member_role', p_user::text, jsonb_build_object('role', p_role, 'group', p_group));
end $$;

create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('lamies.bypass_guard', true) = 'on' then return new; end if;
  if new.id <> old.id then raise exception 'No se puede cambiar el id'; end if;
  if (new.group_id is distinct from old.group_id or new.takes_attendance is distinct from old.takes_attendance)
     and not public.has_perm('personas.editar') then
    raise exception 'No tenés permiso para cambiar la ruta o la asistencia de alguien';
  end if;
  if (new.role is distinct from old.role or new.church_id is distinct from old.church_id
      or new.disabled_at is distinct from old.disabled_at or new.finance_role is distinct from old.finance_role)
     and not public.has_perm('admin.permisos') then
    raise exception 'Solo el pastor o el administrador de la app cambian roles';
  end if;
  if public.is_top_role(old.id) and old.id <> auth.uid() and not public.is_top_role(auth.uid())
     and (new.role is distinct from old.role or new.disabled_at is distinct from old.disabled_at or new.finance_role is distinct from old.finance_role) then
    raise exception 'Al pastor o al administrador de la app solo los cambia otro pastor o administrador';
  end if;
  if new.church_id is distinct from old.church_id then raise exception 'No se puede cambiar la iglesia'; end if;
  if new.is_network_admin is distinct from old.is_network_admin then
    raise exception 'El administrador de la red se asigna desde la base de datos';
  end if;
  return new;
end $$;

create or replace function public.set_finance_role(p_profile uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('fin.roles') or public.has_perm('admin.permisos')) then raise exception 'Solo el pastor o el administrador de la app'; end if;
  if p_role is not null and p_role not in ('treasurer', 'secretary', 'viewer', 'none') then raise exception 'Rol inválido'; end if;
  if public.is_top_role(p_profile) and not public.is_top_role(auth.uid()) then
    raise exception 'Al pastor o al administrador de la app solo los cambia otro pastor o administrador';
  end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set finance_role = p_role where id = p_profile and church_id = public.current_church_id();
  perform set_config('lamies.bypass_guard', 'off', true);
  if not found then raise exception 'No existe esa persona en la iglesia'; end if;
end $$;

-- El rol "administrador de finanzas" desaparece: pasa a Tesorero con permiso de dar roles de finanzas.
insert into public.profile_permissions (profile_id, perm, granted)
  select id, 'fin.roles', true from public.profiles where finance_role = 'manager'
  on conflict do nothing;
update public.profiles set finance_role = 'treasurer' where finance_role = 'manager';

do $g$ declare f text; begin
  foreach f in array array['has_perm(text)', 'my_permissions()', 'set_permission(uuid,text,text)', 'church_permissions()', 'finance_level_of(uuid)', 'is_top_role(uuid)', 'all_perms()', 'role_perms(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  revoke all on function public.perms_of(uuid) from public, anon, authenticated;
  grant execute on function public.perms_of(uuid) to service_role;
end $g$;
