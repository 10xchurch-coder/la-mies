-- 08_informes · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)
begin;
set local session_replication_role = replica;
set local session_replication_role = origin;
select public.run_weekly_report(demo_c(), ((current_date - extract(dow from current_date)::int) - 7 * g + time '21:00')::timestamp) from generate_series(1, 6) g;
commit;
