-- 0084: una iglesia nueva se anota sola desde la web (/empezar), sigue una lista de primeros pasos,
-- importa a su gente con ayuda, y el equipo de La Mies ve las iglesias nuevas y las puede revisar o suspender.
-- Todo es aditivo: tablas nuevas, funciones nuevas y UNA columna nueva (contacts.import_batch, vacía para todo lo que ya existe).
-- No se cambia ninguna función ni política que ya estaba. La iglesia que ya usa la app no tiene filas en estas tablas.

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------
-- La iglesia que se anotó sola: sus datos de contacto y si el equipo ya la revisó o la suspendió.
create table if not exists public.alta_signups (
  church_id      uuid primary key references public.churches(id) on delete cascade,
  created_by     uuid not null unique references public.profiles(id) on delete cascade,  -- una iglesia por cuenta
  pastor_name    text not null,
  email          text not null,
  whatsapp       text not null,
  city           text,
  province       text,
  country        text not null default 'AR',
  size_hint      text,
  status         text not null default 'pending' check (status in ('pending', 'reviewed', 'suspended')),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  suspended_at   timestamptz,
  suspend_reason text check (suspend_reason is null or length(suspend_reason) <= 300),
  created_at     timestamptz not null default now()
);
create index if not exists alta_signups_created_idx on public.alta_signups (created_at desc);
alter table public.alta_signups enable row level security;
revoke all on table public.alta_signups from anon, public, authenticated;
-- Sin políticas: se lee y se escribe solo con las funciones de abajo.

-- La lista de primeros pasos de cada iglesia nueva (sirve también para las que creó el administrador de la red).
create table if not exists public.alta_checklist (
  church_id      uuid primary key references public.churches(id) on delete cascade,
  steps          jsonb not null default '{}'::jsonb,     -- { "iglesia": "done", "personas": "skipped", ... }
  import_help_at timestamptz,                             -- el pastor pidió que el equipo le cargue la lista
  updated_at     timestamptz not null default now()
);
alter table public.alta_checklist enable row level security;
revoke all on table public.alta_checklist from anon, public, authenticated;

-- Cada importación queda anotada, para poder revisarla o deshacerla.
create table if not exists public.alta_import_batches (
  id         uuid primary key,
  church_id  uuid not null references public.churches(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  by_network boolean not null default false,             -- la hizo el equipo de La Mies por pedido del pastor
  file_name  text check (file_name is null or length(file_name) <= 200),
  status     text not null default 'member',
  added      integer not null default 0,
  merged     integer not null default 0,
  skipped    integer not null default 0,
  invalid    integer not null default 0,
  families   jsonb not null default '{}'::jsonb,         -- nombre de familia -> familia creada en esta importación
  created_at timestamptz not null default now(),
  undo_at    timestamptz,                                -- "Deshacer esta importación": queda marcada para revisar
  undo_by    uuid references public.profiles(id) on delete set null
);
create index if not exists alta_import_batches_church_idx on public.alta_import_batches (church_id, created_at desc);
alter table public.alta_import_batches enable row level security;
revoke all on table public.alta_import_batches from anon, public, authenticated;
grant select on table public.alta_import_batches to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alta_import_batches' and policyname = 'alta_import_batches_select') then
    create policy alta_import_batches_select on public.alta_import_batches for select to authenticated
      using (church_id = public.current_church_id() and public.has_perm('personas.editar'));
  end if;
end $$;

-- La marca de la importación en cada ficha nueva. Vacía para todas las fichas que ya existen.
alter table public.contacts add column if not exists import_batch uuid;
create index if not exists contacts_import_batch_idx on public.contacts (import_batch) where import_batch is not null;

-- ---------------------------------------------------------------------------
-- 2. Ayudas internas (nadie las llama directo)
-- ---------------------------------------------------------------------------
create or replace function public.alta_key(p_text text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
$$;
revoke all on function public.alta_key(text) from public, anon, authenticated;

create or replace function public.alta_is_suspended(p_church uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.alta_signups s where s.church_id = p_church and s.status = 'suspended')
$$;
revoke all on function public.alta_is_suspended(uuid) from public, anon, authenticated;

-- Lo que la app puede saber sola de cómo va una iglesia: solo cantidades, nunca nombres.
create or replace function public.alta_facts(p_church uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'logo', (select c.logo_path is not null from public.churches c where c.id = p_church),
    'people', (select count(*) from public.contacts c where c.church_id = p_church and not c.archived and c.merged_into is null and not coalesce(c.auto_created, false)),
    'accounts', (select count(*) from public.profiles p where p.church_id = p_church),
    'leaders', greatest((select count(*) from public.profiles p where p.church_id = p_church and p.role::text <> 'member') - 1, 0),
    'services', (select count(*) from public.church_services s where s.church_id = p_church and s.active),
    'attendance', (select count(*) from (select 1 from public.attendances a where a.church_id = p_church limit 50) x),
    'features_set', exists (select 1 from public.audit_log l where l.church_id = p_church and l.action like 'set_feature:%'),
    'last_activity', (select max(l.at) from public.audit_log l where l.church_id = p_church)
  )
$$;
revoke all on function public.alta_facts(uuid) from public, anon, authenticated;

-- Código para los hermanos a partir del nombre: "Iglesia Bautista Esperanza" -> ESPERANZA-2026 (y si ya existe, con letras al azar).
create or replace function public.alta_make_code(p_name text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_word text; v_code text; v_try integer := 0;
begin
  select w into v_word
    from regexp_split_to_table(upper(regexp_replace(translate(coalesce(p_name, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9 ]', ' ', 'g')), '\s+') with ordinality as t(w, n)
    where length(w) >= 3 and w not in ('IGLESIA', 'BAUTISTA', 'EVANGELICA', 'CRISTIANA', 'DEL', 'LOS', 'LAS', 'MISION', 'TEMPLO', 'CENTRO', 'PASTOR')
    order by n desc limit 1;
  v_word := left(coalesce(v_word, 'IGLESIA'), 14);
  v_code := v_word || '-' || to_char(now(), 'YYYY');
  while exists (select 1 from public.church_join_codes k where upper(k.code) = v_code) or v_code !~ '^[A-Z0-9][A-Z0-9-]{5,23}$' loop
    v_try := v_try + 1;
    v_code := case when v_try > 5 then public.admin_random_code(10) else v_word || '-' || public.admin_random_code(4) end;
    exit when v_try > 12;
  end loop;
  return v_code;
end $$;
revoke all on function public.alta_make_code(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Anotarse: una cuenta nueva, con el correo confirmado y sin iglesia, crea UNA iglesia y queda como su pastor.
--    Mismo cuidado que admin_create_church: mientras se arma la iglesia la función queda "sin sesión",
--    porque el sello automático de church_services pondría la iglesia de quien está logueado.
-- ---------------------------------------------------------------------------
create or replace function public.alta_selfserve_create(
  p_church text, p_city text, p_province text, p_country text, p_pastor text, p_whatsapp text, p_size text, p_timezone text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := btrim(regexp_replace(coalesce(p_church, ''), '\s+', ' ', 'g'));
  v_pastor  text := btrim(regexp_replace(coalesce(p_pastor, ''), '\s+', ' ', 'g'));
  v_city    text := nullif(btrim(coalesce(p_city, '')), '');
  v_prov    text := nullif(btrim(coalesce(p_province, '')), '');
  v_country text := upper(btrim(coalesce(p_country, 'AR')));
  v_phone   text := btrim(coalesce(p_whatsapp, ''));
  v_size    text := nullif(btrim(coalesce(p_size, '')), '');
  v_tz      text := btrim(coalesce(p_timezone, ''));
  v_claims  text := current_setting('request.jwt.claims', true);
  v_sub     text := current_setting('request.jwt.claim.sub', true);
  v_email   text; v_confirmed timestamptz;
  v_profile public.profiles;
  v_id uuid; v_code text;
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or v_confirmed is null then
    raise exception 'Primero confirmá tu correo: abrí el correo que te mandamos y tocá el enlace.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is not null and v_profile.disabled_at is not null then raise exception 'Esta cuenta está desactivada'; end if;
  if v_profile.id is not null and v_profile.church_id is not null then
    raise exception 'Tu cuenta ya es de una iglesia. Para anotar otra iglesia hace falta una cuenta nueva, con otro correo.';
  end if;
  if exists (select 1 from public.alta_signups s where s.created_by = v_uid) then
    raise exception 'Con esta cuenta ya anotaste una iglesia.';
  end if;

  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Escribí el nombre de la iglesia (de 3 a 120 letras).'; end if;
  if v_name !~ '[[:alpha:]]{3}' or v_name ~* '(https?://|www\.|\.com|<|>)' then raise exception 'Revisá el nombre de la iglesia: solo el nombre, sin enlaces.'; end if;
  if length(v_pastor) < 2 or length(v_pastor) > 80 or v_pastor ~* '(https?://|www\.|<|>)' then raise exception 'Escribí tu nombre.'; end if;
  if length(coalesce(v_city, '')) > 80 or length(coalesce(v_prov, '')) > 80 then raise exception 'La ciudad o la provincia es muy larga.'; end if;
  if v_city is null then raise exception 'Escribí la ciudad.'; end if;
  if v_country !~ '^[A-Z]{2}$' then raise exception 'Elegí el país.'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 8 or length(v_phone) > 40 then raise exception 'Escribí tu número de WhatsApp completo, con el código de área.'; end if;
  if v_size is not null and v_size not in ('1-30', '31-80', '81-200', '201-500', '500+') then v_size := null; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'America/Argentina/Buenos_Aires'; end if;

  -- Freno contra abusos: de a una por vez, y un máximo de iglesias nuevas por día en toda la red.
  perform pg_advisory_xact_lock(hashtext('alta_selfserve_create'));
  if (select count(*) from public.alta_signups s where s.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Hoy se anotaron muchas iglesias. Probá de nuevo mañana o escribinos y te ayudamos.';
  end if;
  if exists (select 1 from public.alta_signups s join public.churches c on c.id = s.church_id
             where public.alta_key(c.name) = public.alta_key(v_name) and public.alta_key(s.city) = public.alta_key(v_city)
               and s.created_at > now() - interval '30 days') then
    raise exception 'Ya se anotó hace poco una iglesia con ese nombre en esa ciudad. Si es la tuya, escribinos y lo vemos juntos.';
  end if;

  v_code := public.alta_make_code(v_name);

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.churches (name, city, country, timezone) values (v_name, v_city, v_country, v_tz) returning id into v_id;
  perform public.ensure_default_services(v_id);
  perform public.fin_ensure_defaults(v_id);
  insert into public.church_join_codes (church_id, code) values (v_id, v_code);
  insert into public.admin_church_settings (church_id, setup_pending) values (v_id, true);
  insert into public.alta_checklist (church_id) values (v_id);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  if auth.uid() is distinct from v_uid then raise exception 'No se pudo volver a la sesión'; end if;

  -- La cuenta queda como pastor de SU iglesia nueva (y de ninguna otra).
  perform set_config('lamies.bypass_guard', 'on', true);
  insert into public.profiles (id, church_id, display_name, phone, role)
    values (v_uid, v_id, v_pastor, v_phone, 'admin')
  on conflict (id) do update
    set church_id = excluded.church_id, display_name = excluded.display_name, phone = excluded.phone, role = 'admin'
    where public.profiles.church_id is null
  returning * into v_profile;
  if v_profile.id is null or v_profile.church_id is distinct from v_id then raise exception 'Tu cuenta ya es de una iglesia.'; end if;
  if not exists (select 1 from public.contacts where profile_id = v_uid) then
    insert into public.contacts (church_id, created_by, name, phone, status, member_since, profile_id, auto_created, interest, share_mode)
      values (v_id, v_uid, v_pastor, v_phone, 'member', current_date, v_uid, true, 'very', 'group');
  end if;
  perform set_config('lamies.bypass_guard', 'off', true);

  update public.admin_church_settings set created_by = v_uid where church_id = v_id;
  insert into public.audit_log (church_id, actor_id, action, target, details)
    values (v_id, v_uid, 'alta_selfserve_create', v_id::text, jsonb_build_object('name', v_name, 'city', v_city, 'country', v_country));
  insert into public.alta_signups (church_id, created_by, pastor_name, email, whatsapp, city, province, country, size_hint)
    values (v_id, v_uid, v_pastor, v_email, v_phone, v_city, v_prov, v_country, v_size);

  -- Aviso al equipo de La Mies (los administradores de la red).
  perform public.notify(p.id, 'alta', 'Se anotó una iglesia nueva',
            v_name || ' (' || v_city || '). Tocá para ver sus datos y revisarla.', '/admin/red')
    from public.profiles p where p.is_network_admin and p.disabled_at is null;

  return jsonb_build_object('church_id', v_id, 'join_code', v_code);
end $$;

-- ---------------------------------------------------------------------------
-- 4. La iglesia: ¿está suspendida?, y la lista de primeros pasos
-- ---------------------------------------------------------------------------
-- Para todos los que entran: 'ok' o 'suspended'. Una iglesia que no se anotó sola siempre da 'ok'.
create or replace function public.alta_church_status() returns text
language sql stable security definer set search_path = public as $$
  select case when public.alta_is_suspended((select p.church_id from public.profiles p where p.id = auth.uid())) then 'suspended' else 'ok' end
$$;

-- Cómo va la lista de primeros pasos (pastor o administrador de la app).
create or replace function public.alta_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_c public.alta_checklist; v_s public.alta_signups;
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.iglesia') is not true then raise exception 'Solo el pastor o el administrador de la app'; end if;
  select * into v_c from public.alta_checklist where church_id = v_church;
  select * into v_s from public.alta_signups where church_id = v_church;
  return jsonb_build_object(
    'steps', coalesce(v_c.steps, '{}'::jsonb),
    'import_help_at', v_c.import_help_at,
    'selfserve', v_s.church_id is not null,
    'status', coalesce(v_s.status, 'ok'),
    'facts', public.alta_facts(v_church));
end $$;

-- Marcar un paso: 'done' (hecho), 'skipped' (lo salteo) o 'todo' (falta).
create or replace function public.alta_step_set(p_key text, p_state text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_steps jsonb;
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.iglesia') is not true then raise exception 'Solo el pastor o el administrador de la app'; end if;
  if coalesce(p_key, '') !~ '^[a-z_]{2,24}$' then raise exception 'Paso desconocido'; end if;
  if coalesce(p_state, '') not in ('done', 'skipped', 'todo') then raise exception 'Estado desconocido'; end if;
  insert into public.alta_checklist (church_id, steps) values (v_church, jsonb_build_object(p_key, p_state))
  on conflict (church_id) do update
    set steps = case when (select count(*) from jsonb_object_keys(public.alta_checklist.steps)) >= 40 and not public.alta_checklist.steps ? p_key
                     then public.alta_checklist.steps else public.alta_checklist.steps || jsonb_build_object(p_key, p_state) end,
        updated_at = now()
  returning steps into v_steps;
  return v_steps;
end $$;

-- El pastor pide (o deja de pedir) que el equipo de La Mies le cargue la lista. Sin este pedido, el equipo no puede importar.
create or replace function public.alta_request_import_help(p_on boolean default true) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_at timestamptz := case when coalesce(p_on, true) then now() end; v_name text;
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.iglesia') is not true then raise exception 'Solo el pastor o el administrador de la app'; end if;
  insert into public.alta_checklist (church_id, import_help_at) values (v_church, v_at)
  on conflict (church_id) do update set import_help_at = excluded.import_help_at, updated_at = now();
  insert into public.audit_log (church_id, actor_id, action)
    values (v_church, auth.uid(), 'alta_import_help:' || case when v_at is null then 'off' else 'on' end);
  if v_at is not null then
    select c.name into v_name from public.churches c where c.id = v_church;
    perform public.notify(p.id, 'alta', 'Una iglesia pide ayuda para cargar su lista',
              v_name || ' quiere que el equipo le cargue a su gente.', '/admin/red')
      from public.profiles p where p.is_network_admin and p.disabled_at is null and p.church_id is distinct from v_church;
  end if;
  return v_at;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Para el equipo de La Mies (administrador de la red): las iglesias que se anotaron, revisar y suspender.
--    Ve los datos de contacto del pastor y cantidades. Nunca las personas, la plata ni los mensajes de la iglesia.
-- ---------------------------------------------------------------------------
create or replace function public.alta_net_signups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.admin_is_net() is not true then raise exception 'Solo el administrador de la red'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'church_id', c.id, 'name', c.name, 'city', s.city, 'province', s.province, 'country', s.country,
      'pastor_name', s.pastor_name, 'email', s.email, 'whatsapp', s.whatsapp, 'size_hint', s.size_hint,
      'status', s.status, 'created_at', s.created_at, 'reviewed_at', s.reviewed_at, 'suspended_at', s.suspended_at,
      'suspend_reason', s.suspend_reason,
      'steps', coalesce(k.steps, '{}'::jsonb), 'import_help_at', k.import_help_at,
      'setup_done', (select a.setup_done_at is not null from public.admin_church_settings a where a.church_id = c.id),
      'facts', public.alta_facts(c.id)) order by s.created_at desc)
    from public.alta_signups s
    join public.churches c on c.id = s.church_id
    left join public.alta_checklist k on k.church_id = c.id), '[]'::jsonb);
end $$;

-- Marcar "revisada", suspender o volver a dejar pendiente. Solo sirve para iglesias que se anotaron solas:
-- una iglesia que no está en alta_signups (como la que ya usa la app) no se puede suspender por acá.
create or replace function public.alta_net_set_status(p_church uuid, p_status text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.admin_is_net() is not true then raise exception 'Solo el administrador de la red'; end if;
  if coalesce(p_status, '') not in ('pending', 'reviewed', 'suspended') then raise exception 'Estado desconocido'; end if;
  if p_church = public.current_church_id() then raise exception 'No podés cambiar el estado de tu propia iglesia'; end if;
  if p_status = 'suspended' and v_reason is null then raise exception 'Escribí el motivo de la suspensión'; end if;
  if length(coalesce(v_reason, '')) > 300 then raise exception 'El motivo es muy largo'; end if;
  update public.alta_signups set
    status = p_status,
    reviewed_at = case when p_status = 'pending' then null else coalesce(reviewed_at, now()) end,
    reviewed_by = case when p_status = 'pending' then null else auth.uid() end,
    suspended_at = case when p_status = 'suspended' then now() end,
    suspend_reason = case when p_status = 'suspended' then v_reason end
  where church_id = p_church;
  if not found then raise exception 'Esa iglesia no se anotó sola: no se cambia desde acá'; end if;
  insert into public.audit_log (church_id, actor_id, action, target, details)
    values (p_church, auth.uid(), 'alta_net_status:' || p_status, p_church::text, jsonb_build_object('reason', v_reason));
  return p_status;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Importar personas (nuevo): devuelve qué pasa con CADA fila, puede unir repetidos sin pisar nada,
--    marca cada ficha nueva con la importación y deja al equipo de La Mies importar en una iglesia que lo pidió.
--    Una persona "ya está" si hay una ficha con los mismos últimos 8 números de celular, o con el mismo nombre
--    cuando la fila o la ficha no tienen celular.
-- ---------------------------------------------------------------------------
create or replace function public.alta_import(
  p_rows jsonb, p_status text default 'member', p_mode text default 'skip', p_commit boolean default false,
  p_batch uuid default null, p_church uuid default null, p_file text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_own uuid := public.current_church_id();
  v_church uuid;
  v_net boolean := false;
  v_owner uuid := v_uid;                       -- quién queda como "la cargó"
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub    text := current_setting('request.jwt.claim.sub', true);
  v_b public.alta_import_batches;
  r jsonb; v_i integer := 0;
  v_name text; v_digits text; v_key text; v_phone text;
  v_new integer := 0; v_merged integer := 0; v_dup integer := 0; v_bad integer := 0;
  v_seen_phone text[] := '{}'; v_seen_name text[] := '{}';
  v_match uuid; v_how text; v_code text;
  v_codes jsonb := '[]'::jsonb;
  v_sex text; v_marital text; v_bd date; v_bap date; v_email text; v_addr text; v_bapt boolean; v_status text;
  v_fam text; v_fam_key text; v_fam_id uuid; v_families jsonb := '{}'::jsonb; v_id uuid;
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  if p_status not in ('member', 'visitor', 'contact') then raise exception 'Estado no válido.'; end if;
  if coalesce(p_mode, 'skip') not in ('skip', 'merge') then raise exception 'Modo no válido.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Formato no válido.'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'Son demasiadas filas juntas (máximo 500 por vez).'; end if;

  if p_church is null or p_church = v_own then
    v_church := v_own;
    if v_church is null or public.has_perm('personas.editar') is not true then
      raise exception 'Solo la secretaría o el pastor pueden importar personas.';
    end if;
  else
    -- El equipo de La Mies importa en otra iglesia: solo el administrador de la red, y solo si el pastor lo pidió.
    if public.admin_is_net() is not true then raise exception 'Solo el administrador de la red puede importar en otra iglesia.'; end if;
    if not exists (select 1 from public.alta_checklist k where k.church_id = p_church and k.import_help_at > now() - interval '30 days') then
      raise exception 'El pastor de esa iglesia todavía no pidió que le carguen la lista (o lo pidió hace más de 30 días).';
    end if;
    v_church := p_church;
    v_net := true;
    select p.id into v_owner from public.profiles p
      where p.church_id = v_church and p.role::text = 'admin' and p.disabled_at is null order by p.created_at limit 1;
    if v_owner is null then raise exception 'Esa iglesia todavía no tiene pastor en la app.'; end if;
  end if;
  if public.alta_is_suspended(v_church) then raise exception 'Esta iglesia está suspendida.'; end if;

  if p_commit then
    if p_batch is null then raise exception 'Falta el número de la importación.'; end if;
    select * into v_b from public.alta_import_batches where id = p_batch for update;
    if v_b.id is null then
      insert into public.alta_import_batches (id, church_id, created_by, by_network, file_name, status)
        values (p_batch, v_church, v_uid, v_net, left(nullif(btrim(coalesce(p_file, '')), ''), 200), p_status)
        returning * into v_b;
    elsif v_b.church_id <> v_church or v_b.created_by is distinct from v_uid or v_b.undo_at is not null then
      raise exception 'Esa importación no se puede seguir.';
    end if;
    v_families := v_b.families;
  end if;

  -- En otra iglesia: "sin sesión" mientras se escriben las fichas, para que el sello automático no ponga la iglesia del que importa.
  if v_net and p_commit then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    v_name := nullif(btrim(regexp_replace(coalesce(r->>'name', ''), '\s+', ' ', 'g')), '');
    if v_name is null or length(v_name) > 120 then v_bad := v_bad + 1; v_codes := v_codes || '"bad"'::jsonb; continue; end if;
    v_phone := left(nullif(btrim(r->>'phone'), ''), 40);
    v_digits := right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 8);
    if length(v_digits) < 8 then v_digits := null; end if;
    v_key := public.alta_key(v_name);

    v_match := null; v_how := null;
    if (v_digits is not null and v_digits = any(v_seen_phone)) or (v_digits is null and v_key = any(v_seen_name)) then
      v_dup := v_dup + 1; v_codes := v_codes || '"dup_file"'::jsonb; continue;
    end if;
    if v_digits is not null then
      select c.id into v_match from public.contacts c
        where c.church_id = v_church and not c.archived and c.merged_into is null
          and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = v_digits
        order by c.created_at limit 1;
      if v_match is not null then v_how := 'dup_phone'; end if;
    end if;
    if v_match is null then
      select c.id into v_match from public.contacts c
        where c.church_id = v_church and not c.archived and c.merged_into is null
          and public.alta_key(c.name) = v_key
          and (v_digits is null or length(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) < 8)
        order by c.created_at limit 1;
      if v_match is not null then v_how := 'dup_name'; end if;
    end if;
    if v_digits is not null then v_seen_phone := v_seen_phone || v_digits; else v_seen_name := v_seen_name || v_key; end if;

    v_sex := case lower(coalesce(r->>'sex', '')) when 'm' then 'm' when 'f' then 'f' else null end;
    v_marital := case when coalesce(r->>'marital', '') in ('single', 'married', 'partner', 'widowed') then r->>'marital' else null end;
    v_bd := case when coalesce(r->>'birthdate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'birthdate')::date else null end;
    v_bap := case when coalesce(r->>'baptized_on', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'baptized_on')::date else null end;
    if v_bd is not null and (v_bd > current_date or v_bd < date '1900-01-01') then v_bd := null; end if;
    if v_bap is not null and (v_bap > current_date or v_bap < date '1900-01-01') then v_bap := null; end if;
    v_email := left(nullif(lower(btrim(r->>'email')), ''), 160);
    v_addr := left(nullif(btrim(r->>'address'), ''), 200);
    v_bapt := case when jsonb_typeof(r->'baptized') = 'boolean' then (r->>'baptized')::boolean else null end;
    v_status := case when jsonb_typeof(r->'member') = 'boolean' then case when (r->>'member')::boolean then 'member' else case when p_status = 'member' then 'visitor' else p_status end end else p_status end;

    if v_match is not null then
      if coalesce(p_mode, 'skip') = 'merge' then
        v_merged := v_merged + 1; v_codes := v_codes || to_jsonb(v_how);
        if p_commit then
          -- Unir: solo se completa lo que la ficha tenía vacío. Nunca se pisa un dato que ya estaba.
          update public.contacts c set
            phone = coalesce(nullif(btrim(c.phone), ''), v_phone),
            email = coalesce(nullif(btrim(c.email), ''), v_email),
            address = coalesce(nullif(btrim(c.address), ''), v_addr),
            birthdate = coalesce(c.birthdate, v_bd),
            baptized_on = coalesce(c.baptized_on, v_bap),
            sex = coalesce(c.sex, v_sex),
            marital = coalesce(c.marital, v_marital)
          where c.id = v_match and c.church_id = v_church;
        end if;
      else
        v_dup := v_dup + 1; v_codes := v_codes || to_jsonb(v_how);
      end if;
      continue;
    end if;

    v_new := v_new + 1; v_codes := v_codes || '"new"'::jsonb;
    if not p_commit then continue; end if;

    insert into public.contacts (church_id, created_by, name, phone, email, address, birthdate, sex, marital, status, member_since, baptized_on, baptized, interest, share_mode, import_batch)
    values (v_church, v_owner, v_name, v_phone, v_email, v_addr, v_bd, v_sex, v_marital, v_status,
            case when v_status = 'member' then current_date end, v_bap, coalesce(v_bapt, v_bap is not null, false), 'very', 'group', p_batch)
    returning id into v_id;

    -- Familia: los que traen el mismo nombre de familia en esta importación quedan juntos.
    v_fam := left(nullif(btrim(regexp_replace(coalesce(r->>'family', ''), '\s+', ' ', 'g')), ''), 80);
    if v_fam is not null then
      v_fam_key := public.alta_key(v_fam);
      v_fam_id := nullif(v_families->>v_fam_key, '')::uuid;
      if v_fam_id is null or not exists (select 1 from public.households h where h.id = v_fam_id and h.church_id = v_church) then
        insert into public.households (church_id, name, created_by) values (v_church, v_fam, v_owner) returning id into v_fam_id;
        v_families := v_families || jsonb_build_object(v_fam_key, v_fam_id);
      end if;
      insert into public.household_members (household_id, contact_id) values (v_fam_id, v_id) on conflict do nothing;
    end if;
  end loop;

  if v_net and p_commit then
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    if auth.uid() is distinct from v_uid then raise exception 'No se pudo volver a la sesión'; end if;
  end if;

  if p_commit then
    update public.alta_import_batches set added = added + v_new, merged = merged + v_merged, skipped = skipped + v_dup,
      invalid = invalid + v_bad, families = v_families where id = p_batch;
    insert into public.audit_log (church_id, actor_id, action, target, details)
      values (v_church, v_uid, case when v_net then 'alta_import_network' else 'alta_import' end, p_batch::text,
              jsonb_build_object('nuevas', v_new, 'unidas', v_merged, 'repetidas', v_dup, 'invalidas', v_bad, 'estado', p_status));
  end if;
  return jsonb_build_object('new', v_new, 'merged', v_merged, 'duplicates', v_dup, 'invalid', v_bad, 'committed', p_commit,
                            'rows', v_codes, 'batch', p_batch);
end $$;

-- "Deshacer esta importación": la deja marcada para que la secretaría o el pastor revisen y quiten esas fichas
-- con el botón de siempre. Acá no se quita nada.
create or replace function public.alta_batch_undo(p_batch uuid, p_on boolean default true) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_b public.alta_import_batches; v_mine boolean;
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  select * into v_b from public.alta_import_batches where id = p_batch for update;
  if v_b.id is null then raise exception 'No encontré esa importación'; end if;
  v_mine := v_b.church_id = public.current_church_id() and public.has_perm('personas.editar') is true;
  if not v_mine and not (public.admin_is_net() is true and v_b.by_network and v_b.created_by = auth.uid()) then
    raise exception 'Solo la secretaría o el pastor de esa iglesia (o quien hizo la importación) pueden deshacerla.';
  end if;
  update public.alta_import_batches set undo_at = case when coalesce(p_on, true) then now() end,
    undo_by = case when coalesce(p_on, true) then auth.uid() end where id = p_batch;
  insert into public.audit_log (church_id, actor_id, action, target)
    values (v_b.church_id, auth.uid(), 'alta_batch_undo:' || case when coalesce(p_on, true) then 'on' else 'off' end, p_batch::text);
  if coalesce(p_on, true) and not v_mine then
    perform public.notify(p.id, 'alta', 'Hay una importación para revisar',
              'El equipo de La Mies marcó una importación para deshacer. Entrá a revisar esas fichas.', '/admin/importacion?lote=' || p_batch::text)
      from public.profiles p where p.church_id = v_b.church_id and p.role::text in ('admin', 'secretary') and p.disabled_at is null;
  end if;
  return coalesce(p_on, true);
end $$;

-- Permisos de las funciones: nada para quien no entró.
do $g$ declare f text; begin
  foreach f in array array[
    'alta_selfserve_create(text,text,text,text,text,text,text,text)', 'alta_church_status()', 'alta_state()', 'alta_step_set(text,text)',
    'alta_request_import_help(boolean)', 'alta_net_signups()', 'alta_net_set_status(uuid,text,text)',
    'alta_import(jsonb,text,text,boolean,uuid,uuid,text)', 'alta_batch_undo(uuid,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
