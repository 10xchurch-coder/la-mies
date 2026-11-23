-- 0070: maestros que no tienen la app, y mensajes de voz en el chat.

-- 1. Un maestro de la clase puede ser alguien con cuenta (profile_id) o un hermano sin la app (contact_id).
alter table public.class_teachers add column if not exists contact_id uuid references public.contacts(id) on delete cascade;
alter table public.class_teachers add column if not exists id uuid not null default gen_random_uuid();
alter table public.class_teachers drop constraint if exists class_teachers_pkey;
alter table public.class_teachers alter column profile_id drop not null;
alter table public.class_teachers add constraint class_teachers_pkey primary key (id);
alter table public.class_teachers drop constraint if exists class_teachers_class_profile_key;
alter table public.class_teachers add constraint class_teachers_class_profile_key unique (class_id, profile_id);
alter table public.class_teachers drop constraint if exists class_teachers_class_contact_key;
alter table public.class_teachers add constraint class_teachers_class_contact_key unique (class_id, contact_id);
alter table public.class_teachers drop constraint if exists class_teachers_who;
alter table public.class_teachers add constraint class_teachers_who check ((profile_id is null) <> (contact_id is null));

-- 2. El depósito del chat acepta audio (mensajes de voz).
update storage.buckets
set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types || array['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a']) m)
where name = 'chat';
