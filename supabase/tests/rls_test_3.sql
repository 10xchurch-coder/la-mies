\set ON_ERROR_STOP on
-- la maestra Ana (miembro común) no puede tomar asistencia; la secretaria lo marca; ahora sí; él no puede marcarse solo.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if public.can_take_attendance() then raise exception 'FALLO: la maestra Ana ya podía tomar asistencia'; end if;
  begin
    update public.profiles set takes_attendance = true where id = auth.uid();
    raise exception 'FALLO: se marcó solo';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select public.set_takes_attendance('00000000-0000-0000-0000-0000000000c2', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if not public.can_take_attendance() then raise exception 'FALLO: la maestra Ana no puede tomar asistencia después de la marca'; end if;
end $$;
reset role;
select 'PARTE 2b: TODAS LAS PRUEBAS PASARON' as resultado;
