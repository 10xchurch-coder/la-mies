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

-- Pedidos pendientes, para la pantalla Cuentas (pastor y secretaría).
create or replace function public.account_deletion_requests()
returns table (id uuid, deletion_requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.deletion_requested_at
  from public.profiles p
  where public.is_staff() and p.church_id = public.current_church_id() and p.deletion_requested_at is not null
$$;
grant execute on function public.account_deletion_requests() to authenticated;
