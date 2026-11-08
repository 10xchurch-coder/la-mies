-- 0038: Copia de seguridad semanal dentro de la base.
--  Cada lunes a las 3 (hora de Argentina) se guarda una foto completa de cada iglesia en church_backups.
--  Se guardan las últimas 12 (unos tres meses). Solo el servicio puede leerlas o restaurar desde ellas.
--  Protege contra borrados o cambios por error. No reemplaza una copia fuera de Supabase.
create table if not exists public.church_backups (
  id         bigserial primary key,
  church_id  uuid not null references public.churches(id) on delete cascade,
  created_at timestamptz not null default now(),
  data       jsonb not null,
  bytes      integer not null
);
create index if not exists church_backups_church on public.church_backups (church_id, created_at desc);
alter table public.church_backups enable row level security;
revoke all on public.church_backups from anon, authenticated;

create or replace function public.run_weekly_backups() returns integer
language plpgsql security definer set search_path = public as $$
declare c record; d jsonb; n integer := 0;
begin
  for c in select id from public.churches loop
    d := public.export_church_backup(c.id);
    insert into public.church_backups (church_id, data, bytes) values (c.id, d, length(d::text));
    delete from public.church_backups b where b.church_id = c.id
      and b.id not in (select id from public.church_backups where church_id = c.id order by created_at desc limit 12);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_weekly_backups() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'lamies-copias';
    perform cron.schedule('lamies-copias', '0 6 * * 1', 'select public.run_weekly_backups()');
  end if;
end $$;
