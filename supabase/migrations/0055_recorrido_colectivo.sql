-- 0055: el recorrido del colectivo, parada por parada.
-- Cada ruta (grupo) tiene sus paradas en orden. Una parada es la casa de una persona (se usa el punto de su ficha)
-- o un punto marcado en el mapa (una esquina, una plaza, la iglesia). Después se abre en Google Maps o Apple Maps.
create table if not exists public.bus_stops (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  sort       integer not null default 100,
  contact_id uuid references public.contacts(id) on delete cascade,
  label      text check (label is null or length(label) <= 80),
  lat        double precision check (lat is null or lat between -90 and 90),
  lng        double precision check (lng is null or lng between -180 and 180),
  note       text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  check (contact_id is not null or (lat is not null and lng is not null)),
  unique (group_id, contact_id)
);
create index if not exists bus_stops_group_idx on public.bus_stops (group_id, sort);
alter table public.bus_stops enable row level security;
grant select, insert, update, delete on public.bus_stops to authenticated;

drop policy if exists bus_stops_select on public.bus_stops;
create policy bus_stops_select on public.bus_stops for select to authenticated
  using (church_id = public.current_church_id() and (public.can_drive_bus(group_id) or public.can_take_attendance() or public.has_perm('personas.ver_todas')));
drop policy if exists bus_stops_write on public.bus_stops;
create policy bus_stops_write on public.bus_stops for all to authenticated
  using (church_id = public.current_church_id() and public.can_drive_bus(group_id))
  with check (church_id = public.current_church_id() and public.can_drive_bus(group_id)
              and exists (select 1 from public.groups g where g.id = group_id and g.church_id = public.current_church_id())
              and (contact_id is null or exists (select 1 from public.contacts c where c.id = contact_id and c.church_id = public.current_church_id())));

-- Las paradas en orden, ya con el punto, la dirección y el teléfono de cada casa, y si hoy ya subió.
create or replace function public.bus_route_stops(p_group uuid)
returns table (id uuid, sort integer, contact_id uuid, label text, lat double precision, lng double precision,
               address text, phone text, pickup_time text, picked boolean, note text)
language sql stable security definer set search_path = public as $$
  select s.id, s.sort, s.contact_id, coalesce(nullif(btrim(s.label), ''), c.name, 'Parada'),
         coalesce(s.lat, c.lat), coalesce(s.lng, c.lng), coalesce(c.address, c.address_hint), c.phone, c.pickup_time,
         s.contact_id is not null and exists (select 1 from public.bus_pickups b where b.contact_id = s.contact_id and b.on_date = public.church_today()),
         s.note
    from public.bus_stops s left join public.contacts c on c.id = s.contact_id
   where s.group_id = p_group and s.church_id = public.current_church_id()
     and (public.can_drive_bus(p_group) or public.can_take_attendance() or public.has_perm('personas.ver_todas'))
     and (c.id is null or not c.archived)
   order by s.sort, s.created_at
$$;
revoke all on function public.bus_route_stops(uuid) from public, anon;
grant execute on function public.bus_route_stops(uuid) to authenticated;

-- Sumar de una vez a todos los pasajeros de la ruta que todavía no son parada (por hora de pasada).
create or replace function public.bus_stops_from_riders(p_group uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_base integer; v_n integer;
begin
  if not public.can_drive_bus(p_group) then raise exception 'No tenés permiso para armar este recorrido.'; end if;
  select coalesce(max(sort), 0) into v_base from public.bus_stops where group_id = p_group;
  insert into public.bus_stops (church_id, group_id, sort, contact_id)
  select c.church_id, p_group, v_base + 10 * (row_number() over (order by c.pickup_time nulls last, c.name))::int, c.id
    from public.contacts c
   where c.church_id = public.current_church_id() and not c.archived and c.group_id = p_group and (c.bus_rider or c.pickup)
     and not exists (select 1 from public.bus_stops s where s.group_id = p_group and s.contact_id = c.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.bus_stops_from_riders(uuid) from public, anon;
grant execute on function public.bus_stops_from_riders(uuid) to authenticated;

-- Guardar el orden nuevo: la lista de paradas tal como quedó.
create or replace function public.bus_stops_reorder(p_group uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_drive_bus(p_group) then raise exception 'No tenés permiso para armar este recorrido.'; end if;
  update public.bus_stops s set sort = x.ord * 10
    from unnest(p_ids) with ordinality as x(id, ord)
   where s.id = x.id and s.group_id = p_group and s.church_id = public.current_church_id();
end $$;
revoke all on function public.bus_stops_reorder(uuid, uuid[]) from public, anon;
grant execute on function public.bus_stops_reorder(uuid, uuid[]) to authenticated;
