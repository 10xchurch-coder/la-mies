\set ON_ERROR_STOP on
-- 0060: reuniones y actividades semanales que no se hicieron ("no hubo").
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.cancellations;
select null from set_config('test.sat_svc', (select id::text from public.church_services where church_id = '10000000-0000-0000-0000-000000000001' and name = 'Culto del sábado'), false);
select null from set_config('test.sun_svc', (select id::text from public.church_services where church_id = '10000000-0000-0000-0000-000000000001' and name = 'Culto del domingo'), false);
-- Un sábado pasado de prueba y una actividad semanal ese viernes.
select null from set_config('test.sat', (current_date - 14 - ((extract(dow from current_date)::int + 1) % 7))::text, false);
insert into public.events (id, church_id, title, starts_at, weekly)
values ('59000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Evangelismo personal',
        ((current_setting('test.sat')::date - 1)::text || ' 17:00:00-03')::timestamptz, true)
on conflict (id) do nothing;
insert into public.contacts (id, church_id, created_by, name, status, created_at)
values ('59000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Fiel de prueba', 'member', now() - interval '60 days')
on conflict (id) do nothing;
-- Vino el domingo anterior al sábado de prueba.
insert into public.attendances (church_id, contact_id, attended_on, service, service_id, recorded_by)
values ('10000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-0000000000a1', current_setting('test.sat')::date - 6, 'sun', current_setting('test.sun_svc')::uuid, '00000000-0000-0000-0000-00000000000a');

set role authenticated;
-- Marcos (sin permisos) no puede marcar.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  begin perform public.set_cancelled(current_setting('test.sat_svc')::uuid, null, current_setting('test.sat')::date, true);
    raise exception 'FALLO: Marcos marcó una reunión';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- Lucía toma asistencia: puede marcar reuniones, no actividades del calendario.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
declare v_sat date := current_setting('test.sat')::date;
begin
  perform public.set_attendance('59000000-0000-0000-0000-0000000000a1', v_sat, current_setting('test.sat_svc')::uuid, true);
  begin perform public.set_cancelled(current_setting('test.sat_svc')::uuid, null, v_sat, true);
    raise exception 'FALLO: marcó "no hubo" con presentes cargados';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform public.set_attendance('59000000-0000-0000-0000-0000000000a1', v_sat, current_setting('test.sat_svc')::uuid, false);
  perform public.set_cancelled(current_setting('test.sat_svc')::uuid, null, v_sat, true, 'Lluvia');
  perform public.set_cancelled(current_setting('test.sat_svc')::uuid, null, v_sat, true, 'Tormenta');  -- dos veces no rompe
  if (select count(*) from public.cancellations) <> 1 then raise exception 'FALLO: se duplicó'; end if;
  begin perform public.set_attendance('59000000-0000-0000-0000-0000000000a1', v_sat, current_setting('test.sat_svc')::uuid, true);
    raise exception 'FALLO: tomó asistencia en una reunión que no hubo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.set_cancelled(current_setting('test.sat_svc')::uuid, null, v_sat + 1, true);
    raise exception 'FALLO: aceptó un día que no es sábado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.set_cancelled(null, '59000000-0000-0000-0000-000000000001', v_sat - 1, true);
    raise exception 'FALLO: Lucía suspendió una actividad del calendario';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin insert into public.cancellations (on_date, service_id) values (v_sat + 1, current_setting('test.sun_svc')::uuid);
    raise exception 'FALLO: escribió directo en la tabla';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- El pastor: fidelidad, ausencias e informe.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare v_sat date := current_setting('test.sat')::date; p1 int; p2 int; r jsonb; n1 int; n2 int;
begin
  select possible into p1 from public.people_engagement(12) where contact_id = '59000000-0000-0000-0000-0000000000a1';
  select count(*) into n1 from public.weekend_absences(v_sat);
  perform public.set_cancelled(null, '59000000-0000-0000-0000-000000000001', v_sat - 1, true);
  perform public.set_cancelled(current_setting('test.sun_svc')::uuid, null, v_sat + 1, true);
  select possible into p2 from public.people_engagement(12) where contact_id = '59000000-0000-0000-0000-0000000000a1';
  if p2 <> p1 - 1 then raise exception 'FALLO: la fidelidad sigue contando el domingo que no hubo (% → %)', p1, p2; end if;
  if n1 = 0 then raise exception 'FALLO: la prueba necesita ausentes antes de suspender'; end if;
  if exists (select 1 from public.weekend_absences(v_sat)) then raise exception 'FALLO: hay ausentes en un fin de semana sin reunión'; end if;
  r := public.weekly_report(null, v_sat + 2);
  if (r->>'absent')::int <> 0 or not (r->>'weekend_cancelled')::boolean then raise exception 'FALLO: el informe cuenta ausentes: %', r->>'absent'; end if;
  if jsonb_array_length(r->'cancelled') <> 3 then raise exception 'FALLO: el informe no lista lo suspendido: %', r->'cancelled'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'services') s where s->>'name' = 'Culto del sábado' and (s->>'cancelled')::boolean) then raise exception 'FALLO: el culto del sábado no figura como "no hubo"'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'cancelled') s where s->>'name' = 'Evangelismo personal' and s->>'kind' = 'event') then raise exception 'FALLO: falta Evangelismo personal'; end if;
  -- El fin de semana sin reunión no suma semanas de ausencia al fin de semana siguiente.
  if (select true from public.weekend_absences(v_sat + 7) where contact_id = '59000000-0000-0000-0000-0000000000a1' and weeks_missed = 1) is distinct from true then
    raise exception 'FALLO: contó el fin de semana sin reunión como falta';
  end if;
  -- Desmarcar vuelve todo atrás.
  perform public.set_cancelled(current_setting('test.sun_svc')::uuid, null, v_sat + 1, false);
  if not exists (select 1 from public.weekend_absences(v_sat)) then raise exception 'FALLO: desmarcar no volvió a mostrar ausentes'; end if;
end $$;

-- Otra iglesia no ve nada de esto.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if exists (select 1 from public.cancellations) then raise exception 'FALLO: otra iglesia ve las fechas suspendidas'; end if;
  begin perform public.set_cancelled(current_setting('test.sat_svc')::uuid, null, current_setting('test.sat')::date, false);
    raise exception 'FALLO: otra iglesia tocó una reunión ajena';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.cancellations;
delete from public.events where id = '59000000-0000-0000-0000-000000000001';
delete from public.contacts where id = '59000000-0000-0000-0000-0000000000a1';
\echo '✔ 0060 reuniones que no se hicieron'
