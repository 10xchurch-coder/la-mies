-- 0044: chat de la iglesia, el colectivo en vivo y los cumpleaños del día.
--  1. Chat de toda la iglesia: mensajes en vivo, se pueden denunciar y bloquear como lo demás.
--  2. Colectivo en vivo: el jefe de la ruta (o el que el pastor elija) toca "Salimos" y los de esa ruta
--     ven el colectivo en el mapa. Se apaga solo si el teléfono deja de mandar la ubicación.
--  3. Cumpleaños: el mismo día a la mañana, aviso a los líderes y a la iglesia; tarjeta en el inicio;
--     cada uno puede cargar su propio cumpleaños.

-- ---------------------------------------------------------------------------
-- 1. Chat de la iglesia
-- ---------------------------------------------------------------------------
create table if not exists public.church_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists church_chat_time_idx on public.church_chat_messages (church_id, created_at desc);
alter table public.church_chat_messages enable row level security;
grant select, insert, delete on public.church_chat_messages to authenticated;

drop policy if exists church_chat_select on public.church_chat_messages;
create policy church_chat_select on public.church_chat_messages for select to authenticated
  using (church_id = public.current_church_id() and not public.is_blocked_by_me(user_id));
drop policy if exists church_chat_insert on public.church_chat_messages;
create policy church_chat_insert on public.church_chat_messages for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.disabled_at is null));
drop policy if exists church_chat_delete on public.church_chat_messages;
create policy church_chat_delete on public.church_chat_messages for delete to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_staff()));

-- Los últimos mensajes (o los anteriores a una fecha, para cargar más), con nombre y foto.
create or replace function public.church_chat_list(p_before timestamptz default null, p_limit int default 60)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = m.user_id limit 1),
         m.body, m.created_at, m.user_id = auth.uid()
  from public.church_chat_messages m
  left join public.profiles p on p.id = m.user_id
  where m.church_id = public.current_church_id() and not public.is_blocked_by_me(m.user_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
grant execute on function public.church_chat_list(timestamptz, int) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.church_chat_messages;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1b. Chat de la salida: entre todos los que están en evangelismo en este momento.
-- ---------------------------------------------------------------------------
create or replace function public.in_outing_now() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sessions s where s.user_id = auth.uid() and s.ended_at is null
                   and s.started_at > now() - interval '12 hours')
$$;
grant execute on function public.in_outing_now() to authenticated;

create table if not exists public.outing_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists outing_chat_time_idx on public.outing_chat_messages (church_id, created_at desc);
alter table public.outing_chat_messages enable row level security;
grant select, insert, delete on public.outing_chat_messages to authenticated;

-- Se ven los mensajes de las últimas 12 horas, mientras estás en salida (o si sos líder de evangelismo).
drop policy if exists outing_chat_select on public.outing_chat_messages;
create policy outing_chat_select on public.outing_chat_messages for select to authenticated
  using (church_id = public.current_church_id() and created_at > now() - interval '12 hours'
         and (public.in_outing_now() or public.has_perm('evang.ver_salidas')) and not public.is_blocked_by_me(user_id));
drop policy if exists outing_chat_insert on public.outing_chat_messages;
create policy outing_chat_insert on public.outing_chat_messages for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid()
              and (public.in_outing_now() or public.has_perm('evang.ver_salidas')));
drop policy if exists outing_chat_delete on public.outing_chat_messages;
create policy outing_chat_delete on public.outing_chat_messages for delete to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_staff()));

create or replace function public.outing_chat_list(p_before timestamptz default null, p_limit int default 80)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = m.user_id limit 1),
         m.body, m.created_at, m.user_id = auth.uid()
  from public.outing_chat_messages m
  left join public.profiles p on p.id = m.user_id
  where m.church_id = public.current_church_id() and m.created_at > now() - interval '12 hours'
    and (public.in_outing_now() or public.has_perm('evang.ver_salidas'))
    and not public.is_blocked_by_me(m.user_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200)
$$;
grant execute on function public.outing_chat_list(timestamptz, int) to authenticated;

-- Aviso al teléfono de los demás que están en salida (el teléfono suele estar en el bolsillo).
create or replace function public.outing_chat_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; v_name text;
begin
  select display_name into v_name from public.profiles where id = new.user_id;
  for u in select distinct s.user_id from public.sessions s
           where s.church_id = new.church_id and s.ended_at is null and s.started_at > now() - interval '12 hours' and s.user_id <> new.user_id loop
    perform public.notify(u, 'outing_chat', 'Chat de la salida · ' || coalesce(v_name, 'Alguien'), left(new.body, 140), '/salida-chat');
  end loop;
  return null;
end $$;
drop trigger if exists outing_chat_notify on public.outing_chat_messages;
create trigger outing_chat_notify after insert on public.outing_chat_messages for each row execute function public.outing_chat_notify();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.outing_chat_messages;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Denunciar un mensaje del chat.
alter table public.content_reports drop constraint if exists content_reports_kind_check;
alter table public.content_reports add constraint content_reports_kind_check
  check (kind in ('comment', 'prayer', 'ministry_message', 'announcement', 'profile', 'church_chat', 'outing_chat'));

create or replace function public.resolve_report(p_report uuid, p_remove boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_staff() then raise exception 'Solo el pastor o la secretaría'; end if;
  select * into r from public.content_reports where id = p_report and church_id = public.current_church_id();
  if r.id is null then raise exception 'No existe la denuncia'; end if;
  if p_remove then
    if r.kind = 'comment' then delete from public.daily_comments where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'prayer' then delete from public.prayer_requests where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'ministry_message' then delete from public.ministry_messages where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'announcement' then delete from public.announcements where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'church_chat' then delete from public.church_chat_messages where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'outing_chat' then delete from public.outing_chat_messages where id = r.target_id and church_id = r.church_id;
    end if;
  end if;
  update public.content_reports set status = case when p_remove then 'removed' else 'kept' end, resolved_by = auth.uid(), resolved_at = now()
  where church_id = r.church_id and kind = r.kind and target_id = r.target_id and status = 'open';
end $$;
grant execute on function public.resolve_report(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Colectivo en vivo
-- ---------------------------------------------------------------------------
-- Quiénes pueden prender el colectivo en vivo en cada ruta (además del jefe de la ruta).
create table if not exists public.bus_route_drivers (
  group_id   uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  primary key (group_id, profile_id)
);
alter table public.bus_route_drivers enable row level security;
grant select on public.bus_route_drivers to authenticated;
drop policy if exists bus_route_drivers_select on public.bus_route_drivers;
create policy bus_route_drivers_select on public.bus_route_drivers for select to authenticated
  using (church_id = public.current_church_id());

-- Cada salida del colectivo. Solo se lee y escribe con las funciones de abajo.
create table if not exists public.bus_runs (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  driver_id  uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  lat        double precision,
  lng        double precision,
  heading    double precision,
  updated_at timestamptz not null default now()
);
create index if not exists bus_runs_open_idx on public.bus_runs (group_id) where ended_at is null;
alter table public.bus_runs enable row level security;
revoke all on public.bus_runs from anon, authenticated;

create or replace function public.can_drive_bus(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups g where g.id = p_group and g.church_id = public.current_church_id()
                   and (g.captain_id = auth.uid() or public.is_staff()
                        or exists (select 1 from public.bus_route_drivers d where d.group_id = g.id and d.profile_id = auth.uid())))
$$;
grant execute on function public.can_drive_bus(uuid) to authenticated;

-- Los de la ruta: su ficha (o la de un hijo) está en esa ruta, o su cuenta tiene esa ruta.
create or replace function public.rides_bus(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.group_id = p_group)
      or exists (select 1 from public.contacts c where c.profile_id = auth.uid() and c.group_id = p_group and not c.archived)
      or exists (select 1 from public.contacts c join public.contact_children k on k.contact_id = c.id
                 join public.contacts h on h.id = k.child_contact_id
                 where c.profile_id = auth.uid() and h.group_id = p_group and not h.archived)
$$;
grant execute on function public.rides_bus(uuid) to authenticated;

create or replace function public.can_see_bus(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups g where g.id = p_group and g.church_id = public.current_church_id())
     and (public.can_drive_bus(p_group) or public.rides_bus(p_group) or public.has_perm('personas.ver_todas'))
$$;
grant execute on function public.can_see_bus(uuid) to authenticated;

-- Las personas (con cuenta) de una ruta, para avisarles.
create or replace function public.bus_riders(p_group uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p where p.group_id = p_group and p.disabled_at is null
  union
  select c.profile_id from public.contacts c join public.profiles p on p.id = c.profile_id and p.disabled_at is null
  where c.group_id = p_group and not c.archived and c.profile_id is not null
  union
  select c.profile_id from public.contacts c join public.profiles p on p.id = c.profile_id and p.disabled_at is null
  join public.contact_children k on k.contact_id = c.id join public.contacts h on h.id = k.child_contact_id
  where h.group_id = p_group and not h.archived and c.profile_id is not null
$$;
revoke all on function public.bus_riders(uuid) from public, anon, authenticated;

-- Una salida sigue "en vivo" si el teléfono mandó la ubicación en los últimos 20 minutos.
create or replace function public.bus_run_is_live(r public.bus_runs) returns boolean
language sql stable as $$ select r.ended_at is null and r.updated_at > now() - interval '20 minutes' $$;

create or replace function public.start_bus_run(p_group uuid, p_lat double precision default null, p_lng double precision default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_church uuid; v_route text; u uuid;
begin
  if not public.can_drive_bus(p_group) then raise exception 'Solo el jefe de la ruta o quien eligió el pastor'; end if;
  select church_id, name into v_church, v_route from public.groups where id = p_group;
  update public.bus_runs set ended_at = now() where group_id = p_group and ended_at is null;
  insert into public.bus_runs (church_id, group_id, driver_id, lat, lng) values (v_church, p_group, auth.uid(), p_lat, p_lng) returning id into v_id;
  for u in select public.bus_riders(p_group) loop
    if u <> auth.uid() then
      perform public.notify(u, 'bus', 'El colectivo salió', 'El colectivo de ' || v_route || ' salió de la iglesia. Tocá para verlo en el mapa.', '/colectivo-vivo');
    end if;
  end loop;
  return v_id;
end $$;
grant execute on function public.start_bus_run(uuid, double precision, double precision) to authenticated;

create or replace function public.update_bus_run(p_run uuid, p_lat double precision, p_lng double precision, p_heading double precision default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return false; end if;
  update public.bus_runs set lat = p_lat, lng = p_lng, heading = p_heading, updated_at = now()
  where id = p_run and driver_id = auth.uid() and ended_at is null and started_at > now() - interval '8 hours';
  return found;
end $$;
grant execute on function public.update_bus_run(uuid, double precision, double precision, double precision) to authenticated;

create or replace function public.end_bus_run(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from public.bus_runs where id = p_run and ended_at is null;
  if v_group is null then return; end if;
  if not exists (select 1 from public.bus_runs where id = p_run and driver_id = auth.uid()) and not public.can_drive_bus(v_group) then
    raise exception 'No podés terminar esta salida';
  end if;
  update public.bus_runs set ended_at = now() where id = p_run;
end $$;
grant execute on function public.end_bus_run(uuid) to authenticated;

-- Las rutas que puedo ver, con el colectivo en vivo si está andando.
create or replace function public.bus_live_routes()
returns table (group_id uuid, name text, can_drive boolean, run_id uuid, driver_name text, mine boolean,
               lat double precision, lng double precision, heading double precision, started_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, public.can_drive_bus(g.id), r.id, p.display_name, r.driver_id = auth.uid(),
         r.lat, r.lng, r.heading, r.started_at, r.updated_at
  from public.groups g
  left join lateral (select * from public.bus_runs x where x.group_id = g.id and public.bus_run_is_live(x)
                     order by x.started_at desc limit 1) r on true
  left join public.profiles p on p.id = r.driver_id
  where g.church_id = public.current_church_id() and public.can_see_bus(g.id)
  order by g.name
$$;
grant execute on function public.bus_live_routes() to authenticated;

-- El pastor (o el jefe de la ruta) elige quiénes pueden prender el colectivo en vivo.
create or replace function public.set_bus_drivers(p_group uuid, p_profiles uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.groups g where g.id = p_group and g.church_id = public.current_church_id()
                   and (public.is_staff() or g.captain_id = auth.uid())) then
    raise exception 'Solo el pastor, la secretaría o el jefe de la ruta';
  end if;
  delete from public.bus_route_drivers where group_id = p_group and profile_id <> all (coalesce(p_profiles, '{}'));
  insert into public.bus_route_drivers (group_id, profile_id, church_id)
  select p_group, p.id, p.church_id from public.profiles p
  where p.id = any (coalesce(p_profiles, '{}')) and p.church_id = public.current_church_id()
  on conflict do nothing;
end $$;
grant execute on function public.set_bus_drivers(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cumpleaños del día
-- ---------------------------------------------------------------------------
-- Quiénes cumplen hoy (los miembros). La edad solo la ven los líderes.
create or replace function public.today_birthdays()
returns table (contact_id uuid, profile_id uuid, name text, photo_path text, turns int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.profile_id, c.name, c.photo_path,
         case when public.has_perm('inf.panel') then (extract(year from public.church_today()) - extract(year from c.birthdate))::int end,
         c.profile_id is not null and c.profile_id = auth.uid()
  from public.contacts c
  where c.church_id = public.current_church_id() and not c.archived and c.status = 'member' and c.birthdate is not null
    and extract(month from c.birthdate) = extract(month from public.church_today())
    and extract(day from c.birthdate) = extract(day from public.church_today())
  order by c.name
$$;
grant execute on function public.today_birthdays() to authenticated;

-- Mi cumpleaños (para pedirle a cada uno que lo cargue).
create or replace function public.my_birthdate() returns date
language sql stable security definer set search_path = public as $$
  select c.birthdate from public.contacts c where c.profile_id = auth.uid() and not c.archived order by c.created_at limit 1
$$;
grant execute on function public.my_birthdate() to authenticated;

create or replace function public.set_my_birthdate(p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_date is null or p_date > current_date or p_date < date '1900-01-01' then raise exception 'Fecha no válida'; end if;
  update public.contacts set birthdate = p_date where profile_id = auth.uid() and not archived;
  if not found then raise exception 'Tu cuenta todavía no tiene ficha en la iglesia. Pedile a la secretaría que la una.'; end if;
end $$;
grant execute on function public.set_my_birthdate(date) to authenticated;

-- A las 8 de la mañana: a los líderes, con la edad; a la iglesia, el nombre; al que cumple, un saludo.
create or replace function public.run_birthday_today(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare v_today date := p_local::date; v_leaders text; v_members text; v_bday uuid[]; u uuid; n int := 0;
begin
  if extract(hour from p_local)::int <> 8 or not public.job_once(p_church, 'birthdays_today', v_today::text) then return 0; end if;
  select string_agg(c.name || ' (' || (extract(year from v_today) - extract(year from c.birthdate))::int || ')', ', ' order by c.name),
         string_agg(c.name, ', ' order by c.name) filter (where c.status = 'member'),
         array_agg(c.profile_id) filter (where c.profile_id is not null and c.status = 'member')
    into v_leaders, v_members, v_bday
  from public.contacts c where c.church_id = p_church and not c.archived and c.status in ('member', 'visitor')
    and c.birthdate is not null and extract(month from c.birthdate) = extract(month from v_today) and extract(day from c.birthdate) = extract(day from v_today);
  if v_leaders is null then return 0; end if;
  for u in select p.id from public.profiles p where p.church_id = p_church and p.disabled_at is null loop
    if u = any (coalesce(v_bday, '{}')) then
      perform public.notify(u, 'birthday', '¡Feliz cumpleaños!', 'Toda la iglesia te saluda hoy. Que el Señor te bendiga mucho.', '/');
    elsif 'inf.panel' = any (public.perms_of(u)) then
      perform public.notify(u, 'birthday', 'Hoy cumplen años', v_leaders || '. Mandales un saludo.', '/cumples');
    elsif v_members is not null then
      perform public.notify(u, 'birthday', 'Hoy cumple años ' || v_members, 'Mandale un saludo y oremos por su vida.', '/');
    else
      continue;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_birthday_today(uuid, timestamp) from public, anon, authenticated;

-- Salidas del colectivo que quedaron abiertas: se cierran solas.
create or replace function public.run_bus_cleanup() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.bus_runs set ended_at = updated_at where ended_at is null and updated_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  delete from public.bus_runs where started_at < now() - interval '30 days';
  delete from public.outing_chat_messages where created_at < now() - interval '7 days';
  delete from public.notifications where kind = 'outing_chat' and created_at < now() - interval '1 day';
  return 0;
end $$;
revoke all on function public.run_bus_cleanup() from public, anon, authenticated;

create or replace function public.run_v07_jobs() returns integer
language plpgsql security definer set search_path = public as $$
declare c record; v_local timestamp; n integer := 0;
begin
  for c in select * from public.churches loop
    v_local := now() at time zone coalesce(c.timezone, 'America/Argentina/Buenos_Aires');
    n := n + public.run_promise_reminders(c.id, v_local);
    n := n + public.run_event_reminders(c.id, v_local);
    n := n + public.run_weekly_report(c.id, v_local);
    n := n + public.run_fin_recurring(c.id, v_local);
    n := n + public.run_follow_up_reminders(c.id, v_local);
    n := n + public.run_birthday_reminders(c.id, v_local);
    n := n + public.run_birthday_today(c.id, v_local);
  end loop;
  n := n + public.run_bus_cleanup();
  return n;
end $$;
