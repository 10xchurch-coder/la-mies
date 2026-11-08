-- 0033: cada hijo tiene su propia ficha (para tomarle asistencia a todos, también a los bebés).
--  - contact_children.child_contact_id apunta a la ficha del hijo.
--  - set_family_children() guarda la lista de hijos de una familia: si el hijo ya está cargado se
--    vincula; si no, se le crea la ficha con el estado, la ruta y la dirección de los padres.
--  - Los hijos se guardan una sola vez por familia (los ve el padre y la madre).
--  - Los hijos que ya estaban cargados solo con nombre reciben su ficha.

alter table public.contact_children add column if not exists child_contact_id uuid references public.contacts(id) on delete set null;
create index if not exists contact_children_child_idx on public.contact_children (child_contact_id);

drop function if exists public.family_children(uuid);
create function public.family_children(p_contact uuid)
returns table (id uuid, contact_id uuid, name text, age integer, birthdate date, child_contact_id uuid, photo_path text)
language sql stable security definer set search_path = public as $$
  select distinct on (coalesce(k.child_contact_id::text, lower(k.name)))
         k.id, k.contact_id, coalesce(ch.name, k.name), coalesce(ch.age, k.age), coalesce(ch.birthdate, k.birthdate), k.child_contact_id, ch.photo_path
  from public.contact_children k
  join public.contacts c on c.id = k.contact_id
  left join public.contacts ch on ch.id = k.child_contact_id and not ch.archived
  where (k.contact_id = p_contact or k.contact_id = (select spouse_id from public.contacts where id = p_contact))
    and public.can_see_contact(c)
  order by coalesce(k.child_contact_id::text, lower(k.name)), k.contact_id = p_contact desc
$$;
grant execute on function public.family_children(uuid) to authenticated;

-- Crea la ficha de un hijo a partir de la de su papá o mamá.
create or replace function public.make_child_contact(p_parent public.contacts, p_name text, p_age integer, p_birthdate date, p_by uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform set_config('lamies.bypass_guard', 'on', true);
  insert into public.contacts (church_id, created_by, name, age, birthdate, status, group_id, address, address_hint, lat, lng, road_id, side,
                               follow_up_user_id, interest, share_mode, member_since)
  values (p_parent.church_id, coalesce(p_by, p_parent.created_by), initcap(trim(p_name)), p_age, p_birthdate,
          case when p_parent.status in ('member', 'visitor') then p_parent.status else 'contact' end,
          p_parent.group_id, p_parent.address, p_parent.address_hint, p_parent.lat, p_parent.lng, p_parent.road_id, p_parent.side,
          p_parent.follow_up_user_id, p_parent.interest, p_parent.share_mode,
          case when p_parent.status = 'member' then p_parent.member_since end)
  returning id into v_id;
  perform set_config('lamies.bypass_guard', 'off', true);
  return v_id;
end $$;
revoke all on function public.make_child_contact(public.contacts, text, integer, date, uuid) from public, anon, authenticated;

-- Guarda los hijos de una familia. p_kids: [{child_contact_id?, name, age?, birthdate?}]
create or replace function public.set_family_children(p_contact uuid, p_kids jsonb)
returns setof public.contact_children
language plpgsql security definer set search_path = public as $$
declare c public.contacts; k jsonb; v_child uuid; v_age int; v_birth date; v_name text;
begin
  select * into c from public.contacts where id = p_contact;
  if c.id is null or not public.can_edit_contact(c) then raise exception 'No podés editar esta ficha'; end if;
  delete from public.contact_children where contact_id = p_contact
     or (c.spouse_id is not null and contact_id = c.spouse_id);
  for k in select * from jsonb_array_elements(coalesce(p_kids, '[]'::jsonb)) loop
    v_name := nullif(trim(k->>'name'), '');
    v_child := nullif(k->>'child_contact_id', '')::uuid;
    v_age := nullif(k->>'age', '')::int;
    v_birth := nullif(k->>'birthdate', '')::date;
    if v_child is not null then
      if not exists (select 1 from public.contacts where id = v_child and church_id = c.church_id) then raise exception 'Ese hijo no es de tu iglesia'; end if;
      perform set_config('lamies.bypass_guard', 'on', true);
      update public.contacts set birthdate = coalesce(birthdate, v_birth), age = coalesce(age, v_age) where id = v_child;
      perform set_config('lamies.bypass_guard', 'off', true);
      select coalesce(v_name, name) into v_name from public.contacts where id = v_child;
    elsif v_name is not null then
      v_child := public.make_child_contact(c, v_name, v_age, v_birth, auth.uid());
    else
      continue;
    end if;
    return query insert into public.contact_children (contact_id, name, age, birthdate, child_contact_id)
      values (p_contact, v_name, v_age, v_birth, v_child) returning *;
  end loop;
end $$;
revoke all on function public.set_family_children(uuid, jsonb) from public, anon;
grant execute on function public.set_family_children(uuid, jsonb) to authenticated;

-- Los hijos de un niño: no hace falta; pero sí saber quiénes son los padres desde la ficha del hijo.
create or replace function public.family_parents(p_child uuid)
returns table (id uuid, name text, photo_path text)
language sql stable security definer set search_path = public as $$
  select distinct c.id, c.name, c.photo_path
  from public.contact_children k
  join public.contacts c on c.id = k.contact_id or c.id = (select spouse_id from public.contacts where id = k.contact_id)
  where k.child_contact_id = p_child and public.can_see_contact(c)
$$;
grant execute on function public.family_parents(uuid) to authenticated;

-- Los hijos que ya estaban cargados solo con nombre: se les crea la ficha
-- (o se vincula con la que ya existe si hay una sola persona con ese nombre completo en la iglesia).
do $bf$
declare r record; v uuid; n int := 0;
begin
  for r in
    select k.id as kid, k.name, k.age, k.birthdate
    from public.contact_children k join public.contacts p on p.id = k.contact_id
    where k.child_contact_id is null and not p.archived
  loop
    select max(x.id::text)::uuid into v from public.contacts x
      where x.church_id = (select church_id from public.contacts where id = (select contact_id from public.contact_children where id = r.kid))
        and not x.archived and lower(x.name) = lower(trim(r.name))
      having count(*) = 1;
    if v is null then
      v := public.make_child_contact((select p from public.contacts p where p.id = (select contact_id from public.contact_children where id = r.kid)), r.name, r.age, r.birthdate, null);
    end if;
    update public.contact_children set child_contact_id = v where id = r.kid;
    n := n + 1;
  end loop;
  raise notice 'hijos con ficha: %', n;
end $bf$;

-- Si el padre y la madre tenían cargado al mismo hijo por separado, queda una sola vez.
delete from public.contact_children k
using public.contacts c, public.contact_children k2
where c.id = k.contact_id and c.spouse_id = k2.contact_id and k.child_contact_id = k2.child_contact_id
  and k.contact_id > k2.contact_id;
