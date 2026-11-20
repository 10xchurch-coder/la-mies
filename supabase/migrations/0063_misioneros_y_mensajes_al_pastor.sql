-- 0063: mensajes privados de los miembros al pastor, y la sección de misioneros con su informe de cada mes.

-- ---------------------------------------------------------------------------
-- 1. ¿Es el pastor? (el rol "pastor", no el de administrador de la app ni el de pastor asistente)
-- ---------------------------------------------------------------------------
create or replace function public.is_pastor() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select role::text = 'admin' and disabled_at is null from public.profiles where id = auth.uid()), false)
$$;
revoke all on function public.is_pastor() from public, anon;
grant execute on function public.is_pastor() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Mensajes privados: cada miembro tiene una sola conversación, solo con el pastor.
--    La tabla no se lee ni se escribe directo: todo pasa por las funciones de abajo,
--    así nadie más (ni la secretaría) ve nada, y el teléfono no los guarda para usar sin internet.
-- ---------------------------------------------------------------------------
create table if not exists public.pastor_messages (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,   -- de quién es la conversación
  sender_id  uuid not null references public.profiles(id) on delete cascade,   -- quién escribió este mensaje
  body       text not null check (length(btrim(body)) between 1 and 2000),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pastor_messages_thread_idx on public.pastor_messages (member_id, created_at);
create index if not exists pastor_messages_church_idx on public.pastor_messages (church_id, created_at desc);
alter table public.pastor_messages enable row level security;
revoke all on table public.pastor_messages from anon, authenticated, public;
comment on table public.pastor_messages is 'Sin políticas a propósito: solo se usa con las funciones send_pastor_message, pastor_thread, pastor_inbox, read_pastor_thread y pastor_unread.';

-- Escribir. El miembro le escribe al pastor; el pastor le responde a quien eligió.
create or replace function public.send_pastor_message(p_body text, p_member uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid(); v_church uuid; v_member uuid; v_id uuid; v_name text; r record;
begin
  if v_me is null then raise exception 'Iniciá sesión'; end if;
  select church_id, display_name into v_church, v_name from public.profiles where id = v_me and disabled_at is null;
  if v_church is null then raise exception 'Primero entrá a tu iglesia'; end if;
  if length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Escribí el mensaje'; end if;
  if length(p_body) > 2000 then raise exception 'El mensaje es muy largo (máximo 2000 letras)'; end if;

  if public.is_pastor() then
    if p_member is null or p_member = v_me then raise exception 'Elegí a quién le respondés'; end if;
    if not exists (select 1 from public.profiles where id = p_member and church_id = v_church) then
      raise exception 'Esa persona no es de tu iglesia';
    end if;
    v_member := p_member;
  else
    v_member := v_me;
    if (select count(*) from public.pastor_messages where sender_id = v_me and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Mandaste muchos mensajes seguidos. Probá de nuevo en un rato.';
    end if;
  end if;

  insert into public.pastor_messages (church_id, member_id, sender_id, body)
  values (v_church, v_member, v_me, btrim(p_body)) returning id into v_id;

  -- El aviso no lleva el texto: el mensaje es privado y el teléfono bloqueado lo puede mostrar.
  if v_member = v_me then
    for r in select id from public.profiles where church_id = v_church and role::text = 'admin' and disabled_at is null loop
      perform public.notify(r.id, 'pastor_msg', 'Mensaje privado', coalesce(v_name, 'Un hermano') || ' te escribió', '/pastor-bandeja');
    end loop;
  else
    perform public.notify(v_member, 'pastor_msg', 'El pastor te respondió', 'Abrí la app para leerlo', '/pastor-hilo');
  end if;
  return v_id;
end $$;

-- La conversación: el miembro ve la suya; el pastor, la de quien elija.
create or replace function public.pastor_thread(p_member uuid default null)
returns table (id uuid, body text, created_at timestamptz, mine boolean, read_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select m.id, m.body, m.created_at, m.sender_id = auth.uid(), m.read_at
  from public.pastor_messages m
  where m.church_id = public.current_church_id()
    and m.member_id = case when public.is_pastor() then p_member else auth.uid() end
  order by m.created_at asc
  limit 300
$$;

-- La bandeja del pastor: una fila por persona, la más reciente arriba. Para los demás, vacía.
create or replace function public.pastor_inbox()
returns table (member_id uuid, name text, photo_path text, last_body text, last_at timestamptz, last_mine boolean, unread integer)
language sql stable security definer set search_path to 'public' as $$
  with t as (
    select m.member_id, max(m.created_at) as last_at,
           (count(*) filter (where m.sender_id = m.member_id and m.read_at is null))::int as unread
    from public.pastor_messages m where m.church_id = public.current_church_id() group by m.member_id)
  select t.member_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = t.member_id limit 1),
         lm.body, t.last_at, lm.sender_id <> t.member_id, t.unread
  from t
  left join public.profiles p on p.id = t.member_id
  left join lateral (select x.body, x.sender_id from public.pastor_messages x where x.member_id = t.member_id order by x.created_at desc limit 1) lm on true
  where public.is_pastor()
  order by t.last_at desc
$$;

-- Marcar como leído lo que llegó del otro lado.
create or replace function public.read_pastor_thread(p_member uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if public.is_pastor() then
    update public.pastor_messages set read_at = now()
      where church_id = public.current_church_id() and member_id = p_member and sender_id = p_member and read_at is null;
  else
    update public.pastor_messages set read_at = now()
      where member_id = auth.uid() and sender_id <> auth.uid() and read_at is null;
  end if;
end $$;

-- Cuántos hay sin leer: al pastor, los de los miembros; a cada miembro, las respuestas del pastor.
create or replace function public.pastor_unread() returns integer
language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.pastor_messages m
  where m.read_at is null and m.church_id = public.current_church_id()
    and case when public.is_pastor() then m.sender_id = m.member_id
             else m.member_id = auth.uid() and m.sender_id <> auth.uid() end
$$;

revoke all on function public.send_pastor_message(text, uuid), public.pastor_thread(uuid), public.pastor_inbox(),
  public.read_pastor_thread(uuid), public.pastor_unread() from public, anon;
grant execute on function public.send_pastor_message(text, uuid), public.pastor_thread(uuid), public.pastor_inbox(),
  public.read_pastor_thread(uuid), public.pastor_unread() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Misioneros y su informe de cada mes
-- ---------------------------------------------------------------------------
create table if not exists public.missionaries (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 2 and 120),
  field      text check (length(field) <= 160),      -- dónde sirve
  bio        text check (length(bio) <= 2000),       -- unas líneas sobre él y su obra
  photo_path text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists missionaries_church_idx on public.missionaries (church_id, position);

create table if not exists public.missionary_reports (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  missionary_id uuid not null references public.missionaries(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),   -- el primer día del mes del informe
  title        text check (length(title) <= 160),
  summary      text check (length(summary) <= 4000),
  pdf_path     text,
  pdf_name     text,
  photo_paths  text[] not null default '{}' check (cardinality(photo_paths) <= 30),
  announce     boolean not null default false,       -- al cargarlo por primera vez, avisar a la iglesia
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (missionary_id, month)
);
create index if not exists missionary_reports_church_idx on public.missionary_reports (church_id, month desc);

alter table public.missionaries enable row level security;
alter table public.missionary_reports enable row level security;
revoke all on table public.missionaries, public.missionary_reports from anon, public;
grant select, insert, update, delete on table public.missionaries, public.missionary_reports to authenticated;

-- Los ven los miembros que iniciaron sesión en la iglesia. Los cargan el pastor y la secretaría.
drop policy if exists missionaries_select on public.missionaries;
create policy missionaries_select on public.missionaries for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists missionaries_write on public.missionaries;
create policy missionaries_write on public.missionaries for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());

drop policy if exists missionary_reports_select on public.missionary_reports;
create policy missionary_reports_select on public.missionary_reports for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists missionary_reports_write on public.missionary_reports;
create policy missionary_reports_write on public.missionary_reports for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff()
    and exists (select 1 from public.missionaries m where m.id = missionary_id and m.church_id = public.current_church_id()));

-- Aviso a la iglesia cuando se carga un informe nuevo (solo si se tildó "Avisar a todos").
create or replace function public.missionary_report_notify() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_name text; r record;
  v_months constant text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  if not new.announce then return null; end if;
  select name into v_name from public.missionaries where id = new.missionary_id;
  for r in select id from public.profiles where church_id = new.church_id and disabled_at is null and id is distinct from new.created_by loop
    perform public.notify(r.id, 'missionary', 'Informe de misionero nuevo',
      coalesce(v_name, 'Misionero') || ' — ' || v_months[extract(month from new.month)::int] || ' de ' || extract(year from new.month)::int,
      '/misioneros/' || new.missionary_id);
  end loop;
  return null;
end $$;
drop trigger if exists missionary_reports_notify on public.missionary_reports;
create trigger missionary_reports_notify after insert on public.missionary_reports
  for each row execute function public.missionary_report_notify();

-- Depósito privado para el PDF y las fotos.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('missionaries', 'missionaries', false, 26214400, array['image/*', 'application/pdf'])
    on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists lamies_missionaries_read on storage.objects;
    create policy lamies_missionaries_read on storage.objects for select to authenticated
      using (bucket_id = 'missionaries' and (storage.foldername(name))[1] = public.current_church_id()::text);
    drop policy if exists lamies_missionaries_insert on storage.objects;
    create policy lamies_missionaries_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'missionaries' and (storage.foldername(name))[1] = public.current_church_id()::text and public.is_staff());
    drop policy if exists lamies_missionaries_delete on storage.objects;
    create policy lamies_missionaries_delete on storage.objects for delete to authenticated
      using (bucket_id = 'missionaries' and (storage.foldername(name))[1] = public.current_church_id()::text and public.is_staff());
  end if;
end $$;
