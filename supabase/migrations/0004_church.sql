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
