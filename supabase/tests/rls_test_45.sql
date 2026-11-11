\set ON_ERROR_STOP on
-- 0053: ubicación, tildes y privacidad del chat.
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.church_chat_messages; delete from public.chat_reads; delete from public.chat_settings;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$
declare a uuid; b uuid;
begin
  a := public.chat_send_location('church', null, -27.36, -55.89, null, 'Plaza');
  b := public.chat_send_location('church', null, -27.36, -55.89, 15, '');
  if not exists (select 1 from public.church_chat_list() where id = a and kind = 'location' and body = 'Plaza') then raise exception 'FALLO: no se ve la ubicación'; end if;
  if not exists (select 1 from public.church_chat_list() where id = b and kind = 'live' and live_until > now()) then raise exception 'FALLO: no se ve la ubicación en vivo'; end if;
  begin perform public.chat_send_location('church', null, -27.36, -55.89, 20, ''); raise exception 'FALLO: aceptó 20 minutos';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.chat_send_location('church', null, 95, 0, null, ''); raise exception 'FALLO: aceptó latitud 95';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if not public.chat_live_update('church', b, -27.37, -55.90) then raise exception 'FALLO: no actualizó la mía'; end if;
  if (select lat from public.church_chat_list() where id = b) <> -27.37 then raise exception 'FALLO: no se movió'; end if;
  perform set_config('test.live', b::text, false);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  if public.chat_live_update('church', current_setting('test.live')::uuid, 0, 0) then raise exception 'FALLO: movió la ubicación de otro'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  perform public.chat_live_stop('church', current_setting('test.live')::uuid);
  if public.chat_live_update('church', current_setting('test.live')::uuid, 1, 1) then raise exception 'FALLO: siguió después de parar'; end if;
end $$;

-- Tildes: c3 abre el chat → c2 ve que c3 lo vio.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
select public.chat_mark_read('church');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if not exists (select 1 from public.chat_receipts('church') where name = 'Recepción Juan' and delivered_at is not null and read_at is not null) then raise exception 'FALLO: no ve que lo vieron'; end if;
end $$;
-- c3 apaga las confirmaciones: c2 ya no ve "visto" de c3.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
select public.chat_set_privacy(true, false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if not exists (select 1 from public.chat_receipts('church') where name = 'Recepción Juan' and delivered_at is not null and read_at is null) then raise exception 'FALLO: mostró visto con confirmaciones apagadas'; end if;
end $$;
-- Y si c2 las apaga, tampoco ve a nadie.
select public.chat_set_privacy(true, false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
select public.chat_set_privacy(true, true);
select public.chat_mark_read('church');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if exists (select 1 from public.chat_receipts('church') where read_at is not null) then raise exception 'FALLO: vio "visto" con mis confirmaciones apagadas'; end if;
end $$;

-- Ministerio: solo los del grupo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ declare m uuid := (select id from public.ministries where name = 'Recepción' limit 1);
begin
  perform public.chat_send_location('ministry', m, -27.36, -55.89, null, 'Acá');
  if not exists (select 1 from public.ministry_chat_list(m) where kind = 'location') then raise exception 'FALLO: el líder no ve la ubicación del ministerio'; end if;
  perform set_config('test.min', m::text, false);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if exists (select 1 from public.ministry_chat_list(current_setting('test.min')::uuid)) then raise exception 'FALLO: ajeno ve el chat del ministerio'; end if;
  begin perform public.chat_send_location('ministry', current_setting('test.min')::uuid, 1, 1, null, ''); raise exception 'FALLO: ajeno escribió';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
