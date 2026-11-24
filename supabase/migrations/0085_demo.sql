-- 0085 · Iglesia de ejemplo (demostración) para mostrar la app a otros pastores.
--
-- Qué hace esta migración (todo se agrega, no se borra ni se cambia ningún dato de una iglesia real):
--   1. Tabla demo_churches: marca qué iglesia es de ejemplo y guarda la llave de entrada (que no es secreta).
--   2. is_demo_church() / is_demo_user(): saber si una iglesia o la cuenta conectada son de la demostración.
--   3. Candado de solo lectura: un disparador en TODAS las tablas de public que rechaza cualquier
--      insert / update / delete hecho por una cuenta de la demostración (código de error DM001).
--      Algunas tablas "de lectura" (avisos leídos, chat leído, errores de la app…) no dan error: no guardan y listo.
--   4. Lo mismo fuera de public: cuentas (auth.users, auth.mfa_factors), archivos (storage.objects)
--      y el canal en vivo de la presentación (realtime.messages).
--   5. demo_entry(): la puerta de la página /demo. Devuelve con qué cuenta de ejemplo entrar.
--   6. La red no ve la iglesia de ejemplo: admin_network_churches y network_summary la saltean.
--   7. demo_tick(): tarea de todos los días que agrega la asistencia de la semana y mantiene cosas a futuro.
--
-- La carga de datos de ejemplo está aparte: scripts/demo-seed.mjs (ver docs/DEMO.md).

-- ---------------------------------------------------------------------------------------------
-- 1. Marca de iglesia de ejemplo
-- ---------------------------------------------------------------------------------------------
create table if not exists public.demo_churches (
  church_id    uuid primary key references public.churches(id),
  enabled      boolean not null default true,
  pastor_id    uuid,
  member_id    uuid,
  -- Contraseña de las dos cuentas de entrada. NO es un secreto: demo_entry() se la da a cualquiera que abra /demo.
  -- Las cuentas no pueden guardar nada ni cambiar su correo o contraseña, así que no sirven fuera de la demostración.
  entry_key    text,
  seeded_at    timestamptz,
  refreshed_at timestamptz,
  note         text
);
alter table public.demo_churches enable row level security;
revoke all on public.demo_churches from anon, authenticated;
-- Sin políticas: nadie la lee ni la escribe por la API; solo las funciones de abajo.

create or replace function public.is_demo_church(p_church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_church is not null and exists (select 1 from public.demo_churches d where d.church_id = p_church)
$$;

-- ¿La cuenta conectada es de la demostración? Dos señales, cualquiera alcanza:
-- su perfil está en una iglesia de ejemplo, o su sesión trae la marca lamies_demo (la pone la base, no el usuario).
create or replace function public.is_demo_user()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.profiles p join public.demo_churches d on d.church_id = p.church_id where p.id = auth.uid())
    or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'lamies_demo', '') = 'true'
  )
$$;
grant execute on function public.is_demo_church(uuid) to authenticated;
grant execute on function public.is_demo_user() to authenticated, anon;

-- Para poner al principio de una función que una cuenta de ejemplo no debe usar (exportar, etc.).
create or replace function public.demo_block()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_demo_user() then
    raise exception 'Esto es una demostración: acá no se guardan cambios.' using errcode = 'DM001';
  end if;
end $$;
grant execute on function public.demo_block() to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- 3. Candado de solo lectura en todas las tablas de public
-- ---------------------------------------------------------------------------------------------
-- Por sentencia (barato: se fija una vez por insert/update/delete, no por fila).
create or replace function public.demo_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_demo_user() then
    raise exception 'Esto es una demostración: acá no se guardan cambios.' using errcode = 'DM001';
  end if;
  return null;
end $$;

-- Por fila, para las tablas que la app escribe sola mientras uno mira (marcar leído, anotar un error…):
-- TG_ARGV[0] dice qué operaciones se saltean en silencio (I, U, D); las demás dan el mismo error DM001.
create or replace function public.demo_guard_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_demo_user() then
    if position(left(tg_op, 1) in coalesce(tg_argv[0], '')) > 0 then
      return null; -- no se guarda, y no se avisa
    end if;
    raise exception 'Esto es una demostración: acá no se guardan cambios.' using errcode = 'DM001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Segunda capa para lo que se puede escribir SIN cuenta (página pública de un evento, tarjeta de visita):
-- las filas de una iglesia de ejemplo no se escriben desde la API, las haga quien las haga.
create or replace function public.demo_guard_church_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if session_user = 'authenticator' and public.is_demo_church(new.church_id) then
    raise exception 'Esto es una demostración: acá no se guardan cambios.' using errcode = 'DM001';
  end if;
  return new;
end $$;

-- Pone el candado en todas las tablas de public que todavía no lo tienen. Se puede volver a correr
-- cuando se agregan tablas nuevas (la tarea diaria lo hace sola). Devuelve cuántas tablas tocó.
create or replace function public.demo_guard_install()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; n integer := 0; v_ops text;
  -- tabla => operaciones que se saltean en silencio
  v_quiet constant jsonb := jsonb_build_object(
    'chat_reads', 'IUD', 'notifications', 'IU', 'app_errors', 'I', 'reading_log', 'I', 'audit_log', 'I',
    'road_tiles', 'IU', 'dm_messages', 'U', 'pastor_messages', 'U', 'job_log', 'I', 'culto_reminders_sent', 'I',
    'person_chips', 'U');
begin
  for r in
    select c.oid, c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname in ('aaa_demo_guard', 'aaa_demo_guard_row'))
    order by c.relname
  loop
    v_ops := v_quiet ->> r.relname;
    if v_ops is null then
      execute format('create trigger aaa_demo_guard before insert or update or delete on public.%I for each statement execute function public.demo_guard()', r.relname);
    else
      execute format('create trigger aaa_demo_guard_row before insert or update or delete on public.%I for each row execute function public.demo_guard_row(%L)', r.relname, v_ops);
    end if;
    n := n + 1;
  end loop;
  for r in
    select c.oid, c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname in ('event_registrations', 'visit_cards', 'contacts')
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'aaa_demo_guard_church')
  loop
    execute format('create trigger aaa_demo_guard_church before insert or update on public.%I for each row execute function public.demo_guard_church_row()', r.relname);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.demo_guard_install() from public, anon, authenticated;

set local lock_timeout = '8s';
select public.demo_guard_install();

-- ---------------------------------------------------------------------------------------------
-- 4. Cuentas, archivos y canal en vivo
-- ---------------------------------------------------------------------------------------------
-- Las cuentas de ejemplo llevan la marca lamies_demo en raw_app_meta_data (solo la base puede ponerla).
-- Con esa marca, ni la cuenta ni el servidor de sesiones pueden cambiarle correo, contraseña, teléfono o datos,
-- pedir un correo de "recuperar contraseña", ni borrarla. Solo el dueño de la base (sesión postgres) puede.
-- La condición WHEN hace que para las cuentas reales la función ni siquiera se llame.
create or replace function public.demo_auth_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if session_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Esto es una demostración: esta cuenta no se puede borrar.' using errcode = 'DM001';
  end if;
  if new.email is distinct from old.email
     or new.encrypted_password is distinct from old.encrypted_password
     or new.phone is distinct from old.phone
     or new.raw_app_meta_data is distinct from old.raw_app_meta_data
     or new.raw_user_meta_data is distinct from old.raw_user_meta_data
     or new.banned_until is distinct from old.banned_until
     or new.deleted_at is distinct from old.deleted_at
     or new.email_confirmed_at is distinct from old.email_confirmed_at
     or coalesce(new.recovery_token, '') is distinct from coalesce(old.recovery_token, '')
     or coalesce(new.confirmation_token, '') is distinct from coalesce(old.confirmation_token, '')
     or coalesce(new.email_change, '') is distinct from coalesce(old.email_change, '')
     or coalesce(new.email_change_token_new, '') is distinct from coalesce(old.email_change_token_new, '')
     or coalesce(new.email_change_token_current, '') is distinct from coalesce(old.email_change_token_current, '')
     or coalesce(new.reauthentication_token, '') is distinct from coalesce(old.reauthentication_token, '')
     or coalesce(new.phone_change, '') is distinct from coalesce(old.phone_change, '')
     or coalesce(new.phone_change_token, '') is distinct from coalesce(old.phone_change_token, '')
     or new.role is distinct from old.role or new.aud is distinct from old.aud
     or new.is_anonymous is distinct from old.is_anonymous then
    raise exception 'Esto es una demostración: esta cuenta no se puede cambiar.' using errcode = 'DM001';
  end if;
  return new;
end $$;
revoke all on function public.demo_auth_guard() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'lamies_demo_users_update') then
    create trigger lamies_demo_users_update before update on auth.users
      for each row when (old.raw_app_meta_data ? 'lamies_demo') execute function public.demo_auth_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'lamies_demo_users_delete') then
    create trigger lamies_demo_users_delete before delete on auth.users
      for each row when (old.raw_app_meta_data ? 'lamies_demo') execute function public.demo_auth_guard();
  end if;
end $$;

-- Verificación en dos pasos: una cuenta de ejemplo no puede activarla (dejaría afuera a todos los demás).
-- Cualquier error raro de esta función se ignora: nunca debe trabar la verificación en dos pasos de una cuenta real.
create or replace function public.demo_mfa_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_demo boolean := false;
begin
  begin
    select coalesce(u.raw_app_meta_data ? 'lamies_demo', false) into v_demo from auth.users u where u.id = new.user_id;
  exception when others then
    v_demo := false;
  end;
  if v_demo is true and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Esto es una demostración: acá no se guardan cambios.' using errcode = 'DM001';
  end if;
  return new;
end $$;
revoke all on function public.demo_mfa_guard() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.mfa_factors'::regclass and tgname = 'lamies_demo_mfa') then
    create trigger lamies_demo_mfa before insert on auth.mfa_factors
      for each row execute function public.demo_mfa_guard();
  end if;
end $$;

-- Archivos: una cuenta de ejemplo no sube, no cambia y no borra nada en ningún depósito.
-- Son políticas "restrictivas": se suman con Y a las que ya existen, no le abren nada a nadie.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lamies_demo_no_insert') then
    create policy lamies_demo_no_insert on storage.objects as restrictive for insert to authenticated with check (not public.is_demo_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lamies_demo_no_update') then
    create policy lamies_demo_no_update on storage.objects as restrictive for update to authenticated using (not public.is_demo_user()) with check (not public.is_demo_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lamies_demo_no_delete') then
    create policy lamies_demo_no_delete on storage.objects as restrictive for delete to authenticated using (not public.is_demo_user());
  end if;
  -- Presentación entre aparatos: la demostración no manda nada por el canal en vivo
  -- (si no, un visitante podría poner un texto en la pantalla de otro visitante).
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'lamies_demo_no_send') then
    create policy lamies_demo_no_send on realtime.messages as restrictive for insert to authenticated with check (not public.is_demo_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'lamies_demo_no_listen') then
    create policy lamies_demo_no_listen on realtime.messages as restrictive for select to authenticated using (not public.is_demo_user());
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5. La puerta de /demo
-- ---------------------------------------------------------------------------------------------
-- Devuelve el correo y la llave de la cuenta de ejemplo pedida ('pastor' o 'miembro'), o null si la demostración está apagada.
-- La puede llamar cualquiera sin cuenta: la llave no es un secreto (ver arriba).
create or replace function public.demo_entry(p_view text default 'pastor')
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('email', u.email, 'key', d.entry_key, 'church', c.name, 'view', case when p_view = 'miembro' then 'miembro' else 'pastor' end)
  from public.demo_churches d
  join public.churches c on c.id = d.church_id
  join auth.users u on u.id = case when p_view = 'miembro' then d.member_id else d.pastor_id end
  where d.enabled and d.entry_key is not null
  order by d.seeded_at nulls last
  limit 1
$$;
revoke all on function public.demo_entry(text) from public;
grant execute on function public.demo_entry(text) to anon, authenticated;

-- Cambia la llave de entrada de las dos cuentas (la genera al azar; no queda escrita en ningún archivo).
-- Solo el dueño de la base. Las sesiones abiertas siguen andando.
create or replace function public.demo_new_entry_key()
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare d record; v_key text;
begin
  for d in select * from public.demo_churches loop
    v_key := replace(gen_random_uuid()::text, '-', '') || 'Aa1';
    update auth.users set encrypted_password = extensions.crypt(v_key, extensions.gen_salt('bf', 10)), updated_at = now()
      where id in (d.pastor_id, d.member_id);
    update public.demo_churches set entry_key = v_key where church_id = d.church_id;
  end loop;
end $$;
revoke all on function public.demo_new_entry_key() from public, anon, authenticated;

-- Prender o apagar la demostración: select public.demo_set_enabled(false);
-- Apagada: /demo avisa que no está disponible y las cuentas de ejemplo no pueden entrar.
create or replace function public.demo_set_enabled(p_on boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.demo_churches set enabled = coalesce(p_on, false);
  update auth.users u set banned_until = case when coalesce(p_on, false) then null else 'infinity'::timestamptz end
    where u.raw_app_meta_data ? 'lamies_demo';
end $$;
revoke all on function public.demo_set_enabled(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. La red y las exportaciones
-- ---------------------------------------------------------------------------------------------
-- Se cambia la definición que esté puesta en este momento (así no se pisa el trabajo de otra migración).
do $$
declare d text; n text;
begin
  -- Lista de iglesias del administrador de la red
  if to_regprocedure('public.admin_network_churches()') is not null then
    d := pg_get_functiondef('public.admin_network_churches()'::regprocedure);
    if position('is_demo_church' in d) = 0 then
      n := regexp_replace(d, '(left join public\.admin_church_settings s on s\.church_id = c\.id)', E'\\1\n    where not public.is_demo_church(c.id)');
      if n = d then raise exception 'No pude cambiar admin_network_churches'; end if;
      execute n;
    end if;
  end if;
  -- Resumen de la red (números por iglesia)
  if to_regprocedure('public.network_summary(timestamptz, timestamptz)') is not null then
    d := pg_get_functiondef('public.network_summary(timestamptz, timestamptz)'::regprocedure);
    if position('is_demo_church' in d) = 0 then
      n := replace(d, 'where public.is_network_admin()', 'where public.is_network_admin() and not public.is_demo_church(c.id)');
      if n = d then raise exception 'No pude cambiar network_summary'; end if;
      execute n;
    end if;
  end if;
  -- Copia de seguridad y registro de exportación: una cuenta de ejemplo no exporta
  if to_regprocedure('public.export_church_backup(uuid)') is not null then
    d := pg_get_functiondef('public.export_church_backup(uuid)'::regprocedure);
    if position('demo_block' in d) = 0 then
      n := regexp_replace(d, E'\\nbegin\\n', E'\nbegin\n  perform public.demo_block();\n');
      if n = d then raise exception 'No pude cambiar export_church_backup'; end if;
      execute n;
    end if;
  end if;
  if to_regprocedure('public.admin_log_export(integer, integer)') is not null then
    d := pg_get_functiondef('public.admin_log_export(integer, integer)'::regprocedure);
    if position('demo_block' in d) = 0 then
      n := regexp_replace(d, E'\\nbegin\\n', E'\nbegin\n  perform public.demo_block();\n');
      if n = d then raise exception 'No pude cambiar admin_log_export'; end if;
      execute n;
    end if;
  end if;
end $$;
