-- Asistencia de evangelismo: marcar a mano quiénes salieron, aunque no usen la app.
-- No toca la asistencia a los cultos: no cuenta para la fidelidad.

create table if not exists public.outing_attendance (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  went_on date not null,
  recorded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contact_id, went_on)
);
create index if not exists outing_attendance_church_day on public.outing_attendance (church_id, went_on);
alter table public.outing_attendance enable row level security;

drop policy if exists outing_attendance_select on public.outing_attendance;
create policy outing_attendance_select on public.outing_attendance for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists outing_attendance_write on public.outing_attendance;
create policy outing_attendance_write on public.outing_attendance for all to authenticated
  using (church_id = public.current_church_id() and (public.can_take_attendance() or public.is_captain_or_admin()))
  with check (church_id = public.current_church_id() and (public.can_take_attendance() or public.is_captain_or_admin()));
revoke all on table public.outing_attendance from anon, public;
grant select, insert, delete on table public.outing_attendance to authenticated;

-- Cuántas personas distintas salieron: las que usaron la app más las marcadas a mano.
-- Si alguien usó la app y además lo marcaron, cuenta una sola vez.
create or replace function public.people_out_between(p_church uuid, p_from timestamptz, p_to timestamptz)
returns integer language sql stable security definer set search_path to 'public' as $$
  with tz as (select coalesce((select timezone from public.churches where id = p_church), 'America/Argentina/Buenos_Aires') z)
  select count(distinct k)::int from (
    select coalesce((select c.id::text from public.contacts c where c.profile_id = s.user_id and c.church_id = p_church and not c.archived limit 1), s.user_id::text) k
    from public.sessions s
    where (s.ended_at is null or s.counts) and s.church_id = p_church and s.started_at >= p_from and s.started_at < p_to
    union
    select o.contact_id::text from public.outing_attendance o, tz
    where o.church_id = p_church and (o.went_on::timestamp at time zone tz.z) >= p_from and (o.went_on::timestamp at time zone tz.z) < p_to
  ) q
$$;

-- Días en que se marcó gente a mano y nadie usó la app: cada uno cuenta como una salida.
create or replace function public.extra_outings_between(p_church uuid, p_from timestamptz, p_to timestamptz)
returns integer language sql stable security definer set search_path to 'public' as $$
  with tz as (select coalesce((select timezone from public.churches where id = p_church), 'America/Argentina/Buenos_Aires') z)
  select count(distinct o.went_on)::int from public.outing_attendance o, tz
  where o.church_id = p_church and (o.went_on::timestamp at time zone tz.z) >= p_from and (o.went_on::timestamp at time zone tz.z) < p_to
    and not exists (select 1 from public.sessions s where s.church_id = p_church and (s.ended_at is null or s.counts)
                    and (s.started_at at time zone tz.z)::date = o.went_on)
$$;
revoke all on function public.people_out_between(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.extra_outings_between(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- La planilla del día: miembros y asistentes regulares, con quién ya está marcado y quién salió con la app.
create or replace function public.outing_sheet(p_date date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_tz text; v_from timestamptz;
begin
  if not (public.can_take_attendance() or public.is_captain_or_admin()) then raise exception 'No tenés permiso para marcar quién salió'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;
  v_from := p_date::timestamp at time zone v_tz;
  return jsonb_build_object(
    'total', public.people_out_between(v_church, v_from, v_from + interval '1 day'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('contact_id', x.id, 'name', x.name, 'photo_path', x.photo_path, 'status', x.status, 'marked', x.marked, 'via_app', x.via_app) order by x.name)
      from (
        select c.id, c.name, c.photo_path, c.status,
          exists (select 1 from public.outing_attendance o where o.contact_id = c.id and o.went_on = p_date) marked,
          (c.profile_id is not null and exists (select 1 from public.sessions s where s.user_id = c.profile_id and (s.ended_at is null or s.counts)
             and s.started_at >= v_from and s.started_at < v_from + interval '1 day')) via_app
        from public.contacts c
        where c.church_id = v_church and not c.archived
      ) x
      where x.status in ('member', 'regular') or x.marked or x.via_app), '[]'::jsonb)
  );
end $$;
revoke all on function public.outing_sheet(date) from public, anon;
grant execute on function public.outing_sheet(date) to authenticated;

-- Los informes pasan a contar también a los marcados a mano.
do $$
declare v_def text; v_new text;
  procedure_missing constant text := 'No se encontró el texto a cambiar en ';
begin
  -- Informe semanal
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'weekly_report';
  v_new := replace(v_def, $a$'people_out', (select count(distinct user_id) from public.sessions where id = any(ss)),$a$, $a$'people_out', public.people_out_between(v_church, v_from, v_to),$a$);
  if v_new = v_def then raise exception '%weekly_report (people_out)', procedure_missing; end if;
  v_def := v_new;
  v_new := replace(v_def, $a$'outings', (select count(*) from ($a$, $a$'outings', public.extra_outings_between(v_church, v_from, v_to) + (select count(*) from ($a$);
  if v_new = v_def then raise exception '%weekly_report (outings)', procedure_missing; end if;
  execute v_new;

  -- Panel del pastor
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'church_report';
  v_new := replace(v_def, $a$'members',       (select count(distinct s.user_id) from public.sessions s where (s.ended_at is null or s.counts) and s.church_id = public.current_church_id() and s.started_at >= p_from and s.started_at < p_to),$a$,
                          $a$'members',       public.people_out_between(public.current_church_id(), p_from, p_to),$a$);
  if v_new = v_def then raise exception '%church_report', procedure_missing; end if;
  execute v_new;

  -- Totales del equipo
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'team_totals';
  v_new := replace(v_def, $a$'members',       (select count(distinct user_id) from ss),$a$,
                          $a$'members',       public.people_out_between(public.current_church_id(), (select t from since), now() + interval '1 day'),$a$);
  if v_new = v_def then raise exception '%team_totals', procedure_missing; end if;
  execute v_new;

  -- Progreso de la iglesia
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'church_progress';
  v_new := replace(v_def, $a$    x.p, x.h, x.k,$a$, $a$    public.people_out_between(v_church, m.m0::timestamp at time zone v_tz, m.m1::timestamp at time zone v_tz), x.h, x.k,$a$);
  if v_new = v_def then raise exception '%church_progress (people_out)', procedure_missing; end if;
  v_def := v_new;
  v_new := replace(v_def, $a$    (select count(*)::int from (
       select s.started_at, max($a$, $a$    public.extra_outings_between(v_church, m.m0::timestamp at time zone v_tz, m.m1::timestamp at time zone v_tz) + (select count(*)::int from (
       select s.started_at, max($a$);
  if v_new = v_def then raise exception '%church_progress (outings)', procedure_missing; end if;
  execute v_new;
end $$;
