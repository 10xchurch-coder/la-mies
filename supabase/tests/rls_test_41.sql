\set ON_ERROR_STOP on
-- 0049: notas de estudio privadas.
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.study_notes;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.save_study_note('article', 'salvacion', 'Cómo ser salvo', 'Mi primera nota');
select public.save_study_note('article', 'salvacion', 'Cómo ser salvo', 'Nota editada');
do $$ begin
  if (select count(*) from public.study_notes) <> 1 then raise exception 'FALLO: debía haber 1 nota'; end if;
  if (select body from public.study_notes) <> 'Nota editada' then raise exception 'FALLO: no se actualizó'; end if;
  begin insert into public.study_notes (profile_id, kind, ref, body) values (auth.uid(), 'article', 'x', 'y'); raise exception 'FALLO: insertó directo';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if (select count(*) from public.study_notes) <> 0 then raise exception 'FALLO: ve notas ajenas'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.save_study_note('article', 'salvacion', 'Cómo ser salvo', '   ');
do $$ begin
  if (select count(*) from public.study_notes) <> 0 then raise exception 'FALLO: nota vacía debía borrarse'; end if;
end $$;
reset role;
