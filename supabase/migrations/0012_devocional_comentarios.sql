-- ============================================================================
-- La Mies · Devocional: comentarios del día, "me gusta", días anteriores y foto del día.
--  - Comentarios: un chat por día para toda la iglesia. Se puede escribir solo el mismo día
--    (24 horas, hora de la iglesia); los días anteriores se pueden leer.
--  - Me gusta (corazón): uno por persona y por día, hasta 31 días atrás.
--  - Días anteriores: lo de los últimos 31 días (como máximo).
--  - Fondo "auto": una foto distinta cada día (la elige la app).
-- Se puede correr más de una vez.
-- ============================================================================

-- Hoy, en la hora de la iglesia.
create or replace function public.church_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.churches where id = public.current_church_id()),
                                      'America/Argentina/Buenos_Aires'))::date
$$;
grant execute on function public.church_today() to authenticated;

-- Comentarios del día.
create table if not exists public.daily_comments (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  on_date    date not null,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists daily_comments_day_idx on public.daily_comments (church_id, on_date, created_at);
alter table public.daily_comments enable row level security;
grant select, insert, delete on public.daily_comments to authenticated;
grant all on public.daily_comments to service_role;

drop policy if exists daily_comments_select on public.daily_comments;
create policy daily_comments_select on public.daily_comments for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists daily_comments_insert on public.daily_comments;
create policy daily_comments_insert on public.daily_comments for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid() and on_date = public.church_today());
drop policy if exists daily_comments_delete on public.daily_comments;
create policy daily_comments_delete on public.daily_comments for delete to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_staff()));

-- Me gusta del día.
create table if not exists public.daily_likes (
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  on_date    date not null,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (church_id, on_date, user_id)
);
alter table public.daily_likes enable row level security;
grant select, insert, delete on public.daily_likes to authenticated;
grant all on public.daily_likes to service_role;

drop policy if exists daily_likes_select on public.daily_likes;
create policy daily_likes_select on public.daily_likes for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists daily_likes_insert on public.daily_likes;
create policy daily_likes_insert on public.daily_likes for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid()
              and on_date between public.church_today() - 30 and public.church_today());
drop policy if exists daily_likes_delete on public.daily_likes;
create policy daily_likes_delete on public.daily_likes for delete to authenticated
  using (user_id = auth.uid());

-- Los comentarios con nombre y foto de quien escribió.
create or replace function public.daily_comments_list(p_date date)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = c.user_id limit 1),
         c.body, c.created_at, c.user_id = auth.uid()
  from public.daily_comments c
  left join public.profiles p on p.id = c.user_id
  where c.church_id = public.current_church_id() and c.on_date = p_date
  order by c.created_at
  limit 500
$$;
grant execute on function public.daily_comments_list(date) to authenticated;

-- Cuántos comentarios y corazones tiene un día, y si yo ya le di corazón.
create or replace function public.daily_social(p_date date)
returns table (comments integer, likes integer, liked boolean, open boolean)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.daily_comments where church_id = public.current_church_id() and on_date = p_date),
    (select count(*)::int from public.daily_likes where church_id = public.current_church_id() and on_date = p_date),
    exists (select 1 from public.daily_likes where church_id = public.current_church_id() and on_date = p_date and user_id = auth.uid()),
    p_date = public.church_today()
$$;
grant execute on function public.daily_social(date) to authenticated;

-- Lo de los últimos días (hoy primero), como máximo 31.
create or replace function public.daily_range(p_days integer default 31)
returns setof public.daily_content
language plpgsql stable security definer set search_path = public as $$
declare
  t date := public.church_today();
  n integer := least(greatest(coalesce(p_days, 31), 1), 31);
  r public.daily_content;
begin
  for i in 0 .. n - 1 loop
    r := public.daily_for(t - i);
    if r.id is not null then return next r; end if;
  end loop;
end $$;
grant execute on function public.daily_range(integer) to authenticated;

-- Comentarios en vivo.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.daily_comments;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Foto del día: lo nuevo usa "auto" y los devocionales generales y de noviembre pasan a foto.
alter table public.daily_content alter column background set default 'auto';
update public.daily_content set background = 'auto'
  where background in ('campo', 'cielo', 'amanecer', 'noche', 'rio', 'montana')
    and (church_id is null or on_date >= date '2026-11-01');
