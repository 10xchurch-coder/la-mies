-- 0074: modo presentación. Listas del culto (canciones, pasajes, fotos, videos, cuenta regresiva, música)
--       para mostrar en el proyector desde la app, sin otro programa.
--       Las arman y las manejan los líderes (los mismos que la app llama líderes: public.is_captain_or_admin()).

-- 1. Las listas del culto. Cada lista guarda sus partes en "items" (un JSON ordenado).
create table if not exists public.present_sets (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and pg_column_size(items) <= 1048576),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists present_sets_church_idx on public.present_sets (church_id, updated_at desc);
alter table public.present_sets enable row level security;
revoke all on table public.present_sets from anon, public;
grant select, insert, update, delete on table public.present_sets to authenticated;

drop policy if exists present_sets_select on public.present_sets;
create policy present_sets_select on public.present_sets for select to authenticated
  using (church_id = public.current_church_id() and public.is_captain_or_admin());
drop policy if exists present_sets_write on public.present_sets;
create policy present_sets_write on public.present_sets for all to authenticated
  using (church_id = public.current_church_id() and public.is_captain_or_admin())
  with check (church_id = public.current_church_id() and public.is_captain_or_admin());

drop trigger if exists present_sets_touch on public.present_sets;
create trigger present_sets_touch before update on public.present_sets
  for each row execute function public.touch_updated_at();

-- 2. Depósito de archivos de la presentación: fotos, videos y música que sube la iglesia.
--    Cada iglesia en su carpeta. Solo los líderes suben, abren y borran: la pantalla de salida
--    recibe del operador un link firmado que dura un rato.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('present', 'present', false, 52428800, array['image/*', 'video/*', 'audio/*'])
    on conflict (id) do nothing;

    drop policy if exists lamies_present_read on storage.objects;
    create policy lamies_present_read on storage.objects for select to authenticated
      using (bucket_id = 'present' and (storage.foldername(name))[1] = (public.current_church_id())::text and public.is_captain_or_admin());
    drop policy if exists lamies_present_insert on storage.objects;
    create policy lamies_present_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'present' and (storage.foldername(name))[1] = (public.current_church_id())::text and public.is_captain_or_admin());
    drop policy if exists lamies_present_delete on storage.objects;
    create policy lamies_present_delete on storage.objects for delete to authenticated
      using (bucket_id = 'present' and (storage.foldername(name))[1] = (public.current_church_id())::text and public.is_captain_or_admin());
  end if;
end $$;

-- 3. Tiempo real entre aparatos (canal privado "presentar:<id de la iglesia>").
--    Escuchar: cualquiera de la iglesia que entró a la app (el aparato que hace de pantalla).
--    Mandar (pasar de diapositiva, poner en negro): solo los líderes.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    drop policy if exists lamies_present_listen on realtime.messages;
    create policy lamies_present_listen on realtime.messages for select to authenticated
      using (extension = 'broadcast' and realtime.topic() = 'presentar:' || (public.current_church_id())::text);
    drop policy if exists lamies_present_send on realtime.messages;
    create policy lamies_present_send on realtime.messages for insert to authenticated
      with check (extension = 'broadcast' and realtime.topic() = 'presentar:' || (public.current_church_id())::text and public.is_captain_or_admin());
  end if;
end $$;
