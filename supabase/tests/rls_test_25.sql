\set ON_ERROR_STOP on
-- 0033: hijos con ficha propia.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ declare pa uuid; ma uuid; kid uuid; n int; begin
  insert into public.contacts (church_id, created_by, name, status) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Papá Prueba', 'member') returning id into pa;
  insert into public.contacts (church_id, created_by, name, status) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Mamá Prueba', 'member') returning id into ma;
  update public.contacts set spouse_id = ma where id = pa;
  insert into public.contacts (church_id, created_by, name, status) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Hijo Ya Cargado', 'visitor') returning id into kid;
  -- un hijo nuevo (se crea su ficha) y uno que ya estaba
  perform public.set_family_children(pa, jsonb_build_array(jsonb_build_object('name', 'bebé nuevo', 'age', 1), jsonb_build_object('child_contact_id', kid)));
  select count(*) into n from public.family_children(ma);
  if n <> 2 then raise exception 'FALLO: la mamá ve % hijos, esperaba 2', n; end if;
  if not exists (select 1 from public.contacts where name = 'Bebé Nuevo' and status = 'member' and age = 1) then raise exception 'FALLO: no se creó la ficha del bebé como miembro'; end if;
  if (select count(*) from public.family_children(pa) where child_contact_id is null) > 0 then raise exception 'FALLO: hijo sin ficha'; end if;
  -- editar desde la mamá: queda una sola lista
  perform public.set_family_children(ma, (select jsonb_agg(jsonb_build_object('child_contact_id', child_contact_id)) from public.family_children(ma)));
  select count(*) into n from public.contact_children where contact_id in (pa, ma);
  if n <> 2 then raise exception 'FALLO: los hijos quedaron repetidos (%)', n; end if;
  if not exists (select 1 from public.family_parents(kid) where id = pa) then raise exception 'FALLO: el hijo no conoce a sus padres'; end if;
end $$;
-- un miembro común no puede tocar hijos de una familia ajena
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  begin perform public.set_family_children((select id from public.contacts where name = 'Papá Prueba'), '[]'::jsonb); raise exception 'FALLO: editó una familia ajena';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
