-- ============================================================================
-- La Mies · Integrantes de ministerio por ficha: cualquier persona de la iglesia
-- puede estar en un ministerio aunque no use la app.
--
-- ministry_people (por ficha) es la lista que se ve y se edita.
-- ministry_members (por cuenta) sigue existiendo para el chat, los permisos y los avisos:
-- se mantiene sola, en los dos sentidos:
--   · al agregar a alguien con cuenta, se agrega también a ministry_members;
--   · cuando una ficha se vincula a una cuenta, esa cuenta entra a sus ministerios;
--   · si una versión vieja de la app escribe en ministry_members, se copia a ministry_people.
-- Se puede correr más de una vez.
-- ============================================================================

create table if not exists public.ministry_people (
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  is_leader   boolean not null default false,
  joined_at   timestamptz not null default now(),
  primary key (ministry_id, contact_id)
);
create index if not exists ministry_people_contact_idx on public.ministry_people (contact_id);
alter table public.ministry_people enable row level security;
grant select, insert, update, delete on public.ministry_people to authenticated;
grant all on public.ministry_people to service_role;

drop policy if exists ministry_people_select on public.ministry_people;
create policy ministry_people_select on public.ministry_people for select to authenticated
  using (exists (select 1 from public.ministries m where m.id = ministry_id and m.church_id = public.current_church_id()));
drop policy if exists ministry_people_write on public.ministry_people;
create policy ministry_people_write on public.ministry_people for all to authenticated
  using (public.is_ministry_leader(ministry_id)
         and exists (select 1 from public.ministries m where m.id = ministry_id and m.church_id = public.current_church_id()))
  with check (public.is_ministry_leader(ministry_id)
         and exists (select 1 from public.ministries m where m.id = ministry_id and m.church_id = public.current_church_id())
         and exists (select 1 from public.contacts c where c.id = contact_id and c.church_id = public.current_church_id()));

-- Ficha → cuenta: si la persona tiene la app, queda también en ministry_members.
create or replace function public.ministry_people_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_profile uuid;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    select profile_id into v_profile from public.contacts where id = old.contact_id;
    if v_profile is not null then
      delete from public.ministry_members where ministry_id = old.ministry_id and profile_id = v_profile;
    end if;
    return old;
  end if;
  select profile_id into v_profile from public.contacts where id = new.contact_id;
  if v_profile is not null then
    insert into public.ministry_members (ministry_id, profile_id, is_leader)
    values (new.ministry_id, v_profile, new.is_leader)
    on conflict (ministry_id, profile_id) do update set is_leader = excluded.is_leader;
  end if;
  return new;
end $$;
drop trigger if exists ministry_people_sync on public.ministry_people;
create trigger ministry_people_sync after insert or update or delete on public.ministry_people
  for each row execute function public.ministry_people_sync();

-- Cuenta → ficha: lo que escriban versiones viejas de la app (o "Cambiar líder") aparece en la lista.
create or replace function public.ministry_members_mirror() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_contact uuid;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from public.ministry_people mp using public.contacts c
    where mp.ministry_id = old.ministry_id and mp.contact_id = c.id and c.profile_id = old.profile_id;
    return old;
  end if;
  select id into v_contact from public.contacts where profile_id = new.profile_id limit 1;
  if v_contact is not null then
    insert into public.ministry_people (ministry_id, contact_id, is_leader, joined_at)
    values (new.ministry_id, v_contact, new.is_leader, new.joined_at)
    on conflict (ministry_id, contact_id) do update set is_leader = excluded.is_leader;
  end if;
  return new;
end $$;
drop trigger if exists ministry_members_mirror on public.ministry_members;
create trigger ministry_members_mirror after insert or update or delete on public.ministry_members
  for each row execute function public.ministry_members_mirror();

-- Cuando una ficha se vincula a una cuenta (o se crea con cuenta), esa cuenta entra a sus ministerios
-- y la ficha recibe los ministerios que la cuenta ya tenía.
create or replace function public.contacts_ministry_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id then return new; end if;
  insert into public.ministry_members (ministry_id, profile_id, is_leader)
    select ministry_id, new.profile_id, is_leader from public.ministry_people where contact_id = new.id
  on conflict (ministry_id, profile_id) do nothing;
  insert into public.ministry_people (ministry_id, contact_id, is_leader, joined_at)
    select ministry_id, new.id, is_leader, joined_at from public.ministry_members where profile_id = new.profile_id
  on conflict (ministry_id, contact_id) do nothing;
  return new;
end $$;
drop trigger if exists contacts_ministry_link on public.contacts;
create trigger contacts_ministry_link after insert or update of profile_id on public.contacts
  for each row execute function public.contacts_ministry_link();

-- Lo que ya había: cada integrante con cuenta pasa a la lista por ficha.
insert into public.ministry_people (ministry_id, contact_id, is_leader, joined_at)
  select mm.ministry_id, c.id, mm.is_leader, mm.joined_at
  from public.ministry_members mm
  join lateral (select id from public.contacts where profile_id = mm.profile_id limit 1) c on true
on conflict (ministry_id, contact_id) do nothing;

-- La lista del ministerio con nombre y foto (todos los de la iglesia pueden ver quién sirve dónde).
create or replace function public.ministry_people_list(p_ministry uuid)
returns table (contact_id uuid, name text, photo_path text, profile_id uuid, is_leader boolean, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.photo_path, c.profile_id,
         mp.is_leader or (m.leader_id is not null and m.leader_id = c.profile_id),
         mp.joined_at
  from public.ministry_people mp
  join public.contacts c on c.id = mp.contact_id
  join public.ministries m on m.id = mp.ministry_id
  where mp.ministry_id = p_ministry and m.church_id = public.current_church_id()
  order by (mp.is_leader or (m.leader_id is not null and m.leader_id = c.profile_id)) desc, c.name
$$;
grant execute on function public.ministry_people_list(uuid) to authenticated;
