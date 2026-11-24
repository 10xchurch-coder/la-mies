-- 1) El versículo del día en la Biblia de cada iglesia.
--    true: se muestra como se escribió (Reina-Valera 1960). false: en la versión que la iglesia puso de inicio.
--    La iglesia anfitriona lo deja como se escribió; las demás, en su versión.
alter table public.churches add column if not exists daily_verse_written boolean not null default false;
update public.churches set daily_verse_written = true where id = public.central_host() and daily_verse_written = false;

-- 2) El equipo de La Mies puede prender o apagar una función de otra iglesia (para ayudar sin tener que explicar dónde está).
--    Queda anotado en la ficha de la iglesia y en el registro, y al pastor le llega un aviso.
create or replace function public.central_set_feature(p_church uuid, p_feature text, p_on boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare v_off text[]; v_new text[]; v_key text := btrim(coalesce(p_feature, ''));
begin
  if public.central_role() is null then raise exception 'Solo el equipo de La Mies'; end if;
  if p_church is null or public.is_demo_church(p_church) or not exists (select 1 from public.churches c where c.id = p_church) then raise exception 'Elegí otra iglesia'; end if;
  if v_key !~ '^[a-z_]{2,30}$' or p_on is null then raise exception 'Elegí la función'; end if;
  select coalesce(disabled_features, '{}') into v_off from public.churches where id = p_church for update;
  if p_on then v_new := array_remove(v_off, v_key);
  elsif v_key = any (v_off) then v_new := v_off;
  else v_new := v_off || v_key; end if;
  if v_new is not distinct from v_off then return v_off; end if;
  update public.churches set disabled_features = v_new where id = p_church;
  perform public.notify(p.id, 'central', 'El equipo de La Mies cambió una función',
      'Te ' || case when p_on then 'prendimos' else 'apagamos' end || ' una función de la app. La podés ver y cambiar en Funciones de la iglesia.', '/admin/funciones')
    from public.profiles p where p.church_id = p_church and p.role::text = 'admin' and p.disabled_at is null and p.id <> auth.uid();
  insert into public.central_church_notes (church_id, author, kind, body)
    values (p_church, auth.uid(), 'sugerencia', 'El equipo ' || case when p_on then 'prendió' else 'apagó' end || ' la función "' || v_key || '".');
  insert into public.audit_log (church_id, actor_id, action, target, details)
    values (public.central_host(), auth.uid(), 'central_set_feature', p_church::text, jsonb_build_object('feature', v_key, 'on', p_on));
  insert into public.audit_log (church_id, actor_id, action, details)
    values (p_church, auth.uid(), 'set_feature:' || v_key || ':central', jsonb_build_object('on', p_on));
  return v_new;
end $$;
revoke all on function public.central_set_feature(uuid, text, boolean) from public, anon;
grant execute on function public.central_set_feature(uuid, text, boolean) to authenticated;

-- 3) La iglesia de muestra dice que está en Posadas (el mapa ya muestra sus calles).
update public.churches set city = 'Posadas' where public.is_demo_church(id) and city = 'Ciudad de ejemplo';
