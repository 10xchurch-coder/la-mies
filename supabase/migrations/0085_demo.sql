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

-- ---------------------------------------------------------------------------------------------
-- 7. Datos de ejemplo que se calculan solos (para cargar la historia y para que la demostración no envejezca)
-- ---------------------------------------------------------------------------------------------
-- El "azar" es fijo: sale de un texto (persona + fecha), así cada corrida da lo mismo y se puede repetir sin duplicar.
create or replace function public.demo_id(p_key text)
returns uuid language sql immutable as $$ select md5('lmd:' || p_key)::uuid $$;
revoke all on function public.demo_id(text) from public, anon, authenticated;

-- Número fijo entre 0 y 999 a partir de un texto.
create or replace function public.demo_h(p_key text)
returns integer language sql immutable as $$ select (('x' || left(md5('lmd:' || p_key), 7))::bit(28)::int % 1000) $$;
revoke all on function public.demo_h(text) from public, anon, authenticated;

-- Cada persona de ejemplo: qué tan seguido viene (p, de 0 a 1000), su familia (hk y hp) y desde cuándo falta.
create table if not exists public.demo_plan (
  contact_id uuid primary key,
  church_id  uuid not null references public.demo_churches(church_id),
  hk         text not null,
  p          integer not null,
  hp         integer not null,
  stop_on    date
);
alter table public.demo_plan enable row level security;
revoke all on public.demo_plan from anon, authenticated;

-- Los turnos de cada ministerio que se repiten todas las semanas (la persona va rotando).
create table if not exists public.demo_duty_tpl (
  church_id   uuid not null references public.demo_churches(church_id),
  ministry_id uuid not null,
  slot        integer not null,
  task        text not null,
  arrive_time text,
  dow         integer not null default 0,
  primary key (ministry_id, slot)
);
alter table public.demo_duty_tpl enable row level security;
revoke all on public.demo_duty_tpl from anon, authenticated;

-- Un nombre inventado (nombre + apellido de dos listas) para las visitas y contactos que se van sumando.
create or replace function public.demo_name(p_key text, p_sex text)
returns text language sql immutable as $$
  select case when p_sex = 'm'
      then (array['Héctor','Rubén','Darío','Iván','Omar','Adrián','Esteban','Germán','Mauro','Pedro'])[1 + public.demo_h(p_key || 'n') % 10]
      else (array['Nélida','Gladys','Miriam','Karina','Vanesa','Débora','Analía','Marcela','Viviana','Elsa'])[1 + public.demo_h(p_key || 'n') % 10] end
    || ' ' || (array['Sandoval','Ibarra','Escobar','Montenegro','Bustos','Leiva','Mansilla','Roldán','Toledo','Ávalos','Villagra','Zárate','Chávez','Duarte','Paredes','Méndez'])[1 + public.demo_h(p_key || 'a') % 16]
$$;
revoke all on function public.demo_name(text, text) from public, anon, authenticated;

-- Un lugar sobre una calle del pueblo inventado (las calles de ejemplo llevan city = 'Iglesia de ejemplo').
create or replace function public.demo_spot(p_key text)
returns table (road_id bigint, road text, lat double precision, lng double precision, side smallint, num integer)
language sql stable security definer set search_path = public as $$
  select r.id, r.name,
         a.lat + (b.lat - a.lat) * t.t + case when a.lat = b.lat then sd.s * 0.00013 else 0 end,
         a.lng + (b.lng - a.lng) * t.t + case when a.lat = b.lat then 0 else sd.s * 0.00016 end,
         sd.s::smallint, (sg.i + 1) * 100 + (t.t * 96)::int
  from (select * from public.roads where city = 'Iglesia de ejemplo' order by public.demo_h(p_key || id::text), id limit 1) r
  cross join lateral (select public.demo_h(p_key || 'seg') % (jsonb_array_length(r.coords) - 1) as i) sg
  cross join lateral (select (r.coords -> sg.i ->> 0)::float8 as lat, (r.coords -> sg.i ->> 1)::float8 as lng) a
  cross join lateral (select (r.coords -> (sg.i + 1) ->> 0)::float8 as lat, (r.coords -> (sg.i + 1) ->> 1)::float8 as lng) b
  cross join lateral (select (10 + public.demo_h(p_key || 't') % 80) / 100.0 as t) t
  cross join lateral (select case when public.demo_h(p_key || 's') < 500 then 1 else -1 end as s) sd
$$;
revoke all on function public.demo_spot(text) from public, anon, authenticated;

-- Llena la historia entre dos fechas: asistencia, clases, turnos, finanzas, ofrendas y salidas a evangelizar.
-- Solo agrega (y actualiza la cobertura de las calles). Se puede correr dos veces sobre las mismas fechas.
create or replace function public.demo_fill(p_church uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rec uuid; v_pastor uuid; v_member uuid; r record; v_sid uuid; v_uid uuid; v_kind text; n integer; v_out jsonb := '{}'::jsonb;
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  f1 constant uuid := public.demo_id('ff1'); f2 constant uuid := public.demo_id('ff2');
  a1 constant uuid := public.demo_id('fa1'); a2 constant uuid := public.demo_id('fa2');
begin
  if public.is_demo_church(p_church) is not true then raise exception 'No es una iglesia de ejemplo'; end if;
  if auth.uid() is not null then raise exception 'Solo el dueño de la base'; end if;
  -- Sin disparadores: no se mandan avisos ni se crean tareas solas mientras se cargan datos de ejemplo.
  perform set_config('session_replication_role', 'replica', true);
  select pastor_id, member_id into v_pastor, v_member from public.demo_churches where church_id = p_church;
  v_rec := coalesce((select id from public.profiles where church_id = p_church and role::text = 'secretary' order by created_at, id limit 1), v_pastor);

  -- Asistencia a cada reunión
  insert into public.attendances (church_id, contact_id, attended_on, service, recorded_by, created_at, service_id)
  select p_church, pl.contact_id, g.d, case when s.dow = 0 then 'sun' else 'other' end, v_rec, g.d + time '13:00', s.id
  from public.demo_plan pl
  join public.contacts c on c.id = pl.contact_id
  cross join lateral (select x::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') x) g
  join public.church_services s on s.church_id = p_church and s.active and s.dow = extract(dow from g.d)::int
  where pl.church_id = p_church and g.d >= c.created_at::date and (pl.stop_on is null or g.d <= pl.stop_on) and c.status <> 'inactive'
    and public.demo_h(pl.hk || g.d::text || s.sort_order::text) < pl.hp
        * (case extract(month from g.d)::int when 1 then 0.80 when 2 then 0.86 when 7 then 0.90 when 12 then 0.93 else 1 end)
        * (case when s.sort_order <= 10 then 1 when s.sort_order <= 20 then 0.62 else 0.42 end)
    and public.demo_h(pl.contact_id::text || g.d::text || s.sort_order::text) < pl.p
  on conflict (contact_id, attended_on, service_id) do nothing;
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('asistencias', n);

  -- Asistencia de los chicos a su clase (los que vinieron el domingo a la mañana)
  insert into public.class_attendance (church_id, class_id, on_date, contact_id, present, recorded_by, created_at)
  select p_church, cs.class_id, a.attended_on, a.contact_id, true, v_rec, a.created_at
  from public.attendances a
  join public.church_services s on s.id = a.service_id and s.sort_order <= 10
  join public.class_students cs on cs.contact_id = a.contact_id
  join public.classes k on k.id = cs.class_id and k.church_id = p_church
  where a.church_id = p_church and a.attended_on between p_from and p_to
  on conflict (class_id, on_date, contact_id) do nothing;
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('clases', n);

  -- Quién da cada clase (hasta 5 domingos para adelante)
  insert into public.class_schedule (id, church_id, class_id, on_date, teacher_id, teacher_contact_id, helper_id, helper_contact_id, material_id)
  select public.demo_id('cs' || k.id::text || g.d::text), p_church, k.id, g.d, t.profile_id, t.cid, h.profile_id, h.cid, m.id
  from public.classes k
  cross join lateral (select x::date as d, ((x::date - date '2024-01-07') / 7) as w
                      from generate_series(p_from::timestamp, (p_to + 35)::timestamp, interval '1 day') x where extract(dow from x) = 0) g
  left join lateral (select * from (select ct.profile_id, coalesce(ct.contact_id, (select id from public.contacts where profile_id = ct.profile_id)) as cid,
                                           row_number() over (order by ct.id) - 1 as rn, count(*) over () as cnt
                                    from public.class_teachers ct where ct.class_id = k.id and not ct.is_helper) z where z.rn = g.w % z.cnt) t on true
  left join lateral (select * from (select ct.profile_id, coalesce(ct.contact_id, (select id from public.contacts where profile_id = ct.profile_id)) as cid,
                                           row_number() over (order by ct.id) - 1 as rn, count(*) over () as cnt
                                    from public.class_teachers ct where ct.class_id = k.id and ct.is_helper) z where z.rn = g.w % z.cnt) h on true
  left join lateral (select * from (select mt.id, row_number() over (order by mt.chapter_order, mt.id) - 1 as rn, count(*) over () as cnt
                                    from public.materials mt where mt.class_id = k.id) z where z.rn = g.w % z.cnt) m on true
  where k.church_id = p_church and k.active
  on conflict (class_id, on_date) do nothing;

  -- Turnos de los ministerios (hasta 4 semanas para adelante)
  insert into public.duties (id, church_id, ministry_id, on_date, profile_id, contact_id, task, arrive_time, created_by, created_at)
  select public.demo_id('du' || t.ministry_id::text || t.slot::text || g.d::text), p_church, t.ministry_id, g.d, c.profile_id, z.contact_id, t.task, t.arrive_time, v_pastor, now()
  from public.demo_duty_tpl t
  cross join lateral (select x::date as d, ((x::date - date '2024-01-07') / 7) as w
                      from generate_series(p_from::timestamp, (p_to + 28)::timestamp, interval '1 day') x where extract(dow from x) = t.dow) g
  join lateral (select * from (select mp.contact_id, row_number() over (order by mp.contact_id) - 1 as rn, count(*) over () as cnt
                               from public.ministry_people mp where mp.ministry_id = t.ministry_id) q where q.rn = (g.w + t.slot) % q.cnt) z on true
  join public.contacts c on c.id = z.contact_id
  where t.church_id = p_church
  on conflict (id) do nothing;
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('turnos', n);

  -- Finanzas: la ofrenda de cada domingo (efectivo y transferencia)
  insert into public.fin_entries (id, church_id, on_date, kind, fund_id, account_id, category_id, amount, method, description, source, created_by, created_at)
  select public.demo_id('fe' || g.d::text || v.slot::text), p_church, g.d, 'income', f1, case v.slot when 1 then a1 else a2 end, public.demo_id('fc1'),
         greatest(round((nn.c * v.per * (0.75 + public.demo_h('of' || g.d::text || v.slot::text) / 2000.0))::numeric, -2), 1000),
         case v.slot when 1 then 'cash' else 'transfer' end,
         case v.slot when 1 then 'Ofrenda del domingo (efectivo)' else 'Diezmos y ofrendas por transferencia' end, 'demo', v_rec, g.d + time '14:00'
  from (select x::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') x where extract(dow from x) = 0) g
  cross join lateral (select count(*) as c from public.attendances a where a.church_id = p_church and a.attended_on = g.d) nn
  cross join (values (1, 5200), (2, 3900)) v(slot, per)
  where nn.c > 0
  on conflict (id) do nothing;
  -- … y lo de todos los meses
  insert into public.fin_entries (id, church_id, on_date, kind, fund_id, account_id, category_id, amount, method, description, counterpart, source, created_by, created_at)
  select public.demo_id('fm' || g.d::text || v.slot::text), p_church, g.d, v.kind, case when v.mis then f2 else f1 end, case when v.cash then a1 else a2 end, public.demo_id(v.cat),
         round((v.amt * (0.9 + public.demo_h('fm' || g.d::text || v.slot::text) / 5000.0))::numeric, -2), case when v.cash then 'cash' else 'transfer' end,
         v.descr, v.who, 'demo', v_rec, g.d + time '15:00'
  from (select x::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') x) g
  join (values
    (1, 5, 'expense', false, false, 'fc3', 420000, 'Alquiler del salón', 'Dueño del salón'),
    (2, 10, 'expense', false, false, 'fc4', 98000, 'Luz, agua e internet', null),
    (3, 12, 'expense', true, false, 'fc5', 150000, 'Ofrenda del mes a los misioneros', 'Misioneros'),
    (4, 18, 'expense', false, true, 'fc6', 46000, 'Materiales para las clases de los chicos', null),
    (5, 24, 'expense', false, true, 'fc7', 65000, 'Ayuda a una familia', null),
    (6, 8, 'income', true, true, 'fc2', 185000, 'Ofrenda misionera del mes', null),
    (7, 27, 'expense', false, true, 'fc8', 38000, 'Limpieza y arreglos', null)
  ) v(slot, dom, kind, mis, cash, cat, amt, descr, who) on extract(day from g.d)::int = v.dom
  on conflict (id) do nothing;
  -- Ofrendas anotadas por persona (una vez por mes), para "Ofrendas por persona" y "Mis ofrendas"
  insert into public.admin_giving (id, church_id, contact_id, person_name, fund_id, on_date, amount, method, created_by, created_at)
  select public.demo_id('ag' || pl.contact_id::text || g.d::text), p_church, c.id, c.name, f1, g.d,
         (20 + public.demo_h('ag' || pl.contact_id::text) % 100) * 1000,
         case when public.demo_h('agm' || pl.contact_id::text) < 500 then 'cash' else 'transfer' end, v_rec, g.d + time '16:00'
  from (select x::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') x where extract(day from x) = 6) g
  join public.demo_plan pl on pl.church_id = p_church and (pl.stop_on is null or pl.stop_on >= g.d)
  join public.contacts c on c.id = pl.contact_id and c.status = 'member' and c.age >= 20 and c.created_at::date <= g.d
  where public.demo_h('agy' || pl.contact_id::text) < 420 or c.profile_id = v_member
  on conflict (id) do nothing;

  -- Salidas a evangelizar de los sábados: quién salió, qué veredas se recorrieron y los contactos nuevos
  insert into public.sessions (id, church_id, user_id, started_at, ended_at, distance_m, blocks, presentations, promises, contacts, kind, manual)
  select public.demo_id('se' || g.d::text || u.n::text), p_church, u.id,
         (g.d + time '09:30') at time zone v_tz,
         (g.d + time '09:30' + make_interval(mins => 80 + public.demo_h('sm' || g.d::text || u.n::text) % 50)) at time zone v_tz,
         1800 + public.demo_h('sd' || g.d::text || u.n::text) * 3, 5 + public.demo_h('sb' || g.d::text || u.n::text) % 8,
         1 + public.demo_h('sp' || g.d::text || u.n::text) % 5, public.demo_h('sq' || g.d::text || u.n::text) % 3, 1 + public.demo_h('sc' || g.d::text) % 2,
         case when g.w % 5 = 4 then 'flyers' else 'soulwinning' end, false
  from (select x::date as d, ((x::date - date '2024-01-06') / 7) as w
        from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') x where extract(dow from x) = 6) g
  cross join lateral (select p.id, row_number() over (order by p.created_at, p.id) as n from public.profiles p
                      where p.church_id = p_church and p.role::text in ('evangelism', 'captain', 'assistant_pastor')) u
  where u.n = 1 or public.demo_h('sgo' || g.d::text || u.n::text) < 700
  on conflict (id) do nothing;
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('salidas', n);

  for r in select x::date as d, ((x::date - date '2024-01-06') / 7) as w
           from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') x where extract(dow from x) = 6 order by 1 loop
    select s.id, s.user_id, s.kind into v_sid, v_uid, v_kind from public.sessions s where s.id = public.demo_id('se' || r.d::text || '1');
    continue when v_sid is null;
    insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at, kind)
    select p_church, rd.id, sg.seg, sd.side, v_uid, v_sid, (r.d + time '10:15') at time zone v_tz, v_kind
    from public.roads rd
    cross join lateral generate_series(0, jsonb_array_length(rd.coords) - 2) sg(seg)
    cross join (values (-1), (1)) sd(side)
    where rd.city = 'Iglesia de ejemplo' and public.demo_h('zn' || rd.id::text || (sg.seg / 2)::text) % 12 = r.w % 12
    on conflict (session_id, road_id, seg, side) do nothing;
    insert into public.coverage (church_id, road_id, seg, side, last_covered_at, last_user_id, last_session_id, times, kind)
    select e.church_id, e.road_id, e.seg, e.side, e.covered_at, e.user_id, e.session_id, 1, e.kind
    from public.coverage_events e where e.session_id = v_sid
    on conflict (church_id, road_id, seg, side, kind) do update
      set last_covered_at = excluded.last_covered_at, last_user_id = excluded.last_user_id, last_session_id = excluded.last_session_id, times = public.coverage.times + 1
      where public.coverage.last_covered_at < excluded.last_covered_at;
    -- uno o dos contactos nuevos por sábado, con su primera visita
    insert into public.contacts (id, church_id, created_by, session_id, created_at, updated_at, name, age, sex, phone, lat, lng, address_hint, road_id, side,
                                 interest, promise_day, gospel_presented, status, share_mode, follow_up_user_id)
    select public.demo_id('ec' || k.key), p_church, v_uid, v_sid, (r.d + time '10:40') at time zone v_tz, (r.d + time '10:40') at time zone v_tz,
           public.demo_name(k.key, k.sex), 18 + public.demo_h(k.key || 'e') % 55, k.sex,
           case when public.demo_h(k.key || 'p') < 600 then '+54 9 1005 56-' || lpad((public.demo_h(k.key || 'pp') * 9)::text, 4, '0') end,
           sp.lat, sp.lng, sp.road || ' al ' || sp.num, sp.road_id, sp.side,
           (array['very', 'some', 'some', 'little'])[1 + public.demo_h(k.key || 'i') % 4],
           case when public.demo_h(k.key || 'd') < 280 then 'sun' end, public.demo_h(k.key || 'g') < 720, 'contact', 'group', v_uid
    from (select r.d::text || i::text as key, case when public.demo_h(r.d::text || i::text || 'x') < 480 then 'm' else 'f' end as sex
          from generate_series(1, 1 + (r.w % 2)::int) i) k
    cross join lateral public.demo_spot(k.key) sp
    on conflict (id) do nothing;
    insert into public.contact_visits (id, contact_id, church_id, user_id, session_id, visited_at, gospel_presented, promise_day)
    select public.demo_id('cv' || c.id::text), c.id, p_church, v_uid, v_sid, c.created_at, c.gospel_presented, c.promise_day
    from public.contacts c where c.session_id = v_sid and c.church_id = p_church
    on conflict (id) do nothing;
  end loop;
  -- Los que salieron, anotados también por ficha
  insert into public.outing_attendance (church_id, contact_id, went_on, recorded_by)
  select p_church, c.id, (s.started_at at time zone v_tz)::date, v_rec
  from public.sessions s join public.contacts c on c.profile_id = s.user_id
  where s.church_id = p_church and (s.started_at at time zone v_tz)::date between p_from and p_to
  on conflict (contact_id, went_on) do nothing;

  perform set_config('session_replication_role', 'origin', true);
  return v_out;
end $$;
revoke all on function public.demo_fill(uuid, date, date) from public, anon, authenticated;

-- Vuelve a poner, con fecha nueva, lo que se escribió hace unas semanas (anuncios, pedidos de oración, prédicas,
-- chat, devocionales), y corre para adelante lo que tiene que quedar a futuro (orden del culto, evento próximo).
create or replace function public.demo_echo(p_church uuid, p_today date)
returns void language plpgsql security definer set search_path = public as $$
declare v_tz constant text := 'America/Argentina/Buenos_Aires';
begin
  if public.is_demo_church(p_church) is not true then raise exception 'No es una iglesia de ejemplo'; end if;
  if auth.uid() is not null then raise exception 'Solo el dueño de la base'; end if;
  perform set_config('session_replication_role', 'replica', true);

  insert into public.announcements (id, church_id, author_id, title, body, audience, sent_to, created_at)
  select public.demo_id('an' || a.id::text), a.church_id, a.author_id, a.title, a.body, a.audience, a.sent_to, a.created_at + interval '56 days'
  from public.announcements a
  where a.church_id = p_church and (a.created_at at time zone v_tz)::date between p_today - 62 and p_today - 56
  on conflict (id) do nothing;

  insert into public.prayer_requests (id, church_id, user_id, body, visibility, people, anonymous, answered_at, answer_note, created_at)
  select public.demo_id('pr' || a.id::text), a.church_id, a.user_id, a.body, a.visibility, a.people, a.anonymous, a.answered_at + interval '56 days', a.answer_note, a.created_at + interval '56 days'
  from public.prayer_requests a
  where a.church_id = p_church and (a.created_at at time zone v_tz)::date between p_today - 62 and p_today - 56
  on conflict (id) do nothing;

  insert into public.sermons (id, church_id, title, preacher, preached_on, passage, description, summary, notes_outline, created_by, created_at)
  select public.demo_id('sr' || a.id::text), a.church_id, a.title, a.preacher, a.preached_on + 84, a.passage, a.description, a.summary, a.notes_outline, a.created_by, a.created_at + interval '84 days'
  from public.sermons a
  where a.church_id = p_church and a.preached_on between p_today - 90 and p_today - 84
  on conflict (id) do nothing;

  insert into public.church_chat_messages (id, church_id, user_id, body, created_at, kind)
  select public.demo_id('ch' || a.id::text), a.church_id, a.user_id, a.body, a.created_at + interval '28 days', a.kind
  from public.church_chat_messages a
  where a.church_id = p_church and a.kind = 'text' and (a.created_at at time zone v_tz)::date between p_today - 34 and p_today - 28
  on conflict (id) do nothing;

  insert into public.daily_content (id, church_id, on_date, reference, verse, message, devotional, background, created_by, study, prayer)
  select public.demo_id('dc' || a.id::text), a.church_id, a.on_date + 21, a.reference, a.verse, a.message, a.devotional, a.background, a.created_by, a.study, a.prayer
  from public.daily_content a
  where a.church_id = p_church and a.on_date between p_today - 27 and p_today - 14
  on conflict (church_id, on_date) do nothing;

  -- El orden del culto de los próximos dos domingos (copia del último que haya)
  insert into public.service_plans (id, church_id, service_date, title, items, people, created_by)
  select public.demo_id('sp' || g.d::text), p_church, g.d, sp.title, sp.items, sp.people, sp.created_by
  from (select x::date as d from generate_series(p_today::timestamp, (p_today + 13)::timestamp, interval '1 day') x where extract(dow from x) = 0) g
  cross join lateral (select z.* from public.service_plans z where z.church_id = p_church and z.service_date < g.d order by z.service_date desc limit 1) sp
  where not exists (select 1 from public.service_plans y where y.church_id = p_church and y.service_date = g.d)
  on conflict (id) do nothing;

  -- El evento "próximo" siempre queda a futuro: cuando pasa, se corre 6 semanas con sus inscriptos, sesiones, turnos y tareas
  update public.event_registrations x set occurs_on = x.occurs_on + 42
    from public.events e where e.id = x.event_id and e.church_id = p_church and e.source_id = 'demo:proximo' and e.starts_at < now();
  update public.event_sessions x set starts_at = x.starts_at + interval '42 days', ends_at = x.ends_at + interval '42 days'
    from public.events e where e.id = x.event_id and e.church_id = p_church and e.source_id = 'demo:proximo' and e.starts_at < now();
  update public.event_shifts x set starts_at = x.starts_at + interval '42 days', ends_at = x.ends_at + interval '42 days', reminded_at = null
    from public.events e where e.id = x.event_id and e.church_id = p_church and e.source_id = 'demo:proximo' and e.starts_at < now();
  update public.event_tasks x set due_on = x.due_on + 42
    from public.events e where e.id = x.event_id and e.church_id = p_church and e.source_id = 'demo:proximo' and e.starts_at < now();
  update public.events set starts_at = starts_at + interval '42 days', ends_at = ends_at + interval '42 days', reg_deadline = reg_deadline + 42
    where church_id = p_church and source_id = 'demo:proximo' and starts_at < now();

  -- Por las dudas: la iglesia de ejemplo nunca tiene teléfonos para avisos, páginas públicas ni código para unirse
  update public.profiles set push_token = null where church_id = p_church and push_token is not null;
  update public.events set public_page = false where church_id = p_church and public_page;
  update public.churches set join_code = null where id = p_church and join_code is not null;

  perform set_config('session_replication_role', 'origin', true);
end $$;
revoke all on function public.demo_echo(uuid, date) from public, anon, authenticated;

-- La tarea de todos los días (pg_cron "lamies-demo"): pone el candado a las tablas nuevas, agrega lo de los últimos días
-- y, una vez por semana, hace que algunos vuelvan, que otros empiecen a faltar y que llegue una visita nueva.
create or replace function public.demo_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record; v_today date; v_sun date; v_week text; v_from date; v_cap uuid; v_out jsonb := '{}'::jsonb; v_key text;
begin
  if auth.uid() is not null then raise exception 'Solo el dueño de la base'; end if;
  perform public.demo_guard_install();
  for d in select dc.church_id, dc.pastor_id, coalesce(c.timezone, 'America/Argentina/Buenos_Aires') as tz
           from public.demo_churches dc join public.churches c on c.id = dc.church_id where dc.seeded_at is not null loop
    v_today := (now() at time zone d.tz)::date;
    v_sun := v_today - case when extract(dow from v_today)::int = 0 then 7 else extract(dow from v_today)::int end;
    v_week := to_char(v_sun, 'IYYY-IW');
    if public.job_once(d.church_id, 'demo_week', v_week) then
      perform set_config('session_replication_role', 'replica', true);
      update public.demo_plan set stop_on = null where church_id = d.church_id and stop_on < v_today - 30 and public.demo_h(hk || v_week) < 650;
      update public.demo_plan set stop_on = v_sun - 1 where church_id = d.church_id and stop_on is null
        and hk in (select x.hk from (select distinct hk from public.demo_plan where church_id = d.church_id and stop_on is null and hp >= 740 and hk ~ '^\d+$' and hk::int > 14) x
                   order by public.demo_h(x.hk || v_week), x.hk limit 2);
      -- una visita nueva que vino el domingo, con su tarea de seguimiento
      v_key := 'nv' || v_week;
      select g.captain_id into v_cap from public.groups g where g.church_id = d.church_id order by public.demo_h(v_key || g.id::text) limit 1;
      insert into public.contacts (id, church_id, created_by, created_at, updated_at, name, age, sex, phone, lat, lng, address, interest, status, share_mode, follow_up_user_id, gospel_presented)
      select public.demo_id(v_key), d.church_id, d.pastor_id, v_sun + time '11:00', now(), public.demo_name(v_key, sx.s), 20 + public.demo_h(v_key || 'e') % 45, sx.s,
             '+54 9 1005 57-' || lpad((public.demo_h(v_key || 'pp') * 9)::text, 4, '0'), sp.lat, sp.lng, sp.road || ' ' || sp.num, 'very', 'visitor', 'group', v_cap, true
      from (select case when public.demo_h(v_key || 'x') < 480 then 'm' else 'f' end as s) sx cross join lateral public.demo_spot(v_key) sp
      on conflict (id) do nothing;
      insert into public.demo_plan (contact_id, church_id, hk, p, hp, stop_on)
      select public.demo_id(v_key), d.church_id, v_key, 1000, 1000, case when public.demo_h(v_key || 'q') < 500 then v_sun + 15 end
      where exists (select 1 from public.contacts where id = public.demo_id(v_key)) on conflict (contact_id) do nothing;
      insert into public.follow_up_tasks (id, church_id, contact_id, assigned_to, kind, due_at, created_at)
      select public.demo_id('ft' || v_key), d.church_id, public.demo_id(v_key), v_cap, 'call', v_sun + interval '2 days 12 hours', v_sun + time '13:00'
      where exists (select 1 from public.contacts where id = public.demo_id(v_key)) on conflict do nothing;
      update public.follow_up_tasks set done_at = due_at + interval '1 day', done_by = assigned_to
        where church_id = d.church_id and done_at is null and kind = 'call' and due_at < now() - interval '9 days' and public.demo_h(id::text) < 700;
      perform set_config('session_replication_role', 'origin', true);
    end if;
    v_from := greatest(least(coalesce((select max(attended_on) + 1 from public.attendances where church_id = d.church_id), v_today - 10), v_today - 10), v_today - 90);
    v_out := v_out || jsonb_build_object(d.church_id::text, public.demo_fill(d.church_id, v_from, v_today - 1));
    perform public.demo_echo(d.church_id, v_today);
    update public.demo_churches set refreshed_at = now() where church_id = d.church_id;
  end loop;
  return v_out;
end $$;
revoke all on function public.demo_tick() from public, anon, authenticated;

select public.demo_guard_install();

-- Todos los días a las 08:10 UTC (05:10 de Argentina).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and not exists (select 1 from cron.job where jobname = 'lamies-demo') then
    perform cron.schedule('lamies-demo', '10 8 * * *', 'select public.demo_tick()');
  end if;
end $$;
