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
