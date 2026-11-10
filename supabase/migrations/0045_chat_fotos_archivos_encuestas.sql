-- 0045: en los chats se pueden mandar fotos (también GIF) y documentos, y en el chat de la iglesia, encuestas.
--  - Los archivos van a un depósito privado "chat", en la carpeta de cada iglesia.
--  - Una encuesta es un mensaje del chat con opciones; cada uno vota (una opción o varias) y se ven los totales.

-- ---------------------------------------------------------------------------
-- 1. Mensajes con foto, documento o encuesta
-- ---------------------------------------------------------------------------
alter table public.church_chat_messages
  add column if not exists kind text not null default 'text',
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size integer;
alter table public.outing_chat_messages
  add column if not exists kind text not null default 'text',
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size integer;

alter table public.church_chat_messages drop constraint if exists church_chat_messages_body_check;
alter table public.outing_chat_messages drop constraint if exists outing_chat_messages_body_check;
alter table public.church_chat_messages drop constraint if exists church_chat_kind_check;
alter table public.outing_chat_messages drop constraint if exists outing_chat_kind_check;
alter table public.church_chat_messages add constraint church_chat_kind_check check (
  kind in ('text', 'image', 'file', 'poll') and length(body) <= 1000
  and (kind in ('image', 'file') or length(btrim(body)) >= 1)
  and ((kind in ('image', 'file')) = (attachment_path is not null)));
alter table public.outing_chat_messages add constraint outing_chat_kind_check check (
  kind in ('text', 'image') and length(body) <= 1000
  and (kind = 'image' or length(btrim(body)) >= 1)
  and ((kind = 'image') = (attachment_path is not null)));

-- Quien escribe directo solo puede mandar texto, foto o documento (las encuestas pasan por create_chat_poll),
-- y el archivo tiene que estar en la carpeta de su iglesia.
drop policy if exists church_chat_insert on public.church_chat_messages;
create policy church_chat_insert on public.church_chat_messages for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid() and kind in ('text', 'image', 'file')
              and (attachment_path is null or attachment_path like public.current_church_id()::text || '/%')
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.disabled_at is null));
drop policy if exists outing_chat_insert on public.outing_chat_messages;
create policy outing_chat_insert on public.outing_chat_messages for insert to authenticated
  with check (church_id = public.current_church_id() and user_id = auth.uid() and kind in ('text', 'image')
              and (attachment_path is null or attachment_path like public.current_church_id()::text || '/%')
              and (public.in_outing_now() or public.has_perm('evang.ver_salidas')));

drop function if exists public.church_chat_list(timestamptz, int);
create or replace function public.church_chat_list(p_before timestamptz default null, p_limit int default 60)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean,
               kind text, attachment_path text, attachment_name text, attachment_size integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = m.user_id limit 1),
         m.body, m.created_at, m.user_id = auth.uid(), m.kind, m.attachment_path, m.attachment_name, m.attachment_size
  from public.church_chat_messages m
  left join public.profiles p on p.id = m.user_id
  where m.church_id = public.current_church_id() and not public.is_blocked_by_me(m.user_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
grant execute on function public.church_chat_list(timestamptz, int) to authenticated;

drop function if exists public.outing_chat_list(timestamptz, int);
create or replace function public.outing_chat_list(p_before timestamptz default null, p_limit int default 80)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean,
               kind text, attachment_path text, attachment_name text, attachment_size integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = m.user_id limit 1),
         m.body, m.created_at, m.user_id = auth.uid(), m.kind, m.attachment_path, m.attachment_name, m.attachment_size
  from public.outing_chat_messages m
  left join public.profiles p on p.id = m.user_id
  where m.church_id = public.current_church_id() and m.created_at > now() - interval '12 hours'
    and (public.in_outing_now() or public.has_perm('evang.ver_salidas'))
    and not public.is_blocked_by_me(m.user_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200)
$$;
grant execute on function public.outing_chat_list(timestamptz, int) to authenticated;

-- El aviso de la salida no muestra el texto de una foto vacía.
create or replace function public.outing_chat_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; v_name text;
begin
  select display_name into v_name from public.profiles where id = new.user_id;
  for u in select distinct s.user_id from public.sessions s
           where s.church_id = new.church_id and s.ended_at is null and s.started_at > now() - interval '12 hours' and s.user_id <> new.user_id loop
    perform public.notify(u, 'outing_chat', 'Chat de la salida · ' || coalesce(v_name, 'Alguien'),
                          case when new.kind = 'image' then coalesce(nullif(left(new.body, 140), ''), '📷 Mandó una foto') else left(new.body, 140) end,
                          '/salida-chat');
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Depósito privado de archivos del chat
-- ---------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('chat', 'chat', false, 15728640, array['image/*', 'application/pdf', 'text/plain',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
    on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists lamies_chat_read on storage.objects;
    create policy lamies_chat_read on storage.objects for select to authenticated
      using (bucket_id = 'chat' and (storage.foldername(name))[1] = public.current_church_id()::text);
    drop policy if exists lamies_chat_insert on storage.objects;
    create policy lamies_chat_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'chat' and (storage.foldername(name))[1] = public.current_church_id()::text);
    drop policy if exists lamies_chat_delete on storage.objects;
    create policy lamies_chat_delete on storage.objects for delete to authenticated
      using (bucket_id = 'chat' and (storage.foldername(name))[1] = public.current_church_id()::text
             and (coalesce(owner_id, '') = auth.uid()::text or public.is_staff()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Encuestas en el chat de la iglesia
-- ---------------------------------------------------------------------------
create table if not exists public.chat_polls (
  message_id uuid primary key references public.church_chat_messages(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade,
  multiple   boolean not null default false,
  closes_at  timestamptz
);
create table if not exists public.chat_poll_options (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_polls(message_id) on delete cascade,
  position   smallint not null,
  label      text not null check (length(btrim(label)) between 1 and 80)
);
create index if not exists chat_poll_options_msg_idx on public.chat_poll_options (message_id, position);
create table if not exists public.chat_poll_votes (
  option_id  uuid not null references public.chat_poll_options(id) on delete cascade,
  message_id uuid not null references public.chat_polls(message_id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists chat_poll_votes_msg_idx on public.chat_poll_votes (message_id);

-- Todo se lee y se escribe con las funciones de abajo (así nadie ve quién votó qué).
alter table public.chat_polls enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;
revoke all on public.chat_polls, public.chat_poll_options, public.chat_poll_votes from anon, authenticated;

create or replace function public.create_chat_poll(p_question text, p_options text[], p_multiple boolean default false, p_closes_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_church uuid := public.current_church_id(); v_opts text[]; i int;
begin
  if auth.uid() is null or v_church is null then raise exception 'Entrá a tu cuenta'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.disabled_at is null) then raise exception 'Tu cuenta está desactivada'; end if;
  if length(btrim(coalesce(p_question, ''))) not between 1 and 300 then raise exception 'Escribí la pregunta (hasta 300 letras)'; end if;
  select array_agg(btrim(o)) into v_opts from unnest(coalesce(p_options, '{}')) o where length(btrim(o)) > 0;
  if coalesce(array_length(v_opts, 1), 0) not between 2 and 8 then raise exception 'Poné entre 2 y 8 opciones'; end if;
  for i in 1..array_length(v_opts, 1) loop
    if length(v_opts[i]) > 80 then raise exception 'Cada opción puede tener hasta 80 letras'; end if;
  end loop;
  if p_closes_at is not null and p_closes_at <= now() then raise exception 'La fecha de cierre ya pasó'; end if;
  insert into public.church_chat_messages (church_id, user_id, kind, body) values (v_church, auth.uid(), 'poll', btrim(p_question)) returning id into v_id;
  insert into public.chat_polls (message_id, church_id, multiple, closes_at) values (v_id, v_church, coalesce(p_multiple, false), p_closes_at);
  insert into public.chat_poll_options (message_id, position, label)
    select v_id, (row_number() over ())::smallint, o from unnest(v_opts) o;
  return v_id;
end $$;
grant execute on function public.create_chat_poll(text, text[], boolean, timestamptz) to authenticated;

-- Votar: en una encuesta de una sola opción cambia el voto; en una de varias, marca o desmarca.
create or replace function public.vote_chat_poll(p_option uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o record; pl record;
begin
  select * into o from public.chat_poll_options where id = p_option;
  if o.id is null then raise exception 'Esa opción ya no existe'; end if;
  select * into pl from public.chat_polls where message_id = o.message_id and church_id = public.current_church_id();
  if pl.message_id is null then raise exception 'No existe la encuesta'; end if;
  if pl.closes_at is not null and pl.closes_at <= now() then raise exception 'La encuesta ya cerró'; end if;
  if exists (select 1 from public.chat_poll_votes where option_id = p_option and user_id = auth.uid()) then
    delete from public.chat_poll_votes where option_id = p_option and user_id = auth.uid();
    return;
  end if;
  if not pl.multiple then delete from public.chat_poll_votes where message_id = pl.message_id and user_id = auth.uid(); end if;
  insert into public.chat_poll_votes (option_id, message_id, user_id) values (p_option, pl.message_id, auth.uid());
end $$;
grant execute on function public.vote_chat_poll(uuid) to authenticated;

-- Resultados de varias encuestas a la vez (totales y qué votó cada uno; nunca quién votó qué).
create or replace function public.chat_poll_results(p_messages uuid[])
returns table (message_id uuid, option_id uuid, sort smallint, label text, votes integer, mine boolean,
               multiple boolean, closes_at timestamptz, voters integer)
language sql stable security definer set search_path = public as $$
  select o.message_id, o.id, o.position, o.label,
         (select count(*)::int from public.chat_poll_votes v where v.option_id = o.id),
         exists (select 1 from public.chat_poll_votes v where v.option_id = o.id and v.user_id = auth.uid()),
         pl.multiple, pl.closes_at,
         (select count(distinct v.user_id)::int from public.chat_poll_votes v where v.message_id = o.message_id)
  from public.chat_poll_options o join public.chat_polls pl on pl.message_id = o.message_id
  where o.message_id = any (coalesce(p_messages, '{}')) and pl.church_id = public.current_church_id()
  order by o.message_id, o.position
$$;
grant execute on function public.chat_poll_results(uuid[]) to authenticated;

-- Denunciar un mensaje de encuesta o de foto funciona igual que uno de texto (resolve_report borra la fila del chat).
