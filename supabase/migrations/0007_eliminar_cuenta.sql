-- ============================================================================
-- La Mies · Pedido de eliminación de cuenta (lo exige Google Play).
-- La persona lo pide desde Ajustes; el pastor y la secretaría reciben un aviso
-- y lo ven en Cuentas. Se puede correr más de una vez.
-- ============================================================================
alter table public.profiles add column if not exists deletion_requested_at timestamptz;

create or replace function public.request_account_deletion()
returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.profiles;
begin
  select * into v_p from public.profiles where id = auth.uid();
  if v_p.id is null then raise exception 'No hay sesión'; end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set deletion_requested_at = now(), push_token = null where id = v_p.id;
  perform set_config('lamies.bypass_guard', 'off', true);
  if v_p.church_id is not null then
    insert into public.notifications (church_id, user_id, kind, title, body, link)
    select v_p.church_id, p.id, 'account', 'Pedido de eliminar cuenta',
           v_p.display_name || ' pidió eliminar su cuenta de La Mies. Hay que hacerlo dentro de los 10 días hábiles.',
           '/admin/cuentas'
    from public.profiles p
    where p.church_id = v_p.church_id and p.role::text in ('admin', 'secretary') and p.id <> v_p.id;
    insert into public.audit_log (church_id, actor_id, action, target)
    values (v_p.church_id, v_p.id, 'request_account_deletion', v_p.id::text);
  end if;
end $$;
grant execute on function public.request_account_deletion() to authenticated;

drop function if exists public.accounts_overview();
create or replace function public.accounts_overview()
returns table (id uuid, display_name text, email text, role text, disabled_at timestamptz, has_mfa boolean,
               last_sign_in timestamptz, deletion_requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.role::text, p.disabled_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
         u.last_sign_in_at, p.deletion_requested_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_staff() and p.church_id = public.current_church_id()
  order by p.deletion_requested_at desc nulls last, p.display_name
$$;
grant execute on function public.accounts_overview() to authenticated;
