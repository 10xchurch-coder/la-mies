-- Solo para probar las migraciones en un Postgres local (no se corre en Supabase).
-- Imita lo mínimo del esquema "auth" de Supabase.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  last_sign_in_at timestamptz
);
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  status text
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to service_role;
