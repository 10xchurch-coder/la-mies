-- 0036:
--  1. Culto en vivo: la app sabe cuándo el canal de YouTube está transmitiendo (lo revisa cada 3 minutos),
--     avisa a todos y muestra la transmisión con comentarios y notas dentro de la app.
--  2. Seguimiento de visitas: la primera vez que viene alguien, se le asigna una llamada (48 h) y una visita
--     (7 días) a su jefe de ruta (o a quien lo sigue, o al pastor), con recordatorio hasta que se haga.
--  3. Cumpleaños: la víspera les llega a los líderes.
--  4. Niños: al dejar a un chico en la guardería o en su clase, se da un código para retirarlo y se le toma asistencia.
--  5. Rutas del colectivo: lista de pasajeros de cada ruta y quién subió cada día.
--  6. La página web de la iglesia (para compartirla desde el mapa).

alter table public.churches
  add column if not exists website text,
  add column if not exists live_video_id text,
  add column if not exists live_title text,
  add column if not exists live_since timestamptz,
  add column if not exists live_manual boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1. En vivo
-- ---------------------------------------------------------------------------
alter table public.churches add column if not exists youtube_channel_id text;
create table if not exists public.youtube_live_fetches (
  request_id   bigint primary key,
  church_id    uuid not null references public.churches(id) on delete cascade,
  requested_at timestamptz not null default now(),
  done         boolean not null default false
);
alter table public.youtube_live_fetches enable row level security;
revoke all on public.youtube_live_fetches from anon, authenticated;

create or replace function public.youtube_live_watch() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare c record; f record; v_body text; v_id text; v_title text; n int := 0; u uuid;
begin
  -- 1) leer las respuestas que ya llegaron
  for f in select y.*, r.content, r.status_code from public.youtube_live_fetches y
           join net._http_response r on r.id = y.request_id where not y.done loop
    update public.youtube_live_fetches set done = true where request_id = f.request_id;
    select * into c from public.churches where id = f.church_id;
    if c.live_manual and c.live_since > now() - interval '4 hours' then continue; end if;
    v_body := coalesce(f.content, '');
    v_id := null;
    if f.status_code = 200 and v_body like '%"isLiveNow":true%' then
      v_id := substring(v_body from '<link rel="canonical" href="https://www.youtube.com/watch\?v=([A-Za-z0-9_-]{11})"');
      v_title := substring(v_body from '<meta name="title" content="([^"]*)"');
    end if;
    if v_id is not null and c.live_video_id is distinct from v_id then
      update public.churches set live_video_id = v_id, live_title = v_title, live_since = now(), live_manual = false where id = c.id;
      -- avisar a todos una sola vez por transmisión
      if public.job_once(c.id, 'live', v_id) then
        for u in select id from public.profiles where church_id = c.id and disabled_at is null loop
          perform public.notify(u, 'live', 'El culto está en vivo', coalesce(v_title, 'Tocá para verlo en la app.'), '/vivo');
        end loop;
      end if;
      n := n + 1;
    elsif v_id is null and f.status_code = 200 and c.live_video_id is not null and not c.live_manual then
      update public.churches set live_video_id = null, live_title = null, live_since = null where id = c.id;
    end if;
  end loop;
  delete from public.youtube_live_fetches where requested_at < now() - interval '1 day';
  -- 2) pedir de nuevo
  for c in select * from public.churches where youtube_channel_id is not null loop
    insert into public.youtube_live_fetches (request_id, church_id)
    values (net.http_get('https://www.youtube.com/channel/' || c.youtube_channel_id || '/live',
                         headers => jsonb_build_object('User-Agent', 'Mozilla/5.0 (LaMies)', 'Accept-Language', 'es-AR,es;q=0.9')), c.id);
  end loop;
  return n;
end $$;
revoke all on function public.youtube_live_watch() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'lamies-vivo';
    perform cron.schedule('lamies-vivo', '*/3 * * * *', 'select public.youtube_live_watch()');
  end if;
end $$;

-- Marcar a mano que estamos en vivo (o terminar).
create or replace function public.set_live(p_video text, p_title text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_id text; u uuid;
begin
  if not public.has_perm('predicas.subir') then raise exception 'Solo quien maneja las prédicas y la transmisión'; end if;
  if p_video is null or trim(p_video) = '' then
    update public.churches set live_video_id = null, live_title = null, live_since = null, live_manual = false where id = public.current_church_id();
    return;
  end if;
  v_id := coalesce(substring(p_video from '(?:v=|youtu\.be/|/live/|/embed/)([A-Za-z0-9_-]{11})'), case when p_video ~ '^[A-Za-z0-9_-]{11}$' then p_video end);
  if v_id is null then raise exception 'No reconozco ese link de YouTube'; end if;
  update public.churches set live_video_id = v_id, live_title = coalesce(nullif(trim(p_title), ''), 'Culto en vivo'), live_since = now(), live_manual = true
   where id = public.current_church_id();
  if public.job_once(public.current_church_id(), 'live', v_id) then
    for u in select id from public.profiles where church_id = public.current_church_id() and disabled_at is null and id <> auth.uid() loop
      perform public.notify(u, 'live', 'El culto está en vivo', 'Tocá para verlo en la app.', '/vivo');
    end loop;
  end if;
end $$;
revoke all on function public.set_live(text, text) from public, anon;
grant execute on function public.set_live(text, text) to authenticated;

create table if not exists public.live_comments (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  video_id   text not null,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body       text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists live_comments_video_idx on public.live_comments (church_id, video_id, created_at);
alter table public.live_comments enable row level security;
grant select, insert, delete on public.live_comments to authenticated;
drop policy if exists live_comments_select on public.live_comments;
create policy live_comments_select on public.live_comments for select to authenticated
  using (church_id = public.current_church_id()
         and not exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = user_id));
drop policy if exists live_comments_insert on public.live_comments;
create policy live_comments_insert on public.live_comments for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid());
drop policy if exists live_comments_delete on public.live_comments;
create policy live_comments_delete on public.live_comments for delete to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.has_perm('com.moderar')));

create or replace function public.live_comments_list(p_video text, p_after timestamptz default null)
returns table (id uuid, user_id uuid, author text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, p.display_name, c.body, c.created_at, c.user_id = auth.uid()
  from public.live_comments c join public.profiles p on p.id = c.user_id
  where c.church_id = public.current_church_id() and c.video_id = p_video
    and (p_after is null or c.created_at > p_after)
    and not exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = c.user_id)
  order by c.created_at
  limit 300
$$;
grant execute on function public.live_comments_list(text, timestamptz) to authenticated;

create table if not exists public.live_notes (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  video_id   text not null,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.live_notes enable row level security;
grant select, insert, update, delete on public.live_notes to authenticated;
drop policy if exists live_notes_own on public.live_notes;
create policy live_notes_own on public.live_notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Seguimiento de visitas
-- ---------------------------------------------------------------------------
create table if not exists public.follow_up_tasks (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('call', 'visit')),
  due_at      timestamptz not null,
  done_at     timestamptz,
  done_by     uuid references public.profiles(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (contact_id, kind)
);
create index if not exists follow_up_tasks_open_idx on public.follow_up_tasks (church_id, assigned_to) where done_at is null;
alter table public.follow_up_tasks enable row level security;
grant select, update on public.follow_up_tasks to authenticated;
drop policy if exists follow_up_select on public.follow_up_tasks;
create policy follow_up_select on public.follow_up_tasks for select to authenticated
  using (church_id = public.current_church_id() and (assigned_to = auth.uid() or public.has_perm('personas.ver_todas')));
drop policy if exists follow_up_update on public.follow_up_tasks;
create policy follow_up_update on public.follow_up_tasks for update to authenticated
  using (church_id = public.current_church_id() and (assigned_to = auth.uid() or public.has_perm('personas.editar')))
  with check (church_id = public.current_church_id());

-- Al marcar presente a una visita por primera vez, se crean la llamada y la visita.
create or replace function public.first_visit_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; v_to uuid;
begin
  select * into c from public.contacts where id = new.contact_id;
  if c.id is null or c.status <> 'visitor' then return new; end if;
  if exists (select 1 from public.attendances a where a.contact_id = new.contact_id and a.id <> new.id) then return new; end if;
  v_to := coalesce(c.follow_up_user_id,
                   (select g.captain_id from public.groups g where g.id = c.group_id),
                   (select p.id from public.profiles p where p.church_id = c.church_id and p.role::text = 'admin' and p.disabled_at is null order by p.created_at limit 1));
  insert into public.follow_up_tasks (church_id, contact_id, assigned_to, kind, due_at)
  values (c.church_id, c.id, v_to, 'call', now() + interval '48 hours'),
         (c.church_id, c.id, v_to, 'visit', now() + interval '7 days')
  on conflict (contact_id, kind) do nothing;
  if v_to is not null then
    perform public.notify(v_to, 'followup', c.name || ' vino por primera vez',
      'Llamalo o escribile en las próximas 48 horas y visitalo esta semana.', '/contacto/' || c.id);
  end if;
  return new;
end $$;
drop trigger if exists first_visit_tasks on public.attendances;
create trigger first_visit_tasks after insert on public.attendances for each row execute function public.first_visit_tasks();
revoke all on function public.first_visit_tasks() from public, anon, authenticated;

-- Registrar una visita o llamada cierra la tarea.
create or replace function public.visit_closes_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.follow_up_tasks set done_at = now(), done_by = new.user_id
   where contact_id = new.contact_id and done_at is null;
  return new;
end $$;
drop trigger if exists visit_closes_task on public.contact_visits;
create trigger visit_closes_task after insert on public.contact_visits for each row execute function public.visit_closes_task();
revoke all on function public.visit_closes_task() from public, anon, authenticated;

create or replace function public.my_follow_ups()
returns table (id uuid, contact_id uuid, name text, phone text, photo_path text, kind text, due_at timestamptz, overdue boolean)
language sql stable security definer set search_path = public as $$
  select t.id, c.id, c.name, c.phone, c.photo_path, t.kind, t.due_at, t.due_at < now()
  from public.follow_up_tasks t join public.contacts c on c.id = t.contact_id
  where t.church_id = public.current_church_id() and t.done_at is null and not c.archived
    and (t.assigned_to = auth.uid() or (t.assigned_to is null and public.has_perm('personas.editar')))
  order by t.due_at
$$;
grant execute on function public.my_follow_ups() to authenticated;

create or replace function public.complete_follow_up(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.follow_up_tasks set done_at = now(), done_by = auth.uid()
   where id = p_task and church_id = public.current_church_id()
     and (assigned_to = auth.uid() or public.has_perm('personas.editar'));
  if not found then raise exception 'No podés cerrar esta tarea'; end if;
end $$;
grant execute on function public.complete_follow_up(uuid) to authenticated;

-- Recordatorio diario (9 h) de lo vencido.
create or replace function public.run_follow_up_reminders(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if extract(hour from p_local)::int <> 9 or not public.job_once(p_church, 'followups', p_local::date::text) then return 0; end if;
  for r in select t.assigned_to, count(*) k from public.follow_up_tasks t
           where t.church_id = p_church and t.done_at is null and t.due_at < now() and t.assigned_to is not null group by t.assigned_to loop
    perform public.notify(r.assigned_to, 'followup', r.k || case when r.k = 1 then ' visita pendiente' else ' visitas pendientes' end,
      'Personas que vinieron por primera vez y todavía no llamaste o visitaste.', '/seguimiento');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_follow_up_reminders(uuid, timestamp) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cumpleaños: la víspera a las 19 h, a los líderes (y a cada jefe de ruta, los de su ruta).
-- ---------------------------------------------------------------------------
create or replace function public.run_birthday_reminders(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare v_tomorrow date := p_local::date + 1; r record; u uuid; n int := 0; v_names text;
begin
  if extract(hour from p_local)::int <> 19 or not public.job_once(p_church, 'birthdays', v_tomorrow::text) then return 0; end if;
  select string_agg(c.name || ' (' || (extract(year from v_tomorrow) - extract(year from c.birthdate))::int || ')', ', ' order by c.name) into v_names
  from public.contacts c where c.church_id = p_church and not c.archived and c.status in ('member', 'visitor')
    and c.birthdate is not null and extract(month from c.birthdate) = extract(month from v_tomorrow) and extract(day from c.birthdate) = extract(day from v_tomorrow);
  if v_names is null then return 0; end if;
  for u in select p.id from public.profiles p where p.church_id = p_church and p.disabled_at is null
                and 'inf.panel' = any(public.perms_of(p.id)) loop
    perform public.notify(u, 'birthday', 'Mañana cumplen años', v_names || '. Mandales un saludo.', '/cumples');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_birthday_reminders(uuid, timestamp) from public, anon, authenticated;

create or replace function public.upcoming_birthdays(p_days int default 30)
returns table (contact_id uuid, name text, phone text, photo_path text, birthdate date, next_on date, turns int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.phone, c.photo_path, c.birthdate, x.next_on, (extract(year from x.next_on) - extract(year from c.birthdate))::int
  from public.contacts c
  cross join lateral (select case when make_date(extract(year from public.church_today())::int, extract(month from c.birthdate)::int, least(extract(day from c.birthdate)::int, 28 + (extract(month from c.birthdate) <> 2)::int * 2)) >= public.church_today()
                                  then make_date(extract(year from public.church_today())::int, extract(month from c.birthdate)::int, least(extract(day from c.birthdate)::int, 28 + (extract(month from c.birthdate) <> 2)::int * 2))
                                  else make_date(extract(year from public.church_today())::int + 1, extract(month from c.birthdate)::int, least(extract(day from c.birthdate)::int, 28 + (extract(month from c.birthdate) <> 2)::int * 2)) end as next_on) x
  where c.church_id = public.current_church_id() and not c.archived and c.status in ('member', 'visitor') and c.birthdate is not null
    and public.can_see_contact(c) and x.next_on <= public.church_today() + p_days
  order by x.next_on, c.name
$$;
grant execute on function public.upcoming_birthdays(int) to authenticated;

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
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Niños: entrada y retiro con código.
-- ---------------------------------------------------------------------------
create table if not exists public.child_checkins (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  child_id      uuid not null references public.contacts(id) on delete cascade,
  on_date       date not null default public.church_today(),
  room          text not null,
  code          text not null,
  in_at         timestamptz not null default now(),
  in_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  brought_by    text,
  out_at        timestamptz,
  out_by        uuid references public.profiles(id) on delete set null,
  unique (child_id, on_date, room)
);
create index if not exists child_checkins_day_idx on public.child_checkins (church_id, on_date);
alter table public.child_checkins enable row level security;
grant select on public.child_checkins to authenticated;
drop policy if exists child_checkins_select on public.child_checkins;
create policy child_checkins_select on public.child_checkins for select to authenticated
  using (church_id = public.current_church_id() and (public.can_take_attendance() or public.is_any_teacher()
         or exists (select 1 from public.contact_children k join public.contacts p on p.id = k.contact_id
                    where k.child_contact_id = child_id and (p.profile_id = auth.uid()
                      or p.spouse_id in (select id from public.contacts where profile_id = auth.uid())))));

create or replace function public.check_in_child(p_child uuid, p_room text, p_brought_by text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text; c record; v_service uuid;
begin
  if not (public.can_take_attendance() or public.is_any_teacher()) then raise exception 'Solo quien recibe a los chicos'; end if;
  select * into c from public.contacts where id = p_child and church_id = public.current_church_id();
  if c.id is null then raise exception 'No existe ese chico'; end if;
  select code into v_code from public.child_checkins where child_id = p_child and on_date = public.church_today() and room = p_room;
  if v_code is not null then return v_code; end if;
  -- el mismo código para hermanos que llegan juntos con el mismo adulto
  select k.code into v_code from public.child_checkins k
   join public.contact_children a on a.child_contact_id = k.child_id
   join public.contact_children b on b.contact_id = a.contact_id and b.child_contact_id = p_child
   where k.on_date = public.church_today() and k.out_at is null and k.church_id = c.church_id limit 1;
  if v_code is null then
    loop
      v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
      exit when not exists (select 1 from public.child_checkins where church_id = c.church_id and on_date = public.church_today() and code = v_code and out_at is null);
    end loop;
  end if;
  insert into public.child_checkins (church_id, child_id, room, code, brought_by) values (c.church_id, p_child, p_room, v_code, nullif(trim(p_brought_by), ''));
  -- asistencia en la reunión de hoy (la principal, o la primera)
  select id into v_service from public.church_services
   where church_id = c.church_id and dow = extract(dow from public.church_today())::int
   order by main desc, time limit 1;
  if v_service is not null and not exists (select 1 from public.attendances where contact_id = p_child and attended_on = public.church_today()) then
    insert into public.attendances (church_id, contact_id, attended_on, service, service_id, recorded_by)
    values (c.church_id, p_child, public.church_today(),
            case extract(dow from public.church_today())::int when 6 then 'sat' when 0 then 'sun' else 'other' end, v_service, auth.uid())
    on conflict do nothing;
  end if;
  return v_code;
end $$;
grant execute on function public.check_in_child(uuid, text, text) to authenticated;

create or replace function public.check_out_child(p_code text) returns table (child_id uuid, name text)
language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_take_attendance() or public.is_any_teacher()) then raise exception 'Solo quien entrega a los chicos'; end if;
  return query
  with u as (
    update public.child_checkins k set out_at = now(), out_by = auth.uid()
     where k.church_id = public.current_church_id() and k.on_date = public.church_today() and k.code = trim(p_code) and k.out_at is null
    returning k.child_id
  )
  select u.child_id, c.name from u join public.contacts c on c.id = u.child_id;
end $$;
grant execute on function public.check_out_child(text) to authenticated;

create or replace function public.checkins_today()
returns table (id uuid, child_id uuid, name text, photo_path text, room text, code text, in_at timestamptz, out_at timestamptz, brought_by text, age int)
language sql stable security definer set search_path = public as $$
  select k.id, k.child_id, c.name, c.photo_path, k.room, k.code, k.in_at, k.out_at, k.brought_by,
         coalesce(extract(year from age(c.birthdate))::int, c.age)
  from public.child_checkins k join public.contacts c on c.id = k.child_id
  where k.church_id = public.current_church_id() and k.on_date = public.church_today()
    and (public.can_take_attendance() or public.is_any_teacher())
  order by k.room, c.name
$$;
grant execute on function public.checkins_today() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rutas del colectivo: quién subió cada día.
-- ---------------------------------------------------------------------------
alter table public.contacts add column if not exists bus_rider boolean not null default false;
create table if not exists public.bus_pickups (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  on_date    date not null default public.church_today(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  group_id   uuid references public.groups(id) on delete set null,
  picked_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  picked_at  timestamptz not null default now(),
  primary key (contact_id, on_date)
);
alter table public.bus_pickups enable row level security;
grant select, insert, delete on public.bus_pickups to authenticated;
drop policy if exists bus_pickups_rw on public.bus_pickups;
create policy bus_pickups_rw on public.bus_pickups for all to authenticated
  using (church_id = public.current_church_id() and (public.has_perm('personas.asistencia') or public.can_take_attendance()))
  with check (church_id = public.current_church_id() and (public.has_perm('personas.asistencia') or public.can_take_attendance()));

create or replace function public.route_riders(p_group uuid)
returns table (contact_id uuid, name text, phone text, photo_path text, address text, pickup_time text, picked boolean, status text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.phone, c.photo_path, coalesce(c.address, c.address_hint), c.pickup_time,
         exists (select 1 from public.bus_pickups b where b.contact_id = c.id and b.on_date = public.church_today()), c.status
  from public.contacts c
  where c.church_id = public.current_church_id() and not c.archived and c.group_id = p_group
    and (c.bus_rider or c.pickup)
    and (public.can_take_attendance() or public.has_perm('personas.ver_todas'))
  order by c.pickup_time nulls last, c.name
$$;
grant execute on function public.route_riders(uuid) to authenticated;

-- Que el pastor/secretaría pueda marcar quién viaja en el colectivo.
create or replace function public.set_bus_rider(p_contact uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts;
begin
  select * into c from public.contacts where id = p_contact;
  if c.id is null or not (public.can_edit_contact(c) or public.can_take_attendance()) then raise exception 'No podés cambiar esta ficha'; end if;
  update public.contacts set bus_rider = p_on where id = p_contact;
end $$;
grant execute on function public.set_bus_rider(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Datos de la Iglesia Bautista Victoria.
-- ---------------------------------------------------------------------------
update public.churches set website = coalesce(website, 'https://iglesiavictoria.com'), youtube_channel_id = coalesce(youtube_channel_id, 'UCSeQLrnFBd-A9fhWZtHPAMw')
 where id = '2c35b2a1-494d-475d-8a87-b7df18974838';

-- 7. En los informes: "con el evangelio presentado" (ya no se cuenta quién recibió a Cristo).
do $r$
declare f record; d text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc like '%'' con el evangelio%' loop
    d := pg_get_functiondef(f.oid);
    d := replace(d, ''' con el evangelio presentado''', ''' con el evangelio''');
    d := replace(d, ''' con el evangelio''', ''' con el evangelio presentado''');
    d := replace(d, ''' con el evangelio · ''', ''' con el evangelio presentado · ''');
    d := replace(d, ''' con el evangelio presentado presentado''', ''' con el evangelio presentado''');
    execute d;
  end loop;
end $r$;

-- 8. Copia de seguridad semanal: todo lo que no se puede volver a armar, en un solo JSON (solo desde el servidor).
create or replace function public.export_church_backup(p_church uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb := jsonb_build_object('church_id', p_church, 'exported_at', now()); t text; r jsonb;
begin
  foreach t in array array['profiles', 'contacts', 'contact_children', 'contact_visits', 'attendances', 'groups', 'zones',
    'ministries', 'ministry_members', 'classes', 'class_teachers', 'class_students', 'class_schedule', 'class_attendance',
    'church_services', 'events', 'event_registrations', 'announcements', 'sermons', 'materials', 'prayer_requests',
    'fin_funds', 'fin_accounts', 'fin_categories', 'fin_entries', 'fin_attachments', 'fin_recurring', 'sessions', 'child_checkins', 'follow_up_tasks'] loop
    if to_regclass('public.' || t) is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'church_id') then
      execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''push_token''), ''[]''::jsonb) from public.%I x where x.church_id = $1', t) into r using p_church;
      v := v || jsonb_build_object(t, r);
    end if;
  end loop;
  v := v || jsonb_build_object(
    'contact_children', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from public.contact_children k join public.contacts c on c.id = k.contact_id where c.church_id = p_church),
    'ministry_members', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from public.ministry_members k join public.ministries m on m.id = k.ministry_id where m.church_id = p_church),
    'class_teachers', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from public.class_teachers k join public.classes m on m.id = k.class_id where m.church_id = p_church),
    'class_students', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from public.class_students k join public.classes m on m.id = k.class_id where m.church_id = p_church));
  return v;
end $$;
revoke all on function public.export_church_backup(uuid) from public, anon, authenticated;
