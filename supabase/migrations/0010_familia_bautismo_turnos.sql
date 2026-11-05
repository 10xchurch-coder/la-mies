-- ============================================================================
-- La Mies · Ficha más completa: estado civil ampliado, bautismo "acá" o "antes",
-- fecha de nacimiento de los hijos, cónyuge (familia), maestros por ficha,
-- y contacto que pasa a visita solo cuando viene a la iglesia.
-- Se puede correr más de una vez.
-- ============================================================================

-- Estado civil: separado y divorciado.
alter table public.contacts drop constraint if exists contacts_marital_check;
alter table public.contacts add constraint contacts_marital_check
  check (marital in ('single', 'married', 'partner', 'widowed', 'separated', 'divorced'));

-- Bautismo: en esta iglesia (con fecha) o antes de llegar (solo "sí").
alter table public.contacts add column if not exists baptized_here boolean not null default true;

-- Cónyuge: otra ficha de la iglesia, o solo el nombre si no está cargado.
alter table public.contacts add column if not exists spouse_id uuid references public.contacts(id) on delete set null;
alter table public.contacts add column if not exists spouse_name text;
create index if not exists contacts_spouse_idx on public.contacts (spouse_id);

-- Hijos con fecha de nacimiento (la edad sigue sirviendo si no se sabe la fecha).
alter table public.contact_children add column if not exists birthdate date;

-- El vínculo de cónyuge va en los dos sentidos.
create or replace function public.contacts_spouse_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.spouse_id is distinct from old.spouse_id then
    if old.spouse_id is not null and old.spouse_id <> new.id then
      update public.contacts set spouse_id = null where id = old.spouse_id and spouse_id = new.id;
    end if;
    if new.spouse_id is not null and new.spouse_id <> new.id then
      update public.contacts set spouse_id = new.id, spouse_name = null where id = new.spouse_id and spouse_id is distinct from new.id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists contacts_spouse_sync on public.contacts;
create trigger contacts_spouse_sync after update of spouse_id on public.contacts
  for each row execute function public.contacts_spouse_sync();

-- Los hijos de la familia: los de la persona y los de su cónyuge, sin repetir.
create or replace function public.family_children(p_contact uuid)
returns table (id uuid, contact_id uuid, name text, age integer, birthdate date)
language sql stable security definer set search_path = public as $$
  select distinct on (lower(k.name)) k.id, k.contact_id, k.name, k.age, k.birthdate
  from public.contact_children k
  join public.contacts c on c.id = k.contact_id
  where (k.contact_id = p_contact or k.contact_id = (select spouse_id from public.contacts where id = p_contact))
    and public.can_see_contact(c)
  order by lower(k.name), k.birthdate nulls last
$$;
grant execute on function public.family_children(uuid) to authenticated;

-- Sugerencias de cónyuge: fichas de la iglesia que la persona puede ver, por nombre (sin importar acentos).
do $$ begin
  begin create extension if not exists unaccent; exception when others then null; end;
end $$;
create or replace function public.search_people(p_q text)
returns table (id uuid, name text, status text, photo_path text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.status, c.photo_path
  from public.contacts c
  where c.church_id = public.current_church_id() and not c.archived
    and public.can_see_contact(c)
    and (p_q is null or p_q = '' or translate(lower(c.name), 'áéíóúñü', 'aeiounu') like '%' || translate(lower(p_q), 'áéíóúñü', 'aeiounu') || '%')
  order by c.name
  limit 20
$$;
grant execute on function public.search_people(text) to authenticated;

-- Maestros por ficha (no hace falta que tengan cuenta). Si la ficha tiene cuenta, el aviso del lunes le llega.
alter table public.class_schedule
  add column if not exists teacher_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists helper_contact_id uuid references public.contacts(id) on delete set null;

create or replace function public.class_schedule_sync_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_contact_id is not null then
    new.teacher_id := (select profile_id from public.contacts where id = new.teacher_contact_id);
  end if;
  if new.helper_contact_id is not null then
    new.helper_id := (select profile_id from public.contacts where id = new.helper_contact_id);
  end if;
  return new;
end $$;
drop trigger if exists class_schedule_sync_profiles on public.class_schedule;
create trigger class_schedule_sync_profiles before insert or update on public.class_schedule
  for each row execute function public.class_schedule_sync_profiles();

-- Un contacto que viene a la iglesia pasa a ser visita (se anota al tomar asistencia).
create or replace function public.promote_to_visitor(p_contact uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.contacts set status = 'visitor' where id = p_contact and status = 'contact';
  perform set_config('lamies.bypass_guard', 'off', true);
end $$;
revoke all on function public.promote_to_visitor(uuid) from public, anon, authenticated;

create or replace function public.set_attendance(p_contact uuid, p_date date, p_service uuid, p_present boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_dow integer;
begin
  if not public.can_take_attendance() then raise exception 'No tenés permiso para tomar asistencia'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then raise exception 'Persona inválida'; end if;
  select dow into v_dow from public.church_services where id = p_service and church_id = public.current_church_id();
  if v_dow is null then raise exception 'Reunión inválida'; end if;
  if p_present then
    insert into public.attendances (church_id, contact_id, attended_on, service, service_id, recorded_by)
    values (public.current_church_id(), p_contact, p_date,
            case extract(dow from p_date)::int when 6 then 'sat' when 0 then 'sun' else 'other' end, p_service, auth.uid())
    on conflict (contact_id, attended_on, service_id) do nothing;
    perform public.promote_to_visitor(p_contact);
  else
    delete from public.attendances where contact_id = p_contact and attended_on = p_date and service_id = p_service;
  end if;
end $$;

create or replace function public.record_attendance(p_contact uuid, p_date date, p_service text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_service uuid;
begin
  if not public.can_take_attendance() then raise exception 'Solo capitanes, recepción y administradores'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and church_id = public.current_church_id()) then
    raise exception 'Contacto inválido';
  end if;
  perform public.ensure_default_services(public.current_church_id());
  select id into v_service from public.church_services
  where church_id = public.current_church_id() and main and active
    and dow = case p_service when 'sat' then 6 when 'sun' then 0 else dow end
  order by sort_order limit 1;
  if v_service is null then
    select id into v_service from public.church_services where church_id = public.current_church_id() and main order by sort_order limit 1;
  end if;
  insert into public.attendances (church_id, contact_id, attended_on, service, service_id, recorded_by)
  values (public.current_church_id(), p_contact, p_date, p_service, v_service, auth.uid())
  on conflict (contact_id, attended_on, service_id) do nothing;
  perform public.promote_to_visitor(p_contact);
end $$;
