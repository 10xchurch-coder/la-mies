-- Solo para el Postgres local: columnas y funciones que en Supabase ya existen (se agregaron sin migración en el repo).
alter table public.churches add column if not exists tracking_since date;
alter table public.contacts add column if not exists baseline text;
create or replace function public.followup_num(p_church uuid, p_key text, p_default int, p_min int, p_max int)
returns int language sql stable as $$ select p_default $$;
create or replace function public.people_out_between(p_church uuid, p_from timestamptz, p_to timestamptz)
returns integer language sql stable as $$ select 0 $$;
create or replace function public.extra_outings_between(p_church uuid, p_from timestamptz, p_to timestamptz)
returns integer language sql stable as $$ select 0 $$;
