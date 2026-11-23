-- 0072: planificador de eventos. Tipos de entrada con precio y cupo, programa con horarios, oradores,
--       equipo y tareas, avisos a los inscriptos, transmisión y grabaciones, y una página pública
--       (sin la app y sin cuenta) donde cualquiera ve el evento, se inscribe y guarda su entrada.

-- 1. Más datos del evento
alter table public.events add column if not exists slug text;
alter table public.events add column if not exists public_page boolean not null default false;
alter table public.events add column if not exists stream_url text;
alter table public.events add column if not exists stream_access text not null default 'all';
alter table public.events add column if not exists recordings jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists pay_info text;
alter table public.events add column if not exists faq text;
alter table public.events drop constraint if exists events_stream_access_check;
alter table public.events add constraint events_stream_access_check check (stream_access in ('all', 'registered', 'paid'));
create unique index if not exists events_slug_idx on public.events (slug) where slug is not null;

-- 2. Tipos de entrada (general, VIP, niños…): cada uno con su precio y su cupo
create table if not exists public.event_ticket_types (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  description text check (length(description) <= 300),
  price numeric not null default 0 check (price >= 0),
  capacity integer check (capacity is null or capacity >= 0),
  color text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists event_ticket_types_event_idx on public.event_ticket_types (event_id, sort);

alter table public.event_registrations add column if not exists ticket_type_id uuid references public.event_ticket_types(id) on delete set null;
alter table public.event_registrations add column if not exists email text;
alter table public.event_registrations add column if not exists source text not null default 'app';
alter table public.event_registrations add column if not exists access_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists event_registrations_token_idx on public.event_registrations (access_token);
create index if not exists event_registrations_type_idx on public.event_registrations (ticket_type_id) where ticket_type_id is not null;
create index if not exists event_registrations_phone_idx on public.event_registrations (event_id, phone) where phone is not null;

-- 3. Programa, oradores, equipo, tareas y avisos
create table if not exists public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  role text check (length(role) <= 160),
  bio text check (length(bio) <= 2000),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists event_speakers_event_idx on public.event_speakers (event_id, sort);

create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null check (length(btrim(title)) between 1 and 160),
  description text check (length(description) <= 2000),
  place text check (length(place) <= 160),
  speaker_id uuid references public.event_speakers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists event_sessions_event_idx on public.event_sessions (event_id, starts_at);

create table if not exists public.event_team (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  role text check (length(role) <= 80),
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table if not exists public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  done boolean not null default false,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_on date,
  created_at timestamptz not null default now()
);
create index if not exists event_tasks_event_idx on public.event_tasks (event_id, done, due_on);

create table if not exists public.event_updates (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists event_updates_event_idx on public.event_updates (event_id, created_at desc);

-- Quién organiza: los que manejan el calendario y los que están en el equipo del evento.
create or replace function public.can_plan_event(p_event uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.church_id = public.current_church_id())
     and (public.has_perm('cal.editar') or exists (select 1 from public.event_team t where t.event_id = p_event and t.profile_id = auth.uid()))
$$;
revoke all on function public.can_plan_event(uuid) from public, anon;
grant execute on function public.can_plan_event(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['event_ticket_types', 'event_speakers', 'event_sessions', 'event_tasks', 'event_updates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (church_id = public.current_church_id())', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (church_id = public.current_church_id() and public.can_plan_event(event_id)) with check (church_id = public.current_church_id() and public.can_plan_event(event_id))', t || '_write', t);
    execute format('revoke all on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;
-- Las tareas son del equipo: los demás no las ven.
drop policy if exists event_tasks_select on public.event_tasks;
create policy event_tasks_select on public.event_tasks for select to authenticated using (church_id = public.current_church_id() and public.can_plan_event(event_id));

alter table public.event_team enable row level security;
drop policy if exists event_team_select on public.event_team;
drop policy if exists event_team_write on public.event_team;
create policy event_team_select on public.event_team for select to authenticated using (church_id = public.current_church_id());
create policy event_team_write on public.event_team for all to authenticated
  using (church_id = public.current_church_id() and public.has_perm('cal.editar')) with check (church_id = public.current_church_id() and public.has_perm('cal.editar'));
revoke all on table public.event_team from anon, public;
grant select, insert, update, delete on table public.event_team to authenticated;

-- El equipo del evento también edita el evento, ve los inscriptos y atiende la puerta.
drop policy if exists events_team_update on public.events;
create policy events_team_update on public.events for update to authenticated
  using (church_id = public.current_church_id() and public.can_plan_event(id)) with check (church_id = public.current_church_id());
drop policy if exists event_reg_team on public.event_registrations;
create policy event_reg_team on public.event_registrations for all to authenticated
  using (church_id = public.current_church_id() and public.can_plan_event(event_id)) with check (church_id = public.current_church_id() and public.can_plan_event(event_id));

-- Cupo por tipo de entrada (además del cupo total del evento).
create or replace function public.event_type_capacity() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_cap integer; v_taken integer;
begin
  if new.ticket_type_id is null or new.walk_in then return new; end if;
  select capacity into v_cap from public.event_ticket_types where id = new.ticket_type_id and event_id = new.event_id;
  if not found then raise exception 'Ese tipo de entrada no es de este evento'; end if;
  if v_cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.ticket_type_id::text));
  select coalesce(sum(people), 0) into v_taken from public.event_registrations where ticket_type_id = new.ticket_type_id and id is distinct from new.id;
  if v_taken + new.people > v_cap then raise exception 'Ya no quedan entradas de ese tipo (quedan %)', greatest(v_cap - v_taken, 0); end if;
  return new;
end $$;
drop trigger if exists event_type_capacity on public.event_registrations;
create trigger event_type_capacity before insert or update of people, ticket_type_id on public.event_registrations
  for each row execute function public.event_type_capacity();
revoke all on function public.event_type_capacity() from public, anon, authenticated;

-- Números del evento para el planificador (sin traer la lista: sirve igual con 50 o con 50.000 inscriptos).
create or replace function public.event_plan_stats(p_event uuid)
returns table (registrations integer, people integer, checked_in integer, paid numeric, expected numeric, web integer, door integer)
language sql stable security definer set search_path to 'public' as $$
  select count(*)::int, coalesce(sum(r.people), 0)::int,
         coalesce(sum(r.people) filter (where r.checked_in_at is not null), 0)::int,
         coalesce(sum(r.paid_amount), 0),
         coalesce(sum(r.people * coalesce(t.price, e.reg_price, 0)), 0),
         (count(*) filter (where r.source = 'web'))::int, (count(*) filter (where r.walk_in))::int
  from public.events e
  left join public.event_registrations r on r.event_id = e.id
  left join public.event_ticket_types t on t.id = r.ticket_type_id
  where e.id = p_event and public.can_plan_event(p_event)
  group by e.id
$$;

-- Los inscriptos de a páginas, con búsqueda por nombre, teléfono o código.
create or replace function public.event_plan_registrations(p_event uuid, p_q text default null, p_offset integer default 0, p_limit integer default 50)
returns table (id uuid, name text, phone text, email text, people integer, ticket_code text, type_name text, price numeric, paid_amount numeric, checked_in_at timestamptz, source text, walk_in boolean, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select r.id, r.name, r.phone, r.email, r.people, r.ticket_code, t.name, r.people * coalesce(t.price, e.reg_price, 0), r.paid_amount, r.checked_in_at, r.source, r.walk_in, r.created_at
  from public.event_registrations r
  join public.events e on e.id = r.event_id
  left join public.event_ticket_types t on t.id = r.ticket_type_id
  where r.event_id = p_event and public.can_plan_event(p_event)
    and (coalesce(btrim(p_q), '') = '' or r.name ilike '%' || btrim(p_q) || '%' or r.phone like '%' || regexp_replace(p_q, '\D', '', 'g') || '%' and regexp_replace(p_q, '\D', '', 'g') <> '' or r.ticket_code ilike btrim(p_q) || '%')
  order by r.created_at desc
  offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- Anotar lo que pagó un inscripto.
create or replace function public.event_set_paid(p_reg uuid, p_amount numeric, p_note text default null) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_registrations where id = p_reg;
  if v_event is null or not public.can_plan_event(v_event) then raise exception 'No tenés permiso'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Monto inválido'; end if;
  update public.event_registrations set paid_amount = p_amount, paid_note = nullif(btrim(left(coalesce(p_note, ''), 200)), '') where id = p_reg;
end $$;

-- Publicar o despublicar la página del evento. Al publicar se le da un enlace corto.
create or replace function public.event_set_public(p_event uuid, p_on boolean) returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_slug text;
begin
  if not public.can_plan_event(p_event) then raise exception 'No tenés permiso'; end if;
  select slug into v_slug from public.events where id = p_event;
  if v_slug is null then
    loop
      v_slug := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      exit when not exists (select 1 from public.events where slug = v_slug);
    end loop;
  end if;
  update public.events set slug = v_slug, public_page = p_on, registration = registration or p_on where id = p_event;
  return v_slug;
end $$;

-- Aviso a los inscriptos: queda en la página del evento y les llega a los que tienen la app.
create or replace function public.event_post_update(p_event uuid, p_body text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_title text; r record;
begin
  if not public.can_plan_event(p_event) then raise exception 'No tenés permiso'; end if;
  if length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Escribí el aviso'; end if;
  insert into public.event_updates (church_id, event_id, body) values (public.current_church_id(), p_event, btrim(left(p_body, 1000)));
  select title into v_title from public.events where id = p_event;
  for r in select distinct user_id from public.event_registrations where event_id = p_event and user_id is not null loop
    perform public.notify(r.user_id, 'link', v_title, left(btrim(p_body), 140), '/evento/' || p_event::text);
  end loop;
end $$;

revoke all on function public.event_plan_stats(uuid), public.event_plan_registrations(uuid, text, integer, integer), public.event_set_paid(uuid, numeric, text),
  public.event_set_public(uuid, boolean), public.event_post_update(uuid, text) from public, anon;
grant execute on function public.event_plan_stats(uuid), public.event_plan_registrations(uuid, text, integer, integer), public.event_set_paid(uuid, numeric, text),
  public.event_set_public(uuid, boolean), public.event_post_update(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. La página pública (sin cuenta). Solo muestra eventos publicados; no se lee ninguna tabla directo.
-- ---------------------------------------------------------------------------
create or replace function public.event_public(p_slug text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare e public.events; c record; r public.event_registrations; v_taken integer; v_paid boolean := false; v_can_stream boolean; v_price numeric;
begin
  select * into e from public.events where slug = lower(btrim(p_slug)) and public_page;
  if e.id is null then return null; end if;
  select name, case when logo_path ~ '^https?:' then logo_path else null end as logo, coalesce(timezone, 'America/Argentina/Buenos_Aires') as tz into c from public.churches where id = e.church_id;
  if p_token is not null then
    select * into r from public.event_registrations where access_token = p_token and event_id = e.id;
    if r.id is not null then
      select r.people * coalesce((select price from public.event_ticket_types where id = r.ticket_type_id), e.reg_price, 0) into v_price;
      v_paid := v_price = 0 or r.paid_amount >= v_price;
    end if;
  end if;
  select coalesce(sum(people), 0) into v_taken from public.event_registrations where event_id = e.id;
  v_can_stream := e.stream_access = 'all' or (e.stream_access = 'registered' and r.id is not null) or (e.stream_access = 'paid' and r.id is not null and v_paid);
  return jsonb_build_object(
    'church', jsonb_build_object('name', c.name, 'logo', c.logo, 'tz', c.tz),
    'event', jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'all_day', e.all_day, 'place', e.place, 'description', e.description,
      'cost', e.cost, 'transport', e.transport, 'bring', e.bring, 'program', e.program, 'faq', e.faq, 'pay_info', e.pay_info,
      'contact_name', e.contact_name, 'contact_phone', e.contact_phone, 'image_key', e.image_key,
      'registration', e.registration and (e.reg_deadline is null or e.reg_deadline >= (now() at time zone c.tz)::date),
      'price', e.reg_price, 'left', case when e.reg_capacity is null then null else greatest(e.reg_capacity - v_taken, 0) end,
      'stream_access', e.stream_access, 'has_stream', e.stream_url is not null, 'has_recordings', jsonb_array_length(e.recordings) > 0),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description, 'price', t.price, 'color', t.color,
        'left', case when t.capacity is null then null else greatest(t.capacity - coalesce((select sum(x.people) from public.event_registrations x where x.ticket_type_id = t.id), 0), 0) end) order by t.sort, t.created_at)
      from public.event_ticket_types t where t.event_id = e.id and t.active), '[]'::jsonb),
    'speakers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'bio', s.bio) order by s.sort, s.created_at) from public.event_speakers s where s.event_id = e.id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'title', s.title, 'description', s.description, 'place', s.place, 'speaker_id', s.speaker_id) order by s.starts_at)
      from public.event_sessions s where s.event_id = e.id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('body', u.body, 'at', u.created_at) order by u.created_at desc) from (select * from public.event_updates where event_id = e.id order by created_at desc limit 20) u), '[]'::jsonb),
    'stream', case when v_can_stream then jsonb_build_object('url', e.stream_url, 'recordings', e.recordings) else null end,
    'ticket', case when r.id is null then null else jsonb_build_object('name', r.name, 'people', r.people, 'code', r.ticket_code, 'token', r.access_token,
      'type', (select name from public.event_ticket_types where id = r.ticket_type_id), 'to_pay', v_price, 'paid_amount', r.paid_amount, 'paid', v_paid, 'checked_in', r.checked_in_at is not null) end
  );
end $$;

create or replace function public.event_public_register(p_slug text, p_name text, p_phone text, p_email text default null, p_people integer default 1, p_type uuid default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare e public.events; v_tz text; v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''); v_on date; r public.event_registrations; v_name text := btrim(coalesce(p_name, ''));
begin
  select * into e from public.events where slug = lower(btrim(p_slug)) and public_page;
  if e.id is null then raise exception 'Este evento no está disponible'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = e.church_id;
  if not e.registration then raise exception 'Este evento no tiene inscripción'; end if;
  if e.reg_deadline is not null and e.reg_deadline < (now() at time zone v_tz)::date then raise exception 'La inscripción ya cerró'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Escribí tu nombre y apellido'; end if;
  if v_phone is null or length(v_phone) < 8 or length(v_phone) > 15 then raise exception 'Escribí tu celular con el código de área'; end if;
  if p_email is not null and btrim(p_email) <> '' and (length(p_email) > 200 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Revisá el correo'; end if;
  if p_people is null or p_people < 1 or p_people > 10 then raise exception 'Se pueden anotar de 1 a 10 personas por vez'; end if;
  if exists (select 1 from public.event_ticket_types where event_id = e.id and active) then
    if p_type is null or not exists (select 1 from public.event_ticket_types where id = p_type and event_id = e.id and active) then raise exception 'Elegí el tipo de entrada'; end if;
  else
    p_type := null;
  end if;
  v_on := (e.starts_at at time zone v_tz)::date;
  -- El mismo celular ya anotado: se le devuelve su entrada en vez de duplicarla.
  select * into r from public.event_registrations where event_id = e.id and phone = v_phone order by created_at limit 1;
  if r.id is not null then return jsonb_build_object('token', r.access_token, 'code', r.ticket_code, 'already', true); end if;
  -- Freno a los abusos: no más de 60 inscripciones por la web por minuto en un evento.
  if (select count(*) from public.event_registrations where event_id = e.id and source = 'web' and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'Hay mucha gente inscribiéndose ahora. Probá de nuevo en un minuto.';
  end if;
  insert into public.event_registrations (event_id, occurs_on, church_id, user_id, name, phone, email, people, ticket_type_id, source)
  values (e.id, v_on, e.church_id, auth.uid(), v_name, v_phone, nullif(btrim(coalesce(p_email, '')), ''), p_people, p_type, 'web')
  returning * into r;
  return jsonb_build_object('token', r.access_token, 'code', r.ticket_code, 'already', false);
end $$;

revoke all on function public.event_public(text, text), public.event_public_register(text, text, text, text, integer, uuid) from public;
grant execute on function public.event_public(text, text), public.event_public_register(text, text, text, text, integer, uuid) to anon, authenticated;
