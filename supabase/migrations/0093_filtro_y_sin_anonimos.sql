-- Normas de Apple para lo que publican los usuarios (1.2):
--  1. Filtro de malas palabras en todo lo que se publica (chats, comentarios, pedidos de oración, preguntas).
--  2. Nada se publica sin nombre: los pedidos de oración nuevos van siempre con el nombre, y las preguntas le llegan al pastor con quién la hizo.
--     Lo que ya estaba publicado sin nombre queda como estaba (no se le pone el nombre a nadie después).

create or replace function public.has_bad_words(p text) returns boolean
language sql immutable set search_path = public as $$
  select translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun') ~
    '\m(put[ao]s?|hijo de puta|hijueputa|hdp|mierdas?|carajo|pelotud[ao]s?|pijas?|vergas?|culos?|culiad[ao]s?|culiao|maricon(es)?|trolos?|pajer[ao]s?|cabron(es)?|pendej[ao]s?|malparid[ao]s?|chinga(r|da|do)?|soretes?|porno?|fuck(ing|er|ers)?|shit|bitch(es)?|asshole|cunt|nigger|faggot|whore|slut)\M'
$$;

create or replace function public.reject_bad_words() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.has_bad_words(new.body) then
    raise exception 'Ese mensaje tiene palabras que no se permiten en La Mies. Cambialas y volvé a enviarlo.' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['church_chat_messages','ministry_messages','outing_chat_messages','daily_comments','live_comments','prayer_requests','bible_questions','dm_messages'] loop
    execute format('drop trigger if exists bad_words on public.%I', t);
    execute format('create trigger bad_words before insert or update of body on public.%I for each row execute function public.reject_bad_words()', t);
  end loop;
end $$;

create or replace function public.no_anonymous_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'prayer_requests' then new.anonymous := false; end if;
  if tg_table_name = 'bible_questions' and new.user_id is null then new.user_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists no_anon on public.prayer_requests;
create trigger no_anon before insert on public.prayer_requests for each row execute function public.no_anonymous_posts();
drop trigger if exists no_anon on public.bible_questions;
create trigger no_anon before insert on public.bible_questions for each row execute function public.no_anonymous_posts();
