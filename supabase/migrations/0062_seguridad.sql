-- Arreglos de la revisión de seguridad (noviembre 2026).
-- Nada de esto cambia lo que ve la secretaría o el pastor; cierra lo que un miembro común
-- (o cualquiera que consiga el código de la iglesia) podía leer de más.

-- 1) Teléfono, domicilio y aviso del teléfono de los demás: ya no se leen directo de la tabla.
--    Los líderes los siguen viendo por profiles_private(); cada uno ve los suyos.
revoke select (phone, home_address, home_lat, home_lng, push_token) on public.profiles from authenticated, anon;

-- 2) El código de la iglesia sale de la tabla que leen todos los miembros.
create table if not exists public.church_join_codes (
  church_id uuid primary key references public.churches(id) on delete cascade,
  code text not null unique,
  updated_at timestamptz not null default now()
);
alter table public.church_join_codes enable row level security;
revoke all on table public.church_join_codes from anon, authenticated, public;
insert into public.church_join_codes (church_id, code)
  select id, join_code from public.churches where join_code is not null
  on conflict (church_id) do nothing;
alter table public.churches alter column join_code drop not null;
update public.churches set join_code = null where join_code is not null;

-- Solo quien administra la iglesia ve el código.
create or replace function public.church_join_code()
returns text language sql stable security definer set search_path to 'public' as $$
  select c.code from public.church_join_codes c
  where c.church_id = public.current_church_id() and public.has_perm('admin.iglesia')
$$;
revoke all on function public.church_join_code() from public, anon;
grant execute on function public.church_join_code() to authenticated;

create or replace function public.rotate_join_code()
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_code text;
begin
  if not public.has_perm('admin.iglesia') then raise exception 'Solo administradores'; end if;
  -- 10 letras y números al azar, sin los que se confunden (0/O, 1/I/L).
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '')
    into v_code from (select extensions.gen_random_bytes(10) b) r, generate_series(0, 9) i;
  insert into public.church_join_codes (church_id, code) values (public.current_church_id(), v_code)
    on conflict (church_id) do update set code = excluded.code, updated_at = now();
  insert into public.audit_log (church_id, actor_id, action) values (public.current_church_id(), auth.uid(), 'rotate_join_code');
  return v_code;
end $$;

do $$
declare v_def text; v_new text;
begin
  -- Entrar con el código: se busca en la tabla nueva.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'join_church' and p.pronargs = 2;
  v_new := replace(v_def, $a$select * into v_church from public.churches where upper(join_code) = upper(trim(p_code));$a$,
    $a$select ch.* into v_church from public.churches ch join public.church_join_codes k on k.church_id = ch.id where upper(k.code) = upper(trim(p_code));$a$);
  if v_new = v_def then raise exception 'join_church(2): no se encontró el texto a cambiar'; end if;
  execute v_new;

  -- 3) Una cuenta nueva ya no queda unida sola a una ficha por escribir su teléfono.
  --    Se le avisa a la secretaría y al pastor, que la unen si es la misma persona.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'join_church' and p.pronargs = 3;
  v_new := replace(v_def, $a$      update public.contacts set profile_id = v_profile.id where id = v_match;
$a$, '');
  if v_new = v_def then raise exception 'join_church(3): no se encontró la unión automática'; end if;
  v_def := v_new;
  v_new := replace(v_def, $a$'link', 'Cuenta vinculada por teléfono',$a$, $a$'link', 'Cuenta nueva con el teléfono de una ficha',$a$);
  v_new := replace(v_new, $a$' creó su cuenta y quedó unida a la ficha de '$a$, $a$' creó su cuenta con el mismo teléfono que la ficha de '$a$);
  v_new := replace(v_new, $a$'. Revisá que sea la misma persona.',$a$, $a$'. Si es la misma persona, abrí la ficha y unile la cuenta.',$a$);
  if v_new = v_def then raise exception 'join_church(3): no se encontró el aviso'; end if;
  v_def := v_new;
  -- Después del aviso sigue de largo y crea la ficha propia, como cualquier cuenta nueva.
  v_new := replace(v_def, $a$and p.id <> v_profile.id;
      return v_profile;
    end if;$a$, $a$and p.id <> v_profile.id;
    end if;$a$);
  if v_new = v_def then raise exception 'join_church(3): no se encontró el final de la unión'; end if;
  execute v_new;

  -- 4) El informe semanal: un usuario solo ve el de su iglesia, y solo si es secretaría o pastor.
  --    Las tareas automáticas (sin usuario) siguen pudiendo pedir el de cualquier iglesia.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'weekly_report';
  v_new := replace(v_def, $a$if p_church is null and not public.is_staff() then raise exception 'Solo la secretaría o el pastor'; end if;$a$,
    $a$if auth.uid() is not null and (not public.is_staff() or (p_church is not null and p_church is distinct from public.current_church_id())) then raise exception 'Solo la secretaría o el pastor'; end if;
  if auth.uid() is null and p_church is null then raise exception 'Solo la secretaría o el pastor'; end if;$a$);
  if v_new = v_def then raise exception 'weekly_report: no se encontró el control'; end if;
  execute v_new;
end $$;

-- 5) Asistencia: la ve quien la toma, los líderes, y cada uno la de las fichas que ya puede ver.
drop policy if exists attendances_select on public.attendances;
create policy attendances_select on public.attendances for select to authenticated
  using (church_id = public.current_church_id() and (
    public.can_take_attendance() or public.is_captain_or_admin() or public.has_perm('personas.ver_todas')
    or exists (select 1 from public.contacts c where c.id = attendances.contact_id and public.can_see_contact_private(c))));

drop policy if exists outing_attendance_select on public.outing_attendance;
create policy outing_attendance_select on public.outing_attendance for select to authenticated
  using (church_id = public.current_church_id() and (
    public.can_take_attendance() or public.is_captain_or_admin()
    or exists (select 1 from public.contacts c where c.id = outing_attendance.contact_id and public.can_see_contact_private(c))));

-- A quién se le escribió por faltar: solo quienes ven la lista de los que faltaron.
create or replace function public.sees_absences()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_perm('inf.panel') or public.has_perm('personas.editar') or public.i_have_role('captain')
      or auth.uid() = any(coalesce((select absence_recipients from public.churches where id = public.current_church_id()), '{}'::uuid[]))
$$;
revoke all on function public.sees_absences() from public, anon;
grant execute on function public.sees_absences() to authenticated;
drop policy if exists absence_messages_select on public.absence_messages;
create policy absence_messages_select on public.absence_messages for select to authenticated
  using (church_id = public.current_church_id() and public.sees_absences());
drop policy if exists absence_messages_insert on public.absence_messages;
create policy absence_messages_insert on public.absence_messages for insert to authenticated
  with check (church_id = public.current_church_id() and public.sees_absences()
    and exists (select 1 from public.contacts c where c.id = contact_id and c.church_id = public.current_church_id()));
drop policy if exists absence_messages_delete on public.absence_messages;
create policy absence_messages_delete on public.absence_messages for delete to authenticated
  using (church_id = public.current_church_id() and public.sees_absences());

-- 6) Archivos del chat: los abre quien los subió o quien puede leer el mensaje que los trae
--    (los de un ministerio, solo ese ministerio).
drop policy if exists lamies_chat_read on storage.objects;
create policy lamies_chat_read on storage.objects for select to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[1] = (public.current_church_id())::text and (
    coalesce(owner_id, '') = (auth.uid())::text
    or exists (select 1 from public.church_chat_messages m where m.attachment_path = objects.name)
    or exists (select 1 from public.outing_chat_messages m where m.attachment_path = objects.name)
    or exists (select 1 from public.ministry_messages m where m.attachment_path = objects.name)));

-- 7) El registro de errores: con sesión, y sin datos enormes.
create or replace function public.log_app_error(p_message text, p_stack text default null, p_info jsonb default null, p_platform text default null, p_version text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.app_errors (user_id, church_id, platform, app_version, message, stack, info)
  values (auth.uid(), (select church_id from public.profiles where id = auth.uid()), left(p_platform, 40), left(p_version, 40),
          left(coalesce(p_message, 'sin mensaje'), 2000), left(p_stack, 8000),
          case when length(p_info::text) <= 4000 then p_info end);
  delete from public.app_errors where id in (select id from public.app_errors order by created_at desc offset 2000);
end $$;

-- 8) Ninguna función se puede llamar sin iniciar sesión.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $$;
-- Las funciones que se creen de ahora en más tampoco quedan abiertas a quien no inició sesión.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;

-- 9) Permisos que la app nunca usa y no tienen por qué estar.
do $$
declare r record;
begin
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  loop
    execute format('revoke truncate, trigger, references on table %s from authenticated, anon', r.t);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated, anon;
