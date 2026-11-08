-- 0041: Unir dos fichas de la misma persona (por ejemplo, la que cargó el pastor y la que se creó sola
--  cuando la persona hizo su cuenta). Todo lo de la ficha que se va (asistencias, clases, visitas,
--  ministerios, hijos, inscripciones…) pasa a la que queda; los datos vacíos se completan; la que se va
--  queda archivada con merged_into, así no se pierde nada.
alter table public.contacts add column if not exists merged_into uuid references public.contacts(id) on delete set null;

create or replace function public.merge_contacts(p_keep uuid, p_drop uuid, p_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k public.contacts; d public.contacts; tmp uuid;
  r record; row record; v_rank text[] := array['member', 'regular', 'visitor', 'contact'];
begin
  if not public.has_perm('personas.editar') then raise exception 'Solo la secretaría o el pastor unen fichas'; end if;
  if p_keep = p_drop then raise exception 'Elegí dos personas distintas'; end if;
  select * into k from public.contacts where id = p_keep and church_id = public.current_church_id() and not archived;
  select * into d from public.contacts where id = p_drop and church_id = public.current_church_id() and not archived;
  if k.id is null or d.id is null then raise exception 'No encontramos alguna de las dos fichas'; end if;
  if k.profile_id is not null and d.profile_id is not null and k.profile_id <> d.profile_id then
    raise exception 'Las dos fichas tienen su propia cuenta en la app. No se pueden unir: son dos personas con usuario.';
  end if;

  -- 1) Todo lo que apunta a la ficha que se va, pasa a la que queda (si ya estaba repetido, se descarta el repetido).
  for r in
    select tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and ccu.table_name = 'contacts' and ccu.column_name = 'id'
      and not (kcu.table_name = 'contacts' and kcu.column_name = 'merged_into')
  loop
    for row in execute format('select ctid from public.%I where %I = $1', r.table_name, r.column_name) using p_drop loop
      begin
        execute format('update public.%I set %I = $1 where ctid = $2', r.table_name, r.column_name) using p_keep, row.ctid;
      exception when unique_violation then
        execute format('delete from public.%I where ctid = $1', r.table_name) using row.ctid;
      end;
    end loop;
  end loop;
  update public.contacts set spouse_id = null where id = p_keep and spouse_id = p_keep;

  -- 2) Completar la ficha que queda con lo que le faltaba.
  tmp := d.profile_id;
  update public.contacts set profile_id = null where id = p_drop;
  update public.contacts c set
    name = coalesce(nullif(trim(p_name), ''), c.name),
    profile_id = coalesce(c.profile_id, tmp),
    phone = coalesce(c.phone, d.phone), email = coalesce(c.email, d.email), dni = coalesce(c.dni, d.dni),
    address = coalesce(c.address, d.address), address_hint = coalesce(c.address_hint, d.address_hint),
    lat = coalesce(c.lat, d.lat), lng = coalesce(c.lng, d.lng), road_id = coalesce(c.road_id, d.road_id), side = coalesce(c.side, d.side),
    age = coalesce(c.age, d.age), sex = coalesce(c.sex, d.sex), marital = coalesce(c.marital, d.marital), birthdate = coalesce(c.birthdate, d.birthdate),
    photo_path = coalesce(c.photo_path, d.photo_path), group_id = coalesce(c.group_id, d.group_id),
    spouse_id = coalesce(c.spouse_id, nullif(d.spouse_id, p_keep)), spouse_name = coalesce(c.spouse_name, d.spouse_name),
    follow_up_user_id = coalesce(c.follow_up_user_id, d.follow_up_user_id),
    member_since = least(c.member_since, d.member_since), saved_on = least(c.saved_on, d.saved_on),
    baptized_on = coalesce(c.baptized_on, d.baptized_on), discipleship_since = least(c.discipleship_since, d.discipleship_since),
    baptized = c.baptized or d.baptized, baptized_here = coalesce(c.baptized_here, d.baptized_here),
    gospel_presented = c.gospel_presented or d.gospel_presented, bus_rider = c.bus_rider or d.bus_rider, pickup = c.pickup or d.pickup,
    status = case when array_position(v_rank, d.status) < array_position(v_rank, c.status) then d.status else c.status end,
    auto_created = c.auto_created and d.auto_created,
    updated_at = now()
  where c.id = p_keep;

  -- 3) La ficha que se va queda archivada y apuntando a la que queda.
  update public.contacts set archived = true, merged_into = p_keep, spouse_id = null, updated_at = now() where id = p_drop;

  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'merge_contacts', p_keep::text, jsonb_build_object('dropped', p_drop, 'dropped_name', d.name, 'kept_name', k.name));
  return p_keep;
end $$;
revoke all on function public.merge_contacts(uuid, uuid, text) from public, anon;
grant execute on function public.merge_contacts(uuid, uuid, text) to authenticated;

-- Quien tiene un turno para dar o ayudar en una clase puede abrirla (antes el aviso "Esta semana das la clase"
-- llevaba a "No se encontró" si la persona no estaba cargada como maestra fija de esa clase).
create or replace function public.can_see_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('ens.ver') or public.is_teacher_of(p_class) or public.in_teaching_ministry()
      or exists (select 1 from public.class_schedule s where s.class_id = p_class and auth.uid() in (s.teacher_id, s.helper_id))
$$;
