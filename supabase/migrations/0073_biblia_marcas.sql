-- Lo que cada persona marca en su Biblia: color de resaltado, nota y "guardado" de cada versículo.
-- Va por libro, capítulo y versículo (no por versión), así se ve igual en cualquier versión de la Biblia.
create table if not exists public.bible_marks (
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  book smallint not null check (book between 0 and 65),
  chapter smallint not null check (chapter between 1 and 150),
  verse smallint not null check (verse between 1 and 176),
  color text check (color is null or color ~ '^[a-z]{3,10}$'),
  note text check (note is null or char_length(note) <= 4000),
  saved boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, book, chapter, verse)
);
alter table public.bible_marks enable row level security;
drop policy if exists bible_marks_own on public.bible_marks;
create policy bible_marks_own on public.bible_marks for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
grant select, insert, update, delete on public.bible_marks to authenticated;
create index if not exists bible_marks_recent on public.bible_marks (profile_id, updated_at desc);
