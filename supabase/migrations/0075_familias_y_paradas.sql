-- ============================================================================
-- 0075 · Familias y paradas del colectivo
--
-- 1. Familias: una familia es SOLO un vínculo entre personas (esposo, esposa, hijos...).
--    Que uno venga NO quiere decir que vino la familia: la asistencia, las faltas y el
--    seguimiento siguen siendo de cada persona. La familia sirve para ver a los parientes
--    en la ficha, agrupar las listas y saber qué adultos pueden retirar a un chico.
-- 2. Paradas del colectivo: la lista en orden de a quién pasa a buscar cada ruta
--    (una persona o una familia), con su lugar en el mapa.
-- 3. Aviso "El colectivo está a unos 10 minutos": lo manda la base cuando el chofer
--    manda su ubicación (update_bus_run), una sola vez por viaje y por parada.
--
-- Se puede correr más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Familias
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists households_church_idx on public.households (church_id);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  contact_id   uuid not null unique references public.contacts(id) on delete cascade,
  role         text not null default 'otro' check (role in ('padre', 'madre', 'hijo', 'hija', 'abuelo', 'abuela', 'otro')),
  can_pickup   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (household_id, contact_id)
);
create index if not exists household_members_household_idx on public.household_members (household_id);

-- Las familias donde está mi propia ficha (cada uno ve a su familia).
create or replace function public.my_household_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.household_id from public.household_members m
  join public.contacts c on c.id = m.contact_id
  where c.profile_id = auth.uid() and not c.archived
$$;
revoke all on function public.my_household_ids() from public, anon;
grant execute on function public.my_household_ids() to authenticated;

-- Las tablas se leen; los cambios pasan por las funciones de abajo (sacar a alguien: ver el punto 4).
alter table public.households enable row level security;
alter table public.household_members enable row level security;
revoke all on public.households from anon, authenticated;
revoke all on public.household_members from anon, authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;

do $p$
begin
  -- Un vínculo se ve si se puede ver la ficha de esa persona (igual que contacts), o si es de mi familia.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'household_members' and policyname = 'household_members_select') then
    create policy household_members_select on public.household_members for select to authenticated
      using (exists (select 1 from public.contacts c where c.id = household_members.contact_id and public.can_see_contact(c))
             or household_id in (select public.my_household_ids()));
  end if;
  -- Una familia se ve si se puede ver a alguno de sus integrantes (o con permiso para ver o editar a todos).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households_select') then
    create policy households_select on public.households for select to authenticated
      using (church_id = public.current_church_id()
             and (public.has_perm('personas.ver_todas') or public.has_perm('personas.editar')
                  or id in (select public.my_household_ids())
                  or exists (select 1 from public.household_members m join public.contacts c on c.id = m.contact_id
                             where m.household_id = households.id and public.can_see_contact(c))));
  end if;
end $p$;

-- Puede cambiar una familia: quien edita personas, o quien puede editar la ficha de TODOS sus integrantes.
-- OJO: can_edit_contact() puede devolver NULL (no "false") cuando la ficha no tiene cuenta ni encargado;
-- por eso acá y abajo se compara con "is true" / "is not true" y nunca con "not ...".
create or replace function public.can_manage_household(p_household uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.households h where h.id = p_household and h.church_id = public.current_church_id())
    and (public.has_perm('personas.editar') is true
         or (exists (select 1 from public.household_members m where m.household_id = p_household)
             and not exists (select 1 from public.household_members m join public.contacts c on c.id = m.contact_id
                             where m.household_id = p_household and public.can_edit_contact(c) is not true))),
    false)
$$;
revoke all on function public.can_manage_household(uuid) from public, anon;
grant execute on function public.can_manage_household(uuid) to authenticated;

-- Pone a una persona en una familia (nueva o que ya existe), o le cambia el lugar que ocupa.
--  p_household null + la persona sin familia  -> se crea la familia con p_new_name.
--  p_can_pickup ("puede retirar a los chicos") solo lo cambia quien tiene 'personas.editar'.
create or replace function public.household_save_member(
  p_contact uuid, p_household uuid default null, p_new_name text default null, p_role text default 'otro', p_can_pickup boolean default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.contacts; v_h uuid; v_cur uuid; v_cur_pick boolean; v_pick boolean;
begin
  select * into c from public.contacts where id = p_contact;
  if c.id is null or c.church_id is distinct from public.current_church_id() or public.can_edit_contact(c) is not true then
    raise exception 'No podés cambiar la familia de esta persona';
  end if;
  if p_role is null or p_role not in ('padre', 'madre', 'hijo', 'hija', 'abuelo', 'abuela', 'otro') then
    raise exception 'Elegí qué lugar ocupa en la familia';
  end if;
  select household_id, can_pickup into v_cur, v_cur_pick from public.household_members where contact_id = p_contact;

  if v_cur is not null then
    if p_household is not null and p_household <> v_cur then
      raise exception '% ya está en otra familia. Primero sacalo de esa familia.', c.name;
    end if;
    v_h := v_cur;
  elsif p_household is not null then
    if public.can_manage_household(p_household) is not true then raise exception 'No podés agregar personas a esta familia'; end if;
    v_h := p_household;
  else
    if nullif(trim(p_new_name), '') is null then raise exception 'Poné el nombre de la familia'; end if;
    insert into public.households (church_id, name, created_by) values (c.church_id, left(trim(p_new_name), 80), auth.uid()) returning id into v_h;
  end if;

  -- Los hijos no retiran a nadie. Y marcar quién retira es cosa del pastor o la secretaría.
  v_pick := coalesce(v_cur_pick, false);
  if p_can_pickup is not null and p_can_pickup <> v_pick then
    if public.has_perm('personas.editar') is not true then
      raise exception 'Solo el pastor o la secretaría marcan quién puede retirar a los chicos';
    end if;
    v_pick := p_can_pickup;
  end if;
  if p_role in ('hijo', 'hija') then v_pick := false; end if;

  insert into public.household_members (household_id, contact_id, role, can_pickup) values (v_h, p_contact, p_role, v_pick)
  on conflict (contact_id) do update set role = excluded.role, can_pickup = excluded.can_pickup;
  return v_h;
end $$;
revoke all on function public.household_save_member(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.household_save_member(uuid, uuid, text, text, boolean) to authenticated;

create or replace function public.household_rename(p_household uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.can_manage_household(p_household) is not true then raise exception 'No podés cambiar esta familia'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Poné el nombre de la familia'; end if;
  update public.households set name = left(trim(p_name), 80) where id = p_household;
end $$;
revoke all on function public.household_rename(uuid, text) from public, anon;
grant execute on function public.household_rename(uuid, text) to authenticated;

-- La familia de una persona: todos los integrantes que puedo ver (o todos, si es mi familia).
create or replace function public.household_family(p_contact uuid)
returns table (household_id uuid, household_name text, contact_id uuid, name text, photo_path text, role text, can_pickup boolean,
               age integer, has_account boolean, can_open boolean, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select h.id, h.name, c.id, c.name, c.photo_path, m.role, m.can_pickup,
         coalesce(extract(year from age(c.birthdate))::int, c.age), c.profile_id is not null,
         coalesce(public.can_see_contact(c), false), public.can_manage_household(h.id)
  from public.household_members me
  join public.contacts c0 on c0.id = me.contact_id
  join public.households h on h.id = me.household_id
  join public.household_members m on m.household_id = h.id
  join public.contacts c on c.id = m.contact_id
  where me.contact_id = p_contact
    and h.church_id = public.current_church_id()
    and (public.can_see_contact(c0) or h.id in (select public.my_household_ids()))
    and not c.archived
    and (public.can_see_contact(c) or h.id in (select public.my_household_ids()))
  order by case m.role when 'padre' then 1 when 'madre' then 2 when 'hijo' then 3 when 'hija' then 3 when 'abuelo' then 4 when 'abuela' then 4 else 5 end,
           c.birthdate nulls last, c.name
$$;
revoke all on function public.household_family(uuid) from public, anon;
grant execute on function public.household_family(uuid) to authenticated;

-- Buscar una familia por su nombre o por el nombre de alguno de los suyos (para sumar a alguien).
create or replace function public.household_search(p_q text default null)
returns table (id uuid, name text, members text, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select h.id, h.name,
         (select string_agg(split_part(c.name, ' ', 1), ', ' order by c.name)
            from public.household_members m join public.contacts c on c.id = m.contact_id
           where m.household_id = h.id and not c.archived and public.can_see_contact(c)),
         public.can_manage_household(h.id)
  from public.households h
  where h.church_id = public.current_church_id()
    and (public.has_perm('personas.ver_todas') or public.has_perm('personas.editar')
         or exists (select 1 from public.household_members m join public.contacts c on c.id = m.contact_id
                    where m.household_id = h.id and public.can_see_contact(c)))
    and (coalesce(trim(p_q), '') = ''
         or translate(lower(h.name), 'áéíóúñü', 'aeiounu') like '%' || translate(lower(trim(p_q)), 'áéíóúñü', 'aeiounu') || '%'
         or exists (select 1 from public.household_members m join public.contacts c on c.id = m.contact_id
                    where m.household_id = h.id and public.can_see_contact(c)
                      and translate(lower(c.name), 'áéíóúñü', 'aeiounu') like '%' || translate(lower(trim(p_q)), 'áéíóúñü', 'aeiounu') || '%'))
  order by h.name
  limit 20
$$;
revoke all on function public.household_search(text) from public, anon;
grant execute on function public.household_search(text) to authenticated;

-- Entrada de los chicos: los adultos de la familia de cada chico que están marcados "puede retirar".
-- Lo ve solo quien recibe o entrega a los chicos (igual que checkins_today).
create or replace function public.child_pickup_adults(p_children uuid[])
returns table (child_id uuid, contact_id uuid, name text, role text, photo_path text)
language sql stable security definer set search_path = public as $$
  select k.contact_id, a.id, a.name, m.role, a.photo_path
  from public.household_members k
  join public.households h on h.id = k.household_id and h.church_id = public.current_church_id()
  join public.household_members m on m.household_id = k.household_id and m.contact_id <> k.contact_id
  join public.contacts a on a.id = m.contact_id and not a.archived
  where k.contact_id = any (coalesce(p_children, '{}'))
    and m.can_pickup and m.role not in ('hijo', 'hija')
    and (public.can_take_attendance() or public.is_any_teacher())
  order by k.contact_id, case m.role when 'madre' then 1 when 'padre' then 2 else 3 end, a.name
$$;
revoke all on function public.child_pickup_adults(uuid[]) from public, anon;
grant execute on function public.child_pickup_adults(uuid[]) to authenticated;

-- Directorio: de qué familia es cada hermano que eligió aparecer.
create or replace function public.directory_families()
returns table (profile_id uuid, household_id uuid, household_name text)
language sql stable security definer set search_path = public as $$
  select p.id, h.id, h.name
  from public.profiles p
  join public.contacts c on c.profile_id = p.id and not c.archived
  join public.household_members m on m.contact_id = c.id
  join public.households h on h.id = m.household_id
  where p.church_id = public.current_church_id() and p.directory_visible and p.disabled_at is null
    and h.church_id = p.church_id
$$;
revoke all on function public.directory_families() from public, anon;
grant execute on function public.directory_families() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Paradas del colectivo
-- ---------------------------------------------------------------------------
-- Cada parada es una persona o una familia (grandes o chicos: el colectivo busca a todos).
-- lat/lng/address son propios de la parada; si están vacíos se usa el lugar de la casa de la persona.
create table if not exists public.bus_stops (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  group_id     uuid not null references public.groups(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  sort_order   integer not null default 0,
  address      text,
  lat          double precision,
  lng          double precision,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint bus_stops_one_target check ((contact_id is not null) <> (household_id is not null)),
  constraint bus_stops_place check ((lat is null) = (lng is null) and (lat is null or (abs(lat) <= 90 and abs(lng) <= 180))),
  constraint bus_stops_contact_once unique (group_id, contact_id),
  constraint bus_stops_household_once unique (group_id, household_id)
);
create index if not exists bus_stops_group_idx on public.bus_stops (group_id, sort_order);
alter table public.bus_stops enable row level security;
revoke all on public.bus_stops from anon, authenticated; -- se usa con las funciones de abajo (tienen direcciones de casas)

-- Qué pasó con cada parada en cada viaje: si ya se avisó y si el colectivo ya pasó.
create table if not exists public.bus_run_stops (
  run_id      uuid not null references public.bus_runs(id) on delete cascade,
  stop_id     uuid not null references public.bus_stops(id) on delete cascade,
  notified_at timestamptz,
  eta_min     numeric,
  reached_at  timestamptz,
  skipped     boolean not null default false, -- "hoy no viene": el chofer saltó esta parada
  primary key (run_id, stop_id)
);
alter table public.bus_run_stops add column if not exists skipped boolean not null default false;
alter table public.bus_run_stops enable row level security;
revoke all on public.bus_run_stops from anon, authenticated;

-- Quién puede armar las paradas de una ruta: los que pueden manejar ese colectivo o quien edita personas.
create or replace function public.can_edit_bus_route(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.groups g where g.id = p_group and g.church_id = public.current_church_id())
    and (public.can_drive_bus(p_group) is true or public.has_perm('personas.editar') is true),
    false)
$$;
revoke all on function public.can_edit_bus_route(uuid) from public, anon;
grant execute on function public.can_edit_bus_route(uuid) to authenticated;

-- Quién puede ver las paradas (tienen direcciones): los de arriba y los que ven la lista de pasajeros.
create or replace function public.can_see_bus_stops(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.groups g where g.id = p_group and g.church_id = public.current_church_id())
    and (public.can_drive_bus(p_group) is true or public.has_perm('personas.editar') is true
         or public.has_perm('personas.ver_todas') is true or public.can_take_attendance() is true),
    false)
$$;
revoke all on function public.can_see_bus_stops(uuid) from public, anon;
grant execute on function public.can_see_bus_stops(uuid) to authenticated;

-- Las paradas de una ruta en orden, ya con su nombre y su lugar. Uso interno (no pregunta permisos).
-- El lugar sale, en este orden: el que se marcó a mano para la parada; la casa que la persona cargó en su
-- cuenta (profiles.home_lat/home_lng); el lugar de su ficha (contacts.lat/lng); la casa de alguien de su familia.
create or replace function public.bus_stops_resolved(p_group uuid)
returns table (id uuid, pos integer, contact_id uuid, household_id uuid, title text, people text, photo_path text,
               address text, lat double precision, lng double precision, own_place boolean)
language sql stable security definer set search_path = public as $$
  select s.id, (row_number() over (order by s.sort_order, s.created_at, s.id))::int,
         s.contact_id, s.household_id, coalesce(c.name, h.name),
         case when s.household_id is not null then
           (select string_agg(split_part(x.name, ' ', 1), ', ' order by x.name)
              from public.household_members m join public.contacts x on x.id = m.contact_id
             where m.household_id = s.household_id and not x.archived) end,
         c.photo_path,
         coalesce(nullif(trim(s.address), ''), c.address, pr.home_address, c.address_hint, hp.address),
         case when s.lat is not null then s.lat
              when pr.home_lat is not null and pr.home_lng is not null then pr.home_lat
              when c.lat is not null and c.lng is not null then c.lat
              else hp.lat end,
         case when s.lat is not null then s.lng
              when pr.home_lat is not null and pr.home_lng is not null then pr.home_lng
              when c.lat is not null and c.lng is not null then c.lng
              else hp.lng end,
         s.lat is not null
  from public.bus_stops s
  left join public.contacts c on c.id = s.contact_id
  left join public.profiles pr on pr.id = c.profile_id
  left join public.households h on h.id = s.household_id
  -- La casa de la familia: la del primer integrante que tenga el lugar cargado (primero los grandes).
  left join lateral (
    select case when xp.home_lat is not null and xp.home_lng is not null then xp.home_lat else x.lat end as lat,
           case when xp.home_lat is not null and xp.home_lng is not null then xp.home_lng else x.lng end as lng,
           coalesce(x.address, xp.home_address, x.address_hint) as address
    from public.household_members m
    join public.contacts x on x.id = m.contact_id
    left join public.profiles xp on xp.id = x.profile_id
    where m.household_id = coalesce(s.household_id, (select hm.household_id from public.household_members hm where hm.contact_id = s.contact_id))
      and not x.archived
      and ((xp.home_lat is not null and xp.home_lng is not null) or (x.lat is not null and x.lng is not null))
    order by (m.role in ('hijo', 'hija')), x.name
    limit 1) hp on true
  where s.group_id = p_group and (c.id is null or not c.archived)
  order by s.sort_order, s.created_at, s.id
$$;
revoke all on function public.bus_stops_resolved(uuid) from public, anon, authenticated;

-- A quién se le avisa de una parada (solo gente con cuenta):
--  - la persona, si tiene cuenta;
--  - si es una familia: todos los de la familia con cuenta;
--  - si la persona no tiene cuenta (un chico, por ejemplo): los grandes de su familia con cuenta,
--    y sus padres cargados en la ficha.
create or replace function public.bus_stop_recipients(p_stop uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with s as (select * from public.bus_stops where id = p_stop),
  direct as (
    select c.profile_id as uid from s join public.contacts c on c.id = s.contact_id and not c.archived
    join public.profiles p on p.id = c.profile_id and p.disabled_at is null
  ),
  fam as (
    select coalesce(s.household_id, (select m.household_id from public.household_members m where m.contact_id = s.contact_id)) as hid,
           s.household_id is not null as whole
    from s
  )
  select uid from direct
  union
  select c.profile_id from fam
  join public.household_members m on m.household_id = fam.hid
  join public.contacts c on c.id = m.contact_id and not c.archived
  join public.profiles p on p.id = c.profile_id and p.disabled_at is null
  where fam.whole or (not exists (select 1 from direct) and m.role not in ('hijo', 'hija'))
  union
  select par.profile_id from s
  join public.contact_children k on k.child_contact_id = s.contact_id
  join public.contacts par on (par.id = k.contact_id or par.id = (select spouse_id from public.contacts where id = k.contact_id)) and not par.archived
  join public.profiles p on p.id = par.profile_id and p.disabled_at is null
  where not exists (select 1 from direct)
$$;
revoke all on function public.bus_stop_recipients(uuid) from public, anon, authenticated;

-- La lista para la pantalla: las paradas en orden y qué pasó en el viaje de ahora (si hay uno).
create or replace function public.bus_stops_list(p_group uuid)
returns table (id uuid, pos integer, contact_id uuid, household_id uuid, title text, people text, photo_path text,
               address text, lat double precision, lng double precision, own_place boolean,
               notified_at timestamptz, reached_at timestamptz, picked boolean, will_notify integer)
language sql stable security definer set search_path = public as $$
  select x.id, x.pos, x.contact_id, x.household_id, x.title, x.people, x.photo_path, x.address, x.lat, x.lng, x.own_place,
         b.notified_at, b.reached_at,
         x.contact_id is not null and exists (select 1 from public.bus_pickups k where k.contact_id = x.contact_id and k.on_date = public.church_today()),
         (select count(*)::int from public.bus_stop_recipients(x.id))
  from public.bus_stops_resolved(p_group) x
  left join lateral (select r.id from public.bus_runs r where r.group_id = p_group and public.bus_run_is_live(r)
                     order by r.started_at desc limit 1) run on true
  left join public.bus_run_stops b on b.run_id = run.id and b.stop_id = x.id
  where public.can_see_bus_stops(p_group)
  order by x.pos
$$;
revoke all on function public.bus_stops_list(uuid) from public, anon;
grant execute on function public.bus_stops_list(uuid) to authenticated;

-- Agrega una parada al final (una persona o una familia). Si ya estaba, devuelve la que estaba.
create or replace function public.bus_stop_add(p_group uuid, p_contact uuid default null, p_household uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_church uuid := public.current_church_id(); v_pos int;
begin
  if public.can_edit_bus_route(p_group) is not true then raise exception 'No podés cambiar las paradas de esta ruta'; end if;
  if (p_contact is null) = (p_household is null) then raise exception 'Elegí una persona o una familia'; end if;
  if p_contact is not null and not exists (select 1 from public.contacts where id = p_contact and church_id = v_church and not archived) then
    raise exception 'Esa persona no es de tu iglesia';
  end if;
  if p_household is not null and not exists (select 1 from public.households where id = p_household and church_id = v_church) then
    raise exception 'Esa familia no es de tu iglesia';
  end if;
  select id into v_id from public.bus_stops
   where group_id = p_group and ((p_contact is not null and contact_id = p_contact) or (p_household is not null and household_id = p_household));
  if v_id is not null then return v_id; end if;
  select coalesce(max(sort_order), 0) + 1 into v_pos from public.bus_stops where group_id = p_group;
  insert into public.bus_stops (church_id, group_id, contact_id, household_id, sort_order, created_by)
  values (v_church, p_group, p_contact, p_household, v_pos, auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.bus_stop_add(uuid, uuid, uuid) from public, anon;
grant execute on function public.bus_stop_add(uuid, uuid, uuid) to authenticated;

-- El lugar propio de una parada. Con lat y lng vacíos vuelve a usar la casa de la persona.
create or replace function public.bus_stop_set_place(p_stop uuid, p_lat double precision, p_lng double precision, p_address text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from public.bus_stops where id = p_stop;
  if v_group is null or public.can_edit_bus_route(v_group) is not true then raise exception 'No podés cambiar las paradas de esta ruta'; end if;
  if (p_lat is null) <> (p_lng is null) or abs(coalesce(p_lat, 0)) > 90 or abs(coalesce(p_lng, 0)) > 180 then raise exception 'Ese lugar no sirve'; end if;
  update public.bus_stops set lat = p_lat, lng = p_lng, address = nullif(left(trim(coalesce(p_address, '')), 200), '') where id = p_stop;
end $$;
revoke all on function public.bus_stop_set_place(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.bus_stop_set_place(uuid, double precision, double precision, text) to authenticated;

-- Guarda el orden: p_ids es la lista de paradas como tienen que quedar (las que falten van al final, como estaban).
create or replace function public.bus_stops_reorder(p_group uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.can_edit_bus_route(p_group) is not true then raise exception 'No podés cambiar las paradas de esta ruta'; end if;
  update public.bus_stops s set sort_order = o.n
  from (
    select x.id, (row_number() over (order by coalesce(array_position(p_ids, x.id), 100000), x.sort_order, x.created_at, x.id))::int as n
    from public.bus_stops x where x.group_id = p_group
  ) o
  where o.id = s.id and s.group_id = p_group;
end $$;
revoke all on function public.bus_stops_reorder(uuid, uuid[]) from public, anon;
grant execute on function public.bus_stops_reorder(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. "El colectivo está a unos 10 minutos"
-- ---------------------------------------------------------------------------
-- Se llama cada vez que el chofer manda su ubicación. La cuenta es simple (la misma que src/lib/busStops.ts):
--   camino = distancia en línea recta x 1,4 ; velocidad = 25 km/h ; se suma parada por parada en el orden de la ruta.
-- Una parada ya quedó atrás si:
--   - el colectivo pasó a menos de 150 m DESPUÉS de haberle avisado (así una parada que queda cerca de la iglesia
--     no cuenta como "ya pasó" cuando el colectivo recién sale);
--   - es anterior a una parada por la que ya pasó (el chofer la salteó);
--   - el chofer tocó "Hoy no viene" (bus_stop_skip);
--   - o a esa persona ya la marcaron "subió" hoy.
-- Se avisa una sola vez por viaje y por parada.
create or replace function public.bus_notify_near(p_run uuid, p_lat double precision, p_lng double precision) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.bus_runs; s record; u uuid; v_last int; v_n int := 0;
  v_plat double precision := p_lat; v_plng double precision := p_lng;
  v_dist double precision := 0; v_eta numeric; v_who text;
  c_factor constant double precision := 1.4;            -- las calles no van derecho
  c_m_per_min constant double precision := 25000.0 / 60; -- 25 km/h
  c_minutes constant numeric := 10;
  c_reached_m constant double precision := 150;
begin
  select * into r from public.bus_runs where id = p_run and ended_at is null;
  if r.id is null or p_lat is null or p_lng is null then return 0; end if;
  if not exists (select 1 from public.bus_stops where group_id = r.group_id) then return 0; end if;

  -- La última parada por la que el colectivo pasó de verdad (las salteadas a mano no cuentan acá).
  select coalesce(max(x.pos), 0) into v_last
  from public.bus_stops_resolved(r.group_id) x
  join public.bus_run_stops b on b.stop_id = x.id and b.run_id = p_run and b.reached_at is not null and not b.skipped;

  for s in
    select x.id, x.title, x.contact_id, x.household_id, x.lat, x.lng, b.notified_at
    from public.bus_stops_resolved(r.group_id) x
    left join public.bus_run_stops b on b.stop_id = x.id and b.run_id = p_run
    where x.pos > v_last and x.lat is not null and b.reached_at is null
      and not (x.contact_id is not null and exists (select 1 from public.bus_pickups k where k.contact_id = x.contact_id and k.on_date = public.church_today()))
    order by x.pos
  loop
    v_dist := v_dist + public.haversine_m(v_plat, v_plng, s.lat, s.lng) * c_factor;
    v_plat := s.lat; v_plng := s.lng;
    v_eta := round((v_dist / c_m_per_min)::numeric, 1);
    exit when v_eta > c_minutes; -- las que siguen están más lejos todavía
    if s.notified_at is null then
      insert into public.bus_run_stops (run_id, stop_id, notified_at, eta_min) values (p_run, s.id, now(), v_eta)
      on conflict (run_id, stop_id) do update set notified_at = excluded.notified_at, eta_min = excluded.eta_min
        where public.bus_run_stops.notified_at is null;
      if found then
        v_who := case when s.household_id is not null then s.title else split_part(s.title, ' ', 1) end;
        for u in select public.bus_stop_recipients(s.id) loop
          if u is not null and u is distinct from r.driver_id then
            perform public.notify(u, 'bus',
              case when v_eta <= 4 then 'El colectivo ya está muy cerca' else 'El colectivo está a unos 10 minutos' end,
              case when s.contact_id is not null and exists (select 1 from public.contacts me where me.id = s.contact_id and me.profile_id = u)
                   then 'Ya pasa a buscarte. Esperalo en la puerta.'
                   else 'Pasa a buscar a ' || v_who || '. Esperalo en la puerta.' end,
              '/colectivo-vivo');
            v_n := v_n + 1;
          end if;
        end loop;
      end if;
    end if;
  end loop;

  -- Paradas ya avisadas por las que el colectivo está pasando ahora.
  update public.bus_run_stops b set reached_at = now()
  from public.bus_stops_resolved(r.group_id) x
  where b.run_id = p_run and b.stop_id = x.id and b.notified_at is not null and b.reached_at is null
    and x.lat is not null and public.haversine_m(p_lat, p_lng, x.lat, x.lng) <= c_reached_m;
  return v_n;
end $$;
revoke all on function public.bus_notify_near(uuid, double precision, double precision) from public, anon, authenticated;

-- "Hoy no viene": el chofer (o su ayudante) saltea una parada en el viaje de ahora. Con p_skip = false se deshace.
create or replace function public.bus_stop_skip(p_stop uuid, p_skip boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_run uuid;
begin
  select group_id into v_group from public.bus_stops where id = p_stop;
  if v_group is null or public.can_edit_bus_route(v_group) is not true then raise exception 'No podés cambiar las paradas de esta ruta'; end if;
  select r.id into v_run from public.bus_runs r where r.group_id = v_group and public.bus_run_is_live(r) order by r.started_at desc limit 1;
  if v_run is null then raise exception 'El colectivo no está en camino ahora'; end if;
  insert into public.bus_run_stops as b (run_id, stop_id, reached_at, skipped)
  values (v_run, p_stop, case when coalesce(p_skip, true) then now() end, coalesce(p_skip, true))
  on conflict (run_id, stop_id) do update
    set reached_at = case when excluded.skipped then coalesce(b.reached_at, now()) when b.skipped then null else b.reached_at end,
        skipped = excluded.skipped;
end $$;
revoke all on function public.bus_stop_skip(uuid, boolean) from public, anon;
grant execute on function public.bus_stop_skip(uuid, boolean) to authenticated;

-- Las paradas salteadas en el viaje de ahora.
create or replace function public.bus_stops_skipped(p_group uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.stop_id
  from public.bus_run_stops b
  join lateral (select r.id from public.bus_runs r where r.group_id = p_group and public.bus_run_is_live(r)
                order by r.started_at desc limit 1) run on run.id = b.run_id
  where b.skipped and public.can_see_bus_stops(p_group)
$$;
revoke all on function public.bus_stops_skipped(uuid) from public, anon;
grant execute on function public.bus_stops_skipped(uuid) to authenticated;

-- El chofer manda su ubicación: igual que antes, y además se fija a quién hay que avisarle.
-- Si el aviso falla por lo que sea, la ubicación se guarda igual.
create or replace function public.update_bus_run(p_run uuid, p_lat double precision, p_lng double precision, p_heading double precision default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return false; end if;
  update public.bus_runs set lat = p_lat, lng = p_lng, heading = p_heading, updated_at = now()
  where id = p_run and driver_id = auth.uid() and ended_at is null and started_at > now() - interval '8 hours';
  if not found then return false; end if;
  perform public.bus_add_point(p_run, p_lat, p_lng);
  begin
    perform public.bus_notify_near(p_run, p_lat, p_lng);
  exception when others then
    null;
  end;
  return true;
end $$;
grant execute on function public.update_bus_run(uuid, double precision, double precision, double precision) to authenticated;

-- Los que tienen una parada en la ruta también son "de la ruta": ven el colectivo en vivo y les llega "El colectivo salió".
create or replace function public.rides_bus(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.group_id = p_group)
      or exists (select 1 from public.contacts c where c.profile_id = auth.uid() and c.group_id = p_group and not c.archived)
      or exists (select 1 from public.contacts c join public.contact_children k on k.contact_id = c.id
                 join public.contacts h on h.id = k.child_contact_id
                 where c.profile_id = auth.uid() and h.group_id = p_group and not h.archived)
      or exists (select 1 from public.bus_stops s where s.group_id = p_group
                 and auth.uid() in (select public.bus_stop_recipients(s.id)))
$$;
grant execute on function public.rides_bus(uuid) to authenticated;

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
  union
  select u from public.bus_stops s cross join lateral public.bus_stop_recipients(s.id) u
  where s.group_id = p_group and u is not null
$$;
revoke all on function public.bus_riders(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sacar a una persona de su familia y quitar una parada
-- ---------------------------------------------------------------------------
-- Estas dos cosas se hacen borrando la fila desde la app; las reglas de abajo dicen quién puede.

-- ¿La familia quedó sin nadie? (mira todas las filas, no solo las que ve quien pregunta)
create or replace function public.household_is_empty(p_household uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.household_members m where m.household_id = p_household)
$$;
revoke all on function public.household_is_empty(uuid) from public, anon;
grant execute on function public.household_is_empty(uuid) to authenticated;

-- Quien armó una familia la sigue viendo aunque quede vacía (para poder borrarla).
alter policy households_select on public.households
  using (church_id = public.current_church_id()
         and (public.has_perm('personas.ver_todas') or public.has_perm('personas.editar')
              or created_by = auth.uid()
              or id in (select public.my_household_ids())
              or exists (select 1 from public.household_members m join public.contacts c on c.id = m.contact_id
                         where m.household_id = households.id and public.can_see_contact(c))));

grant delete on public.household_members to authenticated;
grant delete on public.households to authenticated;
do $p$
begin
  -- Sacar a alguien de su familia: quien puede editar su ficha, o quien puede cambiar esa familia.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'household_members' and policyname = 'household_members_delete') then
    create policy household_members_delete on public.household_members for delete to authenticated
      using (public.can_manage_household(household_id)
             or exists (select 1 from public.contacts c where c.id = household_members.contact_id and public.can_edit_contact(c) is true));
  end if;
  -- Una familia solo se borra cuando ya no tiene a nadie.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households_delete') then
    create policy households_delete on public.households for delete to authenticated
      using (church_id = public.current_church_id() and public.household_is_empty(id));
  end if;
end $p$;

-- Las familias vacías no salen al buscar.
create or replace function public.household_search(p_q text default null)
returns table (id uuid, name text, members text, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select h.id, h.name,
         (select string_agg(split_part(c.name, ' ', 1), ', ' order by c.name)
            from public.household_members m join public.contacts c on c.id = m.contact_id
           where m.household_id = h.id and not c.archived and public.can_see_contact(c)),
         public.can_manage_household(h.id)
  from public.households h
  where h.church_id = public.current_church_id()
    and not public.household_is_empty(h.id)
    and (public.has_perm('personas.ver_todas') or public.has_perm('personas.editar')
         or exists (select 1 from public.household_members m join public.contacts c on c.id = m.contact_id
                    where m.household_id = h.id and public.can_see_contact(c)))
    and (coalesce(trim(p_q), '') = ''
         or translate(lower(h.name), 'áéíóúñü', 'aeiounu') like '%' || translate(lower(trim(p_q)), 'áéíóúñü', 'aeiounu') || '%'
         or exists (select 1 from public.household_members m join public.contacts c on c.id = m.contact_id
                    where m.household_id = h.id and public.can_see_contact(c)
                      and translate(lower(c.name), 'áéíóúñü', 'aeiounu') like '%' || translate(lower(trim(p_q)), 'áéíóúñü', 'aeiounu') || '%'))
  order by h.name
  limit 20
$$;
revoke all on function public.household_search(text) from public, anon;
grant execute on function public.household_search(text) to authenticated;

-- Las paradas: la app solo ve qué parada es de qué ruta (nada de direcciones) y puede quitar una.
grant select (id, group_id) on public.bus_stops to authenticated;
grant delete on public.bus_stops to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bus_stops' and policyname = 'bus_stops_select') then
    create policy bus_stops_select on public.bus_stops for select to authenticated
      using (public.can_see_bus_stops(group_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bus_stops' and policyname = 'bus_stops_delete') then
    create policy bus_stops_delete on public.bus_stops for delete to authenticated
      using (public.can_edit_bus_route(group_id));
  end if;
end $p$;
