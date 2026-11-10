-- 0051: importar personas desde una planilla (CSV / Excel). Solo la secretaría y el pastor.
-- p_commit = false  → solo cuenta (vista previa): cuántas son nuevas, cuántas ya estaban, cuántas no sirven.
-- p_commit = true   → crea las fichas nuevas. Nunca pisa una ficha existente.
-- Una persona "ya está" si algún contacto de la iglesia (no archivado) tiene los mismos últimos 8 dígitos de celular,
-- o, si la fila no trae celular, el mismo nombre completo (sin tildes ni mayúsculas) y tampoco tiene celular.
create or replace function public.import_people(p_rows jsonb, p_status text default 'member', p_since date default null, p_commit boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_church uuid := public.current_church_id();
  r jsonb;
  v_name text; v_digits text; v_key text;
  v_new int := 0; v_dup int := 0; v_bad int := 0;
  v_seen_phone text[] := '{}'; v_seen_name text[] := '{}';
  v_exists boolean;
  v_sex text; v_marital text;
  v_bd date; v_bap date;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Solo la secretaría o el pastor pueden importar personas.'; end if;
  if p_status not in ('member', 'visitor', 'contact') then raise exception 'Estado no válido.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Formato no válido.'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'Son demasiadas filas juntas (máximo 1000 por vez).'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := nullif(btrim(regexp_replace(coalesce(r->>'name', ''), '\s+', ' ', 'g')), '');
    if v_name is null or length(v_name) > 120 then v_bad := v_bad + 1; continue; end if;
    v_digits := right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 8);
    if length(v_digits) < 8 then v_digits := null; end if;
    v_key := lower(translate(v_name, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));

    if v_digits is not null then
      v_exists := v_digits = any(v_seen_phone) or exists (
        select 1 from public.contacts c where c.church_id = v_church and not c.archived
          and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = v_digits);
    else
      v_exists := v_key = any(v_seen_name) or exists (
        select 1 from public.contacts c where c.church_id = v_church and not c.archived
          and length(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) < 8
          and lower(translate(btrim(c.name), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = v_key);
    end if;
    if v_exists then v_dup := v_dup + 1; continue; end if;

    if v_digits is not null then v_seen_phone := v_seen_phone || v_digits; else v_seen_name := v_seen_name || v_key; end if;
    v_new := v_new + 1;
    if not p_commit then continue; end if;

    v_sex := case lower(coalesce(r->>'sex', '')) when 'm' then 'm' when 'f' then 'f' else null end;
    v_marital := case when coalesce(r->>'marital', '') in ('single', 'married', 'partner', 'widowed') then r->>'marital' else null end;
    v_bd := case when coalesce(r->>'birthdate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'birthdate')::date else null end;
    v_bap := case when coalesce(r->>'baptized_on', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'baptized_on')::date else null end;
    if v_bd is not null and (v_bd > current_date or v_bd < date '1900-01-01') then v_bd := null; end if;
    if v_bap is not null and (v_bap > current_date or v_bap < date '1900-01-01') then v_bap := null; end if;

    insert into public.contacts (church_id, created_by, name, phone, email, address, birthdate, sex, marital, status, member_since, baptized_on, interest, share_mode)
    values (v_church, auth.uid(), v_name, left(nullif(btrim(r->>'phone'), ''), 40), left(nullif(lower(btrim(r->>'email')), ''), 160),
            left(nullif(btrim(r->>'address'), ''), 200), v_bd, v_sex, v_marital, p_status,
            case when p_status = 'member' then coalesce(p_since, current_date) end, v_bap, 'very', 'group');
  end loop;

  if p_commit and v_new > 0 then
    insert into public.audit_log (church_id, actor_id, action, target, details)
    values (v_church, auth.uid(), 'import_people', p_status, jsonb_build_object('nuevas', v_new, 'repetidas', v_dup, 'invalidas', v_bad));
  end if;
  return jsonb_build_object('new', v_new, 'duplicates', v_dup, 'invalid', v_bad, 'committed', p_commit);
end $$;
revoke all on function public.import_people(jsonb, text, date, boolean) from public, anon;
grant execute on function public.import_people(jsonb, text, date, boolean) to authenticated;
