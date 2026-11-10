-- 0049: notas personales en cada estudio (Crecimiento, Capacitación, material de clase). Solo las ve quien las escribió.
create table if not exists public.study_notes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('article', 'training', 'material')),
  ref        text not null check (char_length(ref) between 1 and 100),
  title      text not null default '',
  body       text not null check (char_length(body) between 1 and 8000),
  updated_at timestamptz not null default now(),
  primary key (profile_id, kind, ref)
);
create index if not exists study_notes_recent_idx on public.study_notes (profile_id, updated_at desc);
alter table public.study_notes enable row level security;
revoke all on public.study_notes from anon, authenticated;
grant select on public.study_notes to authenticated;
drop policy if exists study_notes_own on public.study_notes;
create policy study_notes_own on public.study_notes for select to authenticated using (profile_id = auth.uid());

-- Guarda la nota; si queda vacía, la borra.
create or replace function public.save_study_note(p_kind text, p_ref text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if v_body = '' then
    delete from public.study_notes where profile_id = auth.uid() and kind = p_kind and ref = p_ref;
  else
    insert into public.study_notes (profile_id, kind, ref, title, body)
    values (auth.uid(), p_kind, left(p_ref, 100), left(coalesce(p_title, ''), 200), left(v_body, 8000))
    on conflict (profile_id, kind, ref) do update set title = excluded.title, body = excluded.body, updated_at = now();
  end if;
end $$;
grant execute on function public.save_study_note(text, text, text, text) to authenticated;
