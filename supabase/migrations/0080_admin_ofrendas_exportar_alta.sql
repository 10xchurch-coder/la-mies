-- 0080: ofrendas por persona, "Mis ofrendas", y alta de una iglesia nueva (con invitación de pastor y primeros pasos).
-- La copia de todos los datos no necesita tablas: se lee desde la app con los permisos de quien la pide.
-- Todo es aditivo: no se cambia ni se quita nada de lo que ya existe.

-- ---------------------------------------------------------------------------
-- 1. Ajustes de la iglesia que agrega esta parte (solo se escriben con funciones).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_church_settings (
  church_id     uuid primary key references public.churches(id) on delete cascade,
  my_giving_on  boolean not null default false,          -- cada hermano ve sus propias ofrendas
  motto         text check (motto is null or length(motto) <= 200),
  setup_pending boolean not null default false,          -- iglesia nueva: faltan los primeros pasos
  setup_step    integer not null default 0,
  setup_done_at timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);
alter table public.admin_church_settings enable row level security;
revoke all on table public.admin_church_settings from anon, public, authenticated;
grant select on table public.admin_church_settings to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_church_settings' and policyname = 'admin_church_settings_select') then
    create policy admin_church_settings_select on public.admin_church_settings for select to authenticated
      using (church_id = public.current_church_id());
  end if;
end $$;

-- Prender o apagar "Mis ofrendas" (pastor, administrador de la app o tesorero).
create or replace function public.admin_set_my_giving(p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id();
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.permisos') is not true and coalesce(public.finance_level(), 0) < 3 then
    raise exception 'Solo el pastor o el tesorero';
  end if;
  insert into public.admin_church_settings (church_id, my_giving_on) values (v_church, coalesce(p_on, false))
    on conflict (church_id) do update set my_giving_on = excluded.my_giving_on, updated_at = now();
  insert into public.audit_log (church_id, actor_id, action)
    values (v_church, auth.uid(), 'admin_my_giving:' || case when coalesce(p_on, false) then 'on' else 'off' end);
  return coalesce(p_on, false);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Ofrendas por persona. No cambian el saldo de los fondos: son el registro de quién dio.
--    Solo las ve quien tiene permiso de finanzas. Nada se borra: se anula con el motivo.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_giving (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  person_name text not null default '',                  -- el nombre queda guardado aunque se quite la ficha
  fund_id     uuid not null references public.fin_funds(id),
  on_date     date not null,
  amount      numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  currency    text not null default 'ARS',
  method      text not null default 'cash' check (method in ('cash', 'transfer', 'card', 'check', 'other')),
  note        text check (note is null or length(note) <= 300),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   uuid references public.profiles(id) on delete set null,
  void_reason text
);
create index if not exists admin_giving_person_idx on public.admin_giving (church_id, contact_id, on_date desc);
create index if not exists admin_giving_date_idx on public.admin_giving (church_id, on_date desc);

create or replace function public.admin_giving_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare f record; c record;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.church_id := public.current_church_id();
      new.created_by := auth.uid();
    end if;
    if new.church_id is null then raise exception 'La persona no pertenece a ninguna iglesia'; end if;
    if new.contact_id is null then raise exception 'Elegí a la persona'; end if;
    new.voided_at := null; new.voided_by := null; new.void_reason := null;
  else
    new.church_id := old.church_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
    if old.voided_at is not null and new.voided_at is null then raise exception 'Una ofrenda anulada no se puede reactivar; cargala de nuevo'; end if;
    if new.voided_at is not null and old.voided_at is null then
      if coalesce(btrim(new.void_reason), '') = '' then raise exception 'Poné el motivo de la anulación'; end if;
      new.voided_at := now();
      new.voided_by := auth.uid();
    end if;
  end if;
  select id, church_id, currency into f from public.fin_funds where id = new.fund_id;
  if f.id is null or f.church_id <> new.church_id then raise exception 'Fondo inválido'; end if;
  new.currency := f.currency;
  if new.contact_id is not null and (tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id) then
    select id, church_id, name into c from public.contacts where id = new.contact_id;
    if c.id is null or c.church_id <> new.church_id then raise exception 'Esa persona no es de tu iglesia'; end if;
    new.person_name := c.name;
  end if;
  if tg_op = 'UPDATE' and new.contact_id is null then new.person_name := old.person_name; end if;
  return new;
end $$;
revoke all on function public.admin_giving_guard() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'admin_giving_guard' and tgrelid = 'public.admin_giving'::regclass) then
    create trigger admin_giving_guard before insert or update on public.admin_giving
      for each row execute function public.admin_giving_guard();
  end if;
end $$;

-- Queda anotado quién cargó, cambió o anuló (sin el monto, para que el historial general no muestre plata).
create or replace function public.admin_giving_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (church_id, actor_id, action, target)
  values (new.church_id, auth.uid(),
          'admin_giving:' || case when tg_op = 'INSERT' then 'create' when new.voided_at is not null and old.voided_at is null then 'void' else 'edit' end,
          new.id::text);
  return null;
end $$;
revoke all on function public.admin_giving_audit() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'admin_giving_audit' and tgrelid = 'public.admin_giving'::regclass) then
    create trigger admin_giving_audit after insert or update on public.admin_giving
      for each row execute function public.admin_giving_audit();
  end if;
end $$;

alter table public.admin_giving enable row level security;
revoke all on table public.admin_giving from anon, public, authenticated;
grant select, insert, update on table public.admin_giving to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_giving' and policyname = 'admin_giving_read') then
    create policy admin_giving_read on public.admin_giving for select to authenticated
      using (church_id = public.current_church_id() and public.finance_level() >= 1);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_giving' and policyname = 'admin_giving_insert') then
    create policy admin_giving_insert on public.admin_giving for insert to authenticated
      with check (church_id = public.current_church_id() and public.finance_level() >= 2 and voided_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_giving' and policyname = 'admin_giving_update') then
    create policy admin_giving_update on public.admin_giving for update to authenticated
      using (church_id = public.current_church_id() and (public.finance_level() >= 3
             or (public.finance_level() = 2 and created_by = auth.uid() and created_at > now() - interval '7 days')))
      with check (church_id = public.current_church_id() and public.finance_level() >= 2);
  end if;
end $$;
-- Sin permiso para quitar filas: se anulan.

-- Buscar a una persona para cargarle una ofrenda (quien carga finanzas no siempre ve todas las fichas).
create or replace function public.admin_giving_people(p_q text default null)
returns table (id uuid, name text, status text)
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_q text := btrim(coalesce(p_q, ''));
begin
  if v_church is null or coalesce(public.finance_level(), 0) < 1 then raise exception 'No tenés permiso de finanzas'; end if;
  return query
    select c.id, c.name, c.status
    from public.contacts c
    where c.church_id = v_church and c.merged_into is null
      and (v_q = '' or c.name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
    order by (c.status = 'member') desc, c.name
    limit 40;
end $$;

-- Mis ofrendas: cada uno ve solo lo suyo, y solo si la iglesia lo prendió.
create or replace function public.admin_my_giving(p_year integer default null)
returns table (id uuid, on_date date, amount numeric, currency text, method text, fund text, note text)
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id();
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if (select s.my_giving_on from public.admin_church_settings s where s.church_id = v_church) is not true then
    raise exception 'Tu iglesia no tiene prendido "Mis ofrendas"';
  end if;
  return query
    select g.id, g.on_date, g.amount, g.currency, g.method, f.name, g.note
    from public.admin_giving g
    join public.fin_funds f on f.id = g.fund_id
    join public.contacts c on c.id = g.contact_id
    where g.church_id = v_church and c.church_id = v_church and c.profile_id = auth.uid() and g.voided_at is null
      and (p_year is null or extract(year from g.on_date)::integer = p_year)
    order by g.on_date desc, g.created_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Alta de una iglesia nueva. Solo el administrador de la red crea iglesias e invita pastores.
-- ---------------------------------------------------------------------------
create or replace function public.admin_is_net() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_network_admin and p.disabled_at is null from public.profiles p where p.id = auth.uid()), false)
$$;

-- Invitaciones de pastor: sirven una sola vez y vencen. Se guarda la huella del código, no el código.
create table if not exists public.admin_pastor_invites (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz
);
create index if not exists admin_pastor_invites_church_idx on public.admin_pastor_invites (church_id, created_at desc);
alter table public.admin_pastor_invites enable row level security;
revoke all on table public.admin_pastor_invites from anon, public, authenticated;
-- Sin políticas: nadie la lee ni la escribe directo, solo las funciones de abajo.

create or replace function public.admin_random_code(p_len integer) returns text
language sql volatile security definer set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '')
  from (select extensions.gen_random_bytes(p_len) b) r, generate_series(0, p_len - 1) i
$$;
revoke all on function public.admin_random_code(integer) from public, anon, authenticated;

create or replace function public.admin_token_hash(p_token text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(upper(btrim(coalesce(p_token, ''))), 'UTF8')), 'hex')
$$;
revoke all on function public.admin_token_hash(text) from public, anon, authenticated;

-- Crear una iglesia nueva con su primer código para los miembros.
create or replace function public.admin_create_church(p_name text, p_city text, p_timezone text, p_join_code text default null, p_country text default 'AR')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_tz   text := btrim(coalesce(p_timezone, ''));
  v_code text := upper(btrim(coalesce(p_join_code, '')));
  v_country text := upper(btrim(coalesce(p_country, 'AR')));
  v_id   uuid;
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.admin_is_net() is not true then raise exception 'Solo el administrador de la red crea iglesias'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Escribí el nombre de la iglesia'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'Zona horaria desconocida'; end if;
  if v_country !~ '^[A-Z]{2}$' then raise exception 'País inválido (dos letras, por ejemplo AR)'; end if;
  if v_code = '' then
    v_code := public.admin_random_code(10);
  elsif v_code !~ '^[A-Z0-9][A-Z0-9-]{5,23}$' or v_code like 'PASTOR-%' then
    raise exception 'El código tiene que tener de 6 a 24 letras o números (puede llevar guiones) y no empezar con PASTOR-';
  end if;
  if exists (select 1 from public.church_join_codes k where upper(k.code) = v_code) then
    raise exception 'Ese código ya lo usa otra iglesia. Elegí otro.';
  end if;

  insert into public.churches (name, city, country, timezone)
    values (v_name, nullif(btrim(coalesce(p_city, '')), ''), v_country, v_tz)
    returning id into v_id;
  perform public.ensure_default_services(v_id);
  perform public.fin_ensure_defaults(v_id);
  insert into public.church_join_codes (church_id, code) values (v_id, v_code);
  insert into public.admin_church_settings (church_id, setup_pending, created_by) values (v_id, true, auth.uid());
  insert into public.audit_log (church_id, actor_id, action, target, details)
    values (v_id, auth.uid(), 'admin_create_church', v_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('church_id', v_id, 'join_code', v_code);
end $$;

-- Crear la invitación del pastor. Devuelve el código una sola vez. Las invitaciones anteriores sin usar quedan anuladas.
create or replace function public.admin_create_pastor_invite(p_church uuid, p_days integer default 14) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text; v_days integer := least(greatest(coalesce(p_days, 14), 1), 60);
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.admin_is_net() is not true then raise exception 'Solo el administrador de la red invita pastores'; end if;
  if not exists (select 1 from public.churches where id = p_church) then raise exception 'Esa iglesia no existe'; end if;
  update public.admin_pastor_invites set revoked_at = now()
    where church_id = p_church and used_at is null and revoked_at is null;
  v_token := 'PASTOR-' || public.admin_random_code(12);
  insert into public.admin_pastor_invites (church_id, token_hash, created_by, expires_at)
    values (p_church, public.admin_token_hash(v_token), auth.uid(), now() + make_interval(days => v_days));
  insert into public.audit_log (church_id, actor_id, action, target)
    values (p_church, auth.uid(), 'admin_create_pastor_invite', p_church::text);
  return v_token;
end $$;

-- Anular las invitaciones sin usar de una iglesia.
create or replace function public.admin_revoke_pastor_invites(p_church uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.admin_is_net() is not true then raise exception 'Solo el administrador de la red'; end if;
  update public.admin_pastor_invites set revoked_at = now()
    where church_id = p_church and used_at is null and revoked_at is null;
  get diagnostics v_n = row_count;
  insert into public.audit_log (church_id, actor_id, action, target)
    values (p_church, auth.uid(), 'admin_revoke_pastor_invites', p_church::text);
  return v_n;
end $$;

-- Las iglesias de la red (para el administrador de la red). Sin datos de personas: solo cantidades.
create or replace function public.admin_network_churches()
returns table (id uuid, name text, city text, timezone text, created_at timestamptz, accounts integer, pastors integer,
               setup_pending boolean, join_code text, invite_expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.admin_is_net() is not true then raise exception 'Solo el administrador de la red'; end if;
  return query
    select c.id, c.name, c.city, c.timezone, c.created_at,
           (select count(*)::integer from public.profiles p where p.church_id = c.id),
           (select count(*)::integer from public.profiles p where p.church_id = c.id and p.role::text = 'admin'),
           coalesce(s.setup_pending, false),
           -- El código de los miembros solo se muestra mientras la iglesia todavía no tiene pastor.
           case when not exists (select 1 from public.profiles p where p.church_id = c.id and p.role::text = 'admin')
                then (select k.code from public.church_join_codes k where k.church_id = c.id) end,
           (select max(i.expires_at) from public.admin_pastor_invites i
             where i.church_id = c.id and i.used_at is null and i.revoked_at is null and i.expires_at > now())
    from public.churches c
    left join public.admin_church_settings s on s.church_id = c.id
    order by c.created_at desc;
end $$;

-- Usar la invitación: la persona queda como pastor de esa iglesia. Sirve una sola vez.
create or replace function public.admin_accept_pastor_invite(p_token text, p_display_name text, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.admin_pastor_invites;
  v_profile public.profiles;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  if length(v_name) < 2 then raise exception 'Falta el nombre'; end if;
  if length(v_digits) < 8 then raise exception 'Escribí tu número de celular completo (con código de área).'; end if;

  select * into v_inv from public.admin_pastor_invites
    where token_hash = public.admin_token_hash(p_token) for update;
  if v_inv.id is null or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'La invitación no sirve: está mal escrita, venció o ya se usó. Pedí una nueva.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is not null and v_profile.disabled_at is not null then
    raise exception 'Esta cuenta está desactivada';
  end if;
  if v_profile.id is not null and v_profile.church_id is not null and v_profile.church_id <> v_inv.church_id then
    raise exception 'Ya pertenecés a otra iglesia. La invitación es para una cuenta nueva.';
  end if;

  update public.admin_pastor_invites set used_at = now(), used_by = null
    where id = v_inv.id and used_at is null and revoked_at is null;
  if not found then raise exception 'La invitación ya se usó. Pedí una nueva.'; end if;

  perform set_config('lamies.bypass_guard', 'on', true);
  insert into public.profiles (id, church_id, display_name, phone, role)
    values (v_uid, v_inv.church_id, v_name, nullif(btrim(coalesce(p_phone, '')), ''), 'admin')
  on conflict (id) do update
    set church_id = excluded.church_id, display_name = excluded.display_name, phone = excluded.phone, role = 'admin'
  returning * into v_profile;
  update public.admin_pastor_invites set used_by = v_uid where id = v_inv.id;

  if not exists (select 1 from public.contacts where profile_id = v_uid) then
    insert into public.contacts (church_id, created_by, name, phone, status, member_since, profile_id, auto_created, interest, share_mode)
      values (v_inv.church_id, v_uid, v_name, nullif(btrim(coalesce(p_phone, '')), ''), 'member', current_date, v_uid, true, 'very', 'group');
  end if;
  perform set_config('lamies.bypass_guard', 'off', true);

  insert into public.audit_log (church_id, actor_id, action, target)
    values (v_inv.church_id, v_uid, 'admin_accept_pastor_invite', v_uid::text);
  return v_profile;
end $$;

-- Primeros pasos de la iglesia nueva: guardar por dónde va, el lema y cuándo terminó.
create or replace function public.admin_setup_save(p_step integer default null, p_done boolean default false, p_motto text default null)
returns public.admin_church_settings
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_row public.admin_church_settings;
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.iglesia') is not true then raise exception 'Solo el pastor o el administrador de la app'; end if;
  if p_motto is not null and length(btrim(p_motto)) > 200 then raise exception 'El lema es muy largo (hasta 200 letras)'; end if;
  insert into public.admin_church_settings (church_id, setup_step, motto, setup_pending, setup_done_at)
    values (v_church, greatest(coalesce(p_step, 0), 0), nullif(btrim(coalesce(p_motto, '')), ''), false,
            case when coalesce(p_done, false) then now() end)
  on conflict (church_id) do update set
    setup_step = coalesce(p_step, public.admin_church_settings.setup_step),
    motto = case when p_motto is null then public.admin_church_settings.motto else nullif(btrim(p_motto), '') end,
    setup_pending = case when coalesce(p_done, false) then false else public.admin_church_settings.setup_pending end,
    setup_done_at = case when coalesce(p_done, false) then coalesce(public.admin_church_settings.setup_done_at, now()) else public.admin_church_settings.setup_done_at end,
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

-- Queda anotado quién bajó la copia de todos los datos.
create or replace function public.admin_log_export(p_files integer default null, p_rows integer default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_church_id() is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.permisos') is not true then raise exception 'Solo el pastor o el administrador de la app'; end if;
  insert into public.audit_log (church_id, actor_id, action, details)
    values (public.current_church_id(), auth.uid(), 'admin_export_all', jsonb_build_object('files', p_files, 'rows', p_rows));
end $$;

-- Permisos de las funciones: nada para quien no entró.
do $g$ declare f text; begin
  foreach f in array array[
    'admin_set_my_giving(boolean)', 'admin_giving_people(text)', 'admin_my_giving(integer)', 'admin_is_net()',
    'admin_create_church(text,text,text,text,text)', 'admin_create_pastor_invite(uuid,integer)', 'admin_revoke_pastor_invites(uuid)',
    'admin_network_churches()', 'admin_accept_pastor_invite(text,text,text)', 'admin_setup_save(integer,boolean,text)',
    'admin_log_export(integer,integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
