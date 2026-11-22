-- 0065: música y radio de la iglesia (enlaces), entradas con QR y registro en la puerta, y rifas digitales.
-- NO está aplicada en la base todavía: se aplica solo cuando el pastor lo autoriza.

-- ---------------------------------------------------------------------------
-- 1. Enlaces de la iglesia: listas de música (Spotify, YouTube Music) y la radio (FM y por internet)
-- ---------------------------------------------------------------------------
create table if not exists public.church_links (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  kind       text not null check (kind in ('spotify', 'youtube_music', 'music_other', 'radio_fm', 'radio_stream', 'radio_other')),
  title      text not null check (length(btrim(title)) between 2 and 120),
  url        text check (url is null or (length(url) <= 500 and url ~* '^https?://')),
  note       text check (length(note) <= 300),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  check (kind = 'radio_fm' or url is not null)       -- la FM puede ser solo una frecuencia, sin enlace
);
create index if not exists church_links_church_idx on public.church_links (church_id, kind, position);
alter table public.church_links enable row level security;
revoke all on table public.church_links from anon, public;
grant select, insert, update, delete on table public.church_links to authenticated;
drop policy if exists church_links_select on public.church_links;
create policy church_links_select on public.church_links for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists church_links_write on public.church_links;
create policy church_links_write on public.church_links for all to authenticated
  using (church_id = public.current_church_id() and public.has_perm('com.anuncios'))
  with check (church_id = public.current_church_id() and public.has_perm('com.anuncios'));

-- ---------------------------------------------------------------------------
-- 2. Entradas: cada inscripción tiene su código (para el QR) y se marca cuando entra
-- ---------------------------------------------------------------------------
alter table public.event_registrations
  add column if not exists ticket_code   text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references public.profiles(id) on delete set null,
  add column if not exists walk_in       boolean not null default false;      -- se anotó en la puerta
create unique index if not exists event_registrations_ticket_idx on public.event_registrations (ticket_code);
create index if not exists event_registrations_checkin_idx on public.event_registrations (event_id, occurs_on) where checked_in_at is not null;

-- Quien se inscribe no se puede marcar como que ya entró.
create or replace function public.event_reg_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_perm('cal.editar') then return new; end if;
  if tg_op = 'INSERT' then
    new.paid_amount := 0; new.paid_note := null; new.checked_in_at := null; new.checked_in_by := null; new.walk_in := false;
  else
    new.paid_amount := old.paid_amount; new.paid_note := old.paid_note;
    new.checked_in_at := old.checked_in_at; new.checked_in_by := old.checked_in_by; new.walk_in := old.walk_in;
    new.ticket_code := old.ticket_code;
  end if;
  return new;
end $$;

-- Cupo: no se pasan los lugares del evento (los de la puerta pueden pasarse: ya están ahí).
create or replace function public.event_reg_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cap integer; v_taken integer;
begin
  if new.walk_in or public.has_perm('cal.editar') then return new; end if;
  select reg_capacity into v_cap from public.events where id = new.event_id;
  if v_cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.event_id::text || new.occurs_on::text));
  select coalesce(sum(people), 0) into v_taken from public.event_registrations
    where event_id = new.event_id and occurs_on = new.occurs_on and id is distinct from new.id;
  if v_taken + new.people > v_cap then
    raise exception 'Ya no quedan lugares (quedan %)', greatest(v_cap - v_taken, 0);
  end if;
  return new;
end $$;
drop trigger if exists event_reg_capacity on public.event_registrations;
create trigger event_reg_capacity before insert or update of people on public.event_registrations
  for each row execute function public.event_reg_capacity();
revoke all on function public.event_reg_capacity() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. La puerta: quién puede anotar y marcar a los que entran
-- ---------------------------------------------------------------------------
create or replace function public.can_door() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('cal.editar') or public.has_perm('personas.asistencia')
$$;
revoke all on function public.can_door() from public, anon;
grant execute on function public.can_door() to authenticated;

-- Anotar a alguien en la puerta (nombre y teléfono) y dejarlo adentro. Si el teléfono ya estaba anotado, solo se marca que entró.
create or replace function public.event_door_register(p_event uuid, p_on date, p_name text, p_phone text default null, p_people integer default 1)
returns table (id uuid, name text, ticket_code text, already boolean)
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''); v_row public.event_registrations;
begin
  if not public.can_door() then raise exception 'No tenés permiso para anotar en la puerta'; end if;
  if not exists (select 1 from public.events e where e.id = p_event and e.church_id = v_church) then raise exception 'Ese evento no es de tu iglesia'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Escribí el nombre'; end if;
  if p_people is null or p_people < 1 or p_people > 50 then raise exception 'Cantidad de personas no válida'; end if;
  if v_phone is not null and length(v_phone) >= 6 then
    select * into v_row from public.event_registrations r
      where r.event_id = p_event and r.occurs_on = p_on and r.church_id = v_church
        and right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8) limit 1;
    if found then
      update public.event_registrations set checked_in_at = coalesce(checked_in_at, now()), checked_in_by = coalesce(checked_in_by, auth.uid())
        where event_registrations.id = v_row.id and checked_in_at is null;
      return query select v_row.id, v_row.name, v_row.ticket_code, v_row.checked_in_at is not null;
      return;
    end if;
  end if;
  insert into public.event_registrations (event_id, occurs_on, church_id, user_id, name, phone, people, walk_in, checked_in_at, checked_in_by)
    values (p_event, p_on, v_church, null, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), p_people, true, now(), auth.uid())
    returning * into v_row;
  return query select v_row.id, v_row.name, v_row.ticket_code, false;
end $$;

-- Marcar que entró alguien que ya estaba anotado: por el código del QR o por su inscripción (búsqueda por nombre).
create or replace function public.event_check_in(p_code text default null, p_reg uuid default null)
returns table (id uuid, name text, people integer, event_title text, occurs_on date, already boolean)
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_row public.event_registrations; v_was timestamptz; v_title text;
begin
  if not public.can_door() then raise exception 'No tenés permiso para marcar entradas'; end if;
  if p_reg is not null then
    select * into v_row from public.event_registrations r where r.id = p_reg and r.church_id = v_church;
  else
    select * into v_row from public.event_registrations r where r.ticket_code = upper(btrim(coalesce(p_code, ''))) and r.church_id = v_church;
  end if;
  if not found then raise exception 'No encontré esa entrada en tu iglesia'; end if;
  v_was := v_row.checked_in_at;
  if v_was is null then
    update public.event_registrations r set checked_in_at = now(), checked_in_by = auth.uid() where r.id = v_row.id;
  end if;
  select e.title into v_title from public.events e where e.id = v_row.event_id;
  return query select v_row.id, v_row.name, v_row.people, v_title, v_row.occurs_on, v_was is not null;
end $$;

-- Cuántos hay anotados, cuántos entraron y cuántos se anotaron en la puerta.
create or replace function public.event_door_counts(p_event uuid, p_on date)
returns table (registered integer, checked_in integer, walk_ins integer, people_in integer)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where not r.walk_in)::int,
         count(*) filter (where r.checked_in_at is not null)::int,
         count(*) filter (where r.walk_in)::int,
         coalesce(sum(r.people) filter (where r.checked_in_at is not null), 0)::int
  from public.event_registrations r
  where public.can_door() and r.event_id = p_event and r.occurs_on = p_on and r.church_id = public.current_church_id()
$$;

-- Buscar entre los anotados por nombre o teléfono (para marcar a mano).
create or replace function public.event_door_search(p_event uuid, p_on date, p_q text)
returns table (id uuid, name text, phone text, people integer, checked_in boolean, walk_in boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.phone, r.people, r.checked_in_at is not null, r.walk_in
  from public.event_registrations r
  where public.can_door() and r.event_id = p_event and r.occurs_on = p_on and r.church_id = public.current_church_id()
    and (length(btrim(coalesce(p_q, ''))) < 2
         or r.name ilike '%' || btrim(p_q) || '%'
         or regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_q, '\D', '', 'g') || '%' and length(regexp_replace(p_q, '\D', '', 'g')) >= 3)
  order by r.checked_in_at is not null, r.name
  limit 40
$$;

revoke all on function public.event_door_register(uuid, date, text, text, integer), public.event_check_in(text, uuid),
  public.event_door_counts(uuid, date), public.event_door_search(uuid, date, text) from public, anon;
grant execute on function public.event_door_register(uuid, date, text, text, integer), public.event_check_in(text, uuid),
  public.event_door_counts(uuid, date), public.event_door_search(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rifas digitales: entra todo el que estuvo presente y la app saca al azar
-- ---------------------------------------------------------------------------
create table if not exists public.raffles (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  title         text not null check (length(btrim(title)) between 2 and 120),
  prize         text check (length(prize) <= 200),
  pool          text not null check (pool in ('event_checkins', 'event_registered', 'class', 'bus')),
  event_id      uuid references public.events(id) on delete set null,
  class_id      uuid references public.classes(id) on delete set null,
  occurs_on     date not null default public.church_today(),
  unique_winner boolean not null default true,        -- quien ya ganó algo ese día no vuelve a entrar
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((pool in ('event_checkins', 'event_registered') and event_id is not null) or (pool = 'class' and class_id is not null) or pool = 'bus')
);
create index if not exists raffles_church_idx on public.raffles (church_id, occurs_on desc);

create table if not exists public.raffle_winners (
  id         uuid primary key default gen_random_uuid(),
  raffle_id  uuid not null references public.raffles(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade,
  entry_key  text not null,                           -- quién fue (inscripción o contacto): no se repite
  name       text not null,
  phone      text,
  claimed    boolean not null default false,          -- ya retiró el premio
  drawn_at   timestamptz not null default now(),
  unique (raffle_id, entry_key)
);
create index if not exists raffle_winners_raffle_idx on public.raffle_winners (raffle_id, drawn_at);

alter table public.raffles enable row level security;
alter table public.raffle_winners enable row level security;
revoke all on table public.raffles, public.raffle_winners from anon, public;
grant select, insert, update, delete on table public.raffles to authenticated;
grant select, update (claimed) on table public.raffle_winners to authenticated;
grant delete on table public.raffle_winners to authenticated;

drop policy if exists raffles_select on public.raffles;
create policy raffles_select on public.raffles for select to authenticated using (church_id = public.current_church_id());
drop policy if exists raffles_write on public.raffles;
create policy raffles_write on public.raffles for all to authenticated
  using (church_id = public.current_church_id() and public.has_perm('cal.editar'))
  with check (church_id = public.current_church_id() and public.has_perm('cal.editar'));
-- Los teléfonos de los ganadores los ve solo quien maneja el calendario; los demás ven los nombres con raffle_winner_names().
drop policy if exists raffle_winners_select on public.raffle_winners;
create policy raffle_winners_select on public.raffle_winners for select to authenticated
  using (church_id = public.current_church_id() and public.has_perm('cal.editar'));
drop policy if exists raffle_winners_update on public.raffle_winners;
create policy raffle_winners_update on public.raffle_winners for update to authenticated
  using (church_id = public.current_church_id() and public.has_perm('cal.editar'))
  with check (church_id = public.current_church_id() and public.has_perm('cal.editar'));
drop policy if exists raffle_winners_delete on public.raffle_winners;
create policy raffle_winners_delete on public.raffle_winners for delete to authenticated
  using (church_id = public.current_church_id() and public.has_perm('cal.editar'));

-- Quiénes participan: se arma de la asistencia que ya está cargada.
create or replace function public.raffle_pool(p_raffle uuid)
returns table (entry_key text, name text, phone text)
language plpgsql stable security definer set search_path = public as $$
declare r public.raffles;
begin
  select * into r from public.raffles where id = p_raffle and church_id = public.current_church_id();
  if not found then return; end if;
  return query
  with pool as (
    select er.id::text as k, er.name as n, er.phone as p from public.event_registrations er
      where r.pool in ('event_checkins', 'event_registered') and er.event_id = r.event_id and er.occurs_on = r.occurs_on
        and er.church_id = r.church_id and (r.pool = 'event_registered' or er.checked_in_at is not null)
    union all
    select c.id::text, c.name, c.phone from public.class_attendance ca join public.contacts c on c.id = ca.contact_id
      where r.pool = 'class' and ca.class_id = r.class_id and ca.on_date = r.occurs_on and ca.present and ca.church_id = r.church_id
    union all
    select c.id::text, c.name, c.phone from public.bus_pickups bp join public.contacts c on c.id = bp.contact_id
      where r.pool = 'bus' and bp.on_date = r.occurs_on and c.church_id = r.church_id
  )
  select pool.k, pool.n, pool.p from pool
  where not exists (
    select 1 from public.raffle_winners w join public.raffles rw on rw.id = w.raffle_id
    where w.entry_key = pool.k and w.church_id = r.church_id
      and (w.raffle_id = r.id or (r.unique_winner and rw.occurs_on = r.occurs_on)));
end $$;
revoke all on function public.raffle_pool(uuid) from public, anon, authenticated;

create or replace function public.raffle_pool_count(p_raffle uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.has_perm('cal.editar') then (select count(*)::int from public.raffle_pool(p_raffle)) else 0 end
$$;

-- Sacar al azar. Cada nombre sale una sola vez.
create or replace function public.draw_raffle(p_raffle uuid, p_count integer default 1)
returns table (id uuid, name text, phone text)
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id();
begin
  if not public.has_perm('cal.editar') then raise exception 'Solo quien maneja el calendario puede hacer el sorteo'; end if;
  if p_count is null or p_count < 1 or p_count > 20 then raise exception 'Se pueden sacar de 1 a 20 por vez'; end if;
  if not exists (select 1 from public.raffles where raffles.id = p_raffle and church_id = v_church) then raise exception 'Ese sorteo no es de tu iglesia'; end if;
  perform pg_advisory_xact_lock(hashtext(p_raffle::text));
  return query
  with pick as (
    select pp.entry_key, pp.name, pp.phone from public.raffle_pool(p_raffle) pp order by random() limit p_count
  ), ins as (
    insert into public.raffle_winners (raffle_id, church_id, entry_key, name, phone)
    select p_raffle, v_church, pick.entry_key, pick.name, pick.phone from pick
    returning raffle_winners.id, raffle_winners.name, raffle_winners.phone
  )
  select ins.id, ins.name, ins.phone from ins;
end $$;

-- Los nombres de los ganadores, para que los vea cualquiera de la iglesia (sin teléfono).
create or replace function public.raffle_winner_names(p_raffle uuid)
returns table (name text, drawn_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.name, w.drawn_at from public.raffle_winners w
  join public.raffles r on r.id = w.raffle_id
  where w.raffle_id = p_raffle and r.church_id = public.current_church_id()
  order by w.drawn_at
$$;

revoke all on function public.raffle_pool_count(uuid), public.draw_raffle(uuid, integer), public.raffle_winner_names(uuid) from public, anon;
grant execute on function public.raffle_pool_count(uuid), public.draw_raffle(uuid, integer), public.raffle_winner_names(uuid) to authenticated;
