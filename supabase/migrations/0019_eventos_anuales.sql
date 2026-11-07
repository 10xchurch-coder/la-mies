-- 0019: eventos que se repiten todos los años (aniversario, etc.).
alter table public.events add column if not exists yearly boolean not null default false;
