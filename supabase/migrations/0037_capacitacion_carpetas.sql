-- 0037: Capacitación en carpetas y con tres presentaciones del evangelio.
--  - Cada tema general tiene un slug para poder actualizarlo desde el repositorio.
--  - "Cómo presentar el evangelio" pasa a llamarse "¿Sos buena persona?" (la presentación con la ley).
--  - Carpetas: Presentaciones del evangelio, Respuestas bíblicas, Objeciones comunes, Tips para recordar.
alter table public.training_items add column if not exists slug text;
create unique index if not exists training_items_global_slug on public.training_items (slug) where church_id is null and slug is not null;

update public.training_items set title = '¿Sos buena persona?', category = 'Presentaciones del evangelio', slug = 'presentaciones-sos-buena-persona',
  summary = 'Con los Diez Mandamientos: mostrar el pecado, sus consecuencias y el regalo de Dios en Cristo. Tenelo abierto en el teléfono mientras hablás.',
  sort_order = 19, updated_at = now()
 where church_id is null and title = 'Cómo presentar el evangelio';

create or replace function public.load_training(p_json jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.training_items (church_id, slug, category, title, kind, summary, body, minutes, sort_order, published)
  select null, a->>'slug', a->>'category', a->>'title', 'article', a->>'summary', a->>'body', nullif(a->>'minutes', '')::int, coalesce((a->>'sort_order')::int, 100), true
  from jsonb_array_elements(p_json) a
  on conflict (slug) where church_id is null and slug is not null do update set
    category = excluded.category, title = excluded.title, summary = excluded.summary, body = excluded.body,
    minutes = excluded.minutes, sort_order = excluded.sort_order, published = true, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.load_training(jsonb) from public, anon, authenticated;
