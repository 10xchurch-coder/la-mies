-- 0076: eventos con chip y puerta en vivo.
--   1. Puerta: salida (para saber cuántos hay adentro ahora), nombre de la entrada y contador en vivo.
--   2. Asistencia a cada momento del programa (talleres, sesiones) con la misma credencial.
--   3. Turnos de voluntarios del evento, con recordatorio antes de empezar.
--   4. Chips de las personas: cada uno apoya su chip el domingo y queda presente.
--   5. Chicos: etiqueta del chico y etiqueta del adulto que tienen que coincidir para retirarlo.
--   6. Enlace de pago por tipo de entrada (sin procesador de pagos: la iglesia pega su enlace).

-- ---------------------------------------------------------------------------
-- 1. La puerta
-- ---------------------------------------------------------------------------
alter table public.event_registrations
  add column if not exists checked_out_at timestamptz,          -- salió (si vuelve a entrar se borra)
  add column if not exists entrance text check (entrance is null or length(entrance) <= 40),   -- por qué entrada pasó ("Puerta principal", "Estacionamiento"…)
  add column if not exists chip_at timestamptz;                 -- cuándo se le grabó el chip de la credencial
create index if not exists event_registrations_inside_idx on public.event_registrations (event_id, occurs_on) where checked_in_at is not null and checked_out_at is null;

-- En el equipo del evento ahora hay dos clases: organizadores (pueden cambiar el evento) y voluntarios (solo sirven en un turno).
alter table public.event_team add column if not exists kind text not null default 'organizer' check (kind in ('organizer', 'volunteer'));

create or replace function public.can_plan_event(p_event uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.church_id = public.current_church_id())
     and (public.has_perm('cal.editar') or exists (select 1 from public.event_team t where t.event_id = p_event and t.profile_id = auth.uid() and t.kind = 'organizer'))
$$;

-- Quien se inscribe no se puede marcar como que entró ni como que pagó.
-- Arreglo: antes esta regla también frenaba a los que atienden la puerta y a los organizadores del evento
-- cuando no manejaban el calendario (la entrada o el pago no quedaban guardados). Ahora los deja pasar.
create or replace function public.event_reg_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.has_perm('cal.editar') then return new; end if;
  -- Las funciones de la puerta avisan con esta marca (dura solo esa operación y no se puede poner desde la app).
  if coalesce(current_setting('lamies.puerta', true), '') = '1' then return new; end if;
  if public.can_plan_event(case when tg_op = 'INSERT' then new.event_id else old.event_id end) then return new; end if;
  if tg_op = 'INSERT' then
    new.paid_amount := 0; new.paid_note := null; new.checked_in_at := null; new.checked_in_by := null; new.walk_in := false;
    new.checked_out_at := null; new.entrance := null; new.chip_at := null;
  else
    new.paid_amount := old.paid_amount; new.paid_note := old.paid_note;
    new.checked_in_at := old.checked_in_at; new.checked_in_by := old.checked_in_by; new.walk_in := old.walk_in;
    new.ticket_code := old.ticket_code; new.access_token := old.access_token;
    new.checked_out_at := old.checked_out_at; new.entrance := old.entrance; new.chip_at := old.chip_at;
  end if;
  return new;
end $$;
revoke all on function public.event_reg_guard() from public, anon, authenticated;

-- Las dos funciones de la puerta que ya existían: iguales, pero ahora avisan que son de la puerta.
create or replace function public.event_door_register(p_event uuid, p_on date, p_name text, p_phone text default null, p_people integer default 1)
returns table (id uuid, name text, ticket_code text, already boolean)
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''); v_row public.event_registrations;
begin
  if not (public.can_door() or public.can_plan_event(p_event)) then raise exception 'No tenés permiso para anotar en la puerta'; end if;
  if not exists (select 1 from public.events e where e.id = p_event and e.church_id = v_church) then raise exception 'Ese evento no es de tu iglesia'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Escribí el nombre'; end if;
  if p_people is null or p_people < 1 or p_people > 50 then raise exception 'Cantidad de personas no válida'; end if;
  perform set_config('lamies.puerta', '1', true);
  if v_phone is not null and length(v_phone) >= 6 then
    select * into v_row from public.event_registrations r
      where r.event_id = p_event and r.occurs_on = p_on and r.church_id = v_church
        and right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8) limit 1;
    if found then
      update public.event_registrations set checked_in_at = coalesce(checked_in_at, now()), checked_in_by = coalesce(checked_in_by, auth.uid())
        where event_registrations.id = v_row.id and checked_in_at is null;
      return query select v_row.id, v_row.name, v_row.ticket_code, v_row.checked_in_at is not null;
      return;
    end if;
  end if;
  insert into public.event_registrations (event_id, occurs_on, church_id, user_id, name, phone, people, walk_in, checked_in_at, checked_in_by)
    values (p_event, p_on, v_church, null, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), p_people, true, now(), auth.uid())
    returning * into v_row;
  return query select v_row.id, v_row.name, v_row.ticket_code, false;
end $$;

create or replace function public.event_check_in(p_code text default null, p_reg uuid default null)
returns table (id uuid, name text, people integer, event_title text, occurs_on date, already boolean)
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_row public.event_registrations; v_was timestamptz; v_title text;
begin
  if p_reg is not null then
    select * into v_row from public.event_registrations r where r.id = p_reg and r.church_id = v_church;
  else
    select * into v_row from public.event_registrations r where r.ticket_code = upper(btrim(coalesce(p_code, ''))) and r.church_id = v_church;
  end if;
  if not (public.can_door() or (v_row.id is not null and public.can_plan_event(v_row.event_id))) then raise exception 'No tenés permiso para marcar entradas'; end if;
  if v_row.id is null then raise exception 'No encontré esa entrada en tu iglesia'; end if;
  perform set_config('lamies.puerta', '1', true);
  v_was := v_row.checked_in_at;
  if v_was is null then
    update public.event_registrations r set checked_in_at = now(), checked_in_by = auth.uid() where r.id = v_row.id;
  end if;
  select e.title into v_title from public.events e where e.id = v_row.event_id;
  return query select v_row.id, v_row.name, v_row.people, v_title, v_row.occurs_on, v_was is not null;
end $$;

-- Leer una credencial en la puerta (QR, chip o código: los tres llevan el mismo código de la entrada).
-- p_out = false: entra. p_out = true: sale. Si salió y vuelve, entra de nuevo.
-- Devuelve result: 'in' entró · 'back' volvió a entrar · 'already' ya estaba adentro · 'out' salió · 'already_out' ya había salido · 'not_in' nunca entró.
create or replace function public.event_door_scan(p_code text default null, p_reg uuid default null, p_entrance text default null, p_out boolean default false)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); r public.event_registrations; v_result text;
        v_ent text := nullif(btrim(left(coalesce(p_entrance, ''), 40)), '');
begin
  if p_reg is not null then
    select * into r from public.event_registrations x where x.id = p_reg and x.church_id = v_church for update;
  else
    select * into r from public.event_registrations x where x.ticket_code = upper(btrim(coalesce(p_code, ''))) and x.church_id = v_church for update;
  end if;
  if not (public.can_door() or (r.id is not null and public.can_plan_event(r.event_id))) then raise exception 'No tenés permiso para la puerta'; end if;
  if r.id is null then raise exception 'No encontré esa entrada en tu iglesia'; end if;
  perform set_config('lamies.puerta', '1', true);
  if coalesce(p_out, false) then
    if r.checked_in_at is null then v_result := 'not_in';
    elsif r.checked_out_at is not null then v_result := 'already_out';
    else
      update public.event_registrations x set checked_out_at = now() where x.id = r.id;
      v_result := 'out';
    end if;
  elsif r.checked_in_at is null then
    update public.event_registrations x set checked_in_at = now(), checked_in_by = auth.uid(), checked_out_at = null, entrance = v_ent where x.id = r.id;
    v_result := 'in';
  elsif r.checked_out_at is not null then
    update public.event_registrations x set checked_out_at = null, entrance = coalesce(v_ent, x.entrance) where x.id = r.id;
    v_result := 'back';
  else
    v_result := 'already';
  end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'people', r.people, 'event_id', r.event_id,
    'event_title', (select e.title from public.events e where e.id = r.event_id), 'occurs_on', r.occurs_on, 'result', v_result);
end $$;

-- Anotar en la puerta a alguien nuevo, guardando por qué entrada pasó.
create or replace function public.event_door_walkin(p_event uuid, p_on date, p_name text, p_phone text default null, p_people integer default 1, p_entrance text default null)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v record; v_ent text := nullif(btrim(left(coalesce(p_entrance, ''), 40)), '');
begin
  select d.id, d.name, d.ticket_code, d.already into v from public.event_door_register(p_event, p_on, p_name, p_phone, p_people) d;
  perform set_config('lamies.puerta', '1', true);
  update public.event_registrations x set entrance = coalesce(x.entrance, v_ent), checked_out_at = null where x.id = v.id;
  return jsonb_build_object('id', v.id, 'name', v.name, 'ticket_code', v.ticket_code, 'already', v.already);
end $$;

-- Contador en vivo: cuántos hay adentro ahora, cuántos entraron en total y por cada entrada. Cuenta personas, no inscripciones.
create or replace function public.event_door_live(p_event uuid, p_on date) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not (public.can_door() or public.can_plan_event(p_event)) then null else (
    select jsonb_build_object(
      'registered', coalesce(sum(r.people), 0),
      'checked_in', coalesce(sum(r.people) filter (where r.checked_in_at is not null), 0),
      'inside', coalesce(sum(r.people) filter (where r.checked_in_at is not null and r.checked_out_at is null), 0),
      'gone', coalesce(sum(r.people) filter (where r.checked_in_at is not null and r.checked_out_at is not null), 0),
      'capacity', (select e.reg_capacity from public.events e where e.id = p_event),
      'by_entrance', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'checked_in', g.n, 'inside', g.i) order by g.n desc, g.name)
        from (select coalesce(x.entrance, '') as name, sum(x.people) as n, coalesce(sum(x.people) filter (where x.checked_out_at is null), 0) as i
              from public.event_registrations x
              where x.event_id = p_event and x.occurs_on = p_on and x.church_id = public.current_church_id() and x.checked_in_at is not null
              group by 1) g), '[]'::jsonb),
      'at', now())
    from public.event_registrations r
    where r.event_id = p_event and r.occurs_on = p_on and r.church_id = public.current_church_id()) end
$$;

-- Anotar que a esta inscripción ya se le grabó el chip (para no grabar dos veces la misma).
create or replace function public.event_mark_chip(p_reg uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_registrations where id = p_reg and church_id = public.current_church_id();
  if v_event is null or not public.can_plan_event(v_event) then raise exception 'No tenés permiso'; end if;
  update public.event_registrations set chip_at = now() where id = p_reg;
end $$;

-- La lista de inscriptos, que ahora también dice si salió y si ya tiene el chip grabado.
-- Es una función nueva (la anterior queda igual para las versiones viejas de la app).
create or replace function public.event_plan_registrations_v2(p_event uuid, p_q text default null, p_offset integer default 0, p_limit integer default 50)
returns table (id uuid, name text, phone text, email text, people integer, ticket_code text, type_name text, price numeric, paid_amount numeric, checked_in_at timestamptz, source text, walk_in boolean, created_at timestamptz,
               checked_out_at timestamptz, entrance text, chip_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select r.id, r.name, r.phone, r.email, r.people, r.ticket_code, t.name, r.people * coalesce(t.price, e.reg_price, 0), r.paid_amount, r.checked_in_at, r.source, r.walk_in, r.created_at,
         r.checked_out_at, r.entrance, r.chip_at
  from public.event_registrations r
  join public.events e on e.id = r.event_id
  left join public.event_ticket_types t on t.id = r.ticket_type_id
  where r.event_id = p_event and public.can_plan_event(p_event)
    and (coalesce(btrim(p_q), '') = ''
      or r.name ilike '%' || btrim(p_q) || '%'
      or (regexp_replace(p_q, '\D', '', 'g') <> '' and r.phone like '%' || regexp_replace(p_q, '\D', '', 'g') || '%')
      or r.ticket_code ilike btrim(p_q) || '%')
  order by r.created_at desc
  offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

revoke all on function public.event_door_scan(text, uuid, text, boolean), public.event_door_walkin(uuid, date, text, text, integer, text), public.event_door_live(uuid, date),
  public.event_mark_chip(uuid), public.event_plan_registrations_v2(uuid, text, integer, integer) from public, anon;
grant execute on function public.event_door_scan(text, uuid, text, boolean), public.event_door_walkin(uuid, date, text, text, integer, text), public.event_door_live(uuid, date),
  public.event_mark_chip(uuid), public.event_plan_registrations_v2(uuid, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Quién estuvo en cada momento del programa
-- ---------------------------------------------------------------------------
create table if not exists public.event_session_attendance (
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  scanned_by uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (session_id, registration_id)
);
create index if not exists event_session_attendance_event_idx on public.event_session_attendance (event_id);
create index if not exists event_session_attendance_reg_idx on public.event_session_attendance (registration_id);
alter table public.event_session_attendance enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_session_attendance' and policyname = 'event_session_attendance_select') then
    create policy event_session_attendance_select on public.event_session_attendance for select to authenticated
      using (church_id = public.current_church_id() and (public.can_door() or public.can_plan_event(event_id)));
  end if;
end $$;
-- Solo se escribe con las funciones de abajo.
revoke all on table public.event_session_attendance from anon, public, authenticated;
grant select on table public.event_session_attendance to authenticated;

-- Leer una credencial en un taller o sesión. result: 'ok' quedó anotado · 'already' ya estaba anotado.
create or replace function public.event_session_scan(p_session uuid, p_code text default null, p_reg uuid default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); s public.event_sessions; r public.event_registrations; v_new boolean;
begin
  select * into s from public.event_sessions x where x.id = p_session and x.church_id = v_church;
  if s.id is null then raise exception 'No encontré ese momento del programa'; end if;
  if not (public.can_door() or public.can_plan_event(s.event_id)) then raise exception 'No tenés permiso para anotar'; end if;
  if p_reg is not null then
    select * into r from public.event_registrations x where x.id = p_reg and x.church_id = v_church;
  else
    select * into r from public.event_registrations x where x.ticket_code = upper(btrim(coalesce(p_code, ''))) and x.church_id = v_church;
  end if;
  if r.id is null then raise exception 'No encontré esa entrada en tu iglesia'; end if;
  if r.event_id <> s.event_id then raise exception 'Esa entrada es de otro evento'; end if;
  insert into public.event_session_attendance (session_id, registration_id, event_id, church_id) values (s.id, r.id, s.event_id, v_church)
    on conflict (session_id, registration_id) do nothing;
  v_new := found;
  return jsonb_build_object('id', r.id, 'name', r.name, 'people', r.people, 'session_title', s.title, 'result', case when v_new then 'ok' else 'already' end);
end $$;

-- Cuántos fueron a cada momento del programa.
create or replace function public.event_session_counts(p_event uuid)
returns table (session_id uuid, registrations integer, people integer)
language sql stable security definer set search_path to 'public' as $$
  select a.session_id, count(*)::int, coalesce(sum(r.people), 0)::int
  from public.event_session_attendance a join public.event_registrations r on r.id = a.registration_id
  where a.event_id = p_event and a.church_id = public.current_church_id() and (public.can_door() or public.can_plan_event(p_event))
  group by a.session_id
$$;

-- Los que fueron a un momento (los últimos primero).
create or replace function public.event_session_people(p_session uuid)
returns table (registration_id uuid, name text, people integer, scanned_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select a.registration_id, r.name, r.people, a.scanned_at
  from public.event_session_attendance a join public.event_registrations r on r.id = a.registration_id
  where a.session_id = p_session and a.church_id = public.current_church_id() and (public.can_door() or public.can_plan_event(a.event_id))
  order by a.scanned_at desc limit 300
$$;

revoke all on function public.event_session_scan(uuid, text, uuid), public.event_session_counts(uuid), public.event_session_people(uuid) from public, anon;
grant execute on function public.event_session_scan(uuid, text, uuid), public.event_session_counts(uuid), public.event_session_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Turnos de voluntarios del evento
-- ---------------------------------------------------------------------------
create table if not exists public.event_shifts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  place text not null check (length(btrim(place)) between 1 and 80),     -- dónde sirve: puerta, estacionamiento, cocina…
  starts_at timestamptz not null,
  ends_at timestamptz,
  note text check (length(note) <= 300),
  reminded_at timestamptz,                                              -- cuándo se le mandó el recordatorio
  cancelled_at timestamptz,                                             -- el turno se quitó (no se borra: queda guardado)
  created_at timestamptz not null default now(),
  foreign key (event_id, profile_id) references public.event_team(event_id, profile_id) on delete cascade
);
create index if not exists event_shifts_event_idx on public.event_shifts (event_id, starts_at);
create index if not exists event_shifts_profile_idx on public.event_shifts (profile_id, starts_at);
create index if not exists event_shifts_remind_idx on public.event_shifts (starts_at) where reminded_at is null and cancelled_at is null;
alter table public.event_shifts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_shifts' and policyname = 'event_shifts_select') then
    create policy event_shifts_select on public.event_shifts for select to authenticated using (church_id = public.current_church_id());
  end if;
end $$;
-- Solo se escribe con las funciones de abajo.
revoke all on table public.event_shifts from anon, public, authenticated;
grant select on table public.event_shifts to authenticated;

-- Guardar un turno (nuevo o cambiado). Si la persona no estaba en el equipo, entra como voluntario. Le llega un aviso.
create or replace function public.event_shift_save(p_event uuid, p_profile uuid, p_place text, p_starts timestamptz, p_ends timestamptz default null, p_note text default null, p_id uuid default null)
returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_id uuid; v_title text; v_tz text; v_place text := btrim(left(coalesce(p_place, ''), 80));
begin
  if not public.can_plan_event(p_event) then raise exception 'No tenés permiso'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile and p.church_id = v_church and p.disabled_at is null) then raise exception 'Esa persona no es de tu iglesia'; end if;
  if v_place = '' then raise exception 'Escribí dónde sirve'; end if;
  if p_starts is null then raise exception 'Escribí a qué hora empieza'; end if;
  if p_ends is not null and p_ends <= p_starts then raise exception 'La hora de fin tiene que ser después del inicio'; end if;
  insert into public.event_team (event_id, profile_id, church_id, role, kind) values (p_event, p_profile, v_church, null, 'volunteer')
    on conflict (event_id, profile_id) do nothing;
  if p_id is null then
    insert into public.event_shifts (church_id, event_id, profile_id, place, starts_at, ends_at, note)
      values (v_church, p_event, p_profile, v_place, p_starts, p_ends, nullif(btrim(left(coalesce(p_note, ''), 300)), ''))
      returning id into v_id;
  else
    update public.event_shifts s set profile_id = p_profile, place = v_place, starts_at = p_starts, ends_at = p_ends,
        note = nullif(btrim(left(coalesce(p_note, ''), 300)), ''),
        reminded_at = case when s.starts_at = p_starts and s.profile_id = p_profile then s.reminded_at else null end
      where s.id = p_id and s.event_id = p_event and s.cancelled_at is null
      returning s.id into v_id;
    if v_id is null then raise exception 'No encontré ese turno'; end if;
  end if;
  select e.title into v_title from public.events e where e.id = p_event;
  select coalesce(c.timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches c where c.id = v_church;
  if p_profile <> auth.uid() then
    perform public.notify(p_profile, 'link', 'Tenés un turno para servir',
      v_place || ' · ' || to_char(p_starts at time zone v_tz, 'DD/MM HH24:MI') || ' · ' || coalesce(v_title, 'Evento'), '/evento/' || p_event::text);
  end if;
  return v_id;
end $$;

-- Quitar un turno. Queda marcado como quitado (ya no se muestra ni se recuerda).
create or replace function public.event_shift_cancel(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_shifts where id = p_id and church_id = public.current_church_id();
  if v_event is null or not public.can_plan_event(v_event) then raise exception 'No tenés permiso'; end if;
  update public.event_shifts set cancelled_at = now() where id = p_id and cancelled_at is null;
end $$;
revoke all on function public.event_shift_save(uuid, uuid, text, timestamptz, timestamptz, text, uuid), public.event_shift_cancel(uuid) from public, anon;
grant execute on function public.event_shift_save(uuid, uuid, text, timestamptz, timestamptz, text, uuid), public.event_shift_cancel(uuid) to authenticated;

-- Recordatorio: a cada voluntario le llega un aviso cuando faltan menos de 2 horas para su turno (una sola vez).
-- Usa los avisos de siempre (public.notify): aparece en Avisos y llega al teléfono.
create or replace function public.event_shift_reminders() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare s record; n integer := 0;
begin
  for s in
    select sh.id, sh.profile_id, sh.place, sh.starts_at, sh.event_id, e.title, coalesce(c.timezone, 'America/Argentina/Buenos_Aires') as tz
    from public.event_shifts sh
    join public.events e on e.id = sh.event_id
    join public.churches c on c.id = sh.church_id
    where sh.reminded_at is null and sh.cancelled_at is null and sh.starts_at > now() and sh.starts_at <= now() + interval '2 hours'
    for update of sh skip locked
  loop
    update public.event_shifts set reminded_at = now() where id = s.id;
    perform public.notify(s.profile_id, 'link', 'Tu turno empieza a las ' || to_char(s.starts_at at time zone s.tz, 'HH24:MI'),
      s.place || ' · ' || s.title, '/evento/' || s.event_id::text);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.event_shift_reminders() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') and not exists (select 1 from cron.job where jobname = 'lamies-turnos-evento') then
    perform cron.schedule('lamies-turnos-evento', '*/10 * * * *', 'select public.event_shift_reminders()');
  end if;
exception when others then
  raise notice 'No se pudo programar el recordatorio de turnos: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Chips de las personas (para la asistencia de los domingos)
-- ---------------------------------------------------------------------------
-- El chip no lleva el nombre ni el número de la persona: lleva una clave al azar que solo sirve en esta tabla.
create table if not exists public.person_chips (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  label text check (length(label) <= 60),                               -- "tarjeta", "llavero", "pulsera"…
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz                                                -- dado de baja (perdido o cambiado)
);
create unique index if not exists person_chips_token_idx on public.person_chips (token);
create index if not exists person_chips_contact_idx on public.person_chips (contact_id) where revoked_at is null;
alter table public.person_chips enable row level security;
-- Sin ninguna regla de lectura ni permiso directo: la tabla no se puede leer ni escribir desde la app.
-- Todo pasa por las funciones de abajo, que nunca devuelven la clave de un chip ya grabado.
revoke all on table public.person_chips from anon, public, authenticated;

-- Crear la clave para un chip nuevo de una persona. La app la graba en el chip enseguida.
create or replace function public.person_chip_new(p_contact uuid, p_label text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); k public.person_chips; v_name text;
begin
  if not public.can_take_attendance() then raise exception 'No tenés permiso para dar chips'; end if;
  select c.name into v_name from public.contacts c where c.id = p_contact and c.church_id = v_church;
  if v_name is null then raise exception 'Persona inválida'; end if;
  insert into public.person_chips (church_id, contact_id, label) values (v_church, p_contact, nullif(btrim(left(coalesce(p_label, ''), 60)), ''))
    returning * into k;
  return jsonb_build_object('id', k.id, 'token', k.token, 'name', v_name);
end $$;

-- Dar de baja un chip (se perdió, se cambió o no se pudo grabar).
create or replace function public.person_chip_revoke(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.can_take_attendance() then raise exception 'No tenés permiso'; end if;
  update public.person_chips set revoked_at = now() where id = p_id and church_id = public.current_church_id() and revoked_at is null;
end $$;

-- Los chips que están en uso (sin mostrar la clave).
create or replace function public.person_chips_list(p_contact uuid default null)
returns table (id uuid, contact_id uuid, name text, photo_path text, label text, created_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select k.id, k.contact_id, c.name, c.photo_path, k.label, k.created_at, k.last_used_at
  from public.person_chips k join public.contacts c on c.id = k.contact_id
  where k.church_id = public.current_church_id() and k.revoked_at is null and public.can_take_attendance()
    and (p_contact is null or k.contact_id = p_contact)
  order by c.name, k.created_at
$$;

-- La persona apoya su chip: queda presente en esa reunión.
-- La asistencia se guarda con set_attendance, la misma función que usa la pantalla de Asistencia:
-- así valen los mismos permisos y no deja marcar si la reunión está marcada como "no hubo".
create or replace function public.chip_attendance(p_token text, p_date date, p_service uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); k public.person_chips; c public.contacts; v_already boolean;
begin
  if not public.can_take_attendance() then raise exception 'No tenés permiso para tomar asistencia'; end if;
  select * into k from public.person_chips x where x.token = lower(btrim(coalesce(p_token, ''))) and x.church_id = v_church;
  if k.id is null then raise exception 'Ese chip no es de nadie de tu iglesia'; end if;
  if k.revoked_at is not null then raise exception 'Ese chip fue dado de baja. Pedí uno nuevo.'; end if;
  select * into c from public.contacts x where x.id = k.contact_id and x.church_id = v_church;
  -- Si la ficha se unió con otra, vale la ficha que quedó.
  if c.merged_into is not null then select * into c from public.contacts x where x.id = c.merged_into and x.church_id = v_church; end if;
  if c.id is null then raise exception 'No encontré a la persona de ese chip'; end if;
  v_already := exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on = p_date and a.service_id = p_service);
  perform public.set_attendance(c.id, p_date, p_service, true);
  update public.person_chips set last_used_at = now() where id = k.id;
  return jsonb_build_object('contact_id', c.id, 'name', c.name, 'photo_path', c.photo_path, 'already', v_already);
end $$;

revoke all on function public.person_chip_new(uuid, text), public.person_chip_revoke(uuid), public.person_chips_list(uuid), public.chip_attendance(text, date, uuid) from public, anon;
grant execute on function public.person_chip_new(uuid, text), public.person_chip_revoke(uuid), public.person_chips_list(uuid), public.chip_attendance(text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Chicos: la etiqueta del chico y la del adulto tienen que coincidir
-- ---------------------------------------------------------------------------
alter table public.child_checkins
  add column if not exists child_tag text not null default replace(gen_random_uuid()::text, '-', ''),      -- va en la etiqueta (QR o chip) del chico
  add column if not exists pickup_tag text not null default replace(gen_random_uuid()::text, '-', '');     -- va en la etiqueta del adulto; los hermanos comparten la misma
create unique index if not exists child_checkins_child_tag_idx on public.child_checkins (child_tag);
create index if not exists child_checkins_pickup_tag_idx on public.child_checkins (pickup_tag);

-- Entrada del chico con sus dos etiquetas. La entrada se guarda con check_in_child (la función de siempre).
create or replace function public.child_checkin_tags(p_child uuid, p_room text, p_brought_by text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_code text; k public.child_checkins; v_tag text;
begin
  v_code := public.check_in_child(p_child, p_room, p_brought_by);
  select * into k from public.child_checkins x where x.child_id = p_child and x.on_date = public.church_today() and x.room = p_room and x.church_id = public.current_church_id();
  -- Los hermanos que llegaron juntos tienen el mismo código: también comparten la etiqueta del adulto.
  select x.pickup_tag into v_tag from public.child_checkins x
    where x.church_id = k.church_id and x.on_date = k.on_date and x.code = k.code and x.id <> k.id and x.out_at is null
    order by x.in_at limit 1;
  if v_tag is not null and v_tag <> k.pickup_tag then
    update public.child_checkins x set pickup_tag = v_tag where x.id = k.id;
    k.pickup_tag := v_tag;
  end if;
  return jsonb_build_object('checkin_id', k.id, 'code', k.code, 'child_tag', k.child_tag, 'pickup_tag', k.pickup_tag, 'room', k.room,
    'name', (select c.name from public.contacts c where c.id = k.child_id));
end $$;

-- Las etiquetas de un chico que ya entró hoy (para imprimirlas de nuevo).
create or replace function public.child_tags(p_checkin uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare k public.child_checkins;
begin
  if not (public.can_take_attendance() or public.is_any_teacher()) then raise exception 'Solo quien recibe a los chicos'; end if;
  select * into k from public.child_checkins x where x.id = p_checkin and x.church_id = public.current_church_id() and x.on_date = public.church_today();
  if k.id is null then raise exception 'No encontré esa entrada'; end if;
  return jsonb_build_object('checkin_id', k.id, 'code', k.code, 'child_tag', k.child_tag, 'pickup_tag', k.pickup_tag, 'room', k.room,
    'name', (select c.name from public.contacts c where c.id = k.child_id));
end $$;

-- Retiro: se elige al chico (de la lista o leyendo su etiqueta) y se lee la etiqueta del adulto (o se escribe el código).
-- Solo si coinciden queda marcado como retirado. Si no coinciden no se cambia nada y devuelve matched = false.
create or replace function public.child_pickup(p_child text, p_adult text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); k public.child_checkins; v_name text; v_child text := lower(btrim(coalesce(p_child, ''))); v_adult text := lower(btrim(coalesce(p_adult, '')));
begin
  if not (public.can_take_attendance() or public.is_any_teacher()) then raise exception 'Solo quien entrega a los chicos'; end if;
  select * into k from public.child_checkins x
    where x.church_id = v_church and x.on_date = public.church_today() and x.out_at is null and (x.id::text = v_child or x.child_tag = v_child)
    limit 1 for update;
  if k.id is null then raise exception 'Ese chico no está adentro ahora'; end if;
  select c.name into v_name from public.contacts c where c.id = k.child_id;
  if v_adult = '' or not (v_adult = k.code or v_adult = k.pickup_tag) then
    return jsonb_build_object('matched', false, 'name', v_name);
  end if;
  update public.child_checkins x set out_at = now(), out_by = auth.uid() where x.id = k.id;
  return jsonb_build_object('matched', true, 'child_id', k.child_id, 'name', v_name,
    -- los hermanos que siguen adentro con la misma etiqueta del adulto
    'siblings', coalesce((select jsonb_agg(jsonb_build_object('checkin_id', x.id, 'name', c.name) order by c.name)
      from public.child_checkins x join public.contacts c on c.id = x.child_id
      where x.church_id = v_church and x.on_date = k.on_date and x.out_at is null and x.id <> k.id and (x.pickup_tag = k.pickup_tag or x.code = k.code)), '[]'::jsonb));
end $$;

revoke all on function public.child_checkin_tags(uuid, text, text), public.child_tags(uuid), public.child_pickup(text, text) from public, anon;
grant execute on function public.child_checkin_tags(uuid, text, text), public.child_tags(uuid), public.child_pickup(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Enlace de pago (sin procesador de pagos)
-- ---------------------------------------------------------------------------
-- La iglesia pega acá su enlace de pago (por ejemplo un "link de pago" de Mercado Pago) y la página pública muestra el botón "Pagar".
-- El pago lo sigue confirmando una persona con "Marcar que pagó" (event_set_paid).
--
-- PARA MÁS ADELANTE (confirmación automática): cuando la iglesia tenga su cuenta de Mercado Pago y sus credenciales,
-- acá se enchufa: una función de Supabase (supabase/functions) que reciba el aviso de pago de Mercado Pago (webhook),
-- revise la firma, busque la inscripción por su access_token (mandado como "external_reference" al crear el cobro)
-- y guarde paid_amount igual que event_set_paid. Las credenciales van como secretos de la función, nunca en la app ni en esta tabla.
alter table public.event_ticket_types add column if not exists pay_url text check (pay_url is null or (length(pay_url) <= 500 and pay_url ~* '^https://[^\s]+$'));
alter table public.events add column if not exists pay_url text check (pay_url is null or (length(pay_url) <= 500 and pay_url ~* '^https://[^\s]+$'));

-- La página pública: igual que antes, más el enlace de pago de cada tipo de entrada y el de la entrada de la persona.
create or replace function public.event_public(p_slug text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare e public.events; c record; r public.event_registrations; v_taken integer; v_paid boolean := false; v_can_stream boolean; v_price numeric;
begin
  select * into e from public.events where slug = lower(btrim(p_slug)) and public_page;
  if e.id is null then return null; end if;
  select name, case when logo_path ~ '^https?:' then logo_path else null end as logo, coalesce(timezone, 'America/Argentina/Buenos_Aires') as tz into c from public.churches where id = e.church_id;
  if p_token is not null then
    select * into r from public.event_registrations where access_token = p_token and event_id = e.id;
    if r.id is not null then
      select r.people * coalesce((select price from public.event_ticket_types where id = r.ticket_type_id), e.reg_price, 0) into v_price;
      v_paid := v_price = 0 or r.paid_amount >= v_price;
    end if;
  end if;
  select coalesce(sum(people), 0) into v_taken from public.event_registrations where event_id = e.id;
  v_can_stream := e.stream_access = 'all' or (e.stream_access = 'registered' and r.id is not null) or (e.stream_access = 'paid' and r.id is not null and v_paid);
  return jsonb_build_object(
    'church', jsonb_build_object('name', c.name, 'logo', c.logo, 'tz', c.tz),
    'event', jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'all_day', e.all_day, 'place', e.place, 'description', e.description,
      'cost', e.cost, 'transport', e.transport, 'bring', e.bring, 'program', e.program, 'faq', e.faq, 'pay_info', e.pay_info, 'pay_url', e.pay_url,
      'contact_name', e.contact_name, 'contact_phone', e.contact_phone, 'image_key', e.image_key,
      'registration', e.registration and (e.reg_deadline is null or e.reg_deadline >= (now() at time zone c.tz)::date),
      'price', e.reg_price, 'left', case when e.reg_capacity is null then null else greatest(e.reg_capacity - v_taken, 0) end,
      'stream_access', e.stream_access, 'has_stream', e.stream_url is not null, 'has_recordings', jsonb_array_length(e.recordings) > 0),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description, 'price', t.price, 'color', t.color, 'pay_url', t.pay_url,
        'left', case when t.capacity is null then null else greatest(t.capacity - coalesce((select sum(x.people) from public.event_registrations x where x.ticket_type_id = t.id), 0), 0) end) order by t.sort, t.created_at)
      from public.event_ticket_types t where t.event_id = e.id and t.active), '[]'::jsonb),
    'speakers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'bio', s.bio) order by s.sort, s.created_at) from public.event_speakers s where s.event_id = e.id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'title', s.title, 'description', s.description, 'place', s.place, 'speaker_id', s.speaker_id) order by s.starts_at)
      from public.event_sessions s where s.event_id = e.id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('body', u.body, 'at', u.created_at) order by u.created_at desc) from (select * from public.event_updates where event_id = e.id order by created_at desc limit 20) u), '[]'::jsonb),
    'stream', case when v_can_stream then jsonb_build_object('url', e.stream_url, 'recordings', e.recordings) else null end,
    'ticket', case when r.id is null then null else jsonb_build_object('name', r.name, 'people', r.people, 'code', r.ticket_code, 'token', r.access_token,
      'type', (select name from public.event_ticket_types where id = r.ticket_type_id), 'to_pay', v_price, 'paid_amount', r.paid_amount, 'paid', v_paid, 'checked_in', r.checked_in_at is not null,
      'pay_url', coalesce((select pay_url from public.event_ticket_types where id = r.ticket_type_id), e.pay_url)) end
  );
end $$;
