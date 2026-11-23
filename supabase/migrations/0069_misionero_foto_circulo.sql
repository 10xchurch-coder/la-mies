-- Misioneros: además de la foto grande del perfil, un recorte más cerca para el círculo de la lista.
alter table public.missionaries add column if not exists thumb_path text;
