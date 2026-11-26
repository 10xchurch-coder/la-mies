-- Grupos pequeños y escuela dominical.
-- Un grupo pequeño usa la misma base que las clases (líderes = class_teachers, integrantes = class_students,
-- asistencia = class_attendance). Lo que cambia es "kind" y cómo estudian ("study"):
--   'predica'  = repasan la prédica del domingo con la guía que carga el pastor;
--   'material' = estudian una serie propia (materials.series).

alter table public.classes add column if not exists kind text not null default 'escuela';
alter table public.classes add column if not exists study text not null default 'predica';
alter table public.classes add column if not exists meet_time text;
alter table public.classes add column if not exists place text;
alter table public.classes add column if not exists about text;
alter table public.classes add column if not exists series text;
do $$ begin
  alter table public.classes add constraint classes_kind_chk check (kind in ('escuela', 'grupo'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.classes add constraint classes_study_chk check (study in ('predica', 'material'));
exception when duplicate_object then null; end $$;

-- La guía para los grupos pequeños, junto a cada prédica.
alter table public.sermons add column if not exists group_guide text;

-- ¿Soy integrante de este grupo (por mi ficha de persona)?
create or replace function public.is_group_member(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_students s join public.contacts c on c.id = s.contact_id
                 where s.class_id = p_class and c.profile_id = auth.uid())
$$;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Los grupos pequeños los ve toda la iglesia (para saber cuándo y dónde se reúnen y pedir sumarse).
create or replace function public.can_see_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('ens.ver') or public.is_teacher_of(p_class) or public.in_teaching_ministry()
      or exists (select 1 from public.class_schedule s where s.class_id = p_class and auth.uid() in (s.teacher_id, s.helper_id))
      or exists (select 1 from public.classes k where k.id = p_class and k.kind = 'grupo')
$$;

-- Los grupos donde estoy como integrante.
create or replace function public.my_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.class_id from public.class_students s
    join public.contacts c on c.id = s.contact_id
    join public.classes k on k.id = s.class_id
   where c.profile_id = auth.uid() and k.kind = 'grupo' and k.church_id = public.current_church_id()
$$;
grant execute on function public.my_group_ids() to authenticated;

-- "Quiero sumarme": les llega un aviso a los líderes del grupo.
create or replace function public.group_join_request(p_class uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_name text; v_me text; v_n int := 0; r record;
begin
  select name into v_name from public.classes
   where id = p_class and kind = 'grupo' and church_id = public.current_church_id();
  if v_name is null then raise exception 'Grupo no encontrado'; end if;
  select coalesce(display_name, 'Alguien') into v_me from public.profiles where id = auth.uid();
  for r in select distinct profile_id from public.class_teachers where class_id = p_class and profile_id is not null and profile_id <> auth.uid() loop
    perform public.notify(r.profile_id, 'group', v_me || ' quiere sumarse a ' || v_name,
      'Tocá para abrir el grupo y sumarlo.', '/grupo/' || p_class::text);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.group_join_request(uuid) to authenticated;

insert into public.feature_routes (route, feature) values
  ('/grupos', 'grupos'),
  ('/grupo', 'grupos')
on conflict (route) do update set feature = excluded.feature;

-- Estudio propio: el líder marca cuál es la lección de esta semana.
alter table public.classes add column if not exists current_material uuid references public.materials(id) on delete set null;
create or replace function public.group_set_lesson(p_class uuid, p_material uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('ens.editar') or public.is_teacher_of(p_class)) then raise exception 'Solo los líderes del grupo'; end if;
  if p_material is not null and not exists (select 1 from public.materials m where m.id = p_material and m.church_id = public.current_church_id()) then
    raise exception 'Lección no encontrada';
  end if;
  update public.classes set current_material = p_material where id = p_class and church_id = public.current_church_id();
end $$;
grant execute on function public.group_set_lesson(uuid, uuid) to authenticated;
