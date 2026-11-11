-- 0054: planificación de la alabanza (ministerio de música).
-- Canciones de la iglesia (con tono, tempo, letra y acordes que carga la propia iglesia), el orden de cada culto
-- y quién toca o canta ese día (cada uno confirma si puede).
-- Quién arma todo: la secretaría / el pastor, o el líder de un ministerio marcado como "de música".
-- Quién lo ve: ellos y los integrantes de un ministerio de música.

alter table public.ministries add column if not exists is_music boolean not null default false;

create or replace function public.can_plan_worship() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.ministries m where m.is_music and m.church_id = public.current_church_id()
                   and (m.leader_id = auth.uid()
                        or exists (select 1 from public.ministry_members mm where mm.ministry_id = m.id and mm.profile_id = auth.uid() and mm.is_leader)))
$$;
create or replace function public.can_see_worship() returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_plan_worship()
      or exists (select 1 from public.ministry_members mm join public.ministries m on m.id = mm.ministry_id
                  where m.is_music and m.church_id = public.current_church_id() and mm.profile_id = auth.uid())
$$;
revoke all on function public.can_plan_worship() from public, anon;
revoke all on function public.can_see_worship() from public, anon;
grant execute on function public.can_plan_worship() to authenticated;
grant execute on function public.can_see_worship() to authenticated;

create table if not exists public.songs (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  title      text not null check (length(btrim(title)) between 1 and 160),
  author     text,
  song_key   text check (song_key is null or length(song_key) <= 8),     -- tono: "Sol", "G", "Am"
  bpm        integer check (bpm is null or bpm between 30 and 260),
  themes     text,                                                        -- "adoración, cruz, navidad"
  lyrics     text check (lyrics is null or length(lyrics) <= 20000),      -- la carga la iglesia (himnario propio o con licencia)
  chords     text check (chords is null or length(chords) <= 20000),
  link       text,                                                        -- video o audio de referencia
  notes      text,
  archived   boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists songs_church_idx on public.songs (church_id, archived, title);

create table if not exists public.worship_plans (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  on_date    date not null,
  service_id uuid references public.church_services(id) on delete set null,
  title      text,
  notes      text,
  published  boolean not null default false,                              -- hasta publicarlo, solo lo ve quien lo arma
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists worship_plans_date_idx on public.worship_plans (church_id, on_date desc);

create table if not exists public.worship_items (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references public.worship_plans(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  sort      integer not null default 100,
  kind      text not null default 'song' check (kind in ('song', 'reading', 'prayer', 'offering', 'announcements', 'special', 'sermon', 'other')),
  title     text not null check (length(btrim(title)) between 1 and 160),
  song_id   uuid references public.songs(id) on delete set null,
  song_key  text check (song_key is null or length(song_key) <= 8),      -- tono para ese día
  minutes   integer check (minutes is null or minutes between 0 and 240),
  who       text,                                                         -- quién lo dirige
  note      text
);
create index if not exists worship_items_plan_idx on public.worship_items (plan_id, sort);

create table if not exists public.worship_team (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.worship_plans(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (length(btrim(role)) between 1 and 60),  -- "Voz", "Guitarra", "Piano", "Sonido"
  status     text not null default 'pending' check (status in ('pending', 'yes', 'no')),
  answered_at timestamptz,
  unique (plan_id, profile_id, role)
);
create index if not exists worship_team_profile_idx on public.worship_team (profile_id, status);

alter table public.songs enable row level security;
alter table public.worship_plans enable row level security;
alter table public.worship_items enable row level security;
alter table public.worship_team enable row level security;
grant select, insert, update, delete on public.songs, public.worship_plans, public.worship_items, public.worship_team to authenticated;

drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated
  using (church_id = public.current_church_id() and public.can_see_worship());
drop policy if exists songs_write on public.songs;
create policy songs_write on public.songs for all to authenticated
  using (church_id = public.current_church_id() and public.can_plan_worship())
  with check (church_id = public.current_church_id() and public.can_plan_worship());

drop policy if exists worship_plans_select on public.worship_plans;
create policy worship_plans_select on public.worship_plans for select to authenticated
  using (church_id = public.current_church_id() and (public.can_plan_worship() or (published and public.can_see_worship())));
drop policy if exists worship_plans_write on public.worship_plans;
create policy worship_plans_write on public.worship_plans for all to authenticated
  using (church_id = public.current_church_id() and public.can_plan_worship())
  with check (church_id = public.current_church_id() and public.can_plan_worship());

drop policy if exists worship_items_select on public.worship_items;
create policy worship_items_select on public.worship_items for select to authenticated
  using (exists (select 1 from public.worship_plans p where p.id = plan_id));   -- se ve si se ve el plan
drop policy if exists worship_items_write on public.worship_items;
create policy worship_items_write on public.worship_items for all to authenticated
  using (church_id = public.current_church_id() and public.can_plan_worship())
  with check (church_id = public.current_church_id() and public.can_plan_worship()
              and exists (select 1 from public.worship_plans p where p.id = plan_id and p.church_id = public.current_church_id()));

drop policy if exists worship_team_select on public.worship_team;
create policy worship_team_select on public.worship_team for select to authenticated
  using (exists (select 1 from public.worship_plans p where p.id = plan_id));
drop policy if exists worship_team_write on public.worship_team;
create policy worship_team_write on public.worship_team for all to authenticated
  using (church_id = public.current_church_id() and public.can_plan_worship())
  with check (church_id = public.current_church_id() and public.can_plan_worship()
              and exists (select 1 from public.worship_plans p where p.id = plan_id and p.church_id = public.current_church_id())
              and exists (select 1 from public.profiles pr where pr.id = profile_id and pr.church_id = public.current_church_id()));

create or replace function public.songs_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists songs_touch on public.songs;
create trigger songs_touch before update on public.songs for each row execute function public.songs_touch();

-- Cada músico contesta por su turno: puedo / no puedo.
create or replace function public.worship_answer(p_team uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.worship_team t set status = case when p_yes then 'yes' else 'no' end, answered_at = now()
   where t.id = p_team and t.profile_id = auth.uid() and t.church_id = public.current_church_id()
     and exists (select 1 from public.worship_plans p where p.id = t.plan_id and p.published);
  if not found then raise exception 'Ese turno no es tuyo o todavía no está publicado.'; end if;
end $$;
revoke all on function public.worship_answer(uuid, boolean) from public, anon;
grant execute on function public.worship_answer(uuid, boolean) to authenticated;

-- Cuántas veces se cantó cada canción y cuándo fue la última (para no repetir siempre las mismas).
create or replace function public.song_usage()
returns table (song_id uuid, times integer, last_used date)
language sql stable security definer set search_path = public as $$
  select i.song_id, count(distinct p.id)::int, max(p.on_date)
    from public.worship_items i join public.worship_plans p on p.id = i.plan_id
   where p.church_id = public.current_church_id() and public.can_see_worship()
     and i.song_id is not null and p.on_date <= current_date and p.on_date > current_date - 365
   group by i.song_id
$$;
revoke all on function public.song_usage() from public, anon;
grant execute on function public.song_usage() to authenticated;

-- Copiar el orden de un culto anterior a una fecha nueva (sin el equipo).
create or replace function public.worship_copy(p_plan uuid, p_date date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_new uuid; v_src public.worship_plans;
begin
  if not public.can_plan_worship() then raise exception 'No tenés permiso para armar la alabanza.'; end if;
  select * into v_src from public.worship_plans where id = p_plan and church_id = public.current_church_id();
  if v_src.id is null then raise exception 'No encontré ese culto.'; end if;
  insert into public.worship_plans (church_id, on_date, service_id, title, notes, published)
  values (v_src.church_id, p_date, v_src.service_id, v_src.title, v_src.notes, false) returning id into v_new;
  insert into public.worship_items (plan_id, church_id, sort, kind, title, song_id, song_key, minutes, who, note)
  select v_new, church_id, sort, kind, title, song_id, song_key, minutes, who, note from public.worship_items where plan_id = p_plan;
  return v_new;
end $$;
revoke all on function public.worship_copy(uuid, date) from public, anon;
grant execute on function public.worship_copy(uuid, date) to authenticated;
