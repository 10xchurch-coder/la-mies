\set ON_ERROR_STOP on
-- 0056: informe de finanzas para miembros mayores de 18. c5 = miembro común sin permisos de finanzas.
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.churches set fin_report_members = false;
do $$
declare ch uuid;
begin
  select church_id into ch from public.profiles where id = '00000000-0000-0000-0000-0000000000c1';
  perform set_config('test.old5', coalesce((select status || '|' || coalesce(birthdate::text, '') from public.contacts where profile_id = '00000000-0000-0000-0000-0000000000c5'), ''), false);
  update public.contacts set status = 'member', birthdate = date '1980-01-01', archived = false where profile_id = '00000000-0000-0000-0000-0000000000c5';
  if not found then
    insert into public.contacts (church_id, created_by, name, lat, lng, status, birthdate, profile_id)
    values (ch, '00000000-0000-0000-0000-0000000000c1', 'Adulto 48', 0, 0, 'member', date '1980-01-01', '00000000-0000-0000-0000-0000000000c5');
  end if;
  if not public.is_adult_member('00000000-0000-0000-0000-0000000000c5') then raise exception 'FALLO: el adulto no cuenta como adulto'; end if;
  if public.run_fin_member_reports(ch, timestamp '2031-04-10 10:05') <> 0 then raise exception 'FALLO: avisó estando apagado'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  if (public.fin_member_report_state()->>'enabled')::boolean then raise exception 'FALLO: arrancó encendido'; end if;
  begin perform * from public.fin_member_report(current_date - 120, current_date - 30); raise exception 'FALLO: lo vio estando apagado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.set_fin_member_report(true); raise exception 'FALLO: un miembro lo encendió';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select public.set_fin_member_report(true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  perform * from public.fin_member_report(current_date - 120, current_date - 30);
  if not (public.fin_member_report_state()->>'eligible')::boolean then raise exception 'FALLO: no figura como habilitado'; end if;
  begin perform * from public.fin_member_report(current_date - 30, current_date); raise exception 'FALLO: vio un período sin cerrar';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
update public.contacts set birthdate = current_date - 3000 where profile_id = '00000000-0000-0000-0000-0000000000c5';
set role authenticated;
do $$ begin
  begin perform * from public.fin_member_report(current_date - 120, current_date - 30); raise exception 'FALLO: un menor vio el informe';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.churches set fin_report_members = false;
delete from public.contacts where name = 'Adulto 48';
update public.contacts set status = split_part(current_setting('test.old5'), '|', 1), birthdate = nullif(split_part(current_setting('test.old5'), '|', 2), '')::date
 where profile_id = '00000000-0000-0000-0000-0000000000c5' and current_setting('test.old5') <> '';
\echo 'rls_test_48 OK'
