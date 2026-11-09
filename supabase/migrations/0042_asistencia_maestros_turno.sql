-- 0042: el que tiene un turno de maestro o ayudante en una clase (aunque no esté en la lista de maestros)
-- puede ver los alumnos y tomar asistencia de esa clase. No hace falta el permiso general de asistencia.

create or replace function public.can_teach_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_teacher_of(p_class)
      or exists (select 1 from public.class_schedule s
                 where s.class_id = p_class and auth.uid() in (s.teacher_id, s.helper_id)
                   and s.on_date >= current_date - 60)
$$;
revoke all on function public.can_teach_class(uuid) from public;
grant execute on function public.can_teach_class(uuid) to authenticated;

drop policy if exists class_attendance_select on public.class_attendance;
create policy class_attendance_select on public.class_attendance for select to authenticated
  using (church_id = public.current_church_id() and (public.has_perm('ens.ver') or public.can_teach_class(class_id)));

drop policy if exists class_attendance_write on public.class_attendance;
create policy class_attendance_write on public.class_attendance for all to authenticated
  using (church_id = public.current_church_id() and (public.has_perm('ens.editar') or public.can_teach_class(class_id)))
  with check (church_id = public.current_church_id() and (public.has_perm('ens.editar') or public.can_teach_class(class_id)));

drop policy if exists class_students_select on public.class_students;
create policy class_students_select on public.class_students for select to authenticated
  using (exists (select 1 from public.classes k where k.id = class_students.class_id and k.church_id = public.current_church_id())
         and (public.has_perm('ens.ver') or public.can_teach_class(class_id)));

-- Cuántas veces por mes puede enseñar cada maestro (para armar la sugerencia del mes).
create table if not exists public.teacher_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade,
  per_month  integer check (per_month between 1 and 10),
  updated_at timestamptz not null default now()
);
alter table public.teacher_prefs enable row level security;
drop policy if exists teacher_prefs_select on public.teacher_prefs;
create policy teacher_prefs_select on public.teacher_prefs for select to authenticated
  using (church_id = public.current_church_id() and (public.has_perm('ens.ver') or public.has_perm('ens.editar') or profile_id = auth.uid()));
drop policy if exists teacher_prefs_write on public.teacher_prefs;
create policy teacher_prefs_write on public.teacher_prefs for all to authenticated
  using (church_id = public.current_church_id() and public.has_perm('ens.editar'))
  with check (church_id = public.current_church_id() and public.has_perm('ens.editar'));
grant select, insert, update, delete on public.teacher_prefs to authenticated;
