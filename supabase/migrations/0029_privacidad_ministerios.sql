-- 0029: privacidad. Cada uno ve solo lo suyo; el pastor, la secretaría y los capitanes ven todo.
--  - Personas: un miembro o visita ve solo a quienes él cargó, los que le asignaron para seguir,
--    los que le compartieron, los alumnos de su clase (si es maestro) y, si toma asistencia,
--    los miembros y visitas (para poder marcarlos). Ya no ve a todos los miembros de la iglesia
--    (el directorio sigue aparte y es opcional) ni lo que cargaron los demás de su ruta.
--  - Ministerios: cada uno ve solo los ministerios donde está.
--  - Clases: las ven los maestros de esa clase, los del ministerio de enseñanza y los líderes.
--  - Material: va dentro de cada clase (columna class_id) y lo ven los maestros de esa clase.
--  - Crecimiento: artículos para leer (doctrina, preguntas y respuestas); los ven todos.

create or replace function public.can_see_contact_private(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or c.profile_id = auth.uid()
    or public.is_staff()
    or (public.current_role_name()::text = 'captain' and (
          (c.group_id is not null and c.group_id = public.current_group_id())
          or exists (select 1 from public.profiles p where p.id = c.created_by and p.group_id is not null and p.group_id = public.current_group_id())))
    or exists (select 1 from public.contact_shares s where s.contact_id = c.id and s.user_id = auth.uid())
    or public.teaches_contact(c.id)
  )
$$;

create or replace function public.can_see_contact(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_see_contact_private(c)
      or (c.church_id = public.current_church_id() and c.status in ('member', 'visitor') and not c.archived and public.can_take_attendance())
$$;

-- ¿Está en un ministerio de enseñanza?
create or replace function public.in_teaching_ministry() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ministry_members mm join public.ministries m on m.id = mm.ministry_id
                 where mm.profile_id = auth.uid() and m.is_teaching)
      or exists (select 1 from public.ministries m where m.leader_id = auth.uid() and m.is_teaching)
$$;
grant execute on function public.in_teaching_ministry() to authenticated;

create or replace function public.can_see_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_captain_or_admin() or public.is_teacher_of(p_class) or public.in_teaching_ministry()
$$;
grant execute on function public.can_see_class(uuid) to authenticated;

drop policy if exists ministries_select on public.ministries;
create policy ministries_select on public.ministries for select to authenticated
  using (church_id = public.current_church_id()
         and (public.is_captain_or_admin() or public.is_ministry_member(id) or leader_id = auth.uid()));

drop policy if exists ministry_members_select on public.ministry_members;
create policy ministry_members_select on public.ministry_members for select to authenticated
  using (exists (select 1 from public.ministries m where m.id = ministry_id and m.church_id = public.current_church_id())
         and (public.is_captain_or_admin() or public.is_ministry_member(ministry_id) or public.is_ministry_leader(ministry_id)));

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
  using (church_id = public.current_church_id() and public.can_see_class(id));

drop policy if exists class_teachers_select on public.class_teachers;
create policy class_teachers_select on public.class_teachers for select to authenticated
  using (exists (select 1 from public.classes k where k.id = class_id and k.church_id = public.current_church_id()) and public.can_see_class(class_id));

drop policy if exists class_schedule_select on public.class_schedule;
create policy class_schedule_select on public.class_schedule for select to authenticated
  using (church_id = public.current_church_id() and (public.can_see_class(class_id) or teacher_id = auth.uid()));

-- Material dentro de cada clase.
alter table public.materials add column if not exists class_id uuid references public.classes(id) on delete cascade;
create index if not exists materials_class_idx on public.materials (class_id, series, chapter_order);
drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials for select to authenticated
  using (church_id = public.current_church_id() and (
    public.is_captain_or_admin()
    or (class_id is not null and public.can_see_class(class_id))
    or (class_id is null and (public.is_any_teacher() or public.in_teaching_ministry()))));
drop policy if exists materials_write on public.materials;
create policy materials_write on public.materials for all to authenticated
  using (church_id = public.current_church_id() and (public.is_staff() or (class_id is not null and public.is_teacher_of(class_id))))
  with check (church_id = public.current_church_id() and (public.is_staff() or (class_id is not null and public.is_teacher_of(class_id))));

-- Crecimiento espiritual: artículos para leer. church_id nulo = para todas las iglesias.
create table if not exists public.growth_articles (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid references public.churches(id) on delete cascade,
  slug       text not null,
  section    text not null,
  title      text not null,
  summary    text,
  body       text not null,
  sort_order integer not null default 100,
  published  boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (church_id, slug)
);
create unique index if not exists growth_articles_global_slug on public.growth_articles (slug) where church_id is null;
alter table public.growth_articles enable row level security;
grant select on public.growth_articles to authenticated;
grant insert, update, delete on public.growth_articles to authenticated;
drop policy if exists growth_articles_read on public.growth_articles;
create policy growth_articles_read on public.growth_articles for select to authenticated
  using (published and (church_id is null or church_id = public.current_church_id()));
drop policy if exists growth_articles_write on public.growth_articles;
create policy growth_articles_write on public.growth_articles for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

-- Cargar artículos desde un JSON (lo usa la carga inicial; solo desde el servidor).
create or replace function public.load_growth_articles(p_json jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.growth_articles (church_id, slug, section, title, summary, body, sort_order)
  select null, a->>'slug', a->>'section', a->>'title', a->>'summary', a->>'body', coalesce((a->>'sort_order')::int, 100)
  from jsonb_array_elements(p_json) a
  on conflict (slug) where church_id is null do update set
    section = excluded.section, title = excluded.title, summary = excluded.summary, body = excluded.body,
    sort_order = excluded.sort_order, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.load_growth_articles(jsonb) from public, anon, authenticated;
