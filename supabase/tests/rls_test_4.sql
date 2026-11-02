\set ON_ERROR_STOP on
-- Parte 3: versículo del día, racha, cuentas desactivadas, DNI/bautismo.
set role authenticated;
-- La maestra Ana (miembro) lee el devocional dos días: la racha cuenta.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$
declare r jsonb; d public.daily_content;
begin
  d := public.daily_for(null);
  if d.id is null then raise exception 'FALLO: no hay versículo del día'; end if;
  if d.verse is null or d.reference is null then raise exception 'FALLO: versículo vacío'; end if;
  r := public.mark_reading();
  if (r->>'current')::int <> 1 or not (r->>'read_today')::boolean then raise exception 'FALLO: racha %', r; end if;
  insert into public.reading_log (user_id, on_date) select auth.uid(), min(on_date) - 1 from public.reading_log where user_id = auth.uid();
  r := public.reading_streak();
  if (r->>'current')::int <> 2 then raise exception 'FALLO: racha de 2 esperada, %', r; end if;
  -- No puede escribir lecturas de otro.
  begin
    insert into public.reading_log (user_id, on_date) values ('00000000-0000-0000-0000-0000000000c1', current_date);
    raise exception 'FALLO: anotó lectura ajena';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- Miembro no puede cargar contenido de la iglesia.
  begin
    insert into public.daily_content (on_date, reference, verse) values (current_date + 1, 'Juan 1:1', 'En el principio era el Verbo...');
    raise exception 'FALLO: miembro cargó devocional';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- Miembro no puede desactivar cuentas.
  begin
    perform public.set_account_disabled('00000000-0000-0000-0000-0000000000c1', true);
    raise exception 'FALLO: miembro desactivó una cuenta';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
-- La secretaria carga el devocional de mañana para la iglesia y gana sobre el general.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
insert into public.daily_content (on_date, reference, verse, devotional) values (current_date + 1, 'Juan 1:1', 'En el principio era el Verbo, y el Verbo era con Dios, y el Verbo era Dios.', 'Lectura de prueba.');
do $$ declare d public.daily_content; begin
  d := public.daily_for(current_date + 1);
  if d.reference <> 'Juan 1:1' or d.church_id is null then raise exception 'FALLO: no ganó el devocional de la iglesia'; end if;
  if (select count(*) from public.reading_board()) < 1 then raise exception 'FALLO: tablero de lectura vacío'; end if;
  if (select count(*) from public.accounts_overview()) < 1 then raise exception 'FALLO: resumen de cuentas vacío'; end if;
end $$;
-- Solo el pastor desactiva; la cuenta desactivada no ve la iglesia.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.set_account_disabled('00000000-0000-0000-0000-0000000000c2', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if public.current_church_id() is not null then raise exception 'FALLO: cuenta desactivada sigue viendo la iglesia'; end if;
  if (select count(*) from public.contacts) <> 0 then raise exception 'FALLO: cuenta desactivada ve contactos'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.set_account_disabled('00000000-0000-0000-0000-0000000000c2', false);
-- Bautismo y DNI en la ficha.
update public.contacts set baptized = true, dni = '12345678' where id = (select id from public.contacts order by created_at limit 1);
do $$ begin
  if (select count(*) from public.contacts where baptized) < 1 then raise exception 'FALLO: bautismo no se guardó'; end if;
end $$;
reset role;
select 'PARTE 3: TODAS LAS PRUEBAS PASARON' as resultado;
