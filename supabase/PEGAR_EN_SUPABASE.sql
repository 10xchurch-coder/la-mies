-- ============================================================================
-- La Mies · TODO EN UNO para Supabase → SQL Editor.
-- Copiá TODO este archivo, pegalo en una consulta nueva y tocá Run (una sola vez).
-- Al final aparece el código para unirse a la iglesia: anotalo.
-- ============================================================================

-- ---------- supabase/migrations/0001_schema.sql ----------
-- ============================================================================
-- La Mies · Fase 1 · Esquema de la base de datos
-- Cada tabla con datos de una iglesia lleva church_id: una iglesia nunca ve
-- los datos de otra (ver 0002_security.sql).
-- ============================================================================

create extension if not exists pgcrypto;

create type public.member_role as enum ('member', 'captain', 'admin');

-- ---------------------------------------------------------------------------
-- Iglesias y personas
-- ---------------------------------------------------------------------------
create table public.churches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  country     text not null default 'AR',
  join_code   text not null unique,              -- código que usan los hermanos para unirse
  timezone    text not null default 'America/Argentina/Buenos_Aires',
  -- Cómo se organiza la iglesia: por colectivos (rutas de bus), por grupos, o cada uno por su cuenta.
  grouping    text not null default 'groups' check (grouping in ('bus_routes', 'groups', 'none')),
  created_at  timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  name        text not null,                     -- "Colectivo 2"
  captain_id  uuid,                              -- fk se agrega más abajo
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  church_id        uuid references public.churches(id) on delete set null,
  group_id         uuid references public.groups(id) on delete set null,
  role             public.member_role not null default 'member',
  is_network_admin boolean not null default false,
  display_name     text not null,
  phone            text,
  home_lat         double precision,
  home_lng         double precision,
  home_address     text,
  share_default    text not null default 'group' check (share_default in ('group', 'me', 'ask')),
  biometric_lock   boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_church_idx on public.profiles (church_id);

alter table public.groups
  add constraint groups_captain_fk foreign key (captain_id) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Salidas (sesiones de evangelismo) y recorrido GPS
-- ---------------------------------------------------------------------------
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null references public.churches(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  distance_m     double precision not null default 0,
  blocks         integer not null default 0,
  presentations  integer not null default 0,
  promises       integer not null default 0,
  contacts       integer not null default 0,
  auto_stopped   boolean not null default false,  -- la app la cortó sola (velocidad de vehículo)
  trimmed_at     timestamptz,                     -- se recortó el final después (olvido de apagar)
  note           text
);
create index sessions_church_started_idx on public.sessions (church_id, started_at desc);
create index sessions_user_idx on public.sessions (user_id, started_at desc);

create table public.track_points (
  id           bigserial primary key,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  church_id    uuid not null references public.churches(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  recorded_at  timestamptz not null,
  lat          double precision not null,
  lng          double precision not null,
  accuracy_m   real,
  speed_mps    real,
  heading      real
);
create index track_points_session_idx on public.track_points (session_id, recorded_at);

-- Dónde está cada hermano AHORA. Solo existe mientras su salida está activa.
create table public.live_positions (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  church_id   uuid not null references public.churches(id) on delete cascade,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  heading     real,
  updated_at  timestamptz not null default now()
);
create index live_positions_church_idx on public.live_positions (church_id);

-- ---------------------------------------------------------------------------
-- Calles (importadas de OpenStreetMap) y cobertura por vereda
-- ---------------------------------------------------------------------------
create table public.roads (
  id       bigint primary key,                   -- id de la "way" de OpenStreetMap
  name     text,
  highway  text,
  city     text,
  coords   jsonb not null,                       -- [[lat, lng], [lat, lng], ...] en orden
  min_lat  double precision not null,
  min_lng  double precision not null,
  max_lat  double precision not null,
  max_lng  double precision not null
);
create index roads_bbox_idx on public.roads (min_lat, max_lat, min_lng, max_lng);

-- Una fila por (calle, tramo entre dos nodos, vereda). side: -1 izquierda, +1 derecha
-- respecto del sentido en que está dibujada la calle. La app lo traduce a norte/sur/este/oeste.
create table public.coverage (
  church_id        uuid not null references public.churches(id) on delete cascade,
  road_id          bigint not null references public.roads(id) on delete cascade,
  seg              integer not null,
  side             smallint not null check (side in (-1, 1)),
  last_covered_at  timestamptz not null,
  last_user_id     uuid references public.profiles(id) on delete set null,
  last_session_id  uuid references public.sessions(id) on delete set null,
  times            integer not null default 1,
  primary key (church_id, road_id, seg, side)
);

create table public.coverage_events (
  id          bigserial primary key,
  church_id   uuid not null references public.churches(id) on delete cascade,
  road_id     bigint not null references public.roads(id) on delete cascade,
  seg         integer not null,
  side        smallint not null check (side in (-1, 1)),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  covered_at  timestamptz not null,
  unique (session_id, road_id, seg, side)
);
create index coverage_events_lookup_idx on public.coverage_events (church_id, road_id, seg, side, covered_at desc);

-- ---------------------------------------------------------------------------
-- Contactos (las casas marcadas), su familia, visitas, asistencias
-- ---------------------------------------------------------------------------
create table public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null references public.churches(id) on delete cascade,
  created_by         uuid not null references public.profiles(id) on delete cascade,
  session_id         uuid references public.sessions(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  name               text not null,
  age                integer check (age between 0 and 120),
  sex                text check (sex in ('m', 'f')),
  marital            text check (marital in ('single', 'married', 'partner', 'widowed')),
  phone              text,
  lat                double precision not null,
  lng                double precision not null,
  address_hint       text,
  road_id            bigint references public.roads(id) on delete set null,
  side               smallint check (side in (-1, 1)),
  interest           text not null default 'some' check (interest in ('very', 'some', 'little', 'none')),
  promise_day        text check (promise_day in ('sat', 'sun')),
  pickup             boolean not null default false,
  pickup_time        text,
  gospel_presented   boolean not null default false,
  discipleship_since date,                        -- empezó discipulado
  baptized_on        date,                        -- se bautizó
  share_mode         text not null default 'group' check (share_mode in ('group', 'me', 'custom')),
  follow_up_user_id  uuid references public.profiles(id) on delete set null,
  archived           boolean not null default false
);
create index contacts_church_idx on public.contacts (church_id, created_at desc);
create index contacts_creator_idx on public.contacts (created_by);

create table public.contact_children (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  name        text not null,
  age         integer check (age between 0 and 120)
);
create index contact_children_contact_idx on public.contact_children (contact_id);

create table public.contact_shares (
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  primary key (contact_id, user_id)
);

create table public.contact_visits (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  church_id         uuid not null references public.churches(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  session_id        uuid references public.sessions(id) on delete set null,
  visited_at        timestamptz not null default now(),
  note              text,
  gospel_presented  boolean not null default false,
  promise_day       text check (promise_day in ('sat', 'sun'))
);
create index contact_visits_contact_idx on public.contact_visits (contact_id, visited_at desc);
create index contact_visits_church_time_idx on public.contact_visits (church_id, visited_at desc);

-- "Vino a la iglesia": lo marca un capitán o administrador.
create table public.attendances (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  attended_on  date not null,
  service      text not null check (service in ('sat', 'sun', 'other')),
  recorded_by  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (contact_id, attended_on, service)
);
create index attendances_church_idx on public.attendances (church_id, attended_on desc);

-- Capacitación: consejos, artículos y videos cortos. church_id vacío = para todas las iglesias.
create table public.training_items (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references public.churches(id) on delete cascade,
  category    text not null,                     -- "Al tocar la puerta", "Preguntas difíciles", ...
  title       text not null,
  kind        text not null default 'article' check (kind in ('article', 'video')),
  summary     text,
  body        text,                              -- texto del artículo (markdown simple)
  video_url   text,                              -- link del video (YouTube, Vimeo o archivo)
  minutes     integer,                           -- duración aproximada
  sort_order  integer not null default 100,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index training_items_idx on public.training_items (church_id, category, sort_order);

-- Registro de acciones administrativas (quién cambió qué).
create table public.audit_log (
  id          bigserial primary key,
  church_id   uuid references public.churches(id) on delete cascade,
  actor_id    uuid,
  action      text not null,
  target      text,
  details     jsonb,
  at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();
create trigger training_items_touch before update on public.training_items
  for each row execute function public.touch_updated_at();

-- Distancia en metros entre dos puntos (fórmula de haversine).
create or replace function public.haversine_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision
language sql immutable as $$
  select 2 * 6371000.0 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- ---------- supabase/migrations/0002_security.sql ----------
-- ============================================================================
-- La Mies · Fase 1 · Seguridad
-- Row Level Security (RLS) en TODAS las tablas. La app usa la clave "anon"
-- pública; lo que cada persona puede ver o cambiar lo decide esta capa,
-- no el código de la app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Funciones de ayuda (security definer: leen profiles sin disparar RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_church_id() returns uuid
language sql stable security definer set search_path = public as $$
  select church_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_group_id() returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role_name() returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_captain_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('captain', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_network_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_network_admin from public.profiles where id = auth.uid()), false)
$$;

-- Un contacto se ve si: lo creé, me lo asignaron para seguimiento, soy admin,
-- está compartido con todo el grupo del que lo creó y yo estoy en ese grupo,
-- o me lo compartieron a mí puntualmente.
create or replace function public.can_see_contact(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or public.is_admin()
    or (c.share_mode = 'group' and exists (
          select 1 from public.profiles p
          where p.id = c.created_by
            and p.group_id is not null
            and p.group_id = public.current_group_id()))
    or exists (select 1 from public.contact_shares s where s.contact_id = c.id and s.user_id = auth.uid())
  )
$$;

create or replace function public.can_edit_contact(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or public.is_admin()
    or (public.current_role_name() = 'captain' and exists (
          select 1 from public.profiles p
          where p.id = c.created_by and p.group_id = public.current_group_id()))
  )
$$;

-- ---------------------------------------------------------------------------
-- Guardas: nadie se cambia el rol, la iglesia o el grupo a sí mismo
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Llamadas internas (service role, SQL directo) o funciones marcadas pasan.
  if auth.uid() is null or current_setting('lamies.bypass_guard', true) = 'on' then
    return new;
  end if;
  if new.id <> old.id then
    raise exception 'No se puede cambiar el id';
  end if;
  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id
      or new.group_id is distinct from old.group_id
      or new.is_network_admin is distinct from old.is_network_admin)
     and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar rol, iglesia o grupo';
  end if;
  if new.is_network_admin is distinct from old.is_network_admin then
    raise exception 'El administrador de la red se asigna desde la base de datos';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Al crear un contacto, visita o asistencia, la iglesia y el autor se
-- completan solos con los datos de quien está logueado.
create or replace function public.stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.church_id := public.current_church_id();
    if tg_table_name = 'contacts' then new.created_by := auth.uid(); end if;
    if tg_table_name = 'contact_visits' then new.user_id := auth.uid(); end if;
    if tg_table_name = 'attendances' then new.recorded_by := auth.uid(); end if;
  end if;
  if new.church_id is null then
    raise exception 'La persona no pertenece a ninguna iglesia';
  end if;
  return new;
end $$;

create trigger contacts_stamp before insert on public.contacts
  for each row execute function public.stamp_owner();
create trigger contact_visits_stamp before insert on public.contact_visits
  for each row execute function public.stamp_owner();
create trigger attendances_stamp before insert on public.attendances
  for each row execute function public.stamp_owner();

-- Un contacto editado no puede cambiar de iglesia ni de creador.
create or replace function public.contacts_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.church_id := old.church_id;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger contacts_guard before update on public.contacts
  for each row execute function public.contacts_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.churches         enable row level security;
alter table public.groups           enable row level security;
alter table public.profiles         enable row level security;
alter table public.sessions         enable row level security;
alter table public.track_points     enable row level security;
alter table public.live_positions   enable row level security;
alter table public.roads            enable row level security;
alter table public.coverage         enable row level security;
alter table public.coverage_events  enable row level security;
alter table public.contacts         enable row level security;
alter table public.contact_children enable row level security;
alter table public.contact_shares   enable row level security;
alter table public.contact_visits   enable row level security;
alter table public.attendances      enable row level security;
alter table public.training_items   enable row level security;
alter table public.audit_log        enable row level security;

-- churches: cada uno ve solo su iglesia; el admin edita nombre/ciudad.
create policy churches_select on public.churches for select to authenticated
  using (id = public.current_church_id());
create policy churches_update on public.churches for update to authenticated
  using (id = public.current_church_id() and public.is_admin())
  with check (id = public.current_church_id() and public.is_admin());

-- groups
create policy groups_select on public.groups for select to authenticated
  using (church_id = public.current_church_id());
create policy groups_admin on public.groups for all to authenticated
  using (church_id = public.current_church_id() and public.is_admin())
  with check (church_id = public.current_church_id() and public.is_admin());

-- profiles: se ven los hermanos de la misma iglesia; cada uno edita lo suyo
-- (el trigger impide cambiar rol/iglesia/grupo); el admin edita a cualquiera.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or church_id = public.current_church_id());
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and church_id is null and role = 'member' and is_network_admin = false);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (church_id = public.current_church_id() and public.is_admin())
  with check (church_id = public.current_church_id() and public.is_admin());

-- sessions: todo el equipo ve las salidas de la iglesia (estadísticas);
-- solo el dueño o el admin las modifican. Se crean con start_session().
create policy sessions_select on public.sessions for select to authenticated
  using (church_id = public.current_church_id());
create policy sessions_update on public.sessions for update to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_admin()))
  with check (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_admin()));

-- track_points: el recorrido crudo lo ve su dueño, el admin, y el equipo
-- mientras la salida está activa (para verlo en vivo). Se cargan por función.
create policy track_points_select on public.track_points for select to authenticated
  using (
    church_id = public.current_church_id() and (
      user_id = auth.uid()
      or public.is_admin()
      or exists (select 1 from public.sessions s where s.id = session_id and s.ended_at is null)
    )
  );

-- live_positions: el equipo ve dónde está cada uno mientras sale.
create policy live_positions_select on public.live_positions for select to authenticated
  using (church_id = public.current_church_id());
create policy live_positions_own on public.live_positions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and church_id = public.current_church_id());

-- roads: datos públicos de OpenStreetMap. Solo lectura desde la app.
create policy roads_select on public.roads for select to authenticated using (true);

-- coverage: toda la iglesia la ve. Se escribe solo por upsert_coverage().
create policy coverage_select on public.coverage for select to authenticated
  using (church_id = public.current_church_id());
create policy coverage_events_select on public.coverage_events for select to authenticated
  using (church_id = public.current_church_id());

-- contacts
create policy contacts_select on public.contacts for select to authenticated
  using (public.can_see_contact(contacts));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.current_church_id() is not null);
create policy contacts_update on public.contacts for update to authenticated
  using (public.can_edit_contact(contacts)) with check (public.can_edit_contact(contacts));
create policy contacts_delete on public.contacts for delete to authenticated
  using (church_id = public.current_church_id() and (created_by = auth.uid() or public.is_admin()));

-- contact_children: siguen la visibilidad del contacto.
create policy contact_children_select on public.contact_children for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact(c)));
create policy contact_children_write on public.contact_children for all to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)));

-- contact_shares: el creador o el admin eligen con quién compartir; cada uno ve lo suyo.
create policy contact_shares_select on public.contact_shares for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)));
create policy contact_shares_write on public.contact_shares for all to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c))
              and exists (select 1 from public.profiles p where p.id = user_id and p.church_id = public.current_church_id()));

-- contact_visits
create policy contact_visits_select on public.contact_visits for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact(c)));
create policy contact_visits_insert on public.contact_visits for insert to authenticated
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact(c)));
create policy contact_visits_update on public.contact_visits for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- attendances: la ven todos los de la iglesia; la cargan capitanes y admins.
create policy attendances_select on public.attendances for select to authenticated
  using (church_id = public.current_church_id());
create policy attendances_write on public.attendances for all to authenticated
  using (church_id = public.current_church_id() and public.is_captain_or_admin())
  with check (public.is_captain_or_admin());

-- training_items: el material general lo ven todos; el de una iglesia, esa iglesia.
-- Lo carga el admin de la iglesia (lo suyo) o el admin de la red (lo general).
create policy training_select on public.training_items for select to authenticated
  using (published and (church_id is null or church_id = public.current_church_id()));
create policy training_church_admin on public.training_items for all to authenticated
  using (church_id = public.current_church_id() and public.is_admin())
  with check (church_id = public.current_church_id() and public.is_admin());
create policy training_network_admin on public.training_items for all to authenticated
  using (church_id is null and public.is_network_admin())
  with check (church_id is null and public.is_network_admin());

-- audit_log: solo el admin lee; se escribe desde funciones.
create policy audit_log_select on public.audit_log for select to authenticated
  using (church_id = public.current_church_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- Permisos de las tablas. Lo que no está acá, no se puede hacer.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated, service_role;
grant select on public.churches, public.groups, public.profiles, public.sessions,
  public.track_points, public.live_positions, public.roads, public.coverage,
  public.coverage_events, public.contacts, public.contact_children, public.contact_shares,
  public.contact_visits, public.attendances, public.training_items, public.audit_log to authenticated;
grant insert, update, delete on public.training_items to authenticated;
grant update on public.churches, public.sessions to authenticated;
grant insert, update, delete on public.groups to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.live_positions to authenticated;
grant insert, update, delete on public.contacts, public.contact_children, public.contact_shares to authenticated;
grant insert, update on public.contact_visits to authenticated;
grant insert, update, delete on public.attendances to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---------- supabase/migrations/0003_functions.sql ----------
-- ============================================================================
-- La Mies · Fase 1 · Funciones que usa la app (RPC)
-- Todas corren como "security definer" con search_path fijo y verifican por
-- su cuenta quién las llama. La app solo recibe lo que estas funciones devuelven.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Unirse a una iglesia con su código
-- ---------------------------------------------------------------------------
create or replace function public.join_church(p_code text, p_display_name text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_church public.churches;
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 then raise exception 'Falta el nombre'; end if;

  select * into v_church from public.churches where upper(join_code) = upper(trim(p_code));
  if v_church.id is null then raise exception 'Código de iglesia incorrecto'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is not null and v_profile.church_id is not null and v_profile.church_id <> v_church.id then
    raise exception 'Ya pertenecés a otra iglesia. Pedile al administrador que te cambie.';
  end if;

  perform set_config('lamies.bypass_guard', 'on', true);
  insert into public.profiles (id, church_id, display_name)
  values (v_uid, v_church.id, trim(p_display_name))
  on conflict (id) do update
    set church_id = excluded.church_id,
        display_name = excluded.display_name
  returning * into v_profile;

  insert into public.audit_log (church_id, actor_id, action, target)
  values (v_church.id, v_uid, 'join_church', v_uid::text);
  return v_profile;
end $$;

-- ---------------------------------------------------------------------------
-- Salidas
-- ---------------------------------------------------------------------------
create or replace function public.start_session()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_church uuid := public.current_church_id();
  v_id uuid;
begin
  if v_uid is null or v_church is null then raise exception 'No pertenecés a ninguna iglesia'; end if;
  -- Cierra cualquier salida que haya quedado abierta (el teléfono se apagó, etc.)
  update public.sessions set ended_at = coalesce(
      (select max(recorded_at) from public.track_points t where t.session_id = sessions.id), started_at)
    where user_id = v_uid and ended_at is null;
  delete from public.live_positions where user_id = v_uid;

  insert into public.sessions (church_id, user_id) values (v_church, v_uid) returning id into v_id;
  return v_id;
end $$;

-- p_points: [{"t": "2026-10-31T17:05:00Z", "lat": -27.4, "lng": -55.9, "acc": 8, "spd": 1.2, "hdg": 90}, ...]
create or replace function public.upload_track_points(p_session uuid, p_points jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_count integer;
  v_last record;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.user_id <> v_uid then raise exception 'Salida inválida'; end if;
  if v_session.ended_at is not null then raise exception 'La salida ya terminó'; end if;

  insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng, accuracy_m, speed_mps, heading)
  select v_session.id, v_session.church_id, v_uid, x.t, x.lat, x.lng, x.acc, x.spd, x.hdg
  from jsonb_to_recordset(p_points)
    as x(t timestamptz, lat double precision, lng double precision, acc real, spd real, hdg real)
  where x.t is not null and x.lat between -90 and 90 and x.lng between -180 and 180;
  get diagnostics v_count = row_count;

  select x.lat, x.lng, x.hdg, x.t into v_last
  from jsonb_to_recordset(p_points) as x(t timestamptz, lat double precision, lng double precision, hdg real)
  where x.t is not null order by x.t desc limit 1;

  if v_last.lat is not null then
    insert into public.live_positions (user_id, church_id, session_id, lat, lng, heading, updated_at)
    values (v_uid, v_session.church_id, v_session.id, v_last.lat, v_last.lng, v_last.hdg, now())
    on conflict (user_id) do update
      set lat = excluded.lat, lng = excluded.lng, heading = excluded.heading,
          session_id = excluded.session_id, updated_at = now();
  end if;
  return v_count;
end $$;

-- p_events: [{"road_id": 123, "seg": 4, "side": -1, "at": "2026-10-31T17:05:00Z"}, ...]
create or replace function public.upsert_coverage(p_session uuid, p_events jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_count integer;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.user_id <> v_uid then raise exception 'Salida inválida'; end if;

  insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at)
  select v_session.church_id, e.road_id, e.seg, e.side, v_uid, v_session.id, e.at
  from jsonb_to_recordset(p_events) as e(road_id bigint, seg integer, side smallint, at timestamptz)
  join public.roads r on r.id = e.road_id
  where e.side in (-1, 1) and e.at is not null
  on conflict (session_id, road_id, seg, side) do nothing;
  get diagnostics v_count = row_count;

  insert into public.coverage (church_id, road_id, seg, side, last_covered_at, last_user_id, last_session_id, times)
  select v_session.church_id, e.road_id, e.seg, e.side, max(e.at), v_uid, v_session.id, 1
  from jsonb_to_recordset(p_events) as e(road_id bigint, seg integer, side smallint, at timestamptz)
  join public.roads r on r.id = e.road_id
  where e.side in (-1, 1) and e.at is not null
  group by e.road_id, e.seg, e.side
  on conflict (church_id, road_id, seg, side) do update
    set last_covered_at = greatest(coverage.last_covered_at, excluded.last_covered_at),
        last_user_id = case when excluded.last_covered_at >= coverage.last_covered_at then excluded.last_user_id else coverage.last_user_id end,
        last_session_id = case when excluded.last_covered_at >= coverage.last_covered_at then excluded.last_session_id else coverage.last_session_id end,
        times = coverage.times + case when coverage.last_session_id is distinct from excluded.last_session_id then 1 else 0 end;
  return v_count;
end $$;

create or replace function public.end_session(p_session uuid, p_distance_m double precision, p_blocks integer,
                                              p_auto_stopped boolean default false)
returns public.sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.user_id <> v_uid then raise exception 'Salida inválida'; end if;

  update public.sessions s set
    ended_at = coalesce(s.ended_at, now()),
    distance_m = greatest(0, coalesce(p_distance_m, 0)),
    blocks = greatest(0, coalesce(p_blocks, 0)),
    auto_stopped = coalesce(p_auto_stopped, false),
    contacts = (select count(*) from public.contacts c where c.session_id = s.id),
    presentations = (select count(*) from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
    promises = (select count(*) from public.contact_visits v where v.session_id = s.id and v.promise_day is not null)
  where s.id = p_session
  returning * into v_session;

  delete from public.live_positions where user_id = v_uid;
  return v_session;
end $$;

-- Recortar una salida: "me olvidé de apagarla". Todo lo que pasó después de
-- p_cutoff se borra (puntos y cobertura) y la salida termina en ese momento.
-- También lo usa la app cuando detecta velocidad de vehículo (p_auto_stopped).
create or replace function public.trim_session(p_session uuid, p_cutoff timestamptz, p_auto_stopped boolean default false)
returns public.sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_affected record;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null then raise exception 'Salida inválida'; end if;
  if v_session.user_id <> v_uid and not (public.is_admin() and v_session.church_id = public.current_church_id()) then
    raise exception 'Solo el dueño de la salida o un administrador pueden recortarla';
  end if;
  if p_cutoff < v_session.started_at then raise exception 'El corte es anterior al inicio'; end if;

  -- 1. Borrar puntos y eventos de cobertura posteriores al corte.
  delete from public.track_points where session_id = p_session and recorded_at > p_cutoff;

  create temp table if not exists _trim_affected (road_id bigint, seg integer, side smallint) on commit drop;
  delete from _trim_affected;
  insert into _trim_affected
    select distinct road_id, seg, side from public.coverage_events
    where session_id = p_session and covered_at > p_cutoff;
  delete from public.coverage_events where session_id = p_session and covered_at > p_cutoff;

  -- 2. Rehacer la cobertura de las veredas afectadas con lo que quedó.
  for v_affected in select * from _trim_affected loop
    if exists (select 1 from public.coverage_events e
               where e.church_id = v_session.church_id and e.road_id = v_affected.road_id
                 and e.seg = v_affected.seg and e.side = v_affected.side) then
      update public.coverage c set
        last_covered_at = x.last_at, last_user_id = x.user_id, last_session_id = x.session_id, times = x.times
      from (
        select e.covered_at as last_at, e.user_id, e.session_id,
               (select count(distinct e2.session_id) from public.coverage_events e2
                 where e2.church_id = v_session.church_id and e2.road_id = v_affected.road_id
                   and e2.seg = v_affected.seg and e2.side = v_affected.side)::integer as times
        from public.coverage_events e
        where e.church_id = v_session.church_id and e.road_id = v_affected.road_id
          and e.seg = v_affected.seg and e.side = v_affected.side
        order by e.covered_at desc limit 1
      ) x
      where c.church_id = v_session.church_id and c.road_id = v_affected.road_id
        and c.seg = v_affected.seg and c.side = v_affected.side;
    else
      delete from public.coverage c
      where c.church_id = v_session.church_id and c.road_id = v_affected.road_id
        and c.seg = v_affected.seg and c.side = v_affected.side;
    end if;
  end loop;

  -- 3. Cerrar la salida en el corte y recalcular distancia y cuadras.
  update public.sessions s set
    ended_at = p_cutoff,
    trimmed_at = now(),
    auto_stopped = s.auto_stopped or coalesce(p_auto_stopped, false),
    distance_m = coalesce((
      select sum(public.haversine_m(prev_lat, prev_lng, lat, lng))
      from (select lat, lng, lag(lat) over (order by recorded_at) as prev_lat,
                   lag(lng) over (order by recorded_at) as prev_lng
            from public.track_points t where t.session_id = p_session) q
      where prev_lat is not null), 0),
    blocks = (select count(distinct (road_id, seg)) from public.coverage_events e where e.session_id = p_session),
    contacts = (select count(*) from public.contacts c where c.session_id = s.id),
    presentations = (select count(*) from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
    promises = (select count(*) from public.contact_visits v where v.session_id = s.id and v.promise_day is not null)
  where s.id = p_session
  returning * into v_session;

  delete from public.live_positions where session_id = p_session;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (v_session.church_id, v_uid, 'trim_session', p_session::text,
          jsonb_build_object('cutoff', p_cutoff, 'auto', p_auto_stopped));
  return v_session;
end $$;

-- ---------------------------------------------------------------------------
-- Mapa: calles y cobertura en un rectángulo
-- ---------------------------------------------------------------------------
create or replace function public.roads_in_bbox(p_min_lat double precision, p_min_lng double precision,
                                                p_max_lat double precision, p_max_lng double precision)
returns setof public.roads
language sql stable security definer set search_path = public as $$
  select * from public.roads
  where auth.uid() is not null
    and (p_max_lat - p_min_lat) <= 0.2 and (p_max_lng - p_min_lng) <= 0.2
    and max_lat >= p_min_lat and min_lat <= p_max_lat
    and max_lng >= p_min_lng and min_lng <= p_max_lng
  limit 4000
$$;

create or replace function public.coverage_in_bbox(p_min_lat double precision, p_min_lng double precision,
                                                   p_max_lat double precision, p_max_lng double precision)
returns table (road_id bigint, seg integer, side smallint, last_covered_at timestamptz,
               last_user_name text, times integer)
language sql stable security definer set search_path = public as $$
  select c.road_id, c.seg, c.side, c.last_covered_at, p.display_name, c.times
  from public.coverage c
  join public.roads r on r.id = c.road_id
  left join public.profiles p on p.id = c.last_user_id
  where c.church_id = public.current_church_id()
    and (p_max_lat - p_min_lat) <= 0.2 and (p_max_lng - p_min_lng) <= 0.2
    and r.max_lat >= p_min_lat and r.min_lat <= p_max_lat
    and r.max_lng >= p_min_lng and r.min_lng <= p_max_lng
  limit 20000
$$;

-- Historial de una vereda: quién pasó y cuándo.
create or replace function public.side_history(p_road bigint, p_seg integer, p_side smallint)
returns table (covered_at timestamptz, user_name text, session_id uuid, presentations integer, promises integer)
language sql stable security definer set search_path = public as $$
  select e.covered_at, p.display_name, e.session_id,
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.promise_day is not null)
  from public.coverage_events e
  left join public.profiles p on p.id = e.user_id
  where e.church_id = public.current_church_id()
    and e.road_id = p_road and e.seg = p_seg and e.side = p_side
  order by e.covered_at desc
  limit 50
$$;

-- ---------------------------------------------------------------------------
-- Equipo en vivo y tablero
-- ---------------------------------------------------------------------------
create or replace function public.team_live()
returns table (user_id uuid, display_name text, session_id uuid, started_at timestamptz,
               lat double precision, lng double precision, heading real, updated_at timestamptz,
               presentations integer, promises integer, contacts integer)
language sql stable security definer set search_path = public as $$
  select s.user_id, p.display_name, s.id, s.started_at, l.lat, l.lng, l.heading, l.updated_at,
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.promise_day is not null),
         (select count(*)::integer from public.contacts c where c.session_id = s.id)
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  left join public.live_positions l on l.user_id = s.user_id
  where s.church_id = public.current_church_id()
    and s.ended_at is null
    and s.started_at > now() - interval '12 hours'
  order by s.started_at
$$;

-- Inicio del período ("day", "week", "month") en la zona horaria de la iglesia.
create or replace function public.period_start(p_period text)
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  v_local timestamp := (now() at time zone v_tz);
begin
  return case p_period
    when 'week'  then (date_trunc('week', v_local)) at time zone v_tz
    when 'month' then (date_trunc('month', v_local)) at time zone v_tz
    when 'all'   then '1970-01-01'::timestamptz
    else (date_trunc('day', v_local)) at time zone v_tz
  end;
end $$;

-- Puntos: presentación 1 · promesa 3 · vino a la iglesia 10.
-- "Vino" se le acredita a quien marcó la casa. Bautismos y discipulado se
-- muestran como totales pero no suman puntos (cambiar acá si se quiere).
create or replace function public.scoreboard(p_period text)
returns table (user_id uuid, display_name text, group_id uuid, group_name text,
               presentations integer, promises integer, came integer, points integer)
language sql stable security definer set search_path = public as $$
  with since as (select public.period_start(p_period) as t),
  visits as (
    select v.user_id,
           count(*) filter (where v.gospel_presented) as presentations,
           count(*) filter (where v.promise_day is not null) as promises
    from public.contact_visits v, since
    where v.church_id = public.current_church_id() and v.visited_at >= since.t
    group by v.user_id
  ),
  came as (
    select c.created_by as user_id, count(*) as came
    from public.attendances a
    join public.contacts c on c.id = a.contact_id, since
    where a.church_id = public.current_church_id() and a.attended_on >= (since.t)::date
    group by c.created_by
  )
  select p.id, p.display_name, p.group_id, g.name,
         coalesce(v.presentations, 0)::integer, coalesce(v.promises, 0)::integer, coalesce(k.came, 0)::integer,
         (coalesce(v.presentations, 0) * 1 + coalesce(v.promises, 0) * 3 + coalesce(k.came, 0) * 10)::integer as points
  from public.profiles p
  left join public.groups g on g.id = p.group_id
  left join visits v on v.user_id = p.id
  left join came k on k.user_id = p.id
  where p.church_id = public.current_church_id()
    and (coalesce(v.presentations, 0) + coalesce(v.promises, 0) + coalesce(k.came, 0)) > 0
  order by points desc, p.display_name
$$;

-- Totales del equipo para el período (lo que muestra "Salida de hoy").
create or replace function public.team_totals(p_period text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select public.period_start(p_period) as t)
  select jsonb_build_object(
    'sessions',      (select count(*) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'members',       (select count(distinct s.user_id) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'minutes',       (select coalesce(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60), 0)::integer
                        from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'blocks',        (select coalesce(sum(s.blocks), 0) from public.sessions s, since where s.church_id = public.current_church_id() and s.started_at >= since.t),
    'presentations', (select count(*) from public.contact_visits v, since where v.church_id = public.current_church_id() and v.visited_at >= since.t and v.gospel_presented),
    'promises',      (select count(*) from public.contact_visits v, since where v.church_id = public.current_church_id() and v.visited_at >= since.t and v.promise_day is not null),
    'came',          (select count(*) from public.attendances a, since where a.church_id = public.current_church_id() and a.attended_on >= (since.t)::date),
    'discipleship',  (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.discipleship_since >= (since.t)::date),
    'baptisms',      (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.baptized_on >= (since.t)::date),
    'contacts',      (select count(*) from public.contacts c, since where c.church_id = public.current_church_id() and c.created_at >= since.t)
  )
$$;

-- ---------------------------------------------------------------------------
-- Mi progreso (niveles e insignias se calculan en la app con estos números)
-- ---------------------------------------------------------------------------
create or replace function public.my_progress()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  v_streak integer := 0;
  v_week date;
  v_has boolean;
begin
  -- Racha: semanas seguidas (contando esta o la anterior) con al menos una salida terminada.
  v_week := date_trunc('week', (now() at time zone v_tz))::date;
  loop
    select exists (
      select 1 from public.sessions s
      where s.user_id = v_uid and s.ended_at is not null
        and date_trunc('week', (s.started_at at time zone v_tz))::date = v_week
    ) into v_has;
    if not v_has then
      if v_streak = 0 and v_week = date_trunc('week', (now() at time zone v_tz))::date then
        v_week := v_week - 7; continue; -- esta semana todavía no salió: mirá la anterior
      end if;
      exit;
    end if;
    v_streak := v_streak + 1;
    v_week := v_week - 7;
    exit when v_streak > 520;
  end loop;

  return jsonb_build_object(
    'sessions',      (select count(*) from public.sessions s where s.user_id = v_uid and s.ended_at is not null),
    'minutes',       (select coalesce(sum(extract(epoch from (s.ended_at - s.started_at)) / 60), 0)::integer from public.sessions s where s.user_id = v_uid and s.ended_at is not null),
    'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s where s.user_id = v_uid),
    'presentations', (select count(*) from public.contact_visits v where v.user_id = v_uid and v.gospel_presented),
    'promises',      (select count(*) from public.contact_visits v where v.user_id = v_uid and v.promise_day is not null),
    'came',          (select count(*) from public.attendances a join public.contacts c on c.id = a.contact_id where c.created_by = v_uid),
    'discipleship',  (select count(*) from public.contacts c where c.created_by = v_uid and c.discipleship_since is not null),
    'baptisms',      (select count(*) from public.contacts c where c.created_by = v_uid and c.baptized_on is not null),
    'streak_weeks',  v_streak,
    'last_session',  (select max(s.started_at) from public.sessions s where s.user_id = v_uid)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Panel del pastor
-- ---------------------------------------------------------------------------
create or replace function public.church_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_captain_or_admin() then null else jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'sessions',      (select count(*) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'members',       (select count(distinct s.user_id) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'minutes',       (select coalesce(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60), 0)::integer from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'km',            (select round((coalesce(sum(s.distance_m), 0) / 1000)::numeric, 1) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'blocks',        (select coalesce(sum(s.blocks), 0) from public.sessions s where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),
      'presentations', (select count(*) from public.contact_visits v where v.church_id = public.current_church_id() and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
      'promises',      (select count(*) from public.contact_visits v where v.church_id = public.current_church_id() and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
      'came',          (select count(*) from public.attendances a where a.church_id = public.current_church_id() and a.attended_on >= p_from::date and a.attended_on < p_to::date),
      'discipleship',  (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.discipleship_since >= p_from::date and c.discipleship_since < p_to::date),
      'baptisms',      (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.baptized_on >= p_from::date and c.baptized_on < p_to::date),
      'contacts',      (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.created_at >= p_from and c.created_at < p_to),
      'pending_pickups', (select count(*) from public.contacts c where c.church_id = public.current_church_id() and c.pickup and c.promise_day is not null and not c.archived
                           and not exists (select 1 from public.attendances a where a.contact_id = c.id))
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'display_name', p.display_name,
        'sessions', (select count(*) from public.sessions s where s.user_id = p.id and s.started_at >= p_from and s.started_at < p_to),
        'presentations', (select count(*) from public.contact_visits v where v.user_id = p.id and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
        'promises', (select count(*) from public.contact_visits v where v.user_id = p.id and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
        'last_session', (select max(s.started_at) from public.sessions s where s.user_id = p.id)
      ) order by p.display_name), '[]'::jsonb)
      from public.profiles p where p.church_id = public.current_church_id()
    ),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'user_id', s.user_id, 'display_name', p.display_name,
        'started_at', s.started_at, 'ended_at', s.ended_at, 'distance_m', s.distance_m, 'blocks', s.blocks,
        'presentations', s.presentations, 'promises', s.promises, 'contacts', s.contacts,
        'auto_stopped', s.auto_stopped, 'trimmed_at', s.trimmed_at
      ) order by s.started_at desc), '[]'::jsonb)
      from public.sessions s join public.profiles p on p.id = s.user_id
      where s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to
    )
  ) end
$$;

-- Red de iglesias (Fase 3): solo totales, nunca contactos ni recorridos.
create or replace function public.network_summary(p_from timestamptz, p_to timestamptz)
returns table (church_id uuid, church_name text, city text, country text,
               sessions integer, members integer, presentations integer, promises integer, came integer,
               discipleship integer, baptisms integer)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.country,
    (select count(*)::integer from public.sessions s where s.church_id = c.id and s.started_at >= p_from and s.started_at < p_to),
    (select count(distinct s.user_id)::integer from public.sessions s where s.church_id = c.id and s.started_at >= p_from and s.started_at < p_to),
    (select count(*)::integer from public.contact_visits v where v.church_id = c.id and v.visited_at >= p_from and v.visited_at < p_to and v.gospel_presented),
    (select count(*)::integer from public.contact_visits v where v.church_id = c.id and v.visited_at >= p_from and v.visited_at < p_to and v.promise_day is not null),
    (select count(*)::integer from public.attendances a where a.church_id = c.id and a.attended_on >= p_from::date and a.attended_on < p_to::date),
    (select count(*)::integer from public.contacts k where k.church_id = c.id and k.discipleship_since >= p_from::date and k.discipleship_since < p_to::date),
    (select count(*)::integer from public.contacts k where k.church_id = c.id and k.baptized_on >= p_from::date and k.baptized_on < p_to::date)
  from public.churches c
  where public.is_network_admin()
  order by c.country, c.name
$$;

-- ---------------------------------------------------------------------------
-- Administración
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(p_user uuid, p_role public.member_role, p_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  if not exists (select 1 from public.profiles where id = p_user and church_id = public.current_church_id()) then
    raise exception 'Esa persona no es de tu iglesia';
  end if;
  if p_group is not null and not exists (select 1 from public.groups where id = p_group and church_id = public.current_church_id()) then
    raise exception 'Ese grupo no es de tu iglesia';
  end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set role = p_role, group_id = p_group where id = p_user;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_member_role', p_user::text,
          jsonb_build_object('role', p_role, 'group', p_group));
end $$;

create or replace function public.rotate_join_code()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  v_code := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8));
  update public.churches set join_code = v_code where id = public.current_church_id();
  insert into public.audit_log (church_id, actor_id, action) values (public.current_church_id(), auth.uid(), 'rotate_join_code');
  return v_code;
end $$;

create or replace function public.record_attendance(p_contact uuid, p_date date, p_service text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_captain_or_admin() then raise exception 'Solo capitanes y administradores'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then
    raise exception 'Contacto inválido';
  end if;
  insert into public.attendances (church_id, contact_id, attended_on, service, recorded_by)
  values (public.current_church_id(), p_contact, p_date, p_service, auth.uid())
  on conflict (contact_id, attended_on, service) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from anon, public;
grant execute on function
  public.join_church(text, text), public.start_session(), public.upload_track_points(uuid, jsonb),
  public.upsert_coverage(uuid, jsonb), public.end_session(uuid, double precision, integer, boolean),
  public.trim_session(uuid, timestamptz, boolean), public.haversine_m(double precision, double precision, double precision, double precision),
  public.roads_in_bbox(double precision, double precision, double precision, double precision),
  public.coverage_in_bbox(double precision, double precision, double precision, double precision),
  public.side_history(bigint, integer, smallint), public.team_live(), public.period_start(text),
  public.scoreboard(text), public.team_totals(text), public.my_progress(),
  public.church_report(timestamptz, timestamptz), public.network_summary(timestamptz, timestamptz),
  public.set_member_role(uuid, public.member_role, uuid), public.rotate_join_code(),
  public.record_attendance(uuid, date, text),
  public.current_church_id(), public.current_group_id(), public.current_role_name(),
  public.is_admin(), public.is_captain_or_admin(), public.is_network_admin(),
  public.can_see_contact(public.contacts), public.can_edit_contact(public.contacts)
to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real: la app se suscribe a estos cambios (RLS sigue aplicando).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_positions, public.sessions, public.contacts;
  end if;
end $$;

-- ---------- supabase/migrations/0004_church.sql ----------
-- ============================================================================
-- La Mies · Parte 2 · La iglesia completa
--  - Salidas de evangelismo o de volantes (mapas separados)
--  - Personas: contactos y miembros, con foto, colectivo y cuenta vinculada
--  - Reuniones y asistencia · Clases, maestros, material · Ministerios, chat, turnos
--  - Avisos (con notificación al teléfono) y tareas programadas
--  - Prédicas · Datos para ofrendar · Fidelidad y camino de cada persona
--  - El GPS crudo se borra a los 30 días; las veredas cubiertas quedan para siempre
-- ============================================================================

alter type public.member_role add value if not exists 'secretary';

-- ---------------------------------------------------------------------------
-- Ayudas de permisos (se comparan como texto para poder usar el rol nuevo ya)
-- ---------------------------------------------------------------------------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('admin', 'secretary') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_captain_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('captain', 'admin', 'secretary') from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------------
-- Iglesia: datos para ofrendar y horarios de avisos
-- ---------------------------------------------------------------------------
alter table public.churches
  add column if not exists giving jsonb not null default '{}'::jsonb,         -- {titular, banco, alias, cbu, cuit, nota}
  add column if not exists reminder_dow smallint not null default 1,          -- lunes
  add column if not exists reminder_hour smallint not null default 9,
  add column if not exists absence_dow smallint not null default 0,           -- domingo
  add column if not exists absence_hour smallint not null default 17;

drop policy if exists churches_update on public.churches;
create policy churches_update on public.churches for update to authenticated
  using (id = public.current_church_id() and public.is_staff())
  with check (id = public.current_church_id() and public.is_staff());

alter table public.profiles add column if not exists push_token text;

-- ---------------------------------------------------------------------------
-- Salidas: evangelismo o volantes, cada una con su propio mapa
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists kind text not null default 'soulwinning'
  check (kind in ('soulwinning', 'flyers'));

alter table public.coverage add column if not exists kind text not null default 'soulwinning'
  check (kind in ('soulwinning', 'flyers'));
alter table public.coverage drop constraint if exists coverage_pkey;
alter table public.coverage add constraint coverage_pkey primary key (church_id, road_id, seg, side, kind);

alter table public.coverage_events add column if not exists kind text not null default 'soulwinning'
  check (kind in ('soulwinning', 'flyers'));
create index if not exists coverage_events_kind_idx on public.coverage_events (church_id, road_id, seg, side, kind, covered_at desc);

drop function if exists public.start_session();
create or replace function public.start_session(p_kind text default 'soulwinning')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_church uuid := public.current_church_id();
  v_id uuid;
begin
  if v_uid is null or v_church is null then raise exception 'No pertenecés a ninguna iglesia'; end if;
  if p_kind not in ('soulwinning', 'flyers') then raise exception 'Tipo de salida inválido'; end if;
  update public.sessions set ended_at = coalesce(
      (select max(recorded_at) from public.track_points t where t.session_id = sessions.id), started_at)
    where user_id = v_uid and ended_at is null;
  delete from public.live_positions where user_id = v_uid;
  insert into public.sessions (church_id, user_id, kind) values (v_church, v_uid, p_kind) returning id into v_id;
  return v_id;
end $$;

create or replace function public.upsert_coverage(p_session uuid, p_events jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_count integer;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.user_id <> v_uid then raise exception 'Salida inválida'; end if;

  insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at, kind)
  select v_session.church_id, e.road_id, e.seg, e.side, v_uid, v_session.id, e.at, v_session.kind
  from jsonb_to_recordset(p_events) as e(road_id bigint, seg integer, side smallint, at timestamptz)
  join public.roads r on r.id = e.road_id
  where e.side in (-1, 1) and e.at is not null
  on conflict (session_id, road_id, seg, side) do nothing;
  get diagnostics v_count = row_count;

  insert into public.coverage (church_id, road_id, seg, side, kind, last_covered_at, last_user_id, last_session_id, times)
  select v_session.church_id, e.road_id, e.seg, e.side, v_session.kind, max(e.at), v_uid, v_session.id, 1
  from jsonb_to_recordset(p_events) as e(road_id bigint, seg integer, side smallint, at timestamptz)
  join public.roads r on r.id = e.road_id
  where e.side in (-1, 1) and e.at is not null
  group by e.road_id, e.seg, e.side
  on conflict (church_id, road_id, seg, side, kind) do update
    set last_covered_at = greatest(coverage.last_covered_at, excluded.last_covered_at),
        last_user_id = case when excluded.last_covered_at >= coverage.last_covered_at then excluded.last_user_id else coverage.last_user_id end,
        last_session_id = case when excluded.last_covered_at >= coverage.last_covered_at then excluded.last_session_id else coverage.last_session_id end,
        times = coverage.times + case when coverage.last_session_id is distinct from excluded.last_session_id then 1 else 0 end;
  return v_count;
end $$;

drop function if exists public.coverage_in_bbox(double precision, double precision, double precision, double precision);
create or replace function public.coverage_in_bbox(p_min_lat double precision, p_min_lng double precision,
                                                   p_max_lat double precision, p_max_lng double precision)
returns table (road_id bigint, seg integer, side smallint, kind text, last_covered_at timestamptz,
               last_user_name text, times integer)
language sql stable security definer set search_path = public as $$
  select c.road_id, c.seg, c.side, c.kind, c.last_covered_at, p.display_name, c.times
  from public.coverage c
  join public.roads r on r.id = c.road_id
  left join public.profiles p on p.id = c.last_user_id
  where c.church_id = public.current_church_id()
    and (p_max_lat - p_min_lat) <= 0.2 and (p_max_lng - p_min_lng) <= 0.2
    and r.max_lat >= p_min_lat and r.min_lat <= p_max_lat
    and r.max_lng >= p_min_lng and r.min_lng <= p_max_lng
  limit 20000
$$;

drop function if exists public.side_history(bigint, integer, smallint);
create or replace function public.side_history(p_road bigint, p_seg integer, p_side smallint, p_kind text default null)
returns table (covered_at timestamptz, user_name text, session_id uuid, kind text, presentations integer, promises integer)
language sql stable security definer set search_path = public as $$
  select e.covered_at, p.display_name, e.session_id, e.kind,
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = e.session_id and v.promise_day is not null)
  from public.coverage_events e
  left join public.profiles p on p.id = e.user_id
  where e.church_id = public.current_church_id()
    and e.road_id = p_road and e.seg = p_seg and e.side = p_side
    and (p_kind is null or e.kind = p_kind)
  order by e.covered_at desc
  limit 100
$$;

drop function if exists public.team_live();
create or replace function public.team_live()
returns table (user_id uuid, display_name text, session_id uuid, kind text, started_at timestamptz,
               lat double precision, lng double precision, heading real, updated_at timestamptz,
               presentations integer, promises integer, contacts integer)
language sql stable security definer set search_path = public as $$
  select s.user_id, p.display_name, s.id, s.kind, s.started_at, l.lat, l.lng, l.heading, l.updated_at,
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
         (select count(*)::integer from public.contact_visits v where v.session_id = s.id and v.promise_day is not null),
         (select count(*)::integer from public.contacts c where c.session_id = s.id)
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  left join public.live_positions l on l.user_id = s.user_id
  where s.church_id = public.current_church_id()
    and s.ended_at is null
    and s.started_at > now() - interval '12 hours'
  order by s.started_at
$$;

-- Recorte, ahora separando evangelismo y volantes.
create or replace function public.trim_session(p_session uuid, p_cutoff timestamptz, p_auto_stopped boolean default false)
returns public.sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions;
  v_a record;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null then raise exception 'Salida inválida'; end if;
  if v_session.user_id <> v_uid and not (public.is_staff() and v_session.church_id = public.current_church_id()) then
    raise exception 'Solo el dueño de la salida o un administrador pueden recortarla';
  end if;
  if p_cutoff < v_session.started_at then raise exception 'El corte es anterior al inicio'; end if;

  delete from public.track_points where session_id = p_session and recorded_at > p_cutoff;

  for v_a in
    with gone as (
      delete from public.coverage_events
      where session_id = p_session and covered_at > p_cutoff
      returning road_id, seg, side, kind
    )
    select distinct road_id, seg, side, kind from gone
  loop
    if exists (select 1 from public.coverage_events e
               where e.church_id = v_session.church_id and e.road_id = v_a.road_id
                 and e.seg = v_a.seg and e.side = v_a.side and e.kind = v_a.kind) then
      update public.coverage c set
        last_covered_at = x.covered_at, last_user_id = x.user_id, last_session_id = x.session_id, times = x.times
      from (
        select e.covered_at, e.user_id, e.session_id,
               (select count(distinct e2.session_id) from public.coverage_events e2
                 where e2.church_id = v_session.church_id and e2.road_id = v_a.road_id
                   and e2.seg = v_a.seg and e2.side = v_a.side and e2.kind = v_a.kind)::integer as times
        from public.coverage_events e
        where e.church_id = v_session.church_id and e.road_id = v_a.road_id
          and e.seg = v_a.seg and e.side = v_a.side and e.kind = v_a.kind
        order by e.covered_at desc limit 1
      ) x
      where c.church_id = v_session.church_id and c.road_id = v_a.road_id
        and c.seg = v_a.seg and c.side = v_a.side and c.kind = v_a.kind;
    else
      delete from public.coverage c
      where c.church_id = v_session.church_id and c.road_id = v_a.road_id
        and c.seg = v_a.seg and c.side = v_a.side and c.kind = v_a.kind;
    end if;
  end loop;

  update public.sessions s set
    ended_at = p_cutoff,
    trimmed_at = now(),
    auto_stopped = s.auto_stopped or coalesce(p_auto_stopped, false),
    distance_m = coalesce((
      select sum(public.haversine_m(prev_lat, prev_lng, lat, lng))
      from (select lat, lng, lag(lat) over (order by recorded_at) as prev_lat,
                   lag(lng) over (order by recorded_at) as prev_lng
            from public.track_points t where t.session_id = p_session) q
      where prev_lat is not null), 0),
    blocks = (select count(distinct (road_id, seg)) from public.coverage_events e where e.session_id = p_session),
    contacts = (select count(*) from public.contacts c where c.session_id = s.id),
    presentations = (select count(*) from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
    promises = (select count(*) from public.contact_visits v where v.session_id = s.id and v.promise_day is not null)
  where s.id = p_session
  returning * into v_session;

  delete from public.live_positions where session_id = p_session;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (v_session.church_id, v_uid, 'trim_session', p_session::text,
          jsonb_build_object('cutoff', p_cutoff, 'auto', p_auto_stopped));
  return v_session;
end $$;

-- GPS crudo: solo hace falta un tiempo (para recortar o revisar). Las veredas quedan.
create or replace function public.purge_old_track_points(p_days integer default 30)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from public.track_points t
  using public.sessions s
  where t.session_id = s.id and s.ended_at is not null and s.ended_at < now() - make_interval(days => p_days);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Colectivos (rutas): son los "groups". Personas: la tabla contacts.
-- ---------------------------------------------------------------------------
alter table public.contacts alter column lat drop not null;
alter table public.contacts alter column lng drop not null;
alter table public.contacts
  add column if not exists status text not null default 'contact' check (status in ('contact', 'visitor', 'member')),
  add column if not exists member_since date,
  add column if not exists photo_path text,
  add column if not exists birthdate date,
  add column if not exists address text,
  add column if not exists email text,
  add column if not exists group_id uuid references public.groups(id) on delete set null,
  add column if not exists profile_id uuid unique references public.profiles(id) on delete set null,
  add column if not exists auto_created boolean not null default false;
create index if not exists contacts_status_idx on public.contacts (church_id, status);
create index if not exists contacts_group_idx on public.contacts (group_id);

-- ---------------------------------------------------------------------------
-- Reuniones de la iglesia y asistencia
-- ---------------------------------------------------------------------------
create table if not exists public.church_services (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  name       text not null,
  dow        smallint not null check (dow between 0 and 6),   -- 0 domingo … 6 sábado
  time       text not null default '10:00',
  main       boolean not null default true,                    -- cuenta para la fidelidad
  active     boolean not null default true,
  sort_order integer not null default 100
);
create index if not exists church_services_church_idx on public.church_services (church_id, dow);

create or replace function public.ensure_default_services(p_church uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.church_services where church_id = p_church) then
    insert into public.church_services (church_id, name, dow, time, main, sort_order) values
      (p_church, 'Culto del sábado', 6, '19:00', true, 10),
      (p_church, 'Culto del domingo', 0, '10:00', true, 20);
  end if;
end $$;

create or replace function public.churches_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_default_services(new.id);
  return new;
end $$;
drop trigger if exists churches_defaults on public.churches;
create trigger churches_defaults after insert on public.churches
  for each row execute function public.churches_after_insert();

do $$
declare r record;
begin
  for r in select id from public.churches loop perform public.ensure_default_services(r.id); end loop;
end $$;

alter table public.attendances add column if not exists service_id uuid references public.church_services(id) on delete cascade;
update public.attendances a set service_id = (
  select s.id from public.church_services s
  where s.church_id = a.church_id and s.main and s.dow = extract(dow from a.attended_on)::int
  order by s.sort_order limit 1)
where service_id is null;
update public.attendances a set service_id = (
  select s.id from public.church_services s where s.church_id = a.church_id and s.main order by s.sort_order limit 1)
where service_id is null;
alter table public.attendances alter column service_id set not null;
alter table public.attendances drop constraint if exists attendances_contact_id_attended_on_service_key;
alter table public.attendances drop constraint if exists attendances_unique;
alter table public.attendances drop constraint if exists attendances_unique;
alter table public.attendances add constraint attendances_unique unique (contact_id, attended_on, service_id);
alter table public.attendances alter column service set default 'other';

-- ---------------------------------------------------------------------------
-- Clases (escuela dominical), maestros, alumnos, turnos, asistencia, material
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  name        text not null,
  age_min     integer,
  age_max     integer,
  days        text[] not null default '{sat,sun}',
  active      boolean not null default true,
  sort_order  integer not null default 100
);
create table if not exists public.class_teachers (
  class_id   uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_helper  boolean not null default false,
  primary key (class_id, profile_id)
);
create table if not exists public.class_students (
  class_id   uuid not null references public.classes(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  primary key (class_id, contact_id)
);
create table if not exists public.materials (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  series        text not null,                    -- "Vida de Jesús" (el libro o la serie)
  title         text not null,                    -- "Capítulo 3: El bautismo"
  chapter_order integer not null default 1,
  body          text,                             -- texto para estudiar
  file_path     text,                             -- PDF u otro archivo (bucket "materials")
  file_name     text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists materials_idx on public.materials (church_id, series, chapter_order);
create table if not exists public.class_schedule (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  on_date     date not null,
  teacher_id  uuid references public.profiles(id) on delete set null,
  helper_id   uuid references public.profiles(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  note        text,
  unique (class_id, on_date)
);
create index if not exists class_schedule_date_idx on public.class_schedule (church_id, on_date);
create table if not exists public.class_attendance (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  on_date     date not null,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  present     boolean not null default true,
  note        text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (class_id, on_date, contact_id)
);
create index if not exists class_attendance_contact_idx on public.class_attendance (contact_id, on_date desc);

-- ---------------------------------------------------------------------------
-- Ministerios, sus integrantes, el chat y los turnos
-- ---------------------------------------------------------------------------
create table if not exists public.ministries (
  id                  uuid primary key default gen_random_uuid(),
  church_id           uuid not null references public.churches(id) on delete cascade,
  name                text not null,
  description         text,
  icon                text not null default 'users',
  leader_id           uuid references public.profiles(id) on delete set null,
  can_take_attendance boolean not null default false,
  is_teaching         boolean not null default false,
  sort_order          integer not null default 100,
  created_at          timestamptz not null default now()
);
create table if not exists public.ministry_members (
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  is_leader   boolean not null default false,
  joined_at   timestamptz not null default now(),
  primary key (ministry_id, profile_id)
);
create table if not exists public.ministry_messages (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'message' check (kind in ('message', 'recommendation', 'announcement')),
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists ministry_messages_idx on public.ministry_messages (ministry_id, created_at desc);
create table if not exists public.duties (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  on_date     date not null,
  profile_id  uuid references public.profiles(id) on delete cascade,   -- quien tiene app
  contact_id  uuid references public.contacts(id) on delete cascade,   -- o alguien sin app
  task        text not null,                                           -- "Recepción en la puerta"
  arrive_time text,                                                    -- "18:00"
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (profile_id is not null or contact_id is not null)
);
create index if not exists duties_date_idx on public.duties (church_id, on_date);

-- ---------------------------------------------------------------------------
-- Avisos, registro de tareas programadas, prédicas
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null,
  link         text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  push_sent_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.job_log (
  church_id uuid not null references public.churches(id) on delete cascade,
  job       text not null,
  key       text not null,
  ran_at    timestamptz not null default now(),
  primary key (church_id, job, key)
);

create table if not exists public.sermons (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  title       text not null,
  preacher    text,
  preached_on date not null default current_date,
  passage     text,
  description text,
  youtube_url text,
  audio_path  text,                                -- bucket "sermons"
  audio_name  text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists sermons_idx on public.sermons (church_id, preached_on desc);

-- ---------------------------------------------------------------------------
-- Más ayudas de permisos
-- ---------------------------------------------------------------------------
create or replace function public.is_teacher_of(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_teachers t where t.class_id = p_class and t.profile_id = auth.uid())
$$;

create or replace function public.is_any_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_teachers t where t.profile_id = auth.uid())
$$;

create or replace function public.teaches_contact(p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_students s join public.class_teachers t on t.class_id = s.class_id
                 where s.contact_id = p_contact and t.profile_id = auth.uid())
$$;

create or replace function public.is_ministry_member(p_ministry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ministry_members m where m.ministry_id = p_ministry and m.profile_id = auth.uid())
$$;

create or replace function public.is_ministry_leader(p_ministry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.ministries m where m.id = p_ministry and m.leader_id = auth.uid())
      or exists (select 1 from public.ministry_members mm where mm.ministry_id = p_ministry and mm.profile_id = auth.uid() and mm.is_leader)
$$;

create or replace function public.can_take_attendance() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_captain_or_admin()
      or exists (select 1 from public.ministry_members mm join public.ministries m on m.id = mm.ministry_id
                 where mm.profile_id = auth.uid() and m.can_take_attendance)
$$;

-- Quién ve una persona.
--  "privado" = sus notas de visitas, hijos, etc.  "ver" = además el directorio de miembros.
create or replace function public.can_see_contact_private(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or c.profile_id = auth.uid()
    or public.is_staff()
    or (c.group_id is not null and c.group_id = public.current_group_id() and public.current_role_name()::text = 'captain')
    or (c.share_mode = 'group' and exists (
          select 1 from public.profiles p
          where p.id = c.created_by and p.group_id is not null and p.group_id = public.current_group_id()))
    or exists (select 1 from public.contact_shares s where s.contact_id = c.id and s.user_id = auth.uid())
    or public.teaches_contact(c.id)
  )
$$;

create or replace function public.can_see_contact(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_see_contact_private(c)
      or (c.church_id = public.current_church_id() and c.status = 'member')
      or (c.church_id = public.current_church_id() and c.status in ('member', 'visitor') and public.can_take_attendance())
$$;

create or replace function public.can_edit_contact(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or c.profile_id = auth.uid()
    or public.is_staff()
    or (public.current_role_name()::text = 'captain' and (
          (c.group_id is not null and c.group_id = public.current_group_id())
          or exists (select 1 from public.profiles p where p.id = c.created_by and p.group_id = public.current_group_id())))
  )
$$;

-- Solo la secretaría o el pastor marcan miembros, vinculan cuentas o crean miembros.
create or replace function public.contacts_people_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff() or current_setting('lamies.bypass_guard', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'member' then new.status := 'contact'; end if;
    new.member_since := null;
    new.profile_id := null;
    new.auto_created := false;
  else
    new.status := old.status;
    new.member_since := old.member_since;
    new.profile_id := old.profile_id;
    new.auto_created := old.auto_created;
    if public.current_role_name()::text <> 'captain' then new.group_id := old.group_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists contacts_people_guard on public.contacts;
create trigger contacts_people_guard before insert or update on public.contacts
  for each row execute function public.contacts_people_guard();

-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------------
alter table public.church_services   enable row level security;
alter table public.classes           enable row level security;
alter table public.class_teachers    enable row level security;
alter table public.class_students    enable row level security;
alter table public.materials         enable row level security;
alter table public.class_schedule    enable row level security;
alter table public.class_attendance  enable row level security;
alter table public.ministries        enable row level security;
alter table public.ministry_members  enable row level security;
alter table public.ministry_messages enable row level security;
alter table public.duties            enable row level security;
alter table public.notifications     enable row level security;
alter table public.job_log           enable row level security;
alter table public.sermons           enable row level security;

-- Visitas e hijos: solo con permiso "privado" (no basta con ser miembro).
drop policy if exists contact_children_select on public.contact_children;
create policy contact_children_select on public.contact_children for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact_private(c)));
drop policy if exists contact_visits_select on public.contact_visits;
create policy contact_visits_select on public.contact_visits for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact_private(c)));
drop policy if exists contact_visits_insert on public.contact_visits;
create policy contact_visits_insert on public.contact_visits for insert to authenticated
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact(c)));
drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated
  using (church_id = public.current_church_id() and (created_by = auth.uid() or public.is_staff()));
drop policy if exists attendances_write on public.attendances;
create policy attendances_write on public.attendances for all to authenticated
  using (church_id = public.current_church_id() and public.can_take_attendance())
  with check (public.can_take_attendance());
drop policy if exists groups_admin on public.groups;
create policy groups_admin on public.groups for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

drop policy if exists church_services_select on public.church_services;
create policy church_services_select on public.church_services for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists church_services_write on public.church_services;
create policy church_services_write on public.church_services for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

drop policy if exists class_teachers_select on public.class_teachers;
create policy class_teachers_select on public.class_teachers for select to authenticated
  using (exists (select 1 from public.classes k where k.id = class_id and k.church_id = public.current_church_id()));
drop policy if exists class_teachers_write on public.class_teachers;
create policy class_teachers_write on public.class_teachers for all to authenticated
  using (public.is_staff() and exists (select 1 from public.classes k where k.id = class_id and k.church_id = public.current_church_id()))
  with check (public.is_staff() and exists (select 1 from public.classes k where k.id = class_id and k.church_id = public.current_church_id()));

drop policy if exists class_students_select on public.class_students;
create policy class_students_select on public.class_students for select to authenticated
  using (exists (select 1 from public.classes k where k.id = class_id and k.church_id = public.current_church_id())
         and (public.is_captain_or_admin() or public.is_teacher_of(class_id)));
drop policy if exists class_students_write on public.class_students;
create policy class_students_write on public.class_students for all to authenticated
  using ((public.is_staff() or public.is_teacher_of(class_id))
         and exists (select 1 from public.classes k where k.id = class_id and k.church_id = public.current_church_id()))
  with check ((public.is_staff() or public.is_teacher_of(class_id))
         and exists (select 1 from public.contacts c where c.id = contact_id and c.church_id = public.current_church_id()));

drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists materials_write on public.materials;
create policy materials_write on public.materials for all to authenticated
  using (church_id = public.current_church_id() and (public.is_staff() or public.is_any_teacher()))
  with check (church_id = public.current_church_id() and (public.is_staff() or public.is_any_teacher()));

drop policy if exists class_schedule_select on public.class_schedule;
create policy class_schedule_select on public.class_schedule for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists class_schedule_write on public.class_schedule;
create policy class_schedule_write on public.class_schedule for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

drop policy if exists class_attendance_select on public.class_attendance;
create policy class_attendance_select on public.class_attendance for select to authenticated
  using (church_id = public.current_church_id() and (public.is_captain_or_admin() or public.is_teacher_of(class_id)));
drop policy if exists class_attendance_write on public.class_attendance;
create policy class_attendance_write on public.class_attendance for all to authenticated
  using (church_id = public.current_church_id() and (public.is_staff() or public.is_teacher_of(class_id)))
  with check (church_id = public.current_church_id() and (public.is_staff() or public.is_teacher_of(class_id)));

drop policy if exists ministries_select on public.ministries;
create policy ministries_select on public.ministries for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists ministries_write on public.ministries;
create policy ministries_write on public.ministries for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

drop policy if exists ministry_members_select on public.ministry_members;
create policy ministry_members_select on public.ministry_members for select to authenticated
  using (exists (select 1 from public.ministries m where m.id = ministry_id and m.church_id = public.current_church_id()));
drop policy if exists ministry_members_write on public.ministry_members;
create policy ministry_members_write on public.ministry_members for all to authenticated
  using (public.is_ministry_leader(ministry_id)
         and exists (select 1 from public.ministries m where m.id = ministry_id and m.church_id = public.current_church_id()))
  with check (public.is_ministry_leader(ministry_id)
         and exists (select 1 from public.profiles p where p.id = profile_id and p.church_id = public.current_church_id()));

drop policy if exists ministry_messages_select on public.ministry_messages;
create policy ministry_messages_select on public.ministry_messages for select to authenticated
  using (church_id = public.current_church_id() and (public.is_ministry_member(ministry_id) or public.is_ministry_leader(ministry_id)));
drop policy if exists ministry_messages_insert on public.ministry_messages;
create policy ministry_messages_insert on public.ministry_messages for insert to authenticated
  with check (user_id = auth.uid() and church_id = public.current_church_id()
              and (public.is_ministry_member(ministry_id) or public.is_ministry_leader(ministry_id))
              and (kind <> 'announcement' or public.is_ministry_leader(ministry_id)));
drop policy if exists ministry_messages_delete on public.ministry_messages;
create policy ministry_messages_delete on public.ministry_messages for delete to authenticated
  using (user_id = auth.uid() or public.is_ministry_leader(ministry_id));

drop policy if exists duties_select on public.duties;
create policy duties_select on public.duties for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists duties_write on public.duties;
create policy duties_write on public.duties for all to authenticated
  using (church_id = public.current_church_id() and public.is_ministry_leader(ministry_id))
  with check (church_id = public.current_church_id() and public.is_ministry_leader(ministry_id));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists sermons_select on public.sermons;
create policy sermons_select on public.sermons for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists sermons_write on public.sermons;
create policy sermons_write on public.sermons for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

-- Completar iglesia y autor automáticamente en las tablas nuevas.
create or replace function public.stamp_church() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.church_id := public.current_church_id();
    if tg_table_name in ('materials', 'duties', 'sermons') then new.created_by := auth.uid(); end if;
    if tg_table_name = 'ministry_messages' then new.user_id := auth.uid(); end if;
    if tg_table_name = 'class_attendance' then new.recorded_by := auth.uid(); end if;
  end if;
  if new.church_id is null then raise exception 'La persona no pertenece a ninguna iglesia'; end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['church_services','classes','materials','class_schedule','class_attendance',
                           'ministries','ministry_messages','duties','sermons'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_stamp', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.stamp_church()', t || '_stamp', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funciones de la app
-- ---------------------------------------------------------------------------
-- Unirse con teléfono: si la secretaría ya cargó la ficha con ese número, se vincula sola.
create or replace function public.join_church(p_code text, p_display_name text, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  v_match uuid;
  v_n integer;
begin
  v_profile := public.join_church(p_code, p_display_name);
  if nullif(p_phone, '') is not null then
    perform set_config('lamies.bypass_guard', 'on', true);
    update public.profiles set phone = p_phone where id = v_profile.id;
  end if;
  if exists (select 1 from public.contacts where profile_id = v_profile.id) then return v_profile; end if;

  if length(v_digits) = 8 then
    select count(*), min(id::text)::uuid into v_n, v_match from public.contacts
    where church_id = v_profile.church_id and profile_id is null
      and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = v_digits;
    if v_n = 1 then
      update public.contacts set profile_id = v_profile.id where id = v_match;
      -- Aviso a la secretaría y al pastor para que confirmen que es la persona correcta.
      insert into public.notifications (church_id, user_id, kind, title, body, link)
      select v_profile.church_id, p.id, 'link', 'Cuenta vinculada por teléfono',
             v_profile.display_name || ' creó su cuenta y quedó unida a la ficha de '
               || (select name from public.contacts where id = v_match) || '. Revisá que sea la misma persona.',
             '/contacto/' || v_match
      from public.profiles p
      where p.church_id = v_profile.church_id and p.role::text in ('admin', 'secretary') and p.id <> v_profile.id;
      return v_profile;
    end if;
  end if;
  -- No hay ficha: se crea una para que aparezca en la lista (la secretaría la puede unir después).
  insert into public.contacts (church_id, created_by, name, phone, status, profile_id, auto_created, interest, share_mode)
  values (v_profile.church_id, v_profile.id, v_profile.display_name, nullif(p_phone, ''), 'contact', v_profile.id, true, 'very', 'group');
  return v_profile;
end $$;


-- Cuentas creadas antes de la Parte 2 no tienen ficha: se crea sola la primera vez.
create or replace function public.ensure_my_card()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_id uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.church_id is null then return null; end if;
  select id into v_id from public.contacts where profile_id = v_profile.id;
  if v_id is not null then return v_id; end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  insert into public.contacts (church_id, created_by, name, phone, status, member_since, profile_id, auto_created, interest, share_mode)
  values (v_profile.church_id, v_profile.id, v_profile.display_name, v_profile.phone,
          case when v_profile.role::text in ('admin', 'secretary') then 'member' else 'contact' end,
          case when v_profile.role::text in ('admin', 'secretary') then current_date end,
          v_profile.id, true, 'very', 'group')
  returning id into v_id;
  return v_id;
end $$;

-- Vincular a mano una cuenta con una ficha (secretaría / pastor).
create or replace function public.link_account(p_contact uuid, p_profile uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old uuid;
begin
  if not public.is_staff() then raise exception 'Solo la secretaría o el pastor'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then raise exception 'Ficha inválida'; end if;
  if not exists (select 1 from public.profiles where id = p_profile and church_id = public.current_church_id()) then raise exception 'Cuenta inválida'; end if;
  select id into v_old from public.contacts where profile_id = p_profile;
  if v_old is not null and v_old <> p_contact then
    update public.contacts set profile_id = null where id = v_old;
    -- La ficha automática vacía se borra para no duplicar a la persona.
    delete from public.contacts c where c.id = v_old and c.auto_created
      and not exists (select 1 from public.contact_visits v where v.contact_id = c.id)
      and not exists (select 1 from public.attendances a where a.contact_id = c.id)
      and not exists (select 1 from public.class_attendance a where a.contact_id = c.id);
  end if;
  update public.contacts set profile_id = p_profile, auto_created = false where id = p_contact;
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'link_account', p_contact::text, jsonb_build_object('profile', p_profile));
end $$;

-- Marcar presente / ausente en una reunión.
create or replace function public.set_attendance(p_contact uuid, p_date date, p_service uuid, p_present boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_dow integer;
begin
  if not public.can_take_attendance() then raise exception 'No tenés permiso para tomar asistencia'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then raise exception 'Persona inválida'; end if;
  select dow into v_dow from public.church_services where id = p_service and church_id = public.current_church_id();
  if v_dow is null then raise exception 'Reunión inválida'; end if;
  if p_present then
    insert into public.attendances (church_id, contact_id, attended_on, service, service_id, recorded_by)
    values (public.current_church_id(), p_contact, p_date,
            case extract(dow from p_date)::int when 6 then 'sat' when 0 then 'sun' else 'other' end, p_service, auth.uid())
    on conflict (contact_id, attended_on, service_id) do nothing;
  else
    delete from public.attendances where contact_id = p_contact and attended_on = p_date and service_id = p_service;
  end if;
end $$;

-- La versión anterior (botones "vino el sábado / domingo") sigue funcionando.
create or replace function public.record_attendance(p_contact uuid, p_date date, p_service text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_service uuid;
begin
  if not public.can_take_attendance() then raise exception 'Solo capitanes, recepción y administradores'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then
    raise exception 'Contacto inválido';
  end if;
  perform public.ensure_default_services(public.current_church_id());
  select id into v_service from public.church_services
  where church_id = public.current_church_id() and main and active
    and dow = case p_service when 'sat' then 6 when 'sun' then 0 else dow end
  order by sort_order limit 1;
  if v_service is null then
    select id into v_service from public.church_services where church_id = public.current_church_id() and main order by sort_order limit 1;
  end if;
  insert into public.attendances (church_id, contact_id, attended_on, service, service_id, recorded_by)
  values (public.current_church_id(), p_contact, p_date, p_service, v_service, auth.uid())
  on conflict (contact_id, attended_on, service_id) do nothing;
end $$;

-- Lista para tomar asistencia: personas + si están presentes en esa reunión.
create or replace function public.attendance_sheet(p_date date, p_service uuid)
returns table (contact_id uuid, name text, photo_path text, status text, group_id uuid, present boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.photo_path, c.status, c.group_id,
         exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on = p_date and a.service_id = p_service)
  from public.contacts c
  where public.can_take_attendance()
    and c.church_id = public.current_church_id()
    and not c.archived
    and (c.status in ('member', 'visitor')
         or exists (select 1 from public.attendances a where a.contact_id = c.id)
         or c.promise_day is not null)
  order by case c.status when 'member' then 0 when 'visitor' then 1 else 2 end, c.name
$$;

-- Fidelidad: porcentaje de reuniones principales a las que vino en las últimas N semanas.
create or replace function public.people_engagement(p_weeks integer default 12)
returns table (contact_id uuid, name text, photo_path text, status text, group_id uuid,
               attended integer, possible integer, pct numeric, category text, last_attended date, class_days integer)
language sql stable security definer set search_path = public as $$
  with tz as (
    select coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires') as tz
  ),
  bounds as (
    select ((now() at time zone tz.tz)::date - (p_weeks * 7)) as d0, (now() at time zone tz.tz)::date as d1 from tz
  ),
  occ as (   -- cada fecha en que hubo una reunión principal
    select g.d::date as d, s.id as service_id
    from bounds b, generate_series(b.d0 + 1, b.d1, interval '1 day') g(d)
    join public.church_services s on s.church_id = public.current_church_id() and s.main and s.active
                                 and s.dow = extract(dow from g.d)::int
  ),
  people as (
    select c.* from public.contacts c
    where c.church_id = public.current_church_id() and not c.archived
      and (c.status in ('member', 'visitor') or exists (select 1 from public.attendances a where a.contact_id = c.id))
  )
  select p.id, p.name, p.photo_path, p.status, p.group_id,
         x.attended, x.possible,
         case when x.possible = 0 then 0 else round(x.attended::numeric / x.possible, 2) end,
         case
           when x.possible = 0 then 'nuevo'
           when x.attended::numeric / x.possible >= 0.95 then 'fiel'
           when x.attended::numeric / x.possible >= 0.80 then 'constante'
           when x.attended::numeric / x.possible >= 0.45 then 'frecuente'
           when x.attended::numeric / x.possible >= 0.20 then 'ocasional'
           when x.attended > 0 then 'esporadico'
           when (select max(a.attended_on) from public.attendances a where a.contact_id = p.id) is not null then 'inactivo'
           else 'sin_asistencia'
         end,
         (select max(a.attended_on) from public.attendances a where a.contact_id = p.id),
         (select count(*)::integer from public.class_attendance ca, bounds b where ca.contact_id = p.id and ca.present and ca.on_date > b.d0)
  from people p
  cross join lateral (
    select
      (select count(*)::integer from occ o where o.d >= greatest((select d0 from bounds) + 1, (p.created_at at time zone (select tz from tz))::date)) as possible,
      (select count(*)::integer from public.attendances a join occ o on o.d = a.attended_on and o.service_id = a.service_id
        where a.contact_id = p.id) as attended
  ) x
  where public.is_captain_or_admin()
  order by x.attended desc, p.name
$$;

-- El camino de una persona: primer contacto → visita → vino → discipulado → clase → miembro → bautismo → sirve.
create or replace function public.person_journey(p_contact uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c public.contacts;
  v jsonb := '[]'::jsonb;
  d timestamptz;
  dd date;
begin
  select * into c from public.contacts where id = p_contact;
  if c.id is null or not public.can_see_contact(c) then return v; end if;
  v := v || jsonb_build_array(jsonb_build_object('step', 'contacto', 'label', 'Primer contacto', 'at', c.created_at,
         'by', (select display_name from public.profiles where id = c.created_by)));
  select min(visited_at) into d from public.contact_visits where contact_id = c.id and visited_at > c.created_at + interval '1 hour';
  if d is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'visita', 'label', 'Lo volvieron a visitar', 'at', d)); end if;
  select min(visited_at) into d from public.contact_visits where contact_id = c.id and promise_day is not null;
  if d is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'promesa', 'label', 'Prometió venir', 'at', d)); end if;
  select min(attended_on) into dd from public.attendances where contact_id = c.id;
  if dd is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'vino', 'label', 'Vino por primera vez a la iglesia', 'at', dd)); end if;
  if c.discipleship_since is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'discipulado', 'label', 'Empezó discipulado', 'at', c.discipleship_since)); end if;
  select min(on_date) into dd from public.class_attendance where contact_id = c.id and present;
  if dd is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'clase', 'label', 'Empezó la escuela dominical', 'at', dd)); end if;
  select min(a.attended_on) into dd from public.attendances a
    where a.contact_id = c.id and extract(dow from a.attended_on) = 0
      and exists (select 1 from public.attendances b where b.contact_id = c.id and b.attended_on = a.attended_on - 1);
  if dd is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'ambos', 'label', 'Vino sábado y domingo el mismo fin de semana', 'at', dd)); end if;
  if c.member_since is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'miembro', 'label', 'Miembro de la iglesia', 'at', c.member_since)); end if;
  if c.baptized_on is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'bautismo', 'label', 'Se bautizó', 'at', c.baptized_on)); end if;
  if c.profile_id is not null then
    select min(started_at) into d from public.sessions where user_id = c.profile_id and kind = 'soulwinning';
    if d is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'evangelismo', 'label', 'Salió a evangelizar', 'at', d)); end if;
    select min(joined_at) into d from public.ministry_members where profile_id = c.profile_id;
    if d is not null then v := v || jsonb_build_array(jsonb_build_object('step', 'ministerio', 'label', 'Empezó a servir en un ministerio', 'at', d)); end if;
  end if;
  return (select coalesce(jsonb_agg(e order by (e->>'at')::timestamptz), '[]'::jsonb) from jsonb_array_elements(v) e);
end $$;

-- Quiénes faltaron el fin de semana (sábado p_saturday y domingo siguiente).
-- Pastor/secretaría: miembros. Capitán: la gente de su colectivo.
create or replace function public.weekend_absences(p_saturday date)
returns table (contact_id uuid, name text, photo_path text, phone text, status text, group_id uuid, group_name text, last_attended date)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.photo_path, c.phone, c.status, c.group_id, g.name,
         (select max(a.attended_on) from public.attendances a where a.contact_id = c.id)
  from public.contacts c
  left join public.groups g on g.id = c.group_id
  where c.church_id = public.current_church_id() and not c.archived
    and (
      (public.is_staff() and c.status = 'member')
      or (public.current_role_name()::text = 'captain' and c.group_id = public.current_group_id())
    )
    and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (p_saturday, p_saturday + 1))
  order by g.name nulls first, c.name
$$;

-- Lo que me toca: turnos y clases de los próximos días.
create or replace function public.my_upcoming(p_days integer default 21)
returns table (kind text, id uuid, on_date date, title text, detail text, ministry_id uuid, class_id uuid, material_id uuid)
language sql stable security definer set search_path = public as $$
  select 'duty', d.id, d.on_date, m.name, d.task || coalesce(' · llegar ' || d.arrive_time, ''), d.ministry_id, null::uuid, null::uuid
  from public.duties d join public.ministries m on m.id = d.ministry_id
  where d.profile_id = auth.uid() and d.on_date between current_date and current_date + p_days
  union all
  select case when s.teacher_id = auth.uid() then 'class' else 'class_helper' end, s.id, s.on_date, k.name,
         coalesce((select mt.series || ' · ' || mt.title from public.materials mt where mt.id = s.material_id), 'Material a confirmar'),
         null::uuid, s.class_id, s.material_id
  from public.class_schedule s join public.classes k on k.id = s.class_id
  where (s.teacher_id = auth.uid() or s.helper_id = auth.uid()) and s.on_date between current_date and current_date + p_days
  order by 3, 4
$$;

-- ---------------------------------------------------------------------------
-- Avisos: notificación al teléfono (Expo) cuando se crea un aviso
-- ---------------------------------------------------------------------------
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (church_id, user_id, kind, title, body, link)
  select p.church_id, p.id, p_kind, p_title, p_body, p_link from public.profiles p where p.id = p_user and p.church_id is not null;
end $$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.send_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  select push_token into v_token from public.profiles where id = new.user_id;
  if v_token is null or v_token = '' then return new; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'net' and p.proname = 'http_post') then
    return new;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send',
          jsonb_build_object('to', v_token, 'title', new.title, 'body', new.body, 'sound', 'default',
                             'data', jsonb_build_object('link', new.link, 'id', new.id)),
          '{"Content-Type": "application/json"}'::jsonb;
  update public.notifications set push_sent_at = now() where id = new.id;
  return new;
exception when others then
  return new;   -- un aviso nunca debe romper lo que lo generó
end $$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.send_push();

-- Anuncios del líder: aviso a todos los del ministerio.
create or replace function public.ministry_announcement_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.kind <> 'announcement' then return new; end if;
  select name into v_name from public.ministries where id = new.ministry_id;
  insert into public.notifications (church_id, user_id, kind, title, body, link)
  select new.church_id, mm.profile_id, 'ministry', v_name, left(new.body, 180), '/ministerio/' || new.ministry_id
  from public.ministry_members mm where mm.ministry_id = new.ministry_id and mm.profile_id <> new.user_id;
  return new;
end $$;
drop trigger if exists ministry_messages_notify on public.ministry_messages;
create trigger ministry_messages_notify after insert on public.ministry_messages
  for each row execute function public.ministry_announcement_notify();

-- ---------------------------------------------------------------------------
-- Tareas programadas (corre cada hora; cada iglesia en su hora local)
-- ---------------------------------------------------------------------------
create or replace function public.job_once(p_church uuid, p_job text, p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.job_log (church_id, job, key) values (p_church, p_job, p_key);
  return true;
exception when unique_violation then
  return false;
end $$;

create or replace function public.run_weekly_reminders(p_church uuid, p_today date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_n integer := 0;
  v_days text[] := array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
begin
  for r in
    select d.*, m.name as ministry_name from public.duties d join public.ministries m on m.id = d.ministry_id
    where d.church_id = p_church and d.profile_id is not null and d.on_date between p_today and p_today + 6
  loop
    perform public.notify(r.profile_id, 'duty',
      'Esta semana tenés ' || lower(r.ministry_name),
      initcap(r.task) || ' el ' || v_days[extract(dow from r.on_date)::int + 1] || ' ' || to_char(r.on_date, 'DD/MM')
        || coalesce('. Llegá a las ' || r.arrive_time, '') || '. Orá antes y vení preparado.'
        || coalesce(' ' || r.note, ''),
      '/ministerio/' || r.ministry_id);
    v_n := v_n + 1;
  end loop;
  for r in
    select s.*, k.name as class_name, mt.series, mt.title as material_title
    from public.class_schedule s join public.classes k on k.id = s.class_id
    left join public.materials mt on mt.id = s.material_id
    where s.church_id = p_church and s.on_date between p_today and p_today + 6
  loop
    if r.teacher_id is not null then
      perform public.notify(r.teacher_id, 'class',
        'Esta semana das la clase ' || r.class_name,
        'El ' || v_days[extract(dow from r.on_date)::int + 1] || ' ' || to_char(r.on_date, 'DD/MM') || '. '
          || coalesce('Material: ' || r.series || ' · ' || r.material_title || '. Tocá para estudiarlo.', 'Todavía no tiene material asignado.'),
        case when r.material_id is not null then '/material/' || r.material_id else '/clase/' || r.class_id end);
      v_n := v_n + 1;
    end if;
    if r.helper_id is not null then
      perform public.notify(r.helper_id, 'class',
        'Esta semana ayudás en ' || r.class_name,
        'El ' || v_days[extract(dow from r.on_date)::int + 1] || ' ' || to_char(r.on_date, 'DD/MM') || '.',
        '/clase/' || r.class_id);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.run_absence_report(p_church uuid, p_sunday date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_sat date := p_sunday - 1;
  v_members integer;
  v_names text;
  r record;
  v_n integer := 0;
begin
  select count(*), string_agg(c.name, ', ' order by c.name) into v_members, v_names
  from public.contacts c
  where c.church_id = p_church and c.status = 'member' and not c.archived
    and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (v_sat, p_sunday));
  if v_members > 0 then
    for r in select id from public.profiles where church_id = p_church and role::text = 'admin' loop
      perform public.notify(r.id, 'absences',
        v_members || case when v_members = 1 then ' miembro no vino' else ' miembros no vinieron' end || ' este fin de semana',
        left(v_names, 300), '/ausencias?fecha=' || v_sat);
      v_n := v_n + 1;
    end loop;
  end if;
  for r in
    select g.id, g.name, g.captain_id,
           count(c.id) as n, string_agg(c.name, ', ' order by c.name) as names
    from public.groups g
    join public.contacts c on c.group_id = g.id and not c.archived
    where g.church_id = p_church and g.captain_id is not null
      and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on in (v_sat, p_sunday))
    group by g.id, g.name, g.captain_id
  loop
    perform public.notify(r.captain_id, 'absences',
      r.n || ' de ' || r.name || case when r.n = 1 then ' no vino' else ' no vinieron' end || ' este fin de semana',
      'Visitalos o escribiles esta semana: ' || left(r.names, 250), '/ausencias?fecha=' || v_sat);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.run_scheduled_jobs() returns integer
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_local timestamp;
  v_n integer := 0;
begin
  for c in select * from public.churches loop
    v_local := now() at time zone c.timezone;
    if extract(dow from v_local)::int = c.reminder_dow and extract(hour from v_local)::int = c.reminder_hour
       and public.job_once(c.id, 'weekly_reminders', v_local::date::text) then
      v_n := v_n + public.run_weekly_reminders(c.id, v_local::date);
    end if;
    if extract(dow from v_local)::int = c.absence_dow and extract(hour from v_local)::int = c.absence_hour
       and public.job_once(c.id, 'absences', v_local::date::text) then
      v_n := v_n + public.run_absence_report(c.id, v_local::date);
    end if;
  end loop;
  if extract(hour from now())::int = 7 then perform public.purge_old_track_points(30); end if;
  return v_n;
end $$;


-- ---------------------------------------------------------------------------
-- Roles: la secretaría administra personas, pero solo el pastor nombra administradores
-- ---------------------------------------------------------------------------
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
      or new.is_network_admin is distinct from old.is_network_admin)
     and not public.is_staff() then
    raise exception 'Solo un administrador puede cambiar rol, iglesia o grupo';
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

create or replace function public.set_member_role(p_user uuid, p_role public.member_role, p_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.is_staff() then raise exception 'Solo administradores o secretaría'; end if;
  select role::text into v_old from public.profiles where id = p_user and church_id = public.current_church_id();
  if v_old is null then raise exception 'Esa persona no es de tu iglesia'; end if;
  if (p_role::text = 'admin' or v_old = 'admin') and p_role::text <> v_old and not public.is_admin() then
    raise exception 'Solo el pastor (administrador) puede nombrar o quitar administradores';
  end if;
  if p_user = auth.uid() and v_old = 'admin' and p_role::text <> 'admin' then
    raise exception 'No te podés quitar el rol de administrador a vos mismo';
  end if;
  if p_group is not null and not exists (select 1 from public.groups where id = p_group and church_id = public.current_church_id()) then
    raise exception 'Ese grupo no es de tu iglesia';
  end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set role = p_role, group_id = p_group where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_member_role', p_user::text,
          jsonb_build_object('role', p_role, 'group', p_group));
end $$;

-- Las tablas nuevas tampoco son visibles sin iniciar sesión.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.church_services, public.classes, public.class_teachers,
  public.class_students, public.materials, public.class_schedule, public.class_attendance, public.ministries,
  public.ministry_members, public.ministry_messages, public.duties, public.sermons to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant all on public.church_services, public.classes, public.class_teachers, public.class_students, public.materials,
  public.class_schedule, public.class_attendance, public.ministries, public.ministry_members, public.ministry_messages,
  public.duties, public.notifications, public.job_log, public.sermons to service_role;

revoke all on all functions in schema public from anon, public;
grant execute on function
  public.is_staff(), public.is_captain_or_admin(), public.start_session(text), public.upsert_coverage(uuid, jsonb),
  public.coverage_in_bbox(double precision, double precision, double precision, double precision),
  public.side_history(bigint, integer, smallint, text), public.team_live(),
  public.trim_session(uuid, timestamptz, boolean), public.is_teacher_of(uuid), public.is_any_teacher(),
  public.teaches_contact(uuid), public.is_ministry_member(uuid), public.is_ministry_leader(uuid),
  public.can_take_attendance(), public.can_see_contact_private(public.contacts), public.can_see_contact(public.contacts),
  public.can_edit_contact(public.contacts), public.join_church(text, text, text), public.link_account(uuid, uuid),
  public.set_attendance(uuid, date, uuid, boolean), public.record_attendance(uuid, date, text),
  public.attendance_sheet(date, uuid), public.people_engagement(integer), public.person_journey(uuid),
  public.weekend_absences(date), public.my_upcoming(integer), public.ensure_my_card()
to authenticated;
-- Las funciones de trabajos programados no las puede llamar la app.
revoke all on function public.run_scheduled_jobs(), public.run_weekly_reminders(uuid, date),
  public.run_absence_report(uuid, date), public.job_once(uuid, text, text), public.purge_old_track_points(integer),
  public.ensure_default_services(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Archivos (fotos, material, audios): cada iglesia en su propia carpeta
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit) values
      ('photos', 'photos', false, 5242880),
      ('materials', 'materials', false, 52428800),
      ('sermons', 'sermons', false, 52428800)
    on conflict (id) do nothing;

    drop policy if exists lamies_read on storage.objects;
    create policy lamies_read on storage.objects for select to authenticated
      using (bucket_id in ('photos', 'materials', 'sermons')
             and (storage.foldername(name))[1] = public.current_church_id()::text);
    drop policy if exists lamies_photos_insert on storage.objects;
    create policy lamies_photos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_church_id()::text);
    drop policy if exists lamies_materials_insert on storage.objects;
    create policy lamies_materials_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'materials' and (storage.foldername(name))[1] = public.current_church_id()::text
                  and (public.is_staff() or public.is_any_teacher()));
    drop policy if exists lamies_sermons_insert on storage.objects;
    create policy lamies_sermons_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'sermons' and (storage.foldername(name))[1] = public.current_church_id()::text and public.is_staff());
    drop policy if exists lamies_staff_delete on storage.objects;
    create policy lamies_staff_delete on storage.objects for delete to authenticated
      using (bucket_id in ('photos', 'materials', 'sermons')
             and (storage.foldername(name))[1] = public.current_church_id()::text and public.is_staff());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Programar la tarea de cada hora (si el servidor lo permite)
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then null;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then null;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      if exists (select 1 from cron.job where jobname = 'lamies-hourly') then
        perform cron.unschedule('lamies-hourly');
      end if;
      perform cron.schedule('lamies-hourly', '7 * * * *', 'select public.run_scheduled_jobs()');
    exception when others then
      raise notice 'No se pudo programar la tarea: %', sqlerrm;
    end;
  end if;
end $$;

-- Tiempo real para el chat y los avisos.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.ministry_messages, public.notifications;
    exception when others then null;
    end;
  end if;
end $$;

-- ---------- supabase/migrations/0005_attendance_takers.sql ----------
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

-- ---------- supabase/seed.sql ----------
-- ============================================================================
-- La Mies · datos iniciales. Correr UNA vez después de las migraciones,
-- en Supabase → SQL Editor.
-- ============================================================================

-- El código para unirse se genera al azar (nadie lo puede adivinar). Se muestra al final.
insert into public.churches (name, city, country, join_code, timezone, grouping)
select 'Iglesia Bautista Victoria', 'Posadas', 'AR',
       'VICTORIA-' || upper(substr(md5(gen_random_uuid()::text), 1, 5)),
       'America/Argentina/Buenos_Aires', 'bus_routes'
where not exists (select 1 from public.churches where name = 'Iglesia Bautista Victoria');

-- Material de capacitación de ejemplo (para todas las iglesias). Editalo o borralo.
insert into public.training_items (church_id, category, title, kind, summary, body, minutes, sort_order) values
(null, 'Antes de salir', 'Qué llevar y cómo prepararse', 'article',
 'Diez minutos de preparación hacen que la salida rinda el doble.',
 '# Antes de salir
- Orá por las casas que vas a visitar y por tu compañero.
- Llevá tratados, una Biblia chica, lapicera y el teléfono con batería.
- Revisá en el mapa qué veredas ya están cubiertas y elegí un sector nuevo.
- Salí de a dos siempre que puedas.

## Cuando llegás a la cuadra
- Tocá "Iniciar salida" recién cuando empezás a caminar la cuadra, no desde la iglesia.
- Fijate que la app diga la vereda correcta; si no, tocá el cartel y la cambia.', 3, 10),
(null, 'Al tocar la puerta', 'Cómo presentarte en 20 segundos', 'article',
 'Sonreí, decí tu nombre y el de la iglesia, y hacé una pregunta sencilla.',
 '# Cómo presentarte
"Buenas tardes, mi nombre es ___ y soy de la Iglesia Bautista ___, acá a unas cuadras. Estamos pasando por el barrio para invitar a las familias y dejarles este folleto. ¿Puedo hacerle una pregunta rápida?"

## Consejos
- No te pares pegado a la puerta: un paso atrás, manos a la vista.
- Si hay perro, esperá en la vereda y llamá desde ahí.
- Si no tienen tiempo, dejá el tratado y preguntá si podés volver otro día. Anotalo en la app.', 4, 20),
(null, 'Preguntas difíciles', '"Yo ya soy católico / evangélico"', 'article',
 'No discutas la religión; hablá de la relación con Dios.',
 '# "Yo ya tengo mi religión"
- Agradecé y afirmá: "Qué bueno que cree en Dios".
- Pasá de la religión a la persona: "¿Puedo hacerle una pregunta? Si hoy falleciera, ¿está seguro de que iría al cielo?"
- Si duda, ofrecé mostrarle en la Biblia cómo se puede estar seguro:

## Romanos 10:9-13
que si confesares con tu boca que Jesús es el Señor, y creyeres en tu corazón que Dios le levantó de los muertos, serás salvo. Porque con el corazón se cree para justicia, pero con la boca se confiesa para salvación. Pues la Escritura dice: Todo aquel que en él creyere, no será avergonzado. Porque no hay diferencia entre judío y griego, pues el mismo que es Señor de todos, es rico para con todos los que le invocan; porque todo aquel que invocare el nombre del Señor, será salvo

- Si no quiere seguir, dejá la invitación con cariño. Lo importante es la puerta abierta para la próxima.', 5, 30);

-- Resultado: anotá este código. Lo vas a usar para crear tu cuenta en la app.
select name as iglesia, join_code as codigo_para_unirse from public.churches;

-- ---------- supabase/seed_victoria_2.sql ----------
-- ============================================================================
-- La Mies · Parte 2 · Datos iniciales de Iglesia Bautista Victoria
-- Se puede correr más de una vez: no duplica nada.
-- ============================================================================
do $$
declare
  v_church uuid;
begin
  select id into v_church from public.churches order by created_at limit 1;
  if v_church is null then
    raise notice 'No hay iglesia todavía';
    return;
  end if;

  update public.churches set name = 'Iglesia Bautista Victoria', city = coalesce(city, 'Posadas'), grouping = 'bus_routes'
  where id = v_church and name ilike '%victoria%';

  -- Colectivo
  if not exists (select 1 from public.groups where church_id = v_church and name = 'El Porvenir') then
    insert into public.groups (church_id, name) values (v_church, 'El Porvenir');
  end if;

  -- Reuniones (reemplaza las dos de fábrica si todavía no se usaron)
  if not exists (select 1 from public.church_services where church_id = v_church and name = 'Jóvenes') then
    delete from public.church_services s where s.church_id = v_church
      and s.name in ('Culto del sábado', 'Culto del domingo')
      and not exists (select 1 from public.attendances a where a.service_id = s.id);
    insert into public.church_services (church_id, name, dow, time, main, sort_order)
    select v_church, x.name, x.dow, x.time, x.main, x.sort_order
    from (values
      ('Jóvenes', 6, '10:00', false, 10),
      ('Oración', 6, '17:30', false, 20),
      ('Culto del sábado', 6, '19:00', true, 30),
      ('Culto del domingo', 0, '10:00', true, 40)
    ) as x(name, dow, time, main, sort_order)
    where not exists (select 1 from public.church_services s where s.church_id = v_church and s.name = x.name);
  end if;

  -- Clases de escuela dominical (sábado y domingo)
  insert into public.classes (church_id, name, age_min, age_max, days, sort_order)
  select v_church, x.name, x.a, x.b, '{sat,sun}', x.o
  from (values ('Cuna (0 a 2 años)', 0, 2, 10), ('Niños (2 a 6 años)', 2, 6, 20), ('Niños (6 a 12 años)', 6, 12, 30))
    as x(name, a, b, o)
  where not exists (select 1 from public.classes k where k.church_id = v_church and k.name = x.name);

  -- Ministerios
  insert into public.ministries (church_id, name, description, icon, can_take_attendance, is_teaching, sort_order)
  select v_church, x.name, x.d, x.icon, x.att, x.teach, x.o
  from (values
    ('Enseñanza', 'Maestros y ayudantes de las clases de los chicos.', 'book-open', false, true, 10),
    ('Recepción', 'Recibir a cada persona en la puerta, saludar a las visitas y tomar asistencia.', 'smile', true, false, 20),
    ('Oración', 'Orar por la iglesia, las visitas y las salidas de evangelismo.', 'heart', false, false, 30),
    ('Limpieza', 'Dejar el templo limpio y listo antes y después de cada reunión.', 'droplet', false, false, 40),
    ('Desayuno', 'Preparar y servir el desayuno del domingo a las 9:30.', 'coffee', false, false, 50)
  ) as x(name, d, icon, att, teach, o)
  where not exists (select 1 from public.ministries m where m.church_id = v_church and m.name = x.name);

  -- Recomendaciones de ejemplo (el líder las puede borrar o cambiar)
  if exists (select 1 from public.profiles where church_id = v_church) then
    insert into public.ministry_messages (church_id, ministry_id, user_id, kind, body)
    select v_church, m.id, (select id from public.profiles where church_id = v_church order by (role::text = 'admin') desc, created_at limit 1),
           'recommendation', x.body
    from public.ministries m
    join (values
      ('Recepción', 'Llegá una hora antes. Saludá a cada persona por su nombre, sonreí y ayudá a las visitas a encontrar lugar. Anotá a cada visita nueva en la app.'),
      ('Limpieza', 'Revisá baños, sillas y el piso del templo antes de cada reunión. Avisá al líder si falta algún producto.'),
      ('Desayuno', 'Llegá a las 8:30. Tené todo listo a las 9:30 y dejá la cocina limpia antes del culto de las 10.'),
      ('Enseñanza', 'Estudiá el capítulo de la semana con tiempo y llegá 20 minutos antes para preparar el aula.')
    ) as x(name, body) on x.name = m.name
    where m.church_id = v_church
      and not exists (select 1 from public.ministry_messages mm where mm.ministry_id = m.id and mm.kind = 'recommendation');
  end if;
end $$;

select c.name as iglesia,
       (select count(*) from public.church_services s where s.church_id = c.id) as reuniones,
       (select count(*) from public.classes k where k.church_id = c.id) as clases,
       (select count(*) from public.ministries m where m.church_id = c.id) as ministerios
from public.churches c;
-- ============================================================================
-- La Mies · Parte 3 · Versículo del día, devocional, racha de lectura,
-- DNI y bautismo en la ficha, cuentas desactivadas.
-- Se puede correr más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Ficha: DNI (opcional) y bautismo como casilla
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column if not exists dni text,
  add column if not exists baptized boolean not null default false;
update public.contacts set baptized = true where baptized_on is not null and not baptized;

-- Cuentas desactivadas por el pastor: no pueden entrar a los datos de la iglesia.
alter table public.profiles add column if not exists disabled_at timestamptz;

create or replace function public.current_church_id() returns uuid
language sql stable security definer set search_path = public as $$
  select church_id from public.profiles where id = auth.uid() and disabled_at is null
$$;

create or replace function public.set_account_disabled(p_user uuid, p_disabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not public.is_admin() then raise exception 'Solo el pastor (administrador)'; end if;
  select role::text into v_role from public.profiles where id = p_user and church_id = public.current_church_id();
  if v_role is null then raise exception 'Esa persona no es de tu iglesia'; end if;
  if p_user = auth.uid() then raise exception 'No podés desactivar tu propia cuenta'; end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set disabled_at = case when p_disabled then now() end, push_token = case when p_disabled then null else push_token end where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_account_disabled', p_user::text, jsonb_build_object('disabled', p_disabled));
end $$;
grant execute on function public.set_account_disabled(uuid, boolean) to authenticated;

-- El guard de perfiles también protege disabled_at.
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
      or new.takes_attendance is distinct from old.takes_attendance
      or new.disabled_at is distinct from old.disabled_at)
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

-- Lista de cuentas con su estado (para el pastor): correo, 2FA, desactivada.
create or replace function public.accounts_overview()
returns table (id uuid, display_name text, email text, role text, disabled_at timestamptz, has_mfa boolean, last_sign_in timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.role::text, p.disabled_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
         u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_staff() and p.church_id = public.current_church_id()
  order by p.display_name
$$;
grant execute on function public.accounts_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Versículo del día y devocional
--   church_id null = contenido general para todas las iglesias.
--   Cada iglesia puede cargar el suyo para una fecha; si existe, gana sobre el general.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_content (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references public.churches(id) on delete cascade,
  on_date     date not null,
  reference   text not null,                 -- "Juan 3:16"
  verse       text not null,                 -- texto RV1960 completo
  message     text,                          -- frase corta para la tarjeta (historia)
  devotional  text,                          -- lectura del día (varios párrafos)
  background  text not null default 'campo', -- fondo: nombre de un fondo incluido o ruta en el bucket "photos"
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (church_id, on_date)
);
create unique index if not exists daily_content_global_idx on public.daily_content (on_date) where church_id is null;
alter table public.daily_content enable row level security;
drop policy if exists daily_content_select on public.daily_content;
create policy daily_content_select on public.daily_content for select to authenticated
  using (church_id is null or church_id = public.current_church_id());
drop policy if exists daily_content_write on public.daily_content;
create policy daily_content_write on public.daily_content for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());
grant select, insert, update, delete on public.daily_content to authenticated;
grant all on public.daily_content to service_role;
-- Desde la app siempre se guarda para la iglesia de quien lo carga; el contenido general lo carga el sistema.
create or replace function public.daily_content_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.church_id := public.current_church_id();
    new.created_by := auth.uid();
    if new.church_id is null then raise exception 'La persona no pertenece a ninguna iglesia'; end if;
  end if;
  return new;
end $$;
drop trigger if exists daily_content_stamp on public.daily_content;
create trigger daily_content_stamp before insert on public.daily_content
  for each row execute function public.daily_content_stamp();

-- Lo de hoy (o de una fecha): primero lo de la iglesia, si no lo general,
-- si no hay nada para esa fecha, se elige uno general rotando por el día del año.
create or replace function public.daily_for(p_date date default null)
returns public.daily_content
language plpgsql stable security definer set search_path = public as $$
declare
  d date := coalesce(p_date, (now() at time zone coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires'))::date);
  r public.daily_content;
  n integer;
begin
  select * into r from public.daily_content where church_id = public.current_church_id() and on_date = d;
  if r.id is not null then return r; end if;
  select * into r from public.daily_content where church_id is null and on_date = d;
  if r.id is not null then return r; end if;
  select count(*) into n from public.daily_content where church_id is null;
  if n = 0 then return null; end if;
  select * into r from public.daily_content where church_id is null
  order by id offset (extract(doy from d)::int % n) limit 1;
  r.on_date := d;
  return r;
end $$;
grant execute on function public.daily_for(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Racha de lectura: un registro por persona y día en que abrió el devocional
-- ---------------------------------------------------------------------------
create table if not exists public.reading_log (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  on_date  date not null,
  read_at  timestamptz not null default now(),
  primary key (user_id, on_date)
);
alter table public.reading_log enable row level security;
drop policy if exists reading_log_own on public.reading_log;
create policy reading_log_own on public.reading_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.reading_log to authenticated;
grant all on public.reading_log to service_role;

-- Marca la lectura de hoy y devuelve la racha actual, la mejor y los premios.
create or replace function public.mark_reading()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  d date := (now() at time zone v_tz)::date;
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  insert into public.reading_log (user_id, on_date) values (auth.uid(), d) on conflict do nothing;
  return public.reading_streak();
end $$;
grant execute on function public.mark_reading() to authenticated;

create or replace function public.reading_streak()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  today date := (now() at time zone v_tz)::date;
  cur integer := 0;
  best integer := 0;
  run integer := 0;
  prev date := null;
  r record;
  total integer := 0;
  read_today boolean := false;
begin
  for r in select on_date from public.reading_log where user_id = auth.uid() order by on_date loop
    total := total + 1;
    if prev is not null and r.on_date = prev + 1 then run := run + 1; else run := 1; end if;
    if run > best then best := run; end if;
    prev := r.on_date;
  end loop;
  -- La racha actual sigue viva si leyó hoy o ayer.
  if prev is not null and (prev = today or prev = today - 1) then cur := run; else cur := 0; end if;
  read_today := (prev = today);
  return jsonb_build_object(
    'current', cur, 'best', best, 'total', total, 'read_today', read_today,
    'rewards', jsonb_build_array(
      jsonb_build_object('days', 7,   'label', 'Una semana',  'earned', best >= 7),
      jsonb_build_object('days', 30,  'label', 'Un mes',      'earned', best >= 30),
      jsonb_build_object('days', 365, 'label', 'Un año',      'earned', best >= 365)));
end $$;
grant execute on function public.reading_streak() to authenticated;

-- Las rachas de la iglesia (para animar): quiénes van mejor.
create or replace function public.reading_board()
returns table (user_id uuid, display_name text, photo_path text, current_streak integer, best_streak integer)
language sql stable security definer set search_path = public as $$
  with tz as (select coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires') as tz),
  logs as (
    select l.user_id, l.on_date,
           l.on_date - (row_number() over (partition by l.user_id order by l.on_date))::int as grp
    from public.reading_log l join public.profiles p on p.id = l.user_id
    where p.church_id = public.current_church_id()
  ),
  runs as (select user_id, grp, count(*)::int as len, max(on_date) as last_day from logs group by user_id, grp)
  select p.id, p.display_name, c.photo_path,
         coalesce((select len from runs r, tz where r.user_id = p.id and r.last_day >= (now() at time zone tz.tz)::date - 1 order by last_day desc limit 1), 0),
         coalesce((select max(len) from runs r where r.user_id = p.id), 0)
  from public.profiles p
  left join public.contacts c on c.profile_id = p.id
  where p.church_id = public.current_church_id() and p.disabled_at is null
    and exists (select 1 from public.reading_log l where l.user_id = p.id)
  order by 4 desc, 5 desc, 2
$$;
grant execute on function public.reading_board() to authenticated;

-- ---------------------------------------------------------------------------
-- Versículos generales (RV1960) para que nunca falte el del día.
-- Las iglesias agregan los suyos con devocional desde la app.
-- ---------------------------------------------------------------------------
insert into public.daily_content (church_id, on_date, reference, verse, message, background)
select null, ('2026-01-01'::date + (row_number() over () - 1)::int), x.ref, x.verse, x.msg, x.bg
from (values
  ('Juan 3:16', 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.', 'Dios te amó primero.', 'cielo'),
  ('Mateo 9:37', 'Entonces dijo a sus discípulos: A la verdad la mies es mucha, mas los obreros pocos.', 'Hoy alguien necesita oír de Jesús.', 'campo'),
  ('Romanos 10:13', 'porque todo aquel que invocare el nombre del Señor, será salvo.', 'La puerta está abierta para todos.', 'amanecer'),
  ('Salmos 119:105', 'Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.', 'Dejá que la Biblia guíe tu día.', 'noche'),
  ('Proverbios 3:5-6', 'Fíate de Jehová de todo tu corazón, Y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, Y él enderezará tus veredas.', 'Confiá, aunque no entiendas.', 'rio'),
  ('Filipenses 4:13', 'Todo lo puedo en Cristo que me fortalece.', 'No estás solo en esto.', 'montana'),
  ('Isaías 41:10', 'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia.', 'Dios está con vos hoy.', 'cielo'),
  ('Salmos 23:1', 'Jehová es mi pastor; nada me faltará.', 'Él cuida de vos.', 'campo'),
  ('Romanos 8:28', 'Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.', 'Nada se desperdicia en las manos de Dios.', 'amanecer'),
  ('Mateo 11:28', 'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.', 'Descansá en Jesús.', 'rio'),
  ('Josué 1:9', 'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.', 'Sé valiente hoy.', 'montana'),
  ('Salmos 46:1', 'Dios es nuestro amparo y fortaleza, Nuestro pronto auxilio en las tribulaciones.', 'Él es tu refugio.', 'noche'),
  ('Juan 14:6', 'Jesús le dijo: Yo soy el camino, y la verdad, y la vida; nadie viene al Padre, sino por mí.', 'Un solo camino: Jesús.', 'cielo'),
  ('Hechos 1:8', 'pero recibiréis poder, cuando haya venido sobre vosotros el Espíritu Santo, y me seréis testigos en Jerusalén, en toda Judea, en Samaria, y hasta lo último de la tierra.', 'Sos testigo donde estás.', 'campo'),
  ('Romanos 5:8', 'Mas Dios muestra su amor para con nosotros, en que siendo aún pecadores, Cristo murió por nosotros.', 'Te amó cuando no lo merecías.', 'amanecer'),
  ('2 Corintios 5:17', 'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.', 'Hoy podés empezar de nuevo.', 'rio'),
  ('Salmos 37:5', 'Encomienda a Jehová tu camino, Y confía en él; y él hará.', 'Entregale tu día.', 'montana'),
  ('Marcos 16:15', 'Y les dijo: Id por todo el mundo y predicad el evangelio a toda criatura.', 'Contale a alguien hoy.', 'campo'),
  ('1 Juan 1:9', 'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados, y limpiarnos de toda maldad.', 'Hay perdón para vos.', 'noche'),
  ('Hebreos 13:8', 'Jesucristo es el mismo ayer, y hoy, y por los siglos.', 'Él no cambia.', 'cielo'),
  ('Salmos 118:24', 'Este es el día que hizo Jehová; Nos gozaremos y alegraremos en él.', 'Alegrate: hoy es un regalo.', 'amanecer'),
  ('Mateo 6:33', 'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.', 'Dios primero, lo demás viene.', 'campo'),
  ('Jeremías 29:11', 'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz, y no de mal, para daros el fin que esperáis.', 'Dios tiene un plan para vos.', 'rio'),
  ('Efesios 2:8-9', 'Porque por gracia sois salvos por medio de la fe; y esto no de vosotros, pues es don de Dios; no por obras, para que nadie se gloríe.', 'La salvación es un regalo.', 'cielo'),
  ('Santiago 1:5', 'Y si alguno de vosotros tiene falta de sabiduría, pídala a Dios, el cual da a todos abundantemente y sin reproche, y le será dada.', 'Pedile sabiduría hoy.', 'montana'),
  ('Salmos 34:8', 'Gustad, y ved que es bueno Jehová; Dichoso el hombre que confía en él.', 'Dios es bueno.', 'amanecer'),
  ('1 Pedro 5:7', 'echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.', 'Dale tus preocupaciones.', 'noche'),
  ('Lucas 19:10', 'Porque el Hijo del Hombre vino a buscar y a salvar lo que se había perdido.', 'Jesús vino por los perdidos.', 'campo'),
  ('Salmos 27:1', 'Jehová es mi luz y mi salvación; ¿de quién temeré? Jehová es la fortaleza de mi vida; ¿de quién he de atemorizarme?', 'Sin miedo.', 'cielo'),
  ('Gálatas 2:20', 'Con Cristo estoy juntamente crucificado, y ya no vivo yo, mas vive Cristo en mí; y lo que ahora vivo en la carne, lo vivo en la fe del Hijo de Dios, el cual me amó y se entregó a sí mismo por mí.', 'Cristo vive en vos.', 'rio'),
  ('Colosenses 3:23', 'Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres;', 'Trabajá hoy para el Señor.', 'montana'),
  ('Salmos 91:1', 'El que habita al abrigo del Altísimo Morará bajo la sombra del Omnipotente.', 'Quedate cerca de Él.', 'noche'),
  ('Juan 10:10', 'El ladrón no viene sino para hurtar y matar y destruir; yo he venido para que tengan vida, y para que la tengan en abundancia.', 'Jesús da vida en abundancia.', 'amanecer'),
  ('Romanos 12:2', 'No os conforméis a este siglo, sino transformaos por medio de la renovación de vuestro entendimiento, para que comprobéis cuál sea la buena voluntad de Dios, agradable y perfecta.', 'Renová tu mente hoy.', 'cielo'),
  ('Salmos 51:10', 'Crea en mí, oh Dios, un corazón limpio, Y renueva un espíritu recto dentro de mí.', 'Un corazón limpio.', 'rio'),
  ('Mateo 28:19-20', 'Por tanto, id, y haced discípulos a todas las naciones, bautizándolos en el nombre del Padre, y del Hijo, y del Espíritu Santo; enseñándoles que guarden todas las cosas que os he mandado; y he aquí yo estoy con vosotros todos los días, hasta el fin del mundo. Amén.', 'Él está con vos todos los días.', 'campo'),
  ('Proverbios 18:10', 'Torre fuerte es el nombre de Jehová; A él correrá el justo, y será levantado.', 'Corré a Él.', 'montana'),
  ('1 Tesalonicenses 5:16-18', 'Estad siempre gozosos. Orad sin cesar. Dad gracias en todo, porque esta es la voluntad de Dios para con vosotros en Cristo Jesús.', 'Gozo, oración, gratitud.', 'amanecer'),
  ('Salmos 100:4', 'Entrad por sus puertas con acción de gracias, Por sus atrios con alabanza; Alabadle, bendecid su nombre.', 'Empezá con gratitud.', 'cielo'),
  ('Isaías 40:31', 'pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.', 'Fuerzas nuevas para hoy.', 'montana')
) as x(ref, verse, msg, bg)
where not exists (select 1 from public.daily_content where church_id is null);
-- ============================================================================
-- La Mies · Pedido de eliminación de cuenta (lo exige Google Play).
-- La persona lo pide desde Ajustes; el pastor y la secretaría reciben un aviso
-- y lo ven en Cuentas. Se puede correr más de una vez.
-- ============================================================================
alter table public.profiles add column if not exists deletion_requested_at timestamptz;

create or replace function public.request_account_deletion()
returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.profiles;
begin
  select * into v_p from public.profiles where id = auth.uid();
  if v_p.id is null then raise exception 'No hay sesión'; end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set deletion_requested_at = now(), push_token = null where id = v_p.id;
  perform set_config('lamies.bypass_guard', 'off', true);
  if v_p.church_id is not null then
    insert into public.notifications (church_id, user_id, kind, title, body, link)
    select v_p.church_id, p.id, 'account', 'Pedido de eliminar cuenta',
           v_p.display_name || ' pidió eliminar su cuenta de La Mies. Hay que hacerlo dentro de los 10 días hábiles.',
           '/admin/cuentas'
    from public.profiles p
    where p.church_id = v_p.church_id and p.role::text in ('admin', 'secretary') and p.id <> v_p.id;
    insert into public.audit_log (church_id, actor_id, action, target)
    values (v_p.church_id, v_p.id, 'request_account_deletion', v_p.id::text);
  end if;
end $$;
grant execute on function public.request_account_deletion() to authenticated;

-- Pedidos pendientes, para la pantalla Cuentas (pastor y secretaría).
create or replace function public.account_deletion_requests()
returns table (id uuid, deletion_requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.deletion_requested_at
  from public.profiles p
  where public.is_staff() and p.church_id = public.current_church_id() and p.deletion_requested_at is not null
$$;
grant execute on function public.account_deletion_requests() to authenticated;
-- ============================================================================
-- La Mies · Registro de errores de la app (para arreglarlos sin tener el teléfono en la mano).
-- Cada persona solo puede anotar; nadie los lee desde la app (se leen desde la base).
-- ============================================================================
create table if not exists public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  church_id   uuid references public.churches(id) on delete set null,
  platform    text,
  app_version text,
  message     text not null,
  stack       text,
  info        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
grant all on public.app_errors to service_role;

create or replace function public.log_app_error(p_message text, p_stack text default null, p_info jsonb default null,
                                                p_platform text default null, p_version text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_errors (user_id, church_id, platform, app_version, message, stack, info)
  values (auth.uid(), (select church_id from public.profiles where id = auth.uid()), p_platform, p_version,
          left(coalesce(p_message, 'sin mensaje'), 2000), left(p_stack, 8000), p_info);
  -- Se guardan como máximo 2000; los más viejos se van borrando.
  delete from public.app_errors where id in (select id from public.app_errors order by created_at desc offset 2000);
end $$;
grant execute on function public.log_app_error(text, text, jsonb, text, text) to authenticated, anon;
