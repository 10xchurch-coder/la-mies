-- 0088: cada función de la app se prende o se apaga por iglesia, también en el servidor.
-- · Las funciones nuevas (partes separadas de otras) heredan el estado que tenía la función de la que salieron.
-- · Los avisos y las tareas programadas respetan lo que cada iglesia apagó.
-- · Las ofrendas por persona apagadas no se pueden anotar ni leer.
-- · Cada iglesia elige qué versiones de la Biblia usa su gente.
-- Apagar una función NO borra ningún dato: al prenderla, todo vuelve como estaba. Todo acá es aditivo.

-- ---------- 1. Padres e hijos (igual que en src/lib/features.ts; hay una prueba que lo compara) ----------
create or replace function public.feature_parent(p_key text) returns text
language sql immutable set search_path to 'public' as $$
  select case p_key
    when 'evang_zonas' then 'evangelismo'
    when 'evang_tablero' then 'evangelismo'
    when 'colectivo_paradas' then 'colectivo'
    when 'colectivo_vivo' then 'colectivo'
    when 'ausencias' then 'asistencia'
    when 'fidelidad' then 'asistencia'
    when 'asistencia_chips' then 'asistencia'
    when 'clase_lecciones' then 'clases'
    when 'clase_versiculos' then 'clases'
    when 'predica_notas' then 'predicas'
    when 'biblia_buscar' then 'biblia'
    when 'biblia_referencias' then 'biblia'
    when 'biblia_originales' then 'biblia'
    when 'biblia_marcas' then 'biblia'
    when 'biblia_imagen' then 'biblia'
    when 'biblia_audio' then 'biblia'
    when 'evento_plan' then 'eventos'
    when 'evento_puerta' then 'eventos'
    when 'evento_credenciales' then 'eventos'
    when 'evento_contador' then 'eventos'
    when 'oracion_respondidas' then 'oracion'
    else null end
$$;

-- ¿Está prendida esta función en esta iglesia? Una parte está apagada si ella o su función principal están apagadas.
-- Con una clave vacía (algo que es de la base de la app) siempre da verdadero.
create or replace function public.feature_on(p_church uuid, p_key text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select not (p_key = any(c.disabled_features)) and not (coalesce(public.feature_parent(p_key), '') = any(c.disabled_features))
    from public.churches c where c.id = p_church), true)
$$;
revoke all on function public.feature_on(uuid, text) from public, anon;
grant execute on function public.feature_on(uuid, text) to authenticated, service_role;

-- ---------- 2. A qué función pertenece cada pantalla (para saber de qué función es un aviso por su enlace) ----------
create table if not exists public.feature_routes (
  route   text primary key,
  feature text not null
);
alter table public.feature_routes enable row level security;
revoke all on table public.feature_routes from anon, authenticated, public;

insert into public.feature_routes (route, feature) values
  ('/mapa', 'evangelismo'),
  ('/salida', 'evangelismo'),
  ('/salidas', 'evangelismo'),
  ('/salida-chat', 'evangelismo'),
  ('/salieron', 'evangelismo'),
  ('/equipo', 'evangelismo'),
  ('/vereda', 'evangelismo'),
  ('/recortar', 'evangelismo'),
  ('/resumen', 'evangelismo'),
  ('/ubicacion', 'evangelismo'),
  ('/contacto/nuevo', 'evangelismo'),
  ('/zonas', 'evang_zonas'),
  ('/zona', 'evang_zonas'),
  ('/tablero', 'evang_tablero'),
  ('/progreso', 'evang_tablero'),
  ('/seguimiento', 'seguimiento'),
  ('/admin/seguimiento', 'seguimiento'),
  ('/bienvenida', 'bienvenida'),
  ('/tarjeta-visita', 'tarjeta_visita'),
  ('/visita', 'tarjeta_visita'),
  ('/decisiones', 'decisiones'),
  ('/discipulado', 'discipulado'),
  ('/clase-miembros', 'clase_miembros'),
  ('/colectivo', 'colectivo'),
  ('/colectivo-paradas', 'colectivo_paradas'),
  ('/colectivo-vivo', 'colectivo_vivo'),
  ('/asistencia', 'asistencia'),
  ('/suspender', 'asistencia'),
  ('/escritorio/asistencia', 'asistencia'),
  ('/ausencias', 'ausencias'),
  ('/fidelidad', 'fidelidad'),
  ('/asistencia-chip', 'asistencia_chips'),
  ('/chips', 'asistencia_chips'),
  ('/culto', 'culto'),
  ('/presentar', 'presentar'),
  ('/ninos', 'ninos'),
  ('/clases', 'clases'),
  ('/clase', 'clases'),
  ('/clase/leccion', 'clase_lecciones'),
  ('/clase/lecciones', 'clase_lecciones'),
  ('/clase/versiculos', 'clase_versiculos'),
  ('/ministerios', 'ministerios'),
  ('/ministerio', 'ministerios'),
  ('/predicas', 'predicas'),
  ('/t-predicas', 'predicas'),
  ('/predica', 'predicas'),
  ('/predica/mis-notas', 'predica_notas'),
  ('/vivo', 'vivo'),
  ('/preguntas', 'preguntas'),
  ('/biblia', 'biblia'),
  ('/biblia/buscar', 'biblia_buscar'),
  ('/biblia/concordancia', 'biblia_buscar'),
  ('/biblia/marcas', 'biblia_marcas'),
  ('/biblia/imagen', 'biblia_imagen'),
  ('/devocional', 'devocional'),
  ('/admin/devocionales', 'devocional'),
  ('/plan-lectura', 'plan_lectura'),
  ('/crecimiento', 'crecimiento'),
  ('/t-crecimiento', 'crecimiento'),
  ('/materiales', 'biblioteca'),
  ('/material', 'biblioteca'),
  ('/capacitacion', 'biblioteca'),
  ('/notas', 'biblioteca'),
  ('/anuncios', 'anuncios'),
  ('/eventos', 'eventos'),
  ('/t-eventos', 'eventos'),
  ('/evento', 'eventos'),
  ('/e', 'eventos'),
  ('/evento/plan', 'evento_plan'),
  ('/evento/puerta', 'evento_puerta'),
  ('/evento/sesion', 'evento_puerta'),
  ('/evento/boleto', 'evento_puerta'),
  ('/evento/credenciales', 'evento_credenciales'),
  ('/evento/contador', 'evento_contador'),
  ('/oracion', 'oracion'),
  ('/t-oracion', 'oracion'),
  ('/oraciones-respondidas', 'oracion_respondidas'),
  ('/chat', 'chat'),
  ('/t-chat', 'chat'),
  ('/mensajes', 'mensajes'),
  ('/pastor-hilo', 'mensajes_pastor'),
  ('/pastor-bandeja', 'mensajes_pastor'),
  ('/directorio', 'directorio'),
  ('/t-directorio', 'directorio'),
  ('/cumples', 'cumples'),
  ('/sugerencias', 'sugerencias'),
  ('/misioneros', 'misioneros'),
  ('/familia-ubicacion', 'ubicacion_familia'),
  ('/certificado', 'bautismos'),
  ('/rifas', 'rifas'),
  ('/canciones', 'cancionero'),
  ('/musica', 'musica'),
  ('/admin/musica', 'musica'),
  ('/radio', 'radio'),
  ('/admin/radio', 'radio'),
  ('/finanzas', 'finanzas'),
  ('/finanzas/ofrendas', 'ofrendas_persona'),
  ('/finanzas/ofrenda-estado', 'ofrendas_persona'),
  ('/mis-ofrendas', 'ofrendas_persona'),
  ('/dar', 'ofrendar'),
  ('/reporte', 'informes'),
  ('/informes', 'informes'),
  ('/progreso-iglesia', 'informes')
on conflict (route) do update set feature = excluded.feature;

-- "/clase/leccion?id=1" -> 'clase_lecciones'. Gana la dirección más larga. Vacío: es de la base de la app.
create or replace function public.feature_of_link(p_link text) returns text
language sql stable security definer set search_path to 'public' as $$
  with p as (
    select regexp_replace(regexp_replace(split_part(split_part(coalesce(p_link, ''), '?', 1), '#', 1), '/\([^/]*\)', '', 'g'), '/+$', '') as path
  )
  select r.feature from public.feature_routes r, p
  where p.path = r.route or left(p.path, length(r.route) + 1) = r.route || '/'
  order by length(r.route) desc limit 1
$$;
revoke all on function public.feature_of_link(text) from public, anon;
grant execute on function public.feature_of_link(text) to authenticated, service_role;

-- ---------- 3. Avisos: si la función del aviso está apagada en esa iglesia, el aviso no se crea (ni manda nada al teléfono) ----------
create or replace function public.notifications_feature_gate() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_key text;
begin
  if new.church_id is null then return new; end if;
  v_key := public.feature_of_link(new.link);
  if v_key is null then
    -- Avisos sin enlace o con enlace a la ficha de una persona: se sabe de qué son por su tipo.
    v_key := case new.kind
      when 'followup' then 'seguimiento' when 'promise' then 'seguimiento' when 'promise_missed' then 'seguimiento'
      when 'birthday' then 'cumples' when 'live' then 'vivo' else null end;
  end if;
  if v_key is not null and public.feature_on(new.church_id, v_key) is not true then return null; end if;
  if new.kind = 'class' and public.feature_on(new.church_id, 'clases') is not true then return null; end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'notifications_feature_gate' and tgrelid = 'public.notifications'::regclass) then
    create trigger notifications_feature_gate before insert on public.notifications
      for each row execute function public.notifications_feature_gate();
  end if;
end $$;

-- ---------- 4. Tareas programadas: no corren para la iglesia que apagó esa función ----------
create or replace function public.run_scheduled_jobs() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  c record;
  v_local timestamp;
  v_n integer := 0;
begin
  for c in select * from public.churches loop
    v_local := now() at time zone c.timezone;
    -- Recordatorios de la semana (clases y ministerios): cada aviso se filtra solo, según la función a la que pertenece.
    if extract(dow from v_local)::int = c.reminder_dow and extract(hour from v_local)::int = c.reminder_hour
       and public.job_once(c.id, 'weekly_reminders', v_local::date::text) then
      v_n := v_n + public.run_weekly_reminders(c.id, v_local::date);
    end if;
    if extract(dow from v_local)::int = c.absence_dow and extract(hour from v_local)::int = c.absence_hour
       and public.feature_on(c.id, 'ausencias')
       and public.job_once(c.id, 'absences', v_local::date::text) then
      v_n := v_n + public.run_absence_report(c.id, v_local::date);
    end if;
  end loop;
  if extract(hour from now())::int = 7 then perform public.purge_old_track_points(30); end if;
  return v_n;
end $$;

create or replace function public.run_v07_jobs() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare c record; v_local timestamp; n integer := 0;
begin
  for c in select * from public.churches loop
    v_local := now() at time zone coalesce(c.timezone, 'America/Argentina/Buenos_Aires');
    if public.feature_on(c.id, 'seguimiento') then n := n + public.run_promise_reminders(c.id, v_local); end if;
    if public.feature_on(c.id, 'eventos') then n := n + public.run_event_reminders(c.id, v_local); end if;
    if public.feature_on(c.id, 'informes') then n := n + public.run_weekly_report(c.id, v_local); end if;
    if public.feature_on(c.id, 'finanzas') then n := n + public.run_fin_recurring(c.id, v_local); end if;
    if public.feature_on(c.id, 'seguimiento') then n := n + public.run_follow_up_reminders(c.id, v_local); end if;
    if public.feature_on(c.id, 'cumples') then
      n := n + public.run_birthday_reminders(c.id, v_local);
      n := n + public.run_birthday_today(c.id, v_local);
    end if;
  end loop;
  n := n + public.run_bus_cleanup();
  return n;
end $$;
revoke all on function public.run_scheduled_jobs() from public, anon, authenticated;
revoke all on function public.run_v07_jobs() from public, anon, authenticated;

-- ---------- 5. Ofrendas por persona: apagadas, el servidor no deja anotar, anular ni leer ----------
create or replace function public.admin_giving_feature_gate() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.feature_on(new.church_id, 'ofrendas_persona') is not true then
    raise exception 'Tu iglesia no usa las ofrendas por persona. El pastor las puede prender en Funciones de la iglesia.';
  end if;
  return new;
end $$;
do $$ begin
  -- El nombre empieza con zz para que corra después de admin_giving_guard, que es quien pone la iglesia.
  if not exists (select 1 from pg_trigger where tgname = 'zz_feature_gate' and tgrelid = 'public.admin_giving'::regclass) then
    create trigger zz_feature_gate before insert or update on public.admin_giving
      for each row execute function public.admin_giving_feature_gate();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_giving' and policyname = 'admin_giving_feature') then
    create policy admin_giving_feature on public.admin_giving as restrictive for select
      using (public.feature_on(church_id, 'ofrendas_persona'));
  end if;
end $$;

-- "Mis ofrendas": lo mismo de antes, y además pide que la función esté prendida.
create or replace function public.admin_my_giving(p_year integer default null)
returns table(id uuid, on_date date, amount numeric, currency text, method text, fund text, note text)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id();
begin
  if auth.uid() is null or v_church is null then raise exception 'No hay sesión'; end if;
  if public.feature_on(v_church, 'ofrendas_persona') is not true then
    raise exception 'Tu iglesia no usa las ofrendas por persona';
  end if;
  if (select s.my_giving_on from public.admin_church_settings s where s.church_id = v_church) is not true then
    raise exception 'Tu iglesia no tiene prendido "Mis ofrendas"';
  end if;
  return query
    select g.id, g.on_date, g.amount, g.currency, g.method, f.name, g.note
    from public.admin_giving g
    join public.fin_funds f on f.id = g.fund_id
    join public.contacts c on c.id = g.contact_id
    where g.church_id = v_church and c.church_id = v_church and c.profile_id = auth.uid() and g.voided_at is null
      and (p_year is null or extract(year from g.on_date)::integer = p_year)
    order by g.on_date desc, g.created_at desc;
end $$;

-- ---------- 6. Páginas públicas: tarjeta de visita y página de un evento ----------
-- La tarjeta de visita de una iglesia que la apagó no muestra nada.
create or replace function public.visit_card_public(p_token text) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('church', ch.name, 'city', ch.city, 'logo', case when ch.logo_path ~ '^https?:' then ch.logo_path end)
  from public.visit_card_links l join public.churches ch on ch.id = l.church_id
  where l.token = p_token and length(p_token) between 16 and 40
    and public.feature_on(l.church_id, 'tarjeta_visita')
$$;

-- Y tampoco recibe tarjetas nuevas, aunque alguien llame directo al servidor.
create or replace function public.visit_cards_feature_gate() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.feature_on(new.church_id, 'tarjeta_visita') is not true then
    raise exception 'Esta iglesia no está usando la tarjeta de visita.';
  end if;
  return new;
end $$;
create or replace function public.event_registrations_feature_gate() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.feature_on(new.church_id, 'eventos') is not true then
    raise exception 'Esta iglesia no está usando los eventos.';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_feature_gate' and tgrelid = 'public.visit_cards'::regclass) then
    create trigger zz_feature_gate before insert on public.visit_cards
      for each row execute function public.visit_cards_feature_gate();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_feature_gate' and tgrelid = 'public.event_registrations'::regclass) then
    create trigger zz_feature_gate before insert on public.event_registrations
      for each row execute function public.event_registrations_feature_gate();
  end if;
end $$;

-- Para que la página pública (sin sesión) sepa si mostrar "esta iglesia no usa esta parte".
-- Si el enlace no existe devuelve verdadero: la página ya sabe decir que el enlace no sirve.
create or replace function public.public_part_on(p_kind text, p_ref text) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_church uuid;
begin
  if p_kind = 'visita' then
    select l.church_id into v_church from public.visit_card_links l where l.token = p_ref and length(p_ref) between 16 and 40;
    return v_church is null or public.feature_on(v_church, 'tarjeta_visita');
  elsif p_kind = 'evento' then
    select e.church_id into v_church from public.events e where e.slug = lower(btrim(p_ref)) and e.public_page;
    return v_church is null or public.feature_on(v_church, 'eventos');
  end if;
  return true;
end $$;
revoke all on function public.public_part_on(text, text) from public;
grant execute on function public.public_part_on(text, text) to anon, authenticated, service_role;

-- ---------- 7. Guardar varias funciones de una vez (la elección rápida de los primeros pasos) ----------
create or replace function public.set_features(p_off text[]) returns text[]
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_clean text[]; v_new text[];
begin
  if public.has_perm('admin.permisos') is not true then raise exception 'Solo el pastor o el administrador de la app'; end if;
  if v_church is null then raise exception 'No hay sesión'; end if;
  select coalesce(array_agg(distinct k), '{}') into v_clean from unnest(coalesce(p_off, '{}')) k where k ~ '^[a-z_]{2,30}$';
  if coalesce(array_length(v_clean, 1), 0) > 200 then raise exception 'Lista demasiado larga'; end if;
  update public.churches set disabled_features = v_clean where id = v_church returning disabled_features into v_new;
  insert into public.audit_log (church_id, actor_id, action, details)
    values (v_church, auth.uid(), 'set_feature:*:bulk', jsonb_build_object('off', v_clean));
  return v_new;
end $$;
revoke all on function public.set_features(text[]) from public, anon;
grant execute on function public.set_features(text[]) to authenticated;

-- El tamaño que la iglesia dijo al anotarse, para sugerirle qué prender. Vacío si no se anotó sola.
create or replace function public.funciones_size_hint() returns text
language sql stable security definer set search_path to 'public' as $$
  select s.size_hint from public.alta_signups s
  where s.church_id = public.current_church_id() and public.has_perm('admin.iglesia') is true
$$;
revoke all on function public.funciones_size_hint() from public, anon;
grant execute on function public.funciones_size_hint() to authenticated;

-- ---------- 8. La Biblia de cada iglesia ----------
-- { "versions": ["rv1909","kjv"], "default": "rv1909" }. Vacío: todas las versiones que trae la app.
alter table public.churches add column if not exists bible jsonb;

create or replace function public.set_bible(p_versions text[], p_default text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_list text[]; v_new jsonb;
begin
  if public.has_perm('admin.permisos') is not true then raise exception 'Solo el pastor o el administrador de la app'; end if;
  if v_church is null then raise exception 'No hay sesión'; end if;
  select coalesce(array_agg(k order by ord), '{}') into v_list
    from (select k, min(ord) as ord from unnest(coalesce(p_versions, '{}')) with ordinality as t(k, ord) where k ~ '^[a-z0-9_]{2,20}$' group by k) x;
  if coalesce(array_length(v_list, 1), 0) = 0 then raise exception 'Dejá prendida al menos una versión de la Biblia'; end if;
  if array_length(v_list, 1) > 30 then raise exception 'Lista demasiado larga'; end if;
  if p_default is null or not (p_default = any(v_list)) then p_default := v_list[1]; end if;
  v_new := jsonb_build_object('versions', to_jsonb(v_list), 'default', p_default);
  update public.churches set bible = v_new where id = v_church;
  insert into public.audit_log (church_id, actor_id, action, details) values (v_church, auth.uid(), 'set_bible', v_new);
  return v_new;
end $$;
revoke all on function public.set_bible(text[], text) from public, anon;
grant execute on function public.set_bible(text[], text) to authenticated;

-- ---------- 9. Las funciones que se separaron heredan el estado de la función de la que salieron (una sola vez) ----------
do $$
declare c record; v_add text[];
begin
  for c in select id, disabled_features as off from public.churches ch
           where not exists (select 1 from public.audit_log l where l.church_id = ch.id and l.action = 'set_feature:*:split_0088') loop
    v_add := '{}';
    if 'finanzas' = any(c.off) then v_add := v_add || array['ofrendas_persona']; end if;
    if 'discipulado' = any(c.off) then v_add := v_add || array['decisiones', 'bienvenida', 'tarjeta_visita', 'clase_miembros']; end if;
    if 'devocional' = any(c.off) then v_add := v_add || array['biblia', 'plan_lectura', 'crecimiento']; end if;
    if array_length(v_add, 1) > 0 then
      update public.churches set disabled_features = (select array_agg(distinct k) from unnest(disabled_features || v_add) k) where id = c.id;
    end if;
    insert into public.audit_log (church_id, action, details) values (c.id, 'set_feature:*:split_0088', jsonb_build_object('added_off', v_add));
  end loop;
end $$;

-- ---------- 10. La iglesia anfitriona no lleva la cuenta de quién dio: se apagan las ofrendas por persona ----------
-- Solo si de verdad no hay ninguna ofrenda anotada. Es el mismo cambio que hace el botón de Funciones (y queda en el registro).
do $$
declare v_church uuid := '2c35b2a1-494d-475d-8a87-b7df18974838';
begin
  if exists (select 1 from public.churches where id = v_church and not ('ofrendas_persona' = any(disabled_features)))
     and not exists (select 1 from public.admin_giving g where g.church_id = v_church) then
    update public.churches set disabled_features = array_append(disabled_features, 'ofrendas_persona') where id = v_church;
    insert into public.audit_log (church_id, action) values (v_church, 'set_feature:ofrendas_persona:off');
  end if;
end $$;
