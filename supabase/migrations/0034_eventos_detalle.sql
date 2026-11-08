-- 0034: cada evento tiene su página: foto, costo, transporte, qué llevar, programa, contacto e inscripción.
alter table public.events
  add column if not exists photo_path    text,       -- foto o flyer subido (bucket photos)
  add column if not exists image_key     text,       -- foto automática por tema (si no hay foto subida)
  add column if not exists cost          text,       -- "Gratis", "$5.000 por persona"
  add column if not exists transport     text,       -- "Hay transporte desde la iglesia a las 8:30"
  add column if not exists bring         text,       -- qué llevar
  add column if not exists program       text,       -- una actividad por línea
  add column if not exists contact_name  text,
  add column if not exists contact_phone text,
  add column if not exists registration  boolean not null default false,  -- pide inscripción
  add column if not exists reg_price     numeric(12, 2),                  -- costo por persona (para saber quién pagó)
  add column if not exists reg_capacity  integer,
  add column if not exists reg_deadline  date,
  add column if not exists reg_ask_ride  boolean not null default false,
  add column if not exists reg_ask_lodging boolean not null default false;

create table if not exists public.event_registrations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  occurs_on     date not null,
  church_id     uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  user_id       uuid references public.profiles(id) on delete set null default auth.uid(),
  name          text not null,
  phone         text,
  people        integer not null default 1 check (people between 1 and 50),
  needs_ride    boolean not null default false,
  needs_lodging boolean not null default false,
  notes         text,
  paid_amount   numeric(12, 2) not null default 0,
  paid_note     text,
  created_at    timestamptz not null default now()
);
create index if not exists event_registrations_event_idx on public.event_registrations (event_id, occurs_on);
alter table public.event_registrations enable row level security;
grant select, insert, update, delete on public.event_registrations to authenticated;

drop policy if exists event_reg_select on public.event_registrations;
create policy event_reg_select on public.event_registrations for select to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.has_perm('cal.editar')));
drop policy if exists event_reg_insert on public.event_registrations;
create policy event_reg_insert on public.event_registrations for insert to authenticated
  with check (church_id = public.current_church_id() and (user_id = auth.uid() or public.has_perm('cal.editar'))
              and exists (select 1 from public.events e where e.id = event_id and e.church_id = public.current_church_id() and e.registration));
drop policy if exists event_reg_update on public.event_registrations;
create policy event_reg_update on public.event_registrations for update to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.has_perm('cal.editar')))
  with check (church_id = public.current_church_id() and (user_id = auth.uid() or public.has_perm('cal.editar')));
drop policy if exists event_reg_delete on public.event_registrations;
create policy event_reg_delete on public.event_registrations for delete to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.has_perm('cal.editar')));

-- Quien se inscribe no puede marcarse pagado: eso lo hace quien maneja el calendario.
create or replace function public.event_reg_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_perm('cal.editar') then return new; end if;
  if tg_op = 'INSERT' then new.paid_amount := 0; new.paid_note := null;
  else new.paid_amount := old.paid_amount; new.paid_note := old.paid_note; end if;
  return new;
end $$;
drop trigger if exists event_reg_guard on public.event_registrations;
create trigger event_reg_guard before insert or update on public.event_registrations
  for each row execute function public.event_reg_guard();
revoke all on function public.event_reg_guard() from public, anon, authenticated;

-- Cuántos se anotaron (lo ve cualquiera, sin los nombres).
create or replace function public.event_registration_count(p_event uuid, p_on date) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(people), 0)::int from public.event_registrations r
  join public.events e on e.id = r.event_id
  where r.event_id = p_event and r.occurs_on = p_on and e.church_id = public.current_church_id()
$$;
grant execute on function public.event_registration_count(uuid, date) to authenticated;

-- Foto automática para los eventos que ya estaban.
update public.events set image_key = case
  when title ~* 'f[uú]tbol|partido' then 'futbol'
  when title ~* 'santa cena|cena del se[nñ]or' then 'santa_cena'
  when title ~* 'feria' then 'feria'
  when title ~* 'bautismo' then 'bautismo'
  when title ~* 'conferencia|congreso|fuegos' then 'conferencia'
  when title ~* 'campamento|retiro' then 'campamento'
  when title ~* 'asado|parrilla|pollo' then 'asado'
  when title ~* 'hombres|varones|caballeros' then 'hombres'
  when title ~* 'mujeres|damas|femenil' then 'mujeres'
  when title ~* 'j[oó]venes|juventud|adolescentes' then 'jovenes'
  when title ~* 'ni[nñ]os|infantil' then 'ninos'
  when title ~* 'oraci[oó]n|vigilia|ayuno' then 'oracion'
  when title ~* 'aniversario|cumple' then 'aniversario'
  when title ~* 'evangeli|almas|salida' then 'evangelismo'
  when title ~* 'm[uú]sica|ensayo|alabanza' then 'musica'
  when title ~* 'estudio|clase|escuela|discipulado' then 'estudio'
  when title ~* 'desayuno|almuerzo|cena|comida' then 'comida'
  when title ~* 'culto|servicio|reuni[oó]n' then 'culto'
  else null end
where image_key is null;
