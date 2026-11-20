-- 0064: cada iglesia puede apagar las funciones de la app que no usa (finanzas, evangelismo en la calle, colectivo, etc.).
-- Se guarda la lista de lo APAGADO: lo que se agregue en el futuro nace prendido.
alter table public.churches add column if not exists disabled_features text[] not null default '{}';

-- Solo el pastor o el administrador de la app (quien da roles y permisos) prende y apaga.
create or replace function public.set_feature(p_key text, p_enabled boolean)
returns text[] language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_new text[];
begin
  if not public.has_perm('admin.permisos') then raise exception 'Solo el pastor o el administrador de la app'; end if;
  if p_key is null or p_key !~ '^[a-z_]{2,30}$' then raise exception 'Función desconocida'; end if;
  update public.churches
     set disabled_features = case when p_enabled then array_remove(disabled_features, p_key)
                                  when p_key = any(disabled_features) then disabled_features
                                  else array_append(disabled_features, p_key) end
   where id = v_church
   returning disabled_features into v_new;
  insert into public.audit_log (church_id, actor_id, action)
    values (v_church, auth.uid(), 'set_feature:' || p_key || ':' || case when p_enabled then 'on' else 'off' end);
  return v_new;
end $$;
revoke all on function public.set_feature(text, boolean) from public, anon;
grant execute on function public.set_feature(text, boolean) to authenticated;
