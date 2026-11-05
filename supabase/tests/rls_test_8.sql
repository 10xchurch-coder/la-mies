\set ON_ERROR_STOP on
-- Devocional: comentarios del día, me gusta y días anteriores.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$
declare n int; cid uuid; s record;
begin
  -- Comentar hoy: sí. Comentar ayer: no (el chat del día dura 24 horas).
  insert into public.daily_comments (on_date, body) values (public.church_today(), 'Me habló mucho este versículo') returning id into cid;
  begin
    insert into public.daily_comments (on_date, body) values (public.church_today() - 1, 'Tarde');
    raise exception 'FALLO: se pudo comentar un día que ya cerró';
  exception when insufficient_privilege or check_violation then null;
    when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  if (select count(*) from public.daily_comments_list(public.church_today())) <> 1 then raise exception 'FALLO: lista de comentarios'; end if;
  if not (select mine from public.daily_comments_list(public.church_today()) limit 1) then raise exception 'FALLO: no marca el comentario propio'; end if;

  -- Me gusta.
  insert into public.daily_likes (on_date) values (public.church_today());
  select * into s from public.daily_social(public.church_today());
  if s.likes <> 1 or not s.liked or s.comments <> 1 or not s.open then raise exception 'FALLO: contadores del día (%)', s; end if;
  delete from public.daily_likes where on_date = public.church_today() and user_id = auth.uid();
  if (select likes from public.daily_social(public.church_today())) <> 0 then raise exception 'FALLO: no se pudo sacar el me gusta'; end if;
  begin
    insert into public.daily_likes (on_date) values (public.church_today() - 40);
    raise exception 'FALLO: me gusta de hace más de un mes';
  exception when insufficient_privilege or check_violation then null;
    when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- Días anteriores: como máximo 31, hoy primero.
  select count(*) into n from public.daily_range(60);
  if n > 31 then raise exception 'FALLO: devolvió % días (máximo 31)', n; end if;
end $$;

-- Otra persona de la misma iglesia no puede borrar el comentario ajeno; el pastor sí.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$
begin
  delete from public.daily_comments where on_date = public.church_today();
  if (select count(*) from public.daily_comments where on_date = public.church_today()) <> 1 then raise exception 'FALLO: borró un comentario ajeno'; end if;
end $$;

-- Alguien de otra iglesia no ve nada.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
begin
  if exists (select 1 from public.daily_comments) then raise exception 'FALLO: ve comentarios de otra iglesia'; end if;
  if (select count(*) from public.daily_comments_list(public.church_today())) <> 0 then raise exception 'FALLO: la lista muestra otra iglesia'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
begin
  delete from public.daily_comments where on_date = public.church_today();
  if exists (select 1 from public.daily_comments where on_date = public.church_today()) then raise exception 'FALLO: el pastor no pudo borrar'; end if;
end $$;
reset role;
select 'PARTE 8: TODAS LAS PRUEBAS PASARON' as resultado;
