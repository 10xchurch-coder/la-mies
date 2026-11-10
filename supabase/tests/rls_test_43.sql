\set ON_ERROR_STOP on
-- 0051: importar personas.
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  begin perform public.import_people('[{"name":"Ana"}]'::jsonb); raise exception 'FALLO: un no-staff importó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$
declare r jsonb; n0 int; rows jsonb := '[
  {"name":"Zoe Importada","phone":"+54 9 376 400-1111","email":"ZOE@x.com","birthdate":"1990-05-03","sex":"f","marital":"married"},
  {"name":"Zoe Importada Repetida","phone":"376 4001111"},
  {"name":"Sin Celular Uno"},
  {"name":"  sin   celular uno "},
  {"name":""},
  {"phone":"3764005555"}
]'::jsonb;
begin
  select count(*) into n0 from public.contacts;
  r := public.import_people(rows, 'member', date '2020-01-01', false);
  if (r->>'new')::int <> 2 or (r->>'duplicates')::int <> 2 or (r->>'invalid')::int <> 2 then raise exception 'FALLO: vista previa %', r; end if;
  if (select count(*) from public.contacts) <> n0 then raise exception 'FALLO: la vista previa creó fichas'; end if;
  r := public.import_people(rows, 'member', date '2020-01-01', true);
  if (select count(*) from public.contacts) <> n0 + 2 then raise exception 'FALLO: no creó 2 fichas'; end if;
  if not exists (select 1 from public.contacts where name = 'Zoe Importada' and status = 'member' and member_since = date '2020-01-01' and email = 'zoe@x.com' and sex = 'f' and marital = 'married' and birthdate = date '1990-05-03') then raise exception 'FALLO: campos mal guardados'; end if;
  r := public.import_people(rows, 'member', null, true);
  if (r->>'new')::int <> 0 then raise exception 'FALLO: importar dos veces duplicó %', r; end if;
end $$;
reset role;
