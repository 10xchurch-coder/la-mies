-- Devocional: además de la lectura corta, un "estudio completo" (5–10 min, con pasajes) y una oración breve.
alter table public.daily_content
  add column if not exists study text,
  add column if not exists prayer text;
