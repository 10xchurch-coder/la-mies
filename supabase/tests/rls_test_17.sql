\set ON_ERROR_STOP on
-- 0023: denunciar y bloquear.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
insert into public.daily_comments (on_date, body) values (public.church_today(), 'Comentario feo');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ declare cid uuid; begin
  select id into cid from public.daily_comments_list(public.church_today()) where body = 'Comentario feo';
  if cid is null then raise exception 'FALLO: no ve el comentario'; end if;
  insert into public.content_reports (kind, target_id, author_id, excerpt, reason) values ('comment', cid, '00000000-0000-0000-0000-0000000000c2', 'Comentario feo', 'Ofensivo');
  insert into public.user_blocks (blocked_id) values ('00000000-0000-0000-0000-0000000000c2');
  if exists (select 1 from public.daily_comments_list(public.church_today()) where body = 'Comentario feo') then raise exception 'FALLO: sigue viendo a quien bloqueó'; end if;
  begin perform public.resolve_report((select id from public.content_reports limit 1), true); raise exception 'FALLO: un miembro resolvió una denuncia';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
-- el pastor recibe el aviso y borra el comentario
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if not exists (select 1 from public.notifications where user_id = auth.uid() and title = 'Contenido denunciado') then raise exception 'FALLO: no avisó al pastor'; end if;
  perform public.resolve_report((select id from public.content_reports where status = 'open' limit 1), true);
  if exists (select 1 from public.daily_comments where body = 'Comentario feo') then raise exception 'FALLO: no se borró'; end if;
end $$;
-- oración anónima: no se ve quién la pidió
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
insert into public.prayer_requests (body, visibility, anonymous) values ('Pedido anónimo', 'church', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if exists (select 1 from public.prayer_list() where body = 'Pedido anónimo' and user_id is not null) then raise exception 'FALLO: el anónimo deja ver quién fue'; end if;
end $$;
reset role;
