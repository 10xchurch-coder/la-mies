\set ON_ERROR_STOP on
-- 0042: un miembro con turno en una clase toma asistencia sin permiso general.
reset role;
insert into public.classes (id, church_id, name) values ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'Clase prueba');
insert into public.contacts (id, church_id, created_by, name, status) values ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Alumno', 'member');
insert into public.class_students (class_id, contact_id) values ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  begin
    insert into public.class_attendance (church_id, class_id, on_date, contact_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000b1', current_date, '20000000-0000-0000-0000-0000000000b1');
    raise exception 'FALLO: tomó asistencia sin turno';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if exists (select 1 from public.class_students where class_id = '30000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO: ve alumnos sin turno'; end if;
end $$;
reset role;
insert into public.class_schedule (church_id, class_id, on_date, teacher_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000b1', current_date, '00000000-0000-0000-0000-0000000000c5');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
insert into public.class_attendance (church_id, class_id, on_date, contact_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000b1', current_date, '20000000-0000-0000-0000-0000000000b1');
do $$ begin
  if not exists (select 1 from public.class_students where class_id = '30000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO: con turno no ve alumnos'; end if;
end $$;
reset role;
delete from public.classes where id = '30000000-0000-0000-0000-0000000000b1';
delete from public.contacts where id = '20000000-0000-0000-0000-0000000000b1';
-- teacher_prefs: el admin guarda, un miembro no
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.teacher_prefs (profile_id, church_id, per_month) values ('00000000-0000-0000-0000-0000000000c5', '10000000-0000-0000-0000-000000000001', 2);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  begin
    update public.teacher_prefs set per_month = 5 where profile_id = '00000000-0000-0000-0000-0000000000c5';
    if found then raise exception 'FALLO: un miembro cambió su límite'; end if;
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
delete from public.teacher_prefs where profile_id = '00000000-0000-0000-0000-0000000000c5';
