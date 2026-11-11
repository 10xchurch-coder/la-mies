-- 0047: "Mi camino" (pasos de crecimiento, privado) y Preguntas (las responde el liderazgo).
-- Los pasos no dan salvación ni puntos: solo muestran a cada uno por dónde va y cuál es el siguiente paso.

-- Pasos que cada uno marca por sí mismo (hoy: "Confié en Cristo").
create table if not exists public.path_self (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  step       text not null check (step in ('cristo')),
  done_on    date not null default current_date,
  primary key (profile_id, step)
);
alter table public.path_self enable row level security;
revoke all on public.path_self from anon, authenticated;

create or replace function public.set_my_step(p_step text, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_done then
    insert into public.path_self (profile_id, step) values (auth.uid(), p_step) on conflict do nothing;
  else
    delete from public.path_self where profile_id = auth.uid() and step = p_step;
  end if;
end $$;
grant execute on function public.set_my_step(text, boolean) to authenticated;

-- Mi camino: cada paso con su fecha si ya se dio. Solo lo ve la propia persona.
create or replace function public.my_path() returns table (step text, done boolean, at date)
language sql stable security definer set search_path = public as $$
  with me as (select c.* from public.contacts c where c.profile_id = auth.uid() and not c.archived order by c.created_at limit 1)
  select 'cristo'::text, exists (select 1 from public.path_self s where s.profile_id = auth.uid() and s.step = 'cristo'),
         (select s.done_on from public.path_self s where s.profile_id = auth.uid() and s.step = 'cristo')
  union all
  select 'bautismo', (select baptized_on is not null from me), (select baptized_on from me)
  union all
  select 'discipulado', (select discipleship_since is not null from me), (select discipleship_since from me)
  union all
  select 'clase', exists (select 1 from public.class_students cs join me on me.id = cs.contact_id), null::date
  union all
  select 'miembro', coalesce((select status = 'member' from me), false), (select member_since from me)
  union all
  select 'ministerio', exists (select 1 from public.ministry_members m where m.profile_id = auth.uid()),
         (select min(m.joined_at)::date from public.ministry_members m where m.profile_id = auth.uid())
  union all
  select 'evangelismo', exists (select 1 from public.sessions s where s.user_id = auth.uid() and s.ended_at is not null and (s.manual or s.ended_at - s.started_at >= interval '10 minutes' or s.distance_m >= 300 or s.contacts + s.presentations + s.promises > 0)),
         (select min(s.started_at)::date from public.sessions s where s.user_id = auth.uid() and s.ended_at is not null and (s.manual or s.ended_at - s.started_at >= interval '10 minutes' or s.distance_m >= 300 or s.contacts + s.presentations + s.promises > 0))
$$;
grant execute on function public.my_path() to authenticated;

-- Preguntas: cualquiera pregunta; el liderazgo responde. Si la responde, puede dejarla pública (sin nombre).
create table if not exists public.faith_questions (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  asker_id    uuid not null references public.profiles(id) on delete cascade,
  question    text not null check (char_length(question) between 5 and 1000),
  answer      text check (answer is null or char_length(answer) <= 6000),
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  article_slug text,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists faith_questions_idx on public.faith_questions (church_id, created_at desc);
alter table public.faith_questions enable row level security;
revoke all on public.faith_questions from anon, authenticated;
grant select on public.faith_questions to authenticated;
drop policy if exists faith_questions_read on public.faith_questions;
create policy faith_questions_read on public.faith_questions for select to authenticated
  using (church_id = public.current_church_id() and (asker_id = auth.uid() or public.is_staff()));

create or replace function public.ask_question(p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_church uuid := public.current_church_id(); u uuid; v_text text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null or v_church is null then raise exception 'Sin sesión'; end if;
  if char_length(v_text) < 5 then raise exception 'Escribí tu pregunta'; end if;
  if (select count(*) from public.faith_questions where asker_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Hoy ya mandaste varias preguntas. Seguimos mañana.';
  end if;
  insert into public.faith_questions (church_id, asker_id, question) values (v_church, auth.uid(), left(v_text, 1000)) returning id into v_id;
  for u in select p.id from public.profiles p where p.church_id = v_church and p.disabled_at is null and p.id <> auth.uid()
           and 'personas.editar' = any(public.perms_of(p.id)) loop
    perform public.notify(u, 'question', 'Pregunta nueva', left(v_text, 120), '/preguntas');
  end loop;
  return v_id;
end $$;
grant execute on function public.ask_question(text) to authenticated;

create or replace function public.answer_question(p_id uuid, p_answer text, p_article text default null, p_public boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare q public.faith_questions;
begin
  if not public.is_staff() then raise exception 'Solo el liderazgo responde'; end if;
  select * into q from public.faith_questions where id = p_id and church_id = public.current_church_id();
  if q.id is null then raise exception 'No existe la pregunta'; end if;
  update public.faith_questions set answer = nullif(btrim(p_answer), ''), article_slug = nullif(btrim(p_article), ''), is_public = p_public,
    answered_by = auth.uid(), answered_at = now() where id = p_id;
  perform public.notify(q.asker_id, 'question', 'Respondieron tu pregunta', left(q.question, 120), '/preguntas');
end $$;
grant execute on function public.answer_question(uuid, text, text, boolean) to authenticated;

-- Respuestas que el liderazgo dejó públicas: sin el nombre de quien preguntó.
create or replace function public.public_questions() returns table (id uuid, question text, answer text, article_slug text, answered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, q.question, q.answer, q.article_slug, q.answered_at from public.faith_questions q
  where q.church_id = public.current_church_id() and q.is_public and q.answer is not null
  order by q.answered_at desc limit 200
$$;
grant execute on function public.public_questions() to authenticated;

create or replace function public.delete_my_question(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.faith_questions where id = p_id and asker_id = auth.uid() and answered_at is null
$$;
grant execute on function public.delete_my_question(uuid) to authenticated;
