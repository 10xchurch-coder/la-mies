-- 0078: personas y seguimiento — discipulado, decisiones, tarjeta de visita por QR, regalo de bienvenida,
-- clase de miembros y certificados para imprimir.
-- Todo se suma a lo que ya había: las lecciones hechas siguen en contacts.discipleship ('one'),
-- las fechas siguen en contacts (saved_on, baptized_on, member_since) y la cantidad de lecciones en churches.followup.
-- Aplicada en tres partes: personas_1_tablas, personas_2_funciones, personas_3_tarjeta_de_visita.

-- =====================================================================================================
-- PARTE 1 (personas_1_tablas): tablas y permisos
-- =====================================================================================================

-- Ajustes por iglesia: nombre del curso de discipulado, nombres de las lecciones y la clase de miembros.
create table if not exists public.people_settings (
  church_id uuid primary key references public.churches(id) on delete cascade,
  disc_course_name text,
  disc_lessons text[] not null default '{}',
  member_lessons text[] not null default '{}',
  member_final text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.people_settings enable row level security;

-- Quién discipula a quién. Las lecciones hechas quedan en contacts.discipleship -> 'one' (como antes).
create table if not exists public.disciple_tracks (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  teacher_contact_id uuid references public.contacts(id) on delete set null,
  started_on date not null default current_date,
  last_met_on date,
  finished_on date,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists disciple_tracks_church on public.disciple_tracks (church_id);
create index if not exists disciple_tracks_teacher on public.disciple_tracks (teacher_contact_id);
alter table public.disciple_tracks enable row level security;

-- Decisiones: fue salvo, se bautizó, se hizo miembro, se reconcilió.
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind text not null check (kind in ('saved', 'baptized', 'member', 'rededicated')),
  on_date date not null,
  note text check (note is null or length(note) <= 500),
  created_by uuid,
  created_at timestamptz not null default now()
);
-- Salvo, bautizado y miembro se anotan una sola vez por persona; reconciliarse puede pasar más de una vez.
create unique index if not exists decisions_once on public.decisions (contact_id, kind) where kind <> 'rededicated';
create index if not exists decisions_church on public.decisions (church_id, on_date desc);
alter table public.decisions enable row level security;

-- Regalo de bienvenida y visita a cada visita nueva: una fila por persona, así nadie recibe dos.
create table if not exists public.visitor_care (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  gift_on date,
  gift_by uuid,
  visit_on date,
  visit_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists visitor_care_church on public.visitor_care (church_id);
alter table public.visitor_care enable row level security;

-- Clase de miembros: qué lecciones hizo cada uno y el paso final que marca el pastor.
create table if not exists public.member_class (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  started_on date not null default current_date,
  done jsonb not null default '{}'::jsonb,
  final_on date,
  final_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists member_class_church on public.member_class (church_id);
alter table public.member_class enable row level security;

-- El código del QR de la puerta (uno por iglesia). Sin permisos directos: solo se lee con las funciones de abajo.
create table if not exists public.visit_card_links (
  church_id uuid primary key references public.churches(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.visit_card_links enable row level security;

-- Cada tarjeta de visita que se llenó (también sirve para frenar abusos).
create table if not exists public.visit_cards (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  phone text,
  heard text,
  prayer text,
  is_new boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists visit_cards_church on public.visit_cards (church_id, created_at desc);
alter table public.visit_cards enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'people_settings' and policyname = 'people_settings_select') then
    create policy people_settings_select on public.people_settings for select using (church_id = public.current_church_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'disciple_tracks' and policyname = 'disciple_tracks_select') then
    create policy disciple_tracks_select on public.disciple_tracks for select using (
      church_id = public.current_church_id() and (
        public.is_captain_or_admin()
        or exists (select 1 from public.contacts c where c.id = disciple_tracks.contact_id)
        or exists (select 1 from public.contacts t where t.id = disciple_tracks.teacher_contact_id and t.profile_id = auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'disciple_tracks' and policyname = 'disciple_tracks_delete') then
    create policy disciple_tracks_delete on public.disciple_tracks for delete using (church_id = public.current_church_id() and public.has_perm('personas.editar'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'decisions' and policyname = 'decisions_select') then
    create policy decisions_select on public.decisions for select using (
      church_id = public.current_church_id() and (public.is_captain_or_admin() or created_by = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'decisions' and policyname = 'decisions_delete') then
    create policy decisions_delete on public.decisions for delete using (
      church_id = public.current_church_id() and (public.has_perm('personas.editar') or created_by = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'visitor_care' and policyname = 'visitor_care_select') then
    create policy visitor_care_select on public.visitor_care for select using (
      church_id = public.current_church_id() and (
        public.is_captain_or_admin() or exists (select 1 from public.contacts c where c.id = visitor_care.contact_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'member_class' and policyname = 'member_class_select') then
    create policy member_class_select on public.member_class for select using (
      church_id = public.current_church_id() and (
        public.is_captain_or_admin() or exists (select 1 from public.contacts c where c.id = member_class.contact_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'member_class' and policyname = 'member_class_delete') then
    create policy member_class_delete on public.member_class for delete using (church_id = public.current_church_id() and public.has_perm('personas.editar'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'visit_cards' and policyname = 'visit_cards_select') then
    create policy visit_cards_select on public.visit_cards for select using (church_id = public.current_church_id() and public.is_captain_or_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'visit_cards' and policyname = 'visit_cards_delete') then
    create policy visit_cards_delete on public.visit_cards for delete using (church_id = public.current_church_id() and public.has_perm('personas.editar'));
  end if;
end $$;

-- Nadie escribe directo en estas tablas: todo pasa por las funciones (que revisan permisos y cuidan los datos).
revoke insert, update on public.people_settings, public.disciple_tracks, public.decisions, public.visitor_care, public.member_class, public.visit_cards from anon, authenticated;
revoke all on public.visit_card_links from anon, authenticated;
revoke all on public.people_settings, public.disciple_tracks, public.decisions, public.visitor_care, public.member_class, public.visit_cards from anon;

-- La iglesia usa el curso "Cristianismo Explicado".
insert into public.people_settings (church_id, disc_course_name)
select id, 'Cristianismo Explicado' from public.churches where name ilike '%victoria%'
on conflict (church_id) do nothing;

-- =====================================================================================================
-- PARTE 2 (personas_2_funciones): funciones para las cuentas de la iglesia
-- =====================================================================================================

-- ¿Puede esta cuenta anotar cosas de esta persona? Líderes, quien la puede editar y (si se pide) quien la discipula.
create or replace function public.personas_can(c public.contacts, p_teacher_ok boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(c.church_id = public.current_church_id() and (
    public.is_captain_or_admin() or public.can_edit_contact(c)
    or (p_teacher_ok and exists (select 1 from public.disciple_tracks d join public.contacts t on t.id = d.teacher_contact_id
                                 where d.contact_id = c.id and t.profile_id = auth.uid()))
  ), false)
$$;

-- La fecha que se anota: hoy (en la hora de la iglesia) si no se dice otra; nunca un día que todavía no llegó.
create or replace function public.personas_day(p date) returns date
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires'))::date;
begin
  if p is null then return v_today; end if;
  if p > v_today + 1 or p < date '1900-01-01' then raise exception 'Revisá la fecha: no puede ser un día que todavía no llegó'; end if;
  return p;
end $$;

-- Guarda el nombre del curso y los nombres de las lecciones. Lo que viene vacío (null) no se toca.
create or replace function public.personas_save_settings(p_course text default null, p_disc text[] default null, p_member text[] default null, p_final text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_n int; x text;
begin
  if v_church is null or public.has_perm('personas.editar') is not true then raise exception 'Solo el pastor o la secretaría pueden cambiar esto'; end if;
  if p_course is not null and length(btrim(p_course)) not between 2 and 60 then raise exception 'El nombre del curso tiene que tener entre 2 y 60 letras'; end if;
  if p_final is not null and length(btrim(p_final)) not between 2 and 60 then raise exception 'El último paso tiene que tener entre 2 y 60 letras'; end if;
  if p_disc is not null then
    v_n := coalesce(array_length(p_disc, 1), 0);
    if v_n < 1 or v_n > 20 then raise exception 'El curso tiene que tener entre 1 y 20 lecciones'; end if;
    foreach x in array p_disc loop
      if x is null or length(btrim(x)) not between 1 and 80 then raise exception 'Cada lección necesita un nombre (hasta 80 letras)'; end if;
    end loop;
    -- La cantidad de lecciones es la misma que usa el resto de la app (Seguimiento y mensajes).
    if v_n <> public.followup_num(v_church, 'disc_one_classes', 4, 0, 20) then
      if public.has_perm('admin.iglesia') is not true then raise exception 'Solo el pastor puede cambiar cuántas lecciones tiene el curso'; end if;
      update public.churches set followup = coalesce(followup, '{}'::jsonb) || jsonb_build_object('disc_one_classes', v_n) where id = v_church;
    end if;
  end if;
  if p_member is not null then
    v_n := coalesce(array_length(p_member, 1), 0);
    if v_n < 1 or v_n > 20 then raise exception 'La clase tiene que tener entre 1 y 20 lecciones'; end if;
    foreach x in array p_member loop
      if x is null or length(btrim(x)) not between 1 and 80 then raise exception 'Cada lección necesita un nombre (hasta 80 letras)'; end if;
    end loop;
  end if;
  insert into public.people_settings (church_id, disc_course_name, disc_lessons, member_lessons, member_final, updated_by)
  values (v_church, btrim(p_course),
          coalesce(array(select btrim(u) from unnest(p_disc) with ordinality as t(u, i) order by i), '{}'),
          coalesce(array(select btrim(u) from unnest(p_member) with ordinality as t(u, i) order by i), '{}'),
          btrim(p_final), auth.uid())
  on conflict (church_id) do update set
    disc_course_name = coalesce(excluded.disc_course_name, people_settings.disc_course_name),
    disc_lessons = case when p_disc is null then people_settings.disc_lessons else excluded.disc_lessons end,
    member_lessons = case when p_member is null then people_settings.member_lessons else excluded.member_lessons end,
    member_final = coalesce(excluded.member_final, people_settings.member_final),
    updated_at = now(), updated_by = auth.uid();
end $$;

-- ---------- Discipulado ----------

-- Empezar el discipulado de una persona (o volver a empezarlo) y decir quién le enseña.
create or replace function public.personas_disc_start(p_contact uuid, p_teacher uuid default null, p_on date default null) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts; t public.contacts; v_on date := public.personas_day(p_on);
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id() and not archived;
  if c.id is null or not public.personas_can(c) then raise exception 'No tenés permiso para anotar el discipulado de esta persona'; end if;
  if p_teacher is not null then
    select * into t from public.contacts where id = p_teacher and church_id = c.church_id and not archived;
    if t.id is null then raise exception 'No se encontró a quien enseña'; end if;
    if t.id = c.id then raise exception 'Nadie se enseña a sí mismo: elegí a otro hermano'; end if;
  end if;
  insert into public.disciple_tracks (contact_id, church_id, teacher_contact_id, started_on, updated_by)
  values (c.id, c.church_id, t.id, v_on, auth.uid())
  on conflict (contact_id) do update set active = true, teacher_contact_id = coalesce(excluded.teacher_contact_id, disciple_tracks.teacher_contact_id),
    updated_at = now(), updated_by = auth.uid();
  update public.contacts set discipleship_since = v_on where id = c.id and discipleship_since is null;
  if t.profile_id is not null and t.profile_id is distinct from auth.uid() then
    perform public.notify(t.profile_id, 'followup', 'Vas a discipular a ' || c.name, 'Tocá para ver la lista y anotar cada lección.', '/discipulado');
  end if;
end $$;

-- Cambiar quién le enseña (null: nadie por ahora).
create or replace function public.personas_disc_teacher(p_contact uuid, p_teacher uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts; t public.contacts;
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id() and not archived;
  if c.id is null or not public.personas_can(c) then raise exception 'No tenés permiso para cambiar quién le enseña'; end if;
  if p_teacher is not null then
    select * into t from public.contacts where id = p_teacher and church_id = c.church_id and not archived;
    if t.id is null then raise exception 'No se encontró a quien enseña'; end if;
    if t.id = c.id then raise exception 'Nadie se enseña a sí mismo: elegí a otro hermano'; end if;
  end if;
  update public.disciple_tracks set teacher_contact_id = t.id, updated_at = now(), updated_by = auth.uid() where contact_id = c.id;
  if not found then raise exception 'Primero empezá el discipulado'; end if;
  if t.profile_id is not null and t.profile_id is distinct from auth.uid() then
    perform public.notify(t.profile_id, 'followup', 'Vas a discipular a ' || c.name, 'Tocá para ver la lista y anotar cada lección.', '/discipulado');
  end if;
end $$;

-- Anotar (o sacar) una lección. La puede anotar un líder, quien edita a la persona o quien le enseña.
create or replace function public.personas_disc_lesson(p_contact uuid, p_lesson integer, p_on date default null, p_undo boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts; v_on date := public.personas_day(p_on); v_total int; v_one jsonb; v_done int; v_last date;
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id() and not archived;
  if c.id is null or not public.personas_can(c, true) then raise exception 'No tenés permiso para anotar lecciones de esta persona'; end if;
  v_total := public.followup_num(c.church_id, 'disc_one_classes', 4, 0, 20);
  if p_lesson is null or p_lesson < 1 or p_lesson > greatest(v_total, 1) then raise exception 'Esa lección no existe en el curso'; end if;
  v_one := coalesce(c.discipleship -> 'one', '{}'::jsonb);
  if coalesce(p_undo, false) then v_one := v_one - p_lesson::text;
  else v_one := v_one || jsonb_build_object(p_lesson::text, to_char(v_on, 'YYYY-MM-DD')); end if;
  update public.contacts set discipleship = coalesce(discipleship, '{}'::jsonb) || jsonb_build_object('one', v_one),
         discipleship_since = coalesce(discipleship_since, v_on) where id = c.id;
  select count(*), max(e.value::date) into v_done, v_last from jsonb_each_text(v_one) e
   where e.key ~ '^\d{1,2}$' and e.key::int between 1 and v_total and e.value ~ '^\d{4}-\d{2}-\d{2}$';
  insert into public.disciple_tracks (contact_id, church_id, started_on, last_met_on, finished_on, updated_by)
  values (c.id, c.church_id, v_on, v_last, case when v_total > 0 and v_done >= v_total then v_last end, auth.uid())
  on conflict (contact_id) do update set last_met_on = excluded.last_met_on,
    finished_on = case when excluded.finished_on is null then null else coalesce(disciple_tracks.finished_on, excluded.finished_on) end,
    updated_at = now(), updated_by = auth.uid();
end $$;

-- Dejar de seguirlo en la lista (o volver a ponerlo). No se borra nada de lo anotado.
create or replace function public.personas_disc_active(p_contact uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts;
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id();
  if c.id is null or not public.personas_can(c) then raise exception 'No tenés permiso para cambiar esto'; end if;
  update public.disciple_tracks set active = coalesce(p_active, true), updated_at = now(), updated_by = auth.uid() where contact_id = c.id;
end $$;

-- La lista de discipulado: los líderes ven a todos; cada hermano ve a los que él enseña o sigue.
create or replace function public.personas_disc_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_lead boolean := coalesce(public.is_captain_or_admin(), false);
begin
  if v_church is null then return jsonb_build_object('total', 0, 'lead', false, 'rows', '[]'::jsonb); end if;
  return jsonb_build_object('total', public.followup_num(v_church, 'disc_one_classes', 4, 0, 20), 'lead', v_lead, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'photo_path', c.photo_path, 'phone', c.phone,
      'teacher_id', t.id, 'teacher_name', t.name, 'started_on', d.started_on,
      'last_met', greatest(d.last_met_on, (select max(e.value::date) from jsonb_each_text(coalesce(c.discipleship -> 'one', '{}'::jsonb)) e where e.value ~ '^\d{4}-\d{2}-\d{2}$')),
      'lessons', coalesce(c.discipleship -> 'one', '{}'::jsonb), 'finished_on', d.finished_on, 'active', d.active,
      'mine', coalesce(t.profile_id = auth.uid(), false)) order by c.name)
    from public.disciple_tracks d join public.contacts c on c.id = d.contact_id left join public.contacts t on t.id = d.teacher_contact_id
    where d.church_id = v_church and not c.archived
      and (v_lead or coalesce(t.profile_id = auth.uid(), false) or coalesce(c.follow_up_user_id = auth.uid(), false))), '[]'::jsonb));
end $$;

-- ---------- Decisiones ----------

-- Anota una decisión y actualiza la ficha de la persona (las mismas fechas que ya usa el resto de la app).
create or replace function public.personas_decision(p_contact uuid, p_kind text, p_on date default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.contacts; v_on date := public.personas_day(p_on); v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_id uuid;
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id() and not archived;
  if c.id is null or not public.personas_can(c) then raise exception 'No tenés permiso para anotar decisiones de esta persona'; end if;
  if p_kind is null or p_kind not in ('saved', 'baptized', 'member', 'rededicated') then raise exception 'Elegí qué decisión tomó'; end if;
  if length(v_note) > 500 then raise exception 'La nota es muy larga (hasta 500 letras)'; end if;
  if p_kind = 'member' then
    if public.has_perm('personas.editar') is not true then raise exception 'Solo el pastor o la secretaría anotan miembros nuevos'; end if;
    if c.status = 'inactive' then raise exception 'Esta persona está en Inactivos. Primero volvela a activa desde su ficha.'; end if;
  end if;
  if p_kind = 'rededicated' then
    insert into public.decisions (church_id, contact_id, kind, on_date, note, created_by) values (c.church_id, c.id, p_kind, v_on, v_note, auth.uid()) returning id into v_id;
  else
    insert into public.decisions (church_id, contact_id, kind, on_date, note, created_by) values (c.church_id, c.id, p_kind, v_on, v_note, auth.uid())
    on conflict (contact_id, kind) where kind <> 'rededicated' do update set on_date = excluded.on_date, note = coalesce(excluded.note, decisions.note), created_by = excluded.created_by
    returning id into v_id;
  end if;
  if p_kind = 'saved' then
    update public.contacts set saved_on = v_on where id = c.id;
  elsif p_kind = 'baptized' then
    -- Lo mismo que anota la función de bautismos: con esto aparece el certificado y le llega el aviso.
    update public.contacts set baptized = true, baptized_here = true, baptized_on = v_on where id = c.id;
  elsif p_kind = 'member' then
    update public.contacts set status = 'member', member_since = v_on where id = c.id;
  end if;
  return jsonb_build_object('id', v_id,
    'in_discipleship', exists (select 1 from public.disciple_tracks d where d.contact_id = c.id and d.active),
    'has_followup', c.follow_up_user_id is not null,
    'in_member_class', exists (select 1 from public.member_class m where m.contact_id = c.id),
    'is_member', c.status = 'member' or p_kind = 'member',
    'baptized', c.baptized or c.baptized_on is not null or p_kind = 'baptized');
end $$;

-- Las últimas decisiones anotadas (con el nombre de cada persona).
create or replace function public.personas_decisions_recent() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'contact_id', x.contact_id, 'name', x.name, 'kind', x.kind, 'on_date', x.on_date, 'note', x.note,
           'mine', coalesce(x.created_by = auth.uid(), false)) order by x.on_date desc, x.created_at desc), '[]'::jsonb)
  from (select d.*, c.name from public.decisions d join public.contacts c on c.id = d.contact_id
        where d.church_id = public.current_church_id() and (coalesce(public.is_captain_or_admin(), false) or d.created_by = auth.uid())
        order by d.on_date desc, d.created_at desc limit 60) x
$$;

-- ---------- Regalo de bienvenida y visita ----------

create or replace function public.personas_care_mark(p_contact uuid, p_what text, p_on date default null, p_undo boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts; v_on date := public.personas_day(p_on); r public.visitor_care; v_who text;
        v_lead boolean := coalesce(public.is_captain_or_admin(), false);
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id() and not archived;
  if c.id is null or not (v_lead or coalesce(public.can_see_contact(c), false)) then raise exception 'No tenés permiso para anotar esto'; end if;
  if p_what is null or p_what not in ('gift', 'visit') then raise exception 'No se entiende qué querés anotar'; end if;
  select * into r from public.visitor_care where contact_id = c.id;
  if coalesce(p_undo, false) then
    if p_what = 'gift' and r.gift_on is not null then
      if r.gift_by is distinct from auth.uid() and not v_lead then raise exception 'Solo quien lo anotó o un líder lo puede sacar'; end if;
      update public.visitor_care set gift_on = null, gift_by = null, updated_at = now() where contact_id = c.id;
    elsif p_what = 'visit' and r.visit_on is not null then
      if r.visit_by is distinct from auth.uid() and not v_lead then raise exception 'Solo quien lo anotó o un líder lo puede sacar'; end if;
      update public.visitor_care set visit_on = null, visit_by = null, updated_at = now() where contact_id = c.id;
    end if;
    return;
  end if;
  -- Solo se anota si todavía no lo tenía: así, aunque dos lo toquen a la vez, nadie recibe dos.
  if p_what = 'gift' then
    insert into public.visitor_care (contact_id, church_id, gift_on, gift_by) values (c.id, c.church_id, v_on, auth.uid())
    on conflict (contact_id) do update set gift_on = excluded.gift_on, gift_by = excluded.gift_by, updated_at = now() where visitor_care.gift_on is null;
    if not found then
      select display_name into v_who from public.profiles where id = r.gift_by;
      raise exception 'Ya recibió el regalo el % (lo anotó %)', to_char(r.gift_on, 'DD/MM'), coalesce(v_who, 'otro hermano');
    end if;
  else
    insert into public.visitor_care (contact_id, church_id, visit_on, visit_by) values (c.id, c.church_id, v_on, auth.uid())
    on conflict (contact_id) do update set visit_on = excluded.visit_on, visit_by = excluded.visit_by, updated_at = now() where visitor_care.visit_on is null;
    if not found then
      select display_name into v_who from public.profiles where id = r.visit_by;
      raise exception 'Ya lo visitaron el % (lo anotó %)', to_char(r.visit_on, 'DD/MM'), coalesce(v_who, 'otro hermano');
    end if;
    -- También queda en el historial de visitas de la ficha.
    insert into public.contact_visits (contact_id, church_id, user_id, note, visited_at)
    values (c.id, c.church_id, auth.uid(), 'Visita de bienvenida', case when v_on = public.personas_day(null) then now() else v_on::timestamp + interval '15 hours' end);
  end if;
end $$;

-- Las visitas (personas con estado "visita") con su regalo y su visita. Los líderes ven a todas.
create or replace function public.personas_care_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.since desc, x.name), '[]'::jsonb) from (
    select c.id, c.name, c.photo_path, c.phone, coalesce(f.first_on, c.created_at::date) as since, f.first_on,
           k.gift_on, (select display_name from public.profiles where id = k.gift_by) as gift_by,
           coalesce(k.visit_on, h.d) as visit_on,
           (select display_name from public.profiles where id = coalesce(k.visit_by, h.user_id)) as visit_by
    from public.contacts c
    left join public.visitor_care k on k.contact_id = c.id
    left join lateral (select min(a.attended_on) as first_on from public.attendances a where a.contact_id = c.id) f on true
    left join lateral (select v.visited_at::date as d, v.user_id from public.contact_visits v
                       where v.contact_id = c.id and k.visit_on is null and v.visited_at::date >= coalesce(f.first_on, (c.created_at + interval '1 day')::date)
                       order by v.visited_at desc limit 1) h on true
    where c.church_id = public.current_church_id() and c.status = 'visitor' and not c.archived
      and (coalesce(public.is_captain_or_admin(), false) or coalesce(public.can_see_contact(c), false))
    order by coalesce(f.first_on, c.created_at::date) desc limit 300) x
$$;

-- ---------- Clase de miembros ----------

-- Empieza la clase (sin lección) o tilda / destilda una lección.
create or replace function public.personas_mclass_set(p_contact uuid, p_lesson integer default null, p_done boolean default true, p_on date default null) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts; v_on date := public.personas_day(p_on); v_n int;
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id() and not archived;
  if c.id is null or not public.personas_can(c) then raise exception 'No tenés permiso para anotar la clase de esta persona'; end if;
  -- Si la iglesia todavía no escribió sus lecciones, valen las 4 de siempre (las mismas que muestra la app).
  v_n := coalesce((select array_length(member_lessons, 1) from public.people_settings where church_id = c.church_id), 4);
  if p_lesson is not null and (p_lesson < 1 or p_lesson > v_n) then raise exception 'Esa lección no existe en la clase'; end if;
  insert into public.member_class (contact_id, church_id, started_on, updated_by) values (c.id, c.church_id, v_on, auth.uid())
  on conflict (contact_id) do nothing;
  if p_lesson is not null then
    update public.member_class set done = case when coalesce(p_done, true) then done || jsonb_build_object(p_lesson::text, to_char(v_on, 'YYYY-MM-DD')) else done - p_lesson::text end,
           updated_at = now(), updated_by = auth.uid() where contact_id = c.id;
  end if;
end $$;

-- El paso final (por ejemplo "Recibido como miembro"): lo marca el pastor o la secretaría.
create or replace function public.personas_mclass_final(p_contact uuid, p_on date default null, p_undo boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts; v_on date := public.personas_day(p_on);
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id() and not archived;
  if c.id is null or public.has_perm('personas.editar') is not true then raise exception 'Este paso lo marca el pastor o la secretaría'; end if;
  insert into public.member_class (contact_id, church_id, started_on, updated_by) values (c.id, c.church_id, v_on, auth.uid())
  on conflict (contact_id) do nothing;
  update public.member_class set final_on = case when coalesce(p_undo, false) then null else v_on end,
         final_by = case when coalesce(p_undo, false) then null else auth.uid() end, updated_at = now(), updated_by = auth.uid()
   where contact_id = c.id;
end $$;

create or replace function public.personas_mclass_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'photo_path', c.photo_path, 'phone', c.phone, 'status', c.status,
           'started_on', m.started_on, 'done', m.done, 'final_on', m.final_on) order by (m.final_on is not null), c.name), '[]'::jsonb)
  from public.member_class m join public.contacts c on c.id = m.contact_id
  where m.church_id = public.current_church_id() and not c.archived
    and (coalesce(public.is_captain_or_admin(), false) or coalesce(c.follow_up_user_id = auth.uid(), false))
$$;

-- ---------- La ficha de una persona: todo lo de estas funciones en una sola consulta ----------
-- Las decisiones (con sus notas) solo las ve quien puede anotar cosas de esa persona.

create or replace function public.personas_person(p_contact uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.contacts; v_can boolean;
begin
  select * into c from public.contacts where id = p_contact and church_id = public.current_church_id();
  if c.id is null or not (public.personas_can(c, true) or coalesce(public.can_see_contact(c), false)) then return null; end if;
  v_can := public.personas_can(c);
  return jsonb_build_object(
    'can', v_can, 'can_lesson', public.personas_can(c, true), 'staff', coalesce(public.has_perm('personas.editar'), false),
    'total', public.followup_num(c.church_id, 'disc_one_classes', 4, 0, 20),
    'lessons', coalesce(c.discipleship -> 'one', '{}'::jsonb),
    'track', (select jsonb_build_object('teacher_id', t.id, 'teacher_name', t.name, 'started_on', d.started_on, 'finished_on', d.finished_on, 'active', d.active,
                'last_met', greatest(d.last_met_on, (select max(e.value::date) from jsonb_each_text(coalesce(c.discipleship -> 'one', '{}'::jsonb)) e where e.value ~ '^\d{4}-\d{2}-\d{2}$')))
              from public.disciple_tracks d left join public.contacts t on t.id = d.teacher_contact_id where d.contact_id = c.id),
    'mclass', (select jsonb_build_object('started_on', m.started_on, 'done', m.done, 'final_on', m.final_on) from public.member_class m where m.contact_id = c.id),
    'care', (select jsonb_build_object('gift_on', k.gift_on, 'gift_by', (select display_name from public.profiles where id = k.gift_by),
                'visit_on', k.visit_on, 'visit_by', (select display_name from public.profiles where id = k.visit_by))
             from public.visitor_care k where k.contact_id = c.id),
    'decisions', case when v_can then coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'on_date', d.on_date, 'note', d.note) order by d.on_date desc, d.created_at desc)
                           from public.decisions d where d.contact_id = c.id), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- ---------- Certificados para imprimir (bautismo y membresía) ----------

create or replace function public.personas_certificate(p_contact uuid, p_kind text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.name, 'on_date', x.d, 'church', ch.name, 'city', ch.city, 'pastor', coalesce(ch.certificate_pastor, 'Pastor'), 'logo', ch.logo_path,
           'number', (case p_kind when 'bautismo' then 'B-' else 'M-' end) || to_char(x.d, 'YYYY') || '-' || upper(substr(replace(c.id::text, '-', ''), 1, 6)))
  from public.contacts c join public.churches ch on ch.id = c.church_id
  cross join lateral (select case p_kind when 'bautismo' then c.baptized_on when 'miembro' then c.member_since end as d) x
  where c.id = p_contact and c.church_id = public.current_church_id() and not c.archived and x.d is not null
    and (c.profile_id = auth.uid() or public.is_staff())
    and ((p_kind = 'bautismo' and c.baptized_here) or (p_kind = 'miembro' and c.status = 'member'))
$$;

revoke all on function public.personas_can(public.contacts, boolean), public.personas_day(date), public.personas_save_settings(text, text[], text[], text),
  public.personas_disc_start(uuid, uuid, date), public.personas_disc_teacher(uuid, uuid), public.personas_disc_lesson(uuid, integer, date, boolean),
  public.personas_disc_active(uuid, boolean), public.personas_disc_list(), public.personas_decision(uuid, text, date, text), public.personas_decisions_recent(),
  public.personas_care_mark(uuid, text, date, boolean), public.personas_care_list(), public.personas_mclass_set(uuid, integer, boolean, date),
  public.personas_mclass_final(uuid, date, boolean), public.personas_mclass_list(), public.personas_person(uuid), public.personas_certificate(uuid, text) from public, anon;
grant execute on function public.personas_can(public.contacts, boolean), public.personas_day(date), public.personas_save_settings(text, text[], text[], text),
  public.personas_disc_start(uuid, uuid, date), public.personas_disc_teacher(uuid, uuid), public.personas_disc_lesson(uuid, integer, date, boolean),
  public.personas_disc_active(uuid, boolean), public.personas_disc_list(), public.personas_decision(uuid, text, date, text), public.personas_decisions_recent(),
  public.personas_care_mark(uuid, text, date, boolean), public.personas_care_list(), public.personas_mclass_set(uuid, integer, boolean, date),
  public.personas_mclass_final(uuid, date, boolean), public.personas_mclass_list(), public.personas_person(uuid), public.personas_certificate(uuid, text) to authenticated;

-- =====================================================================================================
-- PARTE 3 (personas_3_tarjeta_de_visita): la tarjeta de visita por QR, sin cuenta
-- =====================================================================================================

-- El código del QR de la puerta. Lo ven los líderes; lo cambia el pastor o la secretaría (el QR viejo deja de servir).
create or replace function public.personas_visit_link(p_rotate boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v text;
begin
  if v_church is null or public.is_captain_or_admin() is not true then raise exception 'Solo los líderes ven el código de la puerta'; end if;
  select token into v from public.visit_card_links where church_id = v_church;
  if v is not null and not coalesce(p_rotate, false) then return v; end if;
  if v is not null and public.has_perm('personas.editar') is not true then raise exception 'Solo el pastor o la secretaría pueden cambiar el código'; end if;
  v := substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
  insert into public.visit_card_links (church_id, token, created_by) values (v_church, v, auth.uid())
  on conflict (church_id) do update set token = excluded.token, created_at = now(), created_by = auth.uid();
  return v;
end $$;

-- Lo que ve la visita al abrir el QR (sin cuenta): solo el nombre de la iglesia y su logo.
create or replace function public.visit_card_public(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('church', ch.name, 'city', ch.city, 'logo', case when ch.logo_path ~ '^https?:' then ch.logo_path end)
  from public.visit_card_links l join public.churches ch on ch.id = l.church_id
  where l.token = p_token and length(p_token) between 16 and 40
$$;

-- La visita manda su tarjeta (sin cuenta). Crea a la persona como "visita" y avisa para el seguimiento.
create or replace function public.visit_card_submit(p_token text, p_name text, p_phone text, p_heard text default null, p_prayer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_church_name text;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text; v_heard text := nullif(btrim(coalesce(p_heard, '')), ''); v_prayer text := nullif(btrim(coalesce(p_prayer, '')), '');
  c public.contacts; v_admin uuid; v_owner uuid; v_new boolean := false; u uuid; v_note text;
begin
  select l.church_id, ch.name into v_church, v_church_name from public.visit_card_links l join public.churches ch on ch.id = l.church_id
   where l.token = p_token and length(p_token) between 16 and 40;
  if v_church is null then raise exception 'Este código ya no sirve. Pedí ayuda en la entrada.'; end if;
  -- Con una cuenta de otra iglesia abierta, la persona quedaría anotada en la iglesia equivocada.
  if auth.uid() is not null and public.current_church_id() is distinct from v_church then
    raise exception 'Estás con una cuenta de otra iglesia. Abrí este enlace en el navegador, sin entrar a la app.';
  end if;
  -- Controles de largo y de forma.
  if length(v_name) < 3 or length(v_name) > 80 or v_name !~ '[[:alpha:]]{2}' or v_name ~* '(https?:|www\.|[<>@])' then raise exception 'Escribí tu nombre y apellido'; end if;
  if length(coalesce(p_phone, '')) > 30 or length(v_digits) < 8 or length(v_digits) > 15 then raise exception 'Escribí tu celular con el código de área'; end if;
  if length(v_heard) > 80 then raise exception 'Contanos más corto cómo nos conociste'; end if;
  if length(v_prayer) > 500 then raise exception 'El pedido de oración es muy largo (hasta 500 letras)'; end if;
  v_phone := case when btrim(p_phone) ~ '^\+?[0-9][0-9 ()-]{6,28}$' then btrim(p_phone) else v_digits end;
  -- El mismo celular en las últimas 12 horas: ya está anotado, no se repite.
  if exists (select 1 from public.visit_cards where church_id = v_church and created_at > now() - interval '12 hours'
               and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = right(v_digits, 8)) then
    return jsonb_build_object('ok', true, 'church', v_church_name);
  end if;
  -- Freno a los abusos: hasta 40 tarjetas por hora y 300 por día con el mismo código.
  if (select count(*) from public.visit_cards where church_id = v_church and created_at > now() - interval '1 hour') >= 40
     or (select count(*) from public.visit_cards where church_id = v_church and created_at > now() - interval '1 day') >= 300 then
    raise exception 'Hay muchas tarjetas ahora. Avisá en la entrada, por favor.';
  end if;
  select p.id into v_admin from public.profiles p where p.church_id = v_church and p.role::text = 'admin' and p.disabled_at is null order by p.created_at limit 1;
  -- ¿Ya estaba cargada con ese celular? Entonces no se duplica.
  select * into c from public.contacts where church_id = v_church and not archived and merged_into is null
     and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = right(v_digits, 8)
   order by (status = 'member') desc, created_at limit 1;
  v_note := 'Llenó la tarjeta de visita.' || coalesce(' Nos conoció por: ' || v_heard || '.', '');
  if c.id is null then
    v_owner := coalesce(auth.uid(), v_admin, (select s from public.staff_ids(v_church) s limit 1),
                        (select p.id from public.profiles p where p.church_id = v_church and p.disabled_at is null order by p.created_at limit 1));
    if v_owner is null then raise exception 'La iglesia todavía no puede recibir tarjetas. Avisá en la entrada.'; end if;
    insert into public.contacts (church_id, created_by, name, phone, status, interest, follow_note)
    values (v_church, v_owner, v_name, v_phone, 'visitor', 'very', v_note) returning * into c;
    v_new := true;
    -- El mismo paso de seguimiento que cuando se le toma asistencia por primera vez: escribirle.
    insert into public.follow_up_tasks (church_id, contact_id, assigned_to, kind, due_at)
    values (v_church, c.id, v_admin, 'call', now() + make_interval(hours => public.followup_num(v_church, 'write_hours', 48, 1, 336)))
    on conflict (contact_id, kind) do nothing;
  else
    update public.contacts set follow_note = coalesce(follow_note, v_note), status = case when status = 'contact' then 'visitor' else status end where id = c.id;
  end if;
  insert into public.visit_cards (church_id, contact_id, name, phone, heard, prayer, is_new) values (v_church, c.id, v_name, v_phone, v_heard, v_prayer, v_new);
  for u in select s from public.staff_ids(v_church) s loop
    perform public.notify(u, 'followup', case when v_new then 'Visita nueva: ' else 'Tarjeta de visita: ' end || v_name,
      'Llenó la tarjeta de visita en la puerta.' || case when v_prayer is not null then ' Dejó un pedido de oración.' else '' end, '/tarjeta-visita');
  end loop;
  return jsonb_build_object('ok', true, 'church', v_church_name);
end $$;

revoke all on function public.personas_visit_link(boolean), public.visit_card_public(text), public.visit_card_submit(text, text, text, text, text) from public, anon;
grant execute on function public.personas_visit_link(boolean) to authenticated;
grant execute on function public.visit_card_public(text), public.visit_card_submit(text, text, text, text, text) to anon, authenticated;
