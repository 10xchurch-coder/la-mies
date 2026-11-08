\set ON_ERROR_STOP on
-- 0034: eventos con detalle e inscripción.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
insert into public.events (title, starts_at, registration, reg_price, cost) values ('Conferencia de prueba', now() + interval '10 days', true, 1000, '$1.000');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
do $$ declare e uuid; begin
  select id into e from public.events where title = 'Conferencia de prueba';
  insert into public.event_registrations (event_id, occurs_on, name, people, paid_amount) values (e, current_date + 10, 'Miembro', 2, 2000);
  if (select paid_amount from public.event_registrations where event_id = e) <> 0 then raise exception 'FALLO: un miembro se marcó pagado'; end if;
  if public.event_registration_count(e, current_date + 10) <> 2 then raise exception 'FALLO: cuenta de inscriptos'; end if;
  begin update public.events set cost = 'gratis' where id = e;
    if (select cost from public.events where id = e) = 'gratis' then raise exception 'FALLO: un miembro editó el evento'; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  if exists (select 1 from public.event_registrations) then raise exception 'FALLO: ve inscripciones ajenas'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  update public.event_registrations set paid_amount = 2000;
  if (select paid_amount from public.event_registrations limit 1) <> 2000 then raise exception 'FALLO: la secretaría no pudo marcar el pago'; end if;
end $$;
reset role;
