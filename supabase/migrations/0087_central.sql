-- 0087: La Mies Central. El panel del equipo de La Mies (la iglesia que hospeda la app) para ver todas las iglesias de la red.
-- Todo es aditivo: tablas nuevas, funciones nuevas, y un cambio de UNA condición en alta_import y alta_batch_undo
-- (para que el equipo designado también pueda cargar la lista de una iglesia que lo pidió).
--
-- LA REGLA DE PRIVACIDAD (no se negocia): Central nunca muestra personas de otra iglesia. Ni nombres, ni teléfonos, ni domicilios,
-- ni notas, ni pedidos de oración, ni chats, ni ofrendas, ni asistencia por persona. Tampoco plata: solo "usa Finanzas: sí o no".
-- Central lee SOLO con las funciones central_* de este archivo, que devuelven cantidades y datos de la iglesia (no de su gente).
-- El equipo no gana ningún permiso sobre las tablas de siempre: las políticas de las tablas no se tocan.
-- Las únicas personas que aparecen son las que escribieron ellas mismas al equipo (un pedido de ayuda o una idea) y el pastor
-- con los datos que dio al anotarse.

-- ---------------------------------------------------------------------------
-- 1. Tablas (todas cerradas: sin políticas, se leen y escriben solo con las funciones de abajo)
-- ---------------------------------------------------------------------------
-- El equipo de La Mies: a quién de su iglesia le dio acceso el dueño de la red.
create table if not exists public.central_staff (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  note       text check (note is null or length(note) <= 200),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null
);

-- Los números de cada iglesia, semana por semana (lunes a domingo, en la hora de esa iglesia). Los calcula una tarea programada.
create table if not exists public.central_church_weeks (
  church_id     uuid not null references public.churches(id) on delete cascade,
  week_start    date not null,
  accounts      integer not null default 0,   -- cuentas que había al terminar la semana
  people        integer not null default 0,   -- fichas de personas que había al terminar la semana
  new_people    integer not null default 0,
  attendance    integer not null default 0,   -- asistencias de la semana (todas las reuniones)
  visitors      integer not null default 0,   -- personas que vinieron y no son miembros
  first_time    integer not null default 0,
  services      jsonb   not null default '[]'::jsonb,  -- [{ name, dow, count }]: total por reunión, sin personas
  saved         integer not null default 0,
  baptisms      integer not null default 0,
  new_members   integer not null default 0,
  decisions     integer not null default 0,
  outings       integer not null default 0,
  people_out    integer not null default 0,
  houses        integer not null default 0,
  contacts_met  integer not null default 0,
  gospel        integer not null default 0,
  classes       integer not null default 0,
  class_present integer not null default 0,
  events        integer not null default 0,
  event_regs    integer not null default 0,
  devo_reads    integer not null default 0,
  devo_likes    integer not null default 0,
  active_users  integer not null default 0,
  errors        integer not null default 0,
  help_requests integer not null default 0,
  computed_at   timestamptz not null default now(),
  primary key (church_id, week_start)
);
create index if not exists central_church_weeks_week_idx on public.central_church_weeks (week_start);

-- Quién abrió la app cada día, con qué aparato, versión e idioma. Sirve para contar "usuarios activos" y versiones en uso.
create table if not exists public.central_seen (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  church_id   uuid references public.churches(id) on delete cascade,
  platform    text,
  app_version text,
  lang        text,
  primary key (user_id, day)
);
create index if not exists central_seen_church_idx on public.central_seen (church_id, day);

-- Pedidos de ayuda: cada "Necesito ayuda" de cualquier iglesia.
create table if not exists public.central_help_requests (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references public.churches(id) on delete cascade,
  church_name text,                 -- solo cuando todavía no tiene iglesia (se está anotando)
  created_by  uuid references public.profiles(id) on delete set null,
  asker_name  text,
  asker_role  text,
  asker_phone text,
  asker_email text,
  step        text check (step is null or length(step) <= 160),
  screen      text check (screen is null or length(screen) <= 160),
  message     text check (message is null or length(message) <= 2000),
  status      text not null default 'open' check (status in ('open', 'progress', 'done')),
  assignee    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists central_help_status_idx on public.central_help_requests (status, created_at desc);
create index if not exists central_help_church_idx on public.central_help_requests (church_id, created_at desc);

-- Notas internas del equipo sobre un pedido (la iglesia no las ve).
create table if not exists public.central_help_notes (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.central_help_requests(id) on delete cascade,
  author     uuid references public.profiles(id) on delete set null,
  body       text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists central_help_notes_req_idx on public.central_help_notes (request_id, created_at);

-- Ideas y recomendaciones que un pastor o administrador le manda a La Mies (no es la caja de sugerencias de su iglesia).
create table if not exists public.central_ideas (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  author_name text,
  body        text not null check (length(body) between 5 and 2000),
  status      text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'no')),
  reply       text check (reply is null or length(reply) <= 1000),      -- lo que el equipo le responde a la iglesia
  team_note   text check (team_note is null or length(team_note) <= 1000), -- solo para el equipo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists central_ideas_idx on public.central_ideas (status, created_at desc);

-- Notas del equipo sobre una iglesia y la historia de contactos con ella (llamadas, mensajes, visitas). Solo para el equipo.
create table if not exists public.central_church_notes (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  author      uuid references public.profiles(id) on delete set null,
  kind        text not null default 'nota' check (kind in ('nota', 'llamada', 'whatsapp', 'correo', 'visita', 'reunion', 'sugerencia')),
  body        text not null check (length(body) between 1 and 2000),
  at          timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists central_church_notes_idx on public.central_church_notes (church_id, at desc);

do $$ declare t text; begin
  foreach t in array array['central_staff', 'central_church_weeks', 'central_seen', 'central_help_requests', 'central_help_notes', 'central_ideas', 'central_church_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, public, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Quién entra: 'owner' (el dueño de la red), 'staff' (equipo designado) o nada.
-- ---------------------------------------------------------------------------
create or replace function public.central_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    when public.admin_is_net() then 'owner'
    when exists (
      select 1 from public.central_staff s join public.profiles p on p.id = s.profile_id
      where s.profile_id = auth.uid() and s.revoked_at is null and p.disabled_at is null and p.church_id is not null
        -- solo vale mientras siga siendo de la iglesia del dueño de la red
        and p.church_id in (select o.church_id from public.profiles o where o.is_network_admin and o.disabled_at is null)
    ) then 'staff'
  end
$$;

-- La iglesia que hospeda la app (la del dueño de la red).
create or replace function public.central_host() returns uuid
language sql stable security definer set search_path = public as $$
  select o.church_id from public.profiles o where o.is_network_admin and o.disabled_at is null and o.church_id is not null order by o.created_at limit 1
$$;
revoke all on function public.central_host() from public, anon, authenticated;

-- Avisarle a todo el equipo (dueño y designados).
create or replace function public.central_notify_team(p_title text, p_body text, p_link text, p_except uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(p.id, 'central', left(p_title, 120), left(coalesce(p_body, ''), 300), p_link)
    from public.profiles p
    where p.disabled_at is null and p.id is distinct from p_except
      and (p.is_network_admin or (p.church_id = public.central_host()
           and exists (select 1 from public.central_staff s where s.profile_id = p.id and s.revoked_at is null)));
end $$;
revoke all on function public.central_notify_team(text, text, text, uuid) from public, anon, authenticated;

-- Saca de un texto lo que podría ser un dato personal: correos, números largos, identificadores y valores de la base.
create or replace function public.central_scrub(p_text text) returns text
language sql immutable set search_path = public as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
    '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[correo]', 'g'),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[id]', 'g'),
    '=\s*\([^)]*\)', '=(…)', 'g'),
    '\+?[0-9][0-9 ().-]{5,}[0-9]', '[número]', 'g'),
    '\s+', ' ', 'g')), 240)
$$;
revoke all on function public.central_scrub(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Los números de la semana (interno: lo llaman la tarea programada y "Actualizar ahora")
-- ---------------------------------------------------------------------------
create or replace function public.central_compute_week(p_church uuid, p_week date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tz text; v_mon date := date_trunc('week', p_week::timestamp)::date; v_from timestamptz; v_to timestamptz; ss uuid[];
  v_since date;
begin
  select coalesce(c.timezone, 'America/Argentina/Buenos_Aires'), coalesce(c.tracking_since, date '-infinity') into v_tz, v_since from public.churches c where c.id = p_church;
  if not found or public.is_demo_church(p_church) then return; end if;
  v_from := v_mon::timestamp at time zone v_tz;
  v_to := (v_mon + 7)::timestamp at time zone v_tz;
  select coalesce(array_agg(s.id), '{}') into ss from public.sessions s
    where (s.ended_at is null or s.counts) and s.church_id = p_church and s.started_at >= v_from and s.started_at < v_to;

  insert into public.central_church_weeks as w (church_id, week_start, accounts, people, new_people, attendance, visitors, first_time, services,
      saved, baptisms, new_members, decisions, outings, people_out, houses, contacts_met, gospel, classes, class_present, events, event_regs,
      devo_reads, devo_likes, active_users, errors, help_requests, computed_at)
  values (p_church, v_mon,
    (select count(*) from public.profiles p where p.church_id = p_church and p.created_at < v_to),
    (select count(*) from public.contacts c where c.church_id = p_church and not c.archived and c.merged_into is null and not coalesce(c.auto_created, false) and c.created_at < v_to),
    (select count(*) from public.contacts c where c.church_id = p_church and not c.archived and c.merged_into is null and not coalesce(c.auto_created, false) and c.created_at >= v_from and c.created_at < v_to),
    (select count(distinct (a.contact_id, a.attended_on)) from public.attendances a where a.church_id = p_church and a.attended_on >= v_mon and a.attended_on < v_mon + 7),
    (select count(distinct a.contact_id) from public.attendances a join public.contacts c on c.id = a.contact_id
       where a.church_id = p_church and a.attended_on >= v_mon and a.attended_on < v_mon + 7 and c.status <> 'member'),
    (select count(*) from (select a.contact_id, min(a.attended_on) f from public.attendances a join public.contacts c on c.id = a.contact_id
                            where a.church_id = p_church and c.baseline is null group by a.contact_id) x
       where x.f >= v_mon and x.f < v_mon + 7 and x.f >= v_since),
    coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'dow', s.dow, 'count', x.n) order by s.dow, s.sort_order, s.time)
       from public.church_services s
       cross join lateral (select count(*)::int n from public.attendances a where a.service_id = s.id and a.attended_on >= v_mon and a.attended_on < v_mon + 7) x
       where s.church_id = p_church and x.n > 0), '[]'::jsonb),
    (select count(*) from public.contacts c where c.church_id = p_church and c.saved_on >= v_mon and c.saved_on < v_mon + 7),
    (select count(*) from public.contacts c where c.church_id = p_church and c.baptized_on >= v_mon and c.baptized_on < v_mon + 7),
    (select count(*) from public.contacts c where c.church_id = p_church and c.member_since >= v_mon and c.member_since < v_mon + 7 and c.baseline is distinct from 'member' and c.member_since >= v_since),
    (select count(*) from public.decisions d where d.church_id = p_church and d.on_date >= v_mon and d.on_date < v_mon + 7),
    (select count(distinct (s.started_at at time zone v_tz)::date) from public.sessions s where s.id = any(ss)) + public.extra_outings_between(p_church, v_from, v_to),
    public.people_out_between(p_church, v_from, v_to),
    case when cardinality(ss) = 0 then 0 else public.houses_for_sessions(ss) end,
    (select count(distinct v.contact_id) from public.contact_visits v where v.church_id = p_church and v.visited_at >= v_from and v.visited_at < v_to),
    (select count(*) from public.contact_visits v where v.church_id = p_church and v.gospel_presented and v.visited_at >= v_from and v.visited_at < v_to),
    (select count(*) from public.classes k where k.church_id = p_church and k.active),
    (select count(*) from public.class_attendance ca where ca.church_id = p_church and ca.present and ca.on_date >= v_mon and ca.on_date < v_mon + 7),
    (select count(*) from public.events e where e.church_id = p_church and not e.weekly and not e.yearly and e.starts_at >= v_from and e.starts_at < v_to),
    (select count(*) from public.event_registrations r where r.church_id = p_church and r.created_at >= v_from and r.created_at < v_to),
    (select count(*) from public.reading_log r join public.profiles p on p.id = r.user_id where p.church_id = p_church and r.on_date >= v_mon and r.on_date < v_mon + 7),
    (select count(*) from public.daily_likes l where l.church_id = p_church and l.on_date >= v_mon and l.on_date < v_mon + 7),
    (select count(distinct u) from (
       select s.user_id u from public.central_seen s where s.church_id = p_church and s.day >= v_mon and s.day < v_mon + 7
       union
       select a.user_id from auth.sessions a join public.profiles p on p.id = a.user_id
        where p.church_id = p_church and coalesce(a.refreshed_at, a.updated_at, a.created_at) >= v_from and coalesce(a.refreshed_at, a.updated_at, a.created_at) < v_to) q),
    (select count(*) from public.app_errors e where e.church_id = p_church and e.created_at >= v_from and e.created_at < v_to),
    (select count(*) from public.central_help_requests h where h.church_id = p_church and h.created_at >= v_from and h.created_at < v_to),
    now())
  on conflict (church_id, week_start) do update set
    accounts = excluded.accounts, people = excluded.people, new_people = excluded.new_people, attendance = excluded.attendance,
    visitors = excluded.visitors, first_time = excluded.first_time, services = excluded.services, saved = excluded.saved,
    baptisms = excluded.baptisms, new_members = excluded.new_members, decisions = excluded.decisions, outings = excluded.outings,
    people_out = excluded.people_out, houses = excluded.houses, contacts_met = excluded.contacts_met, gospel = excluded.gospel,
    classes = excluded.classes, class_present = excluded.class_present, events = excluded.events, event_regs = excluded.event_regs,
    devo_reads = excluded.devo_reads, devo_likes = excluded.devo_likes,
    -- Estos dos se calculan con datos que se van borrando o pisando: se guarda el número más alto que se llegó a ver.
    active_users = greatest(w.active_users, excluded.active_users),
    errors = greatest(w.errors, excluded.errors),
    help_requests = excluded.help_requests, computed_at = now();
end $$;
revoke all on function public.central_compute_week(uuid, date) from public, anon, authenticated;

-- Recalcula las últimas p_weeks semanas de todas las iglesias (menos la de ejemplo). Interno.
create or replace function public.central_recompute(p_weeks integer default 2, p_church uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare c record; i integer; n integer := 0; v_mon date;
begin
  for c in select ch.id, coalesce(ch.timezone, 'America/Argentina/Buenos_Aires') tz, ch.created_at from public.churches ch
           where not public.is_demo_church(ch.id) and (p_church is null or ch.id = p_church) loop
    v_mon := date_trunc('week', (now() at time zone c.tz))::date;
    for i in 0 .. greatest(coalesce(p_weeks, 2), 1) - 1 loop
      perform public.central_compute_week(c.id, v_mon - 7 * i);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.central_recompute(integer, uuid) from public, anon, authenticated;

-- La tarea de cada hora: refresca esta semana y la anterior, y los lunes a la mañana le manda el resumen al dueño.
create or replace function public.central_cron() returns integer
language plpgsql security definer set search_path = public as $$
declare v_host uuid := public.central_host(); v_tz text; v_now timestamp; v_mon date; n integer;
  v_churches integer; v_att integer; v_prev integer; v_help integer; v_quiet integer;
begin
  if auth.uid() is not null then raise exception 'Solo la tarea programada'; end if;
  n := public.central_recompute(2);
  if v_host is null then return n; end if;
  select coalesce(c.timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches c where c.id = v_host;
  v_now := now() at time zone v_tz;
  v_mon := date_trunc('week', v_now)::date;
  if extract(isodow from v_now) = 1 and extract(hour from v_now) >= 8 and public.job_once(v_host, 'central_weekly', v_mon::text) then
    select count(*) into v_churches from public.churches c where not public.is_demo_church(c.id);
    select coalesce(sum(w.attendance), 0) into v_att from public.central_church_weeks w where w.week_start = v_mon - 7 and not public.is_demo_church(w.church_id);
    select coalesce(sum(w.attendance), 0) into v_prev from public.central_church_weeks w where w.week_start = v_mon - 14 and not public.is_demo_church(w.church_id);
    select count(*) into v_help from public.central_help_requests h where h.status <> 'done';
    select count(*) into v_quiet from public.churches c where not public.is_demo_church(c.id)
      and not exists (select 1 from public.central_church_weeks w where w.church_id = c.id and w.week_start >= v_mon - 14 and (w.active_users > 0 or w.attendance > 0));
    perform public.notify(p.id, 'central', 'Resumen de la semana · La Mies Central',
      v_churches || case when v_churches = 1 then ' iglesia' else ' iglesias' end || ' · asistencia ' || v_att || ' (la semana anterior ' || v_prev || ')'
      || ' · ' || v_help || ' pedidos de ayuda sin resolver · ' || v_quiet || ' sin movimiento', '/central/informes')
      from public.profiles p where p.is_network_admin and p.disabled_at is null;
  end if;
  return n;
end $$;
revoke all on function public.central_cron() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lo que la app anota sola: quién abrió la app hoy (para contar usuarios activos, versiones e idiomas)
-- ---------------------------------------------------------------------------
create or replace function public.central_ping(p_platform text default null, p_version text default null, p_lang text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return; end if;
  select p.church_id into v_church from public.profiles p where p.id = auth.uid() and p.disabled_at is null;
  if v_church is null or public.is_demo_church(v_church) then return; end if;
  insert into public.central_seen (user_id, day, church_id, platform, app_version, lang)
    values (auth.uid(), (now() at time zone 'UTC')::date, v_church, left(p_platform, 20), left(p_version, 40), left(p_lang, 8))
  on conflict (user_id, day) do update set platform = excluded.platform, app_version = excluded.app_version, lang = excluded.lang, church_id = excluded.church_id
    where (public.central_seen.platform, public.central_seen.app_version, public.central_seen.lang) is distinct from (excluded.platform, excluded.app_version, excluded.lang);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Leer: resumen de todas las iglesias, una iglesia, las semanas
-- ---------------------------------------------------------------------------
-- La ficha de una iglesia para Central: datos de la iglesia y cantidades. Interno.
create or replace function public.central_church_row(p_church uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'city', coalesce(s.city, c.city), 'province', s.province, 'country', coalesce(s.country, c.country),
    'timezone', c.timezone, 'created_at', c.created_at,
    'is_host', c.id = public.central_host(),
    'selfserve', s.church_id is not null,
    'status', coalesce(s.status, 'invited'), 'suspend_reason', s.suspend_reason, 'size_hint', s.size_hint,
    -- El pastor: como se anotó. Si la iglesia la creó el dueño, solo el nombre de su cuenta de pastor.
    'pastor_name', coalesce(s.pastor_name, (select p.display_name from public.profiles p where p.church_id = c.id and p.role::text = 'admin' and p.disabled_at is null order by p.created_at limit 1)),
    'pastor_email', s.email, 'pastor_whatsapp', s.whatsapp,
    'pastors', (select count(*) from public.profiles p where p.church_id = c.id and p.role::text = 'admin'),
    'setup_pending', coalesce(a.setup_pending, false), 'setup_done_at', a.setup_done_at,
    'steps', coalesce(k.steps, '{}'::jsonb), 'has_checklist', k.church_id is not null, 'import_help_at', k.import_help_at,
    'facts', public.alta_facts(c.id),
    'disabled_features', coalesce(to_jsonb(c.disabled_features), '[]'::jsonb),
    'uses_finance', (not ('finanzas' = any(coalesce(c.disabled_features, '{}'::text[]))) and exists (select 1 from public.fin_entries f where f.church_id = c.id)),
    'join_code', case when not exists (select 1 from public.profiles p where p.church_id = c.id and p.role::text = 'admin')
                      then (select j.code from public.church_join_codes j where j.church_id = c.id) end,
    'invite_expires_at', (select max(i.expires_at) from public.admin_pastor_invites i where i.church_id = c.id and i.used_at is null and i.revoked_at is null and i.expires_at > now()),
    'active_7', (select count(distinct u) from (
        select z.user_id u from public.central_seen z where z.church_id = c.id and z.day >= current_date - 7
        union select x.user_id from auth.sessions x join public.profiles p on p.id = x.user_id
               where p.church_id = c.id and coalesce(x.refreshed_at, x.updated_at, x.created_at) >= now() - interval '7 days') q),
    'active_30', (select count(distinct u) from (
        select z.user_id u from public.central_seen z where z.church_id = c.id and z.day >= current_date - 30
        union select x.user_id from auth.sessions x join public.profiles p on p.id = x.user_id
               where p.church_id = c.id and coalesce(x.refreshed_at, x.updated_at, x.created_at) >= now() - interval '30 days') q),
    'last_activity', greatest(
        (select max(l.at) from public.audit_log l where l.church_id = c.id),
        (select max(t.created_at) from public.attendances t where t.church_id = c.id),
        (select max(coalesce(x.refreshed_at, x.updated_at, x.created_at)) from auth.sessions x join public.profiles p on p.id = x.user_id where p.church_id = c.id)),
    'open_help', (select count(*) from public.central_help_requests h where h.church_id = c.id and h.status <> 'done'),
    'errors_7', (select count(*) from public.app_errors e where e.church_id = c.id and e.created_at >= now() - interval '7 days'),
    'errors_prev_7', (select count(*) from public.app_errors e where e.church_id = c.id and e.created_at >= now() - interval '14 days' and e.created_at < now() - interval '7 days'))
  from public.churches c
  left join public.alta_signups s on s.church_id = c.id
  left join public.alta_checklist k on k.church_id = c.id
  left join public.admin_church_settings a on a.church_id = c.id
  where c.id = p_church
$$;
revoke all on function public.central_church_row(uuid) from public, anon, authenticated;

create or replace function public.central_week_json(w public.central_church_weeks) returns jsonb
language sql immutable set search_path = public as $$ select to_jsonb(w) - 'computed_at' $$;
revoke all on function public.central_week_json(public.central_church_weeks) from public, anon, authenticated;

-- Resumen: todas las iglesias de un vistazo, con las últimas 26 semanas de cada una.
create or replace function public.central_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.central_role();
begin
  if v_role is null then raise exception 'Solo el equipo de La Mies'; end if;
  return jsonb_build_object(
    'role', v_role,
    'churches', coalesce((select jsonb_agg(public.central_church_row(c.id) order by c.created_at desc) from public.churches c where not public.is_demo_church(c.id)), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(public.central_week_json(w) order by w.week_start, w.church_id) from public.central_church_weeks w
                        where w.week_start >= current_date - 7 * 27 and not public.is_demo_church(w.church_id)), '[]'::jsonb),
    -- La iglesia de ejemplo nunca entra en las listas ni en los totales: solo se avisa que existe.
    'demo', (select jsonb_build_object('name', c.name) from public.demo_churches d join public.churches c on c.id = d.church_id limit 1),
    'help_open', (select count(*) from public.central_help_requests h where h.status <> 'done'),
    'ideas_new', (select count(*) from public.central_ideas i where i.status = 'new'),
    'computed_at', (select max(w.computed_at) from public.central_church_weeks w));
end $$;

-- Las semanas guardadas, de una iglesia o de todas, entre dos fechas (para los informes).
create or replace function public.central_weeks(p_church uuid default null, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  return coalesce((select jsonb_agg(public.central_week_json(w) order by w.week_start, w.church_id) from public.central_church_weeks w
    where (p_church is null or w.church_id = p_church) and not public.is_demo_church(w.church_id)
      and w.week_start >= coalesce(p_from, current_date - 800) and w.week_start <= coalesce(p_to, current_date)), '[]'::jsonb);
end $$;

-- Una iglesia: su ficha, lo que tiene hoy (solo cantidades), aparatos y versiones, notas del equipo, historia y semanas.
create or replace function public.central_church(p_church uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.central_role();
begin
  if v_role is null then raise exception 'Solo el equipo de La Mies'; end if;
  if p_church is null or public.is_demo_church(p_church) or not exists (select 1 from public.churches c where c.id = p_church) then
    raise exception 'Esa iglesia no está en Central';
  end if;
  return jsonb_build_object(
    'role', v_role,
    'church', public.central_church_row(p_church),
    'now', jsonb_build_object(
      'members', (select count(*) from public.contacts c where c.church_id = p_church and not c.archived and c.merged_into is null and c.status = 'member'),
      'visitors', (select count(*) from public.contacts c where c.church_id = p_church and not c.archived and c.merged_into is null and c.status = 'visitor'),
      'contacts', (select count(*) from public.contacts c where c.church_id = p_church and not c.archived and c.merged_into is null and c.status = 'contact'),
      'leaders', (select count(*) from public.profiles p where p.church_id = p_church and p.role::text <> 'member'),
      'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'dow', s.dow, 'time', s.time) order by s.dow, s.sort_order, s.time)
                            from public.church_services s where s.church_id = p_church and s.active), '[]'::jsonb),
      'classes', (select count(*) from public.classes k where k.church_id = p_church and k.active),
      'events_next', (select count(*) from public.events e where e.church_id = p_church and not e.weekly and not e.yearly and e.starts_at >= now())),
    'tech', jsonb_build_object(
      'platforms', coalesce((select jsonb_agg(jsonb_build_object('key', x.k, 'users', x.n) order by x.n desc) from (
          select coalesce(z.platform, '?') k, count(distinct z.user_id) n from public.central_seen z where z.church_id = p_church and z.day >= current_date - 30 group by 1) x), '[]'::jsonb),
      'versions', coalesce((select jsonb_agg(jsonb_build_object('key', x.k, 'users', x.n) order by x.n desc) from (
          select coalesce(z.app_version, '?') k, count(distinct z.user_id) n from public.central_seen z where z.church_id = p_church and z.day >= current_date - 30 group by 1) x), '[]'::jsonb),
      'langs', coalesce((select jsonb_agg(jsonb_build_object('key', x.k, 'users', x.n) order by x.n desc) from (
          select coalesce(z.lang, '?') k, count(distinct z.user_id) n from public.central_seen z where z.church_id = p_church and z.day >= current_date - 30 group by 1) x), '[]'::jsonb)),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'at', n.at,
                         'author', (select p.display_name from public.profiles p where p.id = n.author), 'mine', n.author = auth.uid()) order by n.at desc)
                       from public.central_church_notes n where n.church_id = p_church and n.archived_at is null), '[]'::jsonb),
    -- La historia: lo que pasó con esta iglesia, sin nombres de su gente.
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('at', t.at, 'kind', t.kind, 'text', t.txt) order by t.at desc) from (
        select c.created_at at, 'alta' kind, 'La iglesia entró a la app' txt from public.churches c where c.id = p_church
        union all select l.at, 'estado', case l.action when 'alta_net_status:suspended' then 'El equipo la suspendió' when 'alta_net_status:reviewed' then 'El equipo la marcó como revisada' else 'Volvió a quedar sin revisar' end
          from public.audit_log l where l.church_id = p_church and l.action like 'alta_net_status:%'
        union all select l.at, 'importar', case when l.action = 'alta_import_help:on' then 'Pidió que el equipo le cargue la lista' else 'Ya no pide que le carguen la lista' end
          from public.audit_log l where l.church_id = p_church and l.action like 'alta_import_help:%'
        union all select b.created_at, 'importar', 'El equipo le cargó una lista (' || b.added || ' personas nuevas)' from public.alta_import_batches b where b.church_id = p_church and b.by_network
        union all select h.created_at, 'ayuda', 'Pidió ayuda' || coalesce(': ' || h.step, '') from public.central_help_requests h where h.church_id = p_church
        union all select h.resolved_at, 'ayuda', 'Pedido de ayuda resuelto' || coalesce(': ' || h.step, '') from public.central_help_requests h where h.church_id = p_church and h.resolved_at is not null
        union all select i.created_at, 'idea', 'Mandó una idea' from public.central_ideas i where i.church_id = p_church
      ) t), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(public.central_week_json(w) order by w.week_start) from public.central_church_weeks w where w.church_id = p_church and w.week_start >= current_date - 800), '[]'::jsonb));
end $$;

-- "Actualizar ahora": recalcula las últimas semanas (hasta 8) sin esperar a la tarea de cada hora.
create or replace function public.central_refresh(p_weeks integer default 2) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  return public.central_recompute(least(greatest(coalesce(p_weeks, 2), 1), 8));
end $$;

-- ---------------------------------------------------------------------------
-- 6. El equipo: quién entra. Solo el dueño da y saca el acceso. Todo queda en el registro (audit_log).
-- ---------------------------------------------------------------------------
create or replace function public.central_team() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.central_role();
begin
  if v_role is null then raise exception 'Solo el equipo de La Mies'; end if;
  return jsonb_build_object(
    'role', v_role,
    'team', coalesce((select jsonb_agg(x.j order by x.o, x.n) from (
        select jsonb_build_object('id', p.id, 'name', p.display_name, 'role', 'owner', 'church_role', p.role::text) j, 0 o, p.display_name n
          from public.profiles p where p.is_network_admin and p.disabled_at is null
        union all
        select jsonb_build_object('id', p.id, 'name', p.display_name, 'role', 'staff', 'church_role', p.role::text, 'granted_at', s.granted_at, 'note', s.note,
                                  'granted_by', (select g.display_name from public.profiles g where g.id = s.granted_by)), 1, p.display_name
          from public.central_staff s join public.profiles p on p.id = s.profile_id
          where s.revoked_at is null and p.disabled_at is null and not p.is_network_admin and p.church_id = public.central_host()) x), '[]'::jsonb),
    -- A quién se le puede dar acceso: gente con cuenta en la iglesia del dueño. Solo lo ve el dueño.
    'candidates', case when v_role = 'owner' then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'church_role', p.role::text) order by p.display_name)
        from public.profiles p where p.church_id = public.current_church_id() and p.disabled_at is null and not p.is_network_admin
          and not exists (select 1 from public.central_staff s where s.profile_id = p.id and s.revoked_at is null)), '[]'::jsonb) else '[]'::jsonb end,
    'log', case when v_role = 'owner' then coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action,
          'who', (select p.display_name from public.profiles p where p.id::text = l.target)) order by l.at desc)
        from (select * from public.audit_log a where a.action like 'central_staff:%' order by a.at desc limit 40) l), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.central_staff_grant(p_profile uuid, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_p public.profiles;
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.central_role() is distinct from 'owner' then raise exception 'Solo el dueño de la red da acceso a Central'; end if;
  select * into v_p from public.profiles where id = p_profile;
  if v_p.id is null or v_p.church_id is distinct from v_church or v_p.disabled_at is not null then
    raise exception 'Solo se le puede dar acceso a alguien con cuenta en tu iglesia';
  end if;
  if v_p.is_network_admin then raise exception 'Esa persona ya es dueña de la red'; end if;
  insert into public.central_staff (profile_id, granted_by, granted_at, note, revoked_at, revoked_by)
    values (p_profile, auth.uid(), now(), nullif(left(btrim(coalesce(p_note, '')), 200), ''), null, null)
  on conflict (profile_id) do update set granted_by = excluded.granted_by, granted_at = now(), note = excluded.note, revoked_at = null, revoked_by = null;
  insert into public.audit_log (church_id, actor_id, action, target) values (v_church, auth.uid(), 'central_staff:grant', p_profile::text);
  perform public.notify(p_profile, 'central', 'Ya podés entrar a La Mies Central', 'Te sumaron al equipo de La Mies. Desde la computadora vas a ver el panel de todas las iglesias.', '/central');
  return true;
end $$;

create or replace function public.central_staff_revoke(p_profile uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.central_role() is distinct from 'owner' then raise exception 'Solo el dueño de la red saca el acceso a Central'; end if;
  update public.central_staff set revoked_at = now(), revoked_by = auth.uid() where profile_id = p_profile and revoked_at is null;
  if not found then return false; end if;
  insert into public.audit_log (church_id, actor_id, action, target) values (public.current_church_id(), auth.uid(), 'central_staff:revoke', p_profile::text);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Pedidos de ayuda
-- ---------------------------------------------------------------------------
-- Lo llama la app de cualquier iglesia al tocar "Necesito ayuda" o "Pedir ayuda a La Mies".
create or replace function public.central_help_create(p_step text default null, p_screen text default null, p_message text default null, p_church_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_p public.profiles; v_id uuid; v_church text; v_email text;
  v_step text := nullif(left(btrim(coalesce(p_step, '')), 160), ''); v_msg text := nullif(left(btrim(coalesce(p_message, '')), 2000), '');
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  select * into v_p from public.profiles where id = v_uid;
  if v_p.disabled_at is not null then raise exception 'Esta cuenta está desactivada'; end if;
  if v_p.church_id is not null and public.is_demo_church(v_p.church_id) then return null; end if;
  -- El mismo botón tocado dos veces seguidas no hace dos pedidos.
  if v_msg is null then
    select h.id into v_id from public.central_help_requests h
      where h.created_by = v_uid and h.status <> 'done' and h.step is not distinct from v_step and h.message is null and h.created_at > now() - interval '30 minutes' limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  if (select count(*) from public.central_help_requests h where h.created_by = v_uid and h.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Ya nos mandaste muchos pedidos hoy. Escribinos por WhatsApp o por correo.';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select c.name into v_church from public.churches c where c.id = v_p.church_id;
  insert into public.central_help_requests (church_id, church_name, created_by, asker_name, asker_role, asker_phone, asker_email, step, screen, message)
    values (v_p.church_id, case when v_p.church_id is null then nullif(left(btrim(coalesce(p_church_name, '')), 120), '') end, v_p.id,
            v_p.display_name, v_p.role::text, v_p.phone, v_email, v_step, nullif(left(btrim(coalesce(p_screen, '')), 160), ''), v_msg)
    returning id into v_id;
  perform public.central_notify_team('Pedido de ayuda · ' || coalesce(v_church, p_church_name, 'una iglesia nueva'), coalesce(v_msg, v_step, 'Tocó "Necesito ayuda".'), '/central/ayuda', v_uid);
  return v_id;
end $$;

-- Para la iglesia: cómo van sus pedidos (el pastor o administrador ve los de toda su iglesia; el resto, los suyos). Sin las notas internas.
create or replace function public.central_help_mine() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_all boolean := public.has_perm('admin.iglesia') is true;
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'step', h.step, 'message', h.message, 'status', h.status, 'created_at', h.created_at, 'resolved_at', h.resolved_at) order by h.created_at desc)
    from (select * from public.central_help_requests x where x.created_by = auth.uid() or (v_all and v_church is not null and x.church_id = v_church)
          order by x.created_at desc limit 30) h), '[]'::jsonb);
end $$;

create or replace function public.central_help_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'church_id', h.church_id, 'church', coalesce(c.name, h.church_name, 'Todavía sin iglesia'),
      'asker_name', h.asker_name, 'asker_role', h.asker_role, 'asker_phone', h.asker_phone, 'asker_email', h.asker_email,
      'step', h.step, 'screen', h.screen, 'message', h.message, 'status', h.status,
      'assignee', h.assignee, 'assignee_name', (select p.display_name from public.profiles p where p.id = h.assignee),
      'created_at', h.created_at, 'updated_at', h.updated_at, 'resolved_at', h.resolved_at,
      'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'at', n.created_at,
                 'author', (select p.display_name from public.profiles p where p.id = n.author)) order by n.created_at)
               from public.central_help_notes n where n.request_id = h.id), '[]'::jsonb)) order by h.created_at desc)
    from (select * from public.central_help_requests x where x.church_id is null or not public.is_demo_church(x.church_id) order by x.created_at desc limit 300) h
    left join public.churches c on c.id = h.church_id), '[]'::jsonb);
end $$;

-- Cambiar el estado o a quién le toca. p_assignee: una persona del equipo, o null para dejarlo sin nadie (con p_set_assignee).
create or replace function public.central_help_update(p_id uuid, p_status text default null, p_assignee uuid default null, p_set_assignee boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_h public.central_help_requests;
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  if p_status is not null and p_status not in ('open', 'progress', 'done') then raise exception 'Estado desconocido'; end if;
  if p_set_assignee and p_assignee is not null and not exists (
       select 1 from public.profiles p where p.id = p_assignee and p.disabled_at is null
         and (p.is_network_admin or exists (select 1 from public.central_staff s where s.profile_id = p.id and s.revoked_at is null))) then
    raise exception 'Esa persona no es del equipo de La Mies';
  end if;
  update public.central_help_requests set
    status = coalesce(p_status, status),
    assignee = case when p_set_assignee then p_assignee else assignee end,
    resolved_at = case when p_status = 'done' then coalesce(resolved_at, now()) when p_status is not null then null else resolved_at end,
    updated_at = now()
  where id = p_id returning * into v_h;
  if v_h.id is null then raise exception 'Ese pedido no existe'; end if;
  insert into public.audit_log (church_id, actor_id, action, target, details)
    values (public.central_host(), auth.uid(), 'central_help:' || coalesce(p_status, 'assign'), p_id::text, jsonb_build_object('assignee', v_h.assignee));
  if p_status = 'done' and v_h.created_by is not null and v_h.created_by <> auth.uid() then
    perform public.notify(v_h.created_by, 'central', 'Tu pedido de ayuda quedó resuelto', coalesce(v_h.step, 'El equipo de La Mies lo marcó como resuelto. Si todavía necesitás algo, volvé a escribirnos.'), '/admin/ayuda');
  end if;
  if p_set_assignee and p_assignee is not null and p_assignee <> auth.uid() then
    perform public.notify(p_assignee, 'central', 'Te asignaron un pedido de ayuda', coalesce(v_h.step, v_h.message, ''), '/central/ayuda');
  end if;
  return true;
end $$;

create or replace function public.central_help_note(p_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  if length(v_body) < 1 or length(v_body) > 2000 then raise exception 'Escribí la nota (hasta 2000 letras)'; end if;
  if not exists (select 1 from public.central_help_requests h where h.id = p_id) then raise exception 'Ese pedido no existe'; end if;
  insert into public.central_help_notes (request_id, author, body) values (p_id, auth.uid(), v_body) returning id into v_id;
  update public.central_help_requests set updated_at = now() where id = p_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Ideas para La Mies
-- ---------------------------------------------------------------------------
create or replace function public.central_idea_send(p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_church uuid := public.current_church_id(); v_body text := btrim(coalesce(p_body, '')); v_id uuid; v_name text;
begin
  if v_uid is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.iglesia') is not true then raise exception 'Solo el pastor o el administrador de la app le mandan ideas a La Mies'; end if;
  if public.is_demo_church(v_church) then return null; end if;
  if length(v_body) < 5 or length(v_body) > 2000 then raise exception 'Escribí tu idea (de 5 a 2000 letras)'; end if;
  if (select count(*) from public.central_ideas i where i.created_by = v_uid and i.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Ya mandaste muchas ideas hoy. Mañana podés mandar más.';
  end if;
  insert into public.central_ideas (church_id, created_by, author_name, body)
    values (v_church, v_uid, (select p.display_name from public.profiles p where p.id = v_uid), v_body) returning id into v_id;
  select c.name into v_name from public.churches c where c.id = v_church;
  perform public.central_notify_team('Idea nueva · ' || v_name, v_body, '/central/ideas', v_uid);
  return v_id;
end $$;

-- Para la iglesia: las ideas que mandó y qué le respondieron.
create or replace function public.central_ideas_mine() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id();
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.has_perm('admin.iglesia') is not true then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'body', i.body, 'status', i.status, 'reply', i.reply, 'created_at', i.created_at) order by i.created_at desc)
    from (select * from public.central_ideas x where x.church_id = v_church order by x.created_at desc limit 30) i), '[]'::jsonb);
end $$;

create or replace function public.central_ideas_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'church_id', i.church_id, 'church', c.name, 'author_name', i.author_name, 'body', i.body,
      'status', i.status, 'reply', i.reply, 'team_note', i.team_note, 'created_at', i.created_at, 'updated_at', i.updated_at) order by i.created_at desc)
    from (select * from public.central_ideas x where not public.is_demo_church(x.church_id) order by x.created_at desc limit 300) i
    join public.churches c on c.id = i.church_id), '[]'::jsonb);
end $$;

create or replace function public.central_idea_update(p_id uuid, p_status text default null, p_reply text default null, p_team_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_i public.central_ideas; v_old text;
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  if p_status is not null and p_status not in ('new', 'seen', 'planned', 'done', 'no') then raise exception 'Estado desconocido'; end if;
  select i.reply into v_old from public.central_ideas i where i.id = p_id;
  update public.central_ideas set
    status = coalesce(p_status, status),
    reply = case when p_reply is null then reply else nullif(left(btrim(p_reply), 1000), '') end,
    team_note = case when p_team_note is null then team_note else nullif(left(btrim(p_team_note), 1000), '') end,
    updated_at = now()
  where id = p_id returning * into v_i;
  if v_i.id is null then raise exception 'Esa idea no existe'; end if;
  if v_i.reply is not null and v_i.reply is distinct from v_old and v_i.created_by is not null then
    perform public.notify(v_i.created_by, 'central', 'La Mies respondió tu idea', v_i.reply, '/admin/ayuda');
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Errores de la app, agrupados. Nunca se devuelve quién tuvo el error ni el detalle técnico completo.
-- ---------------------------------------------------------------------------
create or replace function public.central_errors(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('message', g.msg, 'screen', g.screen, 'platform', g.platform, 'version', g.version,
      'count', g.n, 'churches', g.churches, 'people', g.people, 'first_at', g.first_at, 'last_at', g.last_at, 'last_7', g.last_7) order by g.last_at desc)
    from (
      select public.central_scrub(e.message) msg,
             nullif(public.central_scrub(regexp_replace(coalesce(e.info ->> 'ruta', ''), '/[0-9]+(?=/|$)', '/[n]', 'g')), '') screen,
             coalesce(e.platform, '?') platform, coalesce(e.app_version, '?') version,
             count(*) n, count(distinct e.church_id) churches, count(distinct e.user_id) people,
             min(e.created_at) first_at, max(e.created_at) last_at,
             count(*) filter (where e.created_at >= now() - interval '7 days') last_7
      from public.app_errors e
      where e.created_at >= now() - make_interval(days => v_days) and (e.church_id is null or not public.is_demo_church(e.church_id))
      group by 1, 2, 3, 4
      order by max(e.created_at) desc limit 200) g), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Notas del equipo sobre una iglesia, y sugerirle una función al pastor (no se le cambia nada: solo le llega un aviso)
-- ---------------------------------------------------------------------------
create or replace function public.central_note_add(p_church uuid, p_kind text, p_body text, p_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  if p_church is null or public.is_demo_church(p_church) or not exists (select 1 from public.churches c where c.id = p_church) then raise exception 'Esa iglesia no está en Central'; end if;
  if coalesce(p_kind, '') not in ('nota', 'llamada', 'whatsapp', 'correo', 'visita', 'reunion') then raise exception 'Tipo de nota desconocido'; end if;
  if length(v_body) < 1 or length(v_body) > 2000 then raise exception 'Escribí la nota (hasta 2000 letras)'; end if;
  insert into public.central_church_notes (church_id, author, kind, body, at)
    values (p_church, auth.uid(), p_kind, v_body, least(coalesce(p_at, now()), now())) returning id into v_id;
  return v_id;
end $$;

-- Sacar una nota (no se borra: queda archivada). La puede sacar quien la escribió o el dueño.
create or replace function public.central_note_archive(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_role text := public.central_role();
begin
  if v_role is null then raise exception 'Solo el equipo de La Mies'; end if;
  update public.central_church_notes set archived_at = now() where id = p_id and archived_at is null and (author = auth.uid() or v_role = 'owner');
  return found;
end $$;

create or replace function public.central_suggest_feature(p_church uuid, p_feature text, p_message text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_msg text := nullif(left(btrim(coalesce(p_message, '')), 300), ''); v_label text := left(btrim(coalesce(p_feature, '')), 80);
begin
  if public.central_role() is distinct from 'owner' then raise exception 'Solo el dueño de la red le sugiere funciones a otra iglesia'; end if;
  if p_church is null or public.is_demo_church(p_church) or p_church = public.current_church_id() or not exists (select 1 from public.churches c where c.id = p_church) then
    raise exception 'Elegí otra iglesia';
  end if;
  if length(v_label) < 2 then raise exception 'Elegí la función'; end if;
  perform public.notify(p.id, 'central', 'El equipo de La Mies te sugiere una función', 'Podés prender "' || v_label || '" en Funciones de la iglesia.' || coalesce(' ' || v_msg, ''), '/admin/funciones')
    from public.profiles p where p.church_id = p_church and p.role::text = 'admin' and p.disabled_at is null;
  insert into public.central_church_notes (church_id, author, kind, body)
    values (p_church, auth.uid(), 'sugerencia', 'Se le sugirió al pastor prender "' || v_label || '".' || coalesce(' ' || v_msg, ''));
  insert into public.audit_log (church_id, actor_id, action, target, details)
    values (public.central_host(), auth.uid(), 'central_suggest_feature', p_church::text, jsonb_build_object('feature', v_label));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Permisos de las funciones
-- ---------------------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array[
    'central_role()', 'central_ping(text,text,text)', 'central_overview()', 'central_weeks(uuid,date,date)', 'central_church(uuid)', 'central_refresh(integer)',
    'central_team()', 'central_staff_grant(uuid,text)', 'central_staff_revoke(uuid)',
    'central_help_create(text,text,text,text)', 'central_help_mine()', 'central_help_list()', 'central_help_update(uuid,text,uuid,boolean)', 'central_help_note(uuid,text)',
    'central_idea_send(text)', 'central_ideas_mine()', 'central_ideas_list()', 'central_idea_update(uuid,text,text,text)',
    'central_errors(integer)', 'central_note_add(uuid,text,text,timestamptz)', 'central_note_archive(uuid)', 'central_suggest_feature(uuid,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 12. El equipo designado también puede cargar la lista de una iglesia que lo pidió (antes: solo el dueño).
--     Se cambia UNA condición en dos funciones que ya existen; el resto queda igual. El pedido del pastor sigue haciendo falta.
-- ---------------------------------------------------------------------------
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.alta_import(jsonb,text,text,boolean,uuid,uuid,text)'::regprocedure);
  if position('central_role()' in d) = 0 then
    n := replace(d, 'if public.admin_is_net() is not true then raise exception ''Solo el administrador de la red puede importar en otra iglesia.''',
                    'if public.admin_is_net() is not true and public.central_role() is null then raise exception ''Solo el equipo de La Mies puede importar en otra iglesia.''');
    if n = d then raise exception 'No pude cambiar alta_import'; end if;
    execute n;
  end if;
  d := pg_get_functiondef('public.alta_batch_undo(uuid,boolean)'::regprocedure);
  if position('central_role()' in d) = 0 then
    n := replace(d, '(public.admin_is_net() is true and v_b.by_network', '((public.admin_is_net() is true or public.central_role() is not null) and v_b.by_network');
    if n = d then raise exception 'No pude cambiar alta_batch_undo'; end if;
    execute n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 13. Historia: se calculan las semanas desde que cada iglesia tiene datos (hasta 3 años atrás), y la tarea de cada hora.
-- ---------------------------------------------------------------------------
do $$ declare c record; v_start date; v_mon date; begin
  for c in select ch.id, coalesce(ch.timezone, 'America/Argentina/Buenos_Aires') tz, ch.created_at from public.churches ch where not public.is_demo_church(ch.id) loop
    v_mon := date_trunc('week', (now() at time zone c.tz))::date;
    v_start := date_trunc('week', least(c.created_at::date, coalesce((select min(a.attended_on) from public.attendances a where a.church_id = c.id), c.created_at::date))::timestamp)::date;
    v_start := greatest(v_start, v_mon - 7 * 156);
    while v_start <= v_mon loop
      perform public.central_compute_week(c.id, v_start);
      v_start := v_start + 7;
    end loop;
  end loop;
end $$;

-- Las cuentas de la iglesia de ejemplo no pueden escribir en las tablas nuevas.
select public.demo_guard_install();

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and not exists (select 1 from cron.job where jobname = 'lamies-central') then
    perform cron.schedule('lamies-central', '41 * * * *', 'select public.central_cron()');
  end if;
end $$;
