-- ============================================================================
-- La Mies · Prédicas nuevas de YouTube, solas.
--
-- Cada 2 horas la base pide el feed público de la lista de reproducción de la iglesia (o del canal) — los últimos 15 videos —
-- y agrega a Prédicas los mensajes que todavía no están. Los #shorts no se agregan.
-- El título se separa solo: "La Voluntad de Dios | Romanos 12" → título "La Voluntad de Dios", pasaje "Romanos 12".
-- Si lo que sigue a la barra no es una cita, queda como descripción. Todo se puede corregir después en la app.
-- No hace falta ninguna clave: el feed de YouTube es público. Se puede correr más de una vez.
-- ============================================================================

create extension if not exists pg_net;

alter table public.churches add column if not exists youtube_channel_id text;
-- Si la iglesia tiene una lista de reproducción (por ejemplo "Prédicas del domingo"), se importa solo de esa lista.
alter table public.churches add column if not exists youtube_playlist_id text;

-- Pedidos al feed que esperan respuesta (pg_net responde por separado).
create table if not exists public.youtube_fetches (
  request_id   bigint primary key,
  church_id    uuid not null references public.churches(id) on delete cascade,
  requested_at timestamptz not null default now(),
  done         boolean not null default false,
  added        integer not null default 0
);
alter table public.youtube_fetches enable row level security;
revoke all on public.youtube_fetches from anon, authenticated;
grant all on public.youtube_fetches to service_role;

-- Separa un título de YouTube en título, pasaje y descripción.
create or replace function public.sermon_title_parts(p_raw text, out title text, out passage text, out description text)
language plpgsql immutable set search_path = public as $$
declare
  t text;
  parts text[];
  p text;
  i integer;
  ref_re constant text := '^([1-3] ?)?[A-Za-zÁÉÍÓÚÑáéíóúñ]+\.? \d+([:.]\d+)?([-–]\d+)?$';
begin
  t := regexp_replace(coalesce(p_raw, ''), '#\S+', '', 'g');        -- sin hashtags
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  parts := regexp_split_to_array(t, ' ?\| ?| : | [-–—] ?');
  title := btrim(parts[1], ' .,:;-–—');
  for i in 2 .. coalesce(array_length(parts, 1), 1) loop
    p := btrim(parts[i], ' ,;-–—');
    continue when p = '';
    if passage is null and p ~ ref_re then
      passage := rtrim(p, '.');
    else
      description := case when description is null then p else description || ' · ' || p end;
    end if;
  end loop;
  -- "1 Juan 2:6 | Ser como Él": la cita va como pasaje y lo que sigue es el título.
  if title ~ ref_re and passage is null and description is not null then
    passage := title; title := description; description := null;
  end if;
  -- "Romanos 12" solo, sin título: el pasaje es el título.
  if (title is null or title = '') then title := coalesce(passage, t); end if;
end $$;

-- Procesa las respuestas que llegaron y, cada 2 horas, vuelve a pedir el feed.
create or replace function public.import_youtube_sermons()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  f record;
  e xml;
  ns constant text[] := array[array['a','http://www.w3.org/2005/Atom'], array['yt','http://www.youtube.com/xml/schemas/2015']];
  v_vid text; v_title text; v_pub timestamptz; v_link text;
  v_tz text;
  v_parts record;
  v_added integer;
  v_total integer := 0;
  c record;
begin
  -- 1) Respuestas que ya llegaron
  for f in
    select yf.request_id, yf.church_id, r.status_code, r.content
    from public.youtube_fetches yf
    join net._http_response r on r.id = yf.request_id
    where not yf.done
  loop
    v_added := 0;
    if f.status_code = 200 and f.content is not null then
      select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = f.church_id;
      begin
        for e in select unnest(xpath('/a:feed/a:entry', f.content::xml, ns)) loop
          v_vid   := (xpath('/a:entry/yt:videoId/text()', e, ns))[1]::text;
          v_title := (xpath('/a:entry/a:title/text()', e, ns))[1]::text;
          v_pub   := (xpath('/a:entry/a:published/text()', e, ns))[1]::text::timestamptz;
          v_link  := (xpath('/a:entry/a:link/@href', e, ns))[1]::text;
          continue when v_vid is null or v_link like '%/shorts/%' or v_title ~* '#shorts';
          continue when exists (select 1 from public.sermons s where s.church_id = f.church_id and s.youtube_url like '%' || v_vid || '%');
          -- títulos con entidades XML (&amp;, etc.)
          v_title := replace(replace(replace(replace(replace(v_title, '&amp;', '&'), '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>');
          select * into v_parts from public.sermon_title_parts(v_title);
          insert into public.sermons (church_id, title, preached_on, passage, description, youtube_url, created_by)
          values (f.church_id, v_parts.title, (v_pub at time zone v_tz)::date, v_parts.passage, v_parts.description,
                  'https://www.youtube.com/watch?v=' || v_vid, null);
          v_added := v_added + 1;
        end loop;
      exception when others then
        -- un feed raro no frena nada; queda anotado
        insert into public.app_errors (message, platform, app_version)
        values ('import_youtube_sermons: ' || sqlerrm, 'server', 'db');
      end;
    end if;
    update public.youtube_fetches set done = true, added = v_added where request_id = f.request_id;
    v_total := v_total + v_added;
  end loop;

  -- 2) Limpiar pedidos viejos
  delete from public.youtube_fetches where requested_at < now() - interval '2 days';

  -- 3) Pedir el feed de nuevo (cada 2 horas por iglesia)
  for c in select id, youtube_channel_id, youtube_playlist_id from public.churches
           where coalesce(youtube_playlist_id, '') <> '' or coalesce(youtube_channel_id, '') <> '' loop
    if not exists (select 1 from public.youtube_fetches where church_id = c.id and requested_at > now() - interval '110 minutes') then
      insert into public.youtube_fetches (request_id, church_id)
      values (net.http_get('https://www.youtube.com/feeds/videos.xml?' ||
                case when coalesce(c.youtube_playlist_id, '') <> '' then 'playlist_id=' || c.youtube_playlist_id
                     else 'channel_id=' || c.youtube_channel_id end, timeout_milliseconds => 15000), c.id);
    end if;
  end loop;

  return v_total;
end $$;
revoke all on function public.import_youtube_sermons() from public, anon, authenticated;
grant execute on function public.import_youtube_sermons() to service_role;

-- Cada 30 minutos (procesa lo que llegó; pide de nuevo cada 2 horas).
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'lamies-youtube';
    perform cron.schedule('lamies-youtube', '*/30 * * * *', 'select public.import_youtube_sermons()');
  end if;
end $$;
