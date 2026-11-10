\set ON_ERROR_STOP on
-- 0045: fotos y documentos en los chats, encuestas en el chat de la iglesia.
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.church_chat_messages;
delete from public.outing_chat_messages;
delete from public.sessions where ended_at is null;
update public.profiles set disabled_at = null where id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');

-- Foto y documento en el chat de la iglesia.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.church_chat_messages (kind, body, attachment_path, attachment_name, attachment_size)
  values ('image', '', '10000000-0000-0000-0000-000000000001/foto.jpg', 'foto.jpg', 1000),
         ('file', 'El horario', '10000000-0000-0000-0000-000000000001/horario.pdf', 'horario.pdf', 5000);
do $$ begin
  begin
    insert into public.church_chat_messages (kind, body, attachment_path) values ('image', '', '10000000-0000-0000-0000-000000000002/ajeno.jpg');
    raise exception 'FALLO: subió un archivo en la carpeta de otra iglesia';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    insert into public.church_chat_messages (kind, body) values ('image', 'sin archivo');
    raise exception 'FALLO: foto sin archivo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    insert into public.church_chat_messages (kind, body) values ('poll', 'encuesta falsa');
    raise exception 'FALLO: creó una encuesta sin pasar por la función';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    insert into public.church_chat_messages (kind, body) values ('text', '   ');
    raise exception 'FALLO: mensaje vacío';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if (select count(*) from public.church_chat_list() where kind in ('image', 'file') and attachment_path is not null) <> 2 then raise exception 'FALLO: no se ven los adjuntos'; end if;
end $$;

-- Encuesta de una sola opción.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.create_chat_poll('¿Qué día hacemos el asado?', array['Sábado', 'Domingo', '  ', 'Lunes'], false, null);
do $$ begin
  begin
    perform public.create_chat_poll('Una sola', array['solo una'], false, null);
    raise exception 'FALLO: aceptó 1 opción';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform public.create_chat_poll('', array['a', 'b'], false, null);
    raise exception 'FALLO: aceptó pregunta vacía';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ declare m uuid; a uuid; b uuid; begin
  select id into m from public.church_chat_messages where body = '¿Qué día hacemos el asado?';
  select option_id into a from public.chat_poll_results(array[m]) where label = 'Sábado';
  select option_id into b from public.chat_poll_results(array[m]) where label = 'Domingo';
  if (select count(*) from public.chat_poll_results(array[m])) <> 3 then raise exception 'FALLO: opciones mal'; end if;
  perform public.vote_chat_poll(a);
  perform public.vote_chat_poll(b); -- cambia el voto
  if (select votes from public.chat_poll_results(array[m]) where option_id = a) <> 0 then raise exception 'FALLO: el voto anterior sigue'; end if;
  if (select votes from public.chat_poll_results(array[m]) where option_id = b) <> 1 then raise exception 'FALLO: no contó el voto'; end if;
  if not (select mine from public.chat_poll_results(array[m]) where option_id = b) then raise exception 'FALLO: no marca mi voto'; end if;
  perform public.vote_chat_poll(b); -- vuelve a tocar: lo saca
  if (select votes from public.chat_poll_results(array[m]) where option_id = b) <> 0 then raise exception 'FALLO: no sacó el voto'; end if;
  perform public.vote_chat_poll(b);
  begin
    perform * from public.chat_poll_votes;
    raise exception 'FALLO: lee los votos directo';
  exception when insufficient_privilege then null; end;
end $$;
-- Otro vota y los totales suman; otra iglesia no ve nada.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
do $$ declare m uuid; b uuid; begin
  select id into m from public.church_chat_messages where body = '¿Qué día hacemos el asado?';
  select option_id into b from public.chat_poll_results(array[m]) where label = 'Domingo';
  perform public.vote_chat_poll(b);
  if (select votes from public.chat_poll_results(array[m]) where option_id = b) <> 2 then raise exception 'FALLO: total de votos'; end if;
  if (select max(voters) from public.chat_poll_results(array[m])) <> 2 then raise exception 'FALLO: cuántos votaron'; end if;
end $$;

-- Encuesta de varias opciones y encuesta cerrada.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.create_chat_poll('¿Qué traen?', array['Carne', 'Ensalada', 'Postre'], true, now() + interval '1 day');
do $$ declare m uuid; r record; begin
  select id into m from public.church_chat_messages where body = '¿Qué traen?';
  for r in select option_id from public.chat_poll_results(array[m]) where label in ('Carne', 'Postre') loop perform public.vote_chat_poll(r.option_id); end loop;
  if (select count(*) from public.chat_poll_results(array[m]) where mine) <> 2 then raise exception 'FALLO: la de varias opciones'; end if;
end $$;
reset role;
update public.chat_polls set closes_at = now() - interval '1 minute' where message_id = (select id from public.church_chat_messages where body = '¿Qué traen?');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ declare m uuid; begin
  select id into m from public.church_chat_messages where body = '¿Qué traen?';
  begin
    perform public.vote_chat_poll((select option_id from public.chat_poll_results(array[m]) limit 1));
    raise exception 'FALLO: votó en una encuesta cerrada';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- Borrar el mensaje se lleva la encuesta y sus votos.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.resolve_report(null::uuid, true) where false;
delete from public.church_chat_messages where kind = 'poll';
reset role;
do $$ begin
  if exists (select 1 from public.chat_poll_options) or exists (select 1 from public.chat_poll_votes) then raise exception 'FALLO: quedaron opciones o votos sueltos'; end if;
end $$;

-- Chat de la salida: foto sí, documento no.
insert into public.sessions (church_id, user_id, started_at) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', now() - interval '5 minutes');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.outing_chat_messages (kind, body, attachment_path, attachment_name) values ('image', 'Mirá la plaza', '10000000-0000-0000-0000-000000000001/plaza.jpg', 'plaza.jpg');
do $$ begin
  begin
    insert into public.outing_chat_messages (kind, body, attachment_path) values ('file', '', '10000000-0000-0000-0000-000000000001/x.pdf');
    raise exception 'FALLO: documento en el chat de la salida';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select count(*) from public.outing_chat_list() where kind = 'image') <> 1 then raise exception 'FALLO: no se ve la foto de la salida'; end if;
end $$;
reset role;
delete from public.sessions where ended_at is null;
delete from public.outing_chat_messages;
delete from public.church_chat_messages;
delete from public.notifications where kind in ('outing_chat');
