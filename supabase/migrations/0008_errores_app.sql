-- ============================================================================
-- La Mies · Registro de errores de la app (para arreglarlos sin tener el teléfono en la mano).
-- Cada persona solo puede anotar; nadie los lee desde la app (se leen desde la base).
-- ============================================================================
create table if not exists public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  church_id   uuid references public.churches(id) on delete set null,
  platform    text,
  app_version text,
  message     text not null,
  stack       text,
  info        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
grant all on public.app_errors to service_role;

create or replace function public.log_app_error(p_message text, p_stack text default null, p_info jsonb default null,
                                                p_platform text default null, p_version text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_errors (user_id, church_id, platform, app_version, message, stack, info)
  values (auth.uid(), (select church_id from public.profiles where id = auth.uid()), p_platform, p_version,
          left(coalesce(p_message, 'sin mensaje'), 2000), left(p_stack, 8000), p_info);
  -- Se guardan como máximo 2000; los más viejos se van borrando.
  delete from public.app_errors where id in (select id from public.app_errors order by created_at desc offset 2000);
end $$;
grant execute on function public.log_app_error(text, text, jsonb, text, text) to authenticated, anon;
