-- 0079: Orden del culto, oraciones respondidas, lección de cada clase, versículos de memoria,
-- caja de preguntas y el aviso del día antes para los que sirven.
-- Todo se agrega: no se borra ni se cambia nada de lo que ya hay.

-- ---------------------------------------------------------------------------
-- 1. Orden del culto
-- ---------------------------------------------------------------------------
-- items es una lista ordenada. Cada parte:
--   { "id": "texto corto único", "type": "song|prayer|notices|offering|reading|sermon|other",
--     "title": "lo que se ve", "songId": "uuid de songs o null", "ref": "pasaje (solo lectura) o null",
--     "whoId": "uuid de profiles o null", "whoName": "nombre del responsable o null", "note": "texto o null" }
-- people se arma solo con los whoId: son los que pueden ver el orden y reciben el aviso del día antes.
create table if not exists public.service_plans (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  service_date date not null,
  title        text not null default 'Culto' check (char_length(title) between 1 and 120),
  items        jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  people       uuid[] not null default '{}',
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists service_plans_date_idx on public.service_plans (church_id, service_date);
alter table public.service_plans enable row level security;

create or replace function public.culto_plan_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- Solo cuentas de la misma iglesia (un id cualquiera no sirve para ver el orden).
  select coalesce(array_agg(distinct p.id), '{}') into new.people
  from jsonb_array_elements(new.items) e
  join public.profiles p on p.id::text = e->>'whoId' and p.church_id = new.church_id
  where jsonb_typeof(e) = 'object';
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'culto_plan_before' and tgrelid = 'public.service_plans'::regclass) then
    create trigger culto_plan_before before insert or update on public.service_plans
      for each row execute function public.culto_plan_before();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_plans' and policyname = 'service_plans_select') then
    create policy service_plans_select on public.service_plans for select to authenticated
      using (church_id = public.current_church_id() and (public.is_captain_or_admin() or auth.uid() = any(people)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_plans' and policyname = 'service_plans_insert') then
    create policy service_plans_insert on public.service_plans for insert to authenticated
      with check (church_id = public.current_church_id() and public.is_captain_or_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_plans' and policyname = 'service_plans_update') then
    create policy service_plans_update on public.service_plans for update to authenticated
      using (church_id = public.current_church_id() and public.is_captain_or_admin())
      with check (church_id = public.current_church_id() and public.is_captain_or_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_plans' and policyname = 'service_plans_remove') then
    create policy service_plans_remove on public.service_plans for delete to authenticated
      using (church_id = public.current_church_id() and public.is_captain_or_admin());
  end if;
end $$;
revoke all on public.service_plans from anon;
grant select, insert, update, delete on public.service_plans to authenticated;
revoke all on function public.culto_plan_before() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Oraciones respondidas
-- ---------------------------------------------------------------------------
-- La marca quien hizo el pedido o quien modera (com.moderar), con un testimonio corto opcional.
create or replace function public.culto_prayer_answered(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.prayer_requests;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select * into r from public.prayer_requests where id = p_id and church_id = public.current_church_id();
  if r.id is null or public.can_see_prayer(p_id) is not true then raise exception 'No existe el pedido'; end if;
  if r.user_id <> auth.uid() and public.has_perm('com.moderar') is not true then
    raise exception 'Solo quien hizo el pedido o un líder puede marcarlo';
  end if;
  update public.prayer_requests
    set answered_at = coalesce(answered_at, now()), answer_note = nullif(left(btrim(coalesce(p_note, '')), 600), '')
    where id = p_id;
end $$;
revoke all on function public.culto_prayer_answered(uuid, text) from public, anon;
grant execute on function public.culto_prayer_answered(uuid, text) to authenticated;

-- Todas las respondidas que esta persona puede ver (sin el límite de 30 días de la lista de pedidos).
create or replace function public.culto_answered_prayers()
returns table (id uuid, author text, body text, answer_note text, answered_at timestamptz, created_at timestamptz, prayed integer, mine boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         case when p.anonymous and p.user_id <> auth.uid() then null else pr.display_name end,
         p.body, p.answer_note, p.answered_at, p.created_at,
         (select count(*)::int from public.prayer_prayed x where x.request_id = p.id),
         p.user_id = auth.uid()
  from public.prayer_requests p join public.profiles pr on pr.id = p.user_id
  where p.answered_at is not null and public.can_see_prayer(p.id) and not public.is_blocked_by_me(p.user_id)
  order by p.answered_at desc limit 200
$$;
revoke all on function public.culto_answered_prayers() from public, anon;
grant execute on function public.culto_answered_prayers() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. La lección de cada clase y cada día
-- ---------------------------------------------------------------------------
-- Se usa lo que ya hay: la lección es un "material" de la clase (serie "Lecciones") y queda puesta
-- en el turno de ese día (class_schedule.material_id). Lo nuevo: un enlace, y que el maestro de la clase la pueda cargar.
alter table public.materials add column if not exists link_url text;

create or replace function public.culto_save_class_lesson(
  p_class uuid, p_date date, p_title text, p_body text default null, p_link text default null,
  p_file_path text default null, p_file_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_church uuid := public.current_church_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_file text := nullif(btrim(coalesce(p_file_path, '')), '');
  v_mat uuid;
begin
  if auth.uid() is null or v_church is null then raise exception 'Sin sesión'; end if;
  if p_date is null then raise exception 'Falta la fecha'; end if;
  if not exists (select 1 from public.classes k where k.id = p_class and k.church_id = v_church) then raise exception 'No existe la clase'; end if;
  if public.has_perm('ens.editar') is not true and public.is_teacher_of(p_class) is not true then
    raise exception 'Solo los maestros de la clase o un líder pueden cargar la lección';
  end if;
  if char_length(v_title) < 2 then raise exception 'Escribí el título de la lección'; end if;
  if v_link is not null and v_link !~* '^https?://' then raise exception 'El enlace tiene que empezar con https://'; end if;
  if v_file is not null and v_file not like v_church::text || '/%' then raise exception 'El archivo no es de esta iglesia'; end if;

  -- Si ese día ya tiene una lección cargada acá, se cambia esa. Si tenía un capítulo de un libro, no se toca: se crea una lección nueva.
  select m.id into v_mat
  from public.class_schedule s join public.materials m on m.id = s.material_id
  where s.class_id = p_class and s.on_date = p_date and m.class_id = p_class and m.series = 'Lecciones';

  if v_mat is not null then
    update public.materials set title = left(v_title, 200), body = v_body, link_url = v_link, file_path = v_file,
      file_name = case when v_file is null then null else nullif(btrim(coalesce(p_file_name, '')), '') end
      where id = v_mat;
  else
    insert into public.materials (church_id, series, title, chapter_order, body, link_url, file_path, file_name, created_by, class_id)
    values (v_church, 'Lecciones', left(v_title, 200), to_char(p_date, 'YYMMDD')::int, v_body, v_link, v_file,
            case when v_file is null then null else nullif(btrim(coalesce(p_file_name, '')), '') end, auth.uid(), p_class)
    returning id into v_mat;
    insert into public.class_schedule (church_id, class_id, on_date, material_id) values (v_church, p_class, p_date, v_mat)
      on conflict (class_id, on_date) do update set material_id = excluded.material_id;
  end if;
  return v_mat;
end $$;
revoke all on function public.culto_save_class_lesson(uuid, date, text, text, text, text, text) from public, anon;
grant execute on function public.culto_save_class_lesson(uuid, date, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Versículos de memoria y premios de los chicos
-- ---------------------------------------------------------------------------
-- class_id vacío: el versículo es para todas las clases de la iglesia.
create table if not exists public.memory_verses (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  class_id   uuid references public.classes(id) on delete cascade,
  reference  text not null check (char_length(reference) between 2 and 80),
  body       text check (body is null or char_length(body) <= 1000),
  position   integer not null default 0,
  active     boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists memory_verses_idx on public.memory_verses (church_id, class_id);
alter table public.memory_verses enable row level security;

create table if not exists public.memory_verse_done (
  verse_id   uuid not null references public.memory_verses(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  learned_on date not null default current_date,
  marked_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  primary key (verse_id, contact_id)
);
create index if not exists memory_verse_done_contact_idx on public.memory_verse_done (contact_id);
alter table public.memory_verse_done enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memory_verses' and policyname = 'memory_verses_select') then
    create policy memory_verses_select on public.memory_verses for select to authenticated
      using (church_id = public.current_church_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memory_verses' and policyname = 'memory_verses_insert') then
    create policy memory_verses_insert on public.memory_verses for insert to authenticated
      with check (church_id = public.current_church_id()
        and (class_id is null or exists (select 1 from public.classes k where k.id = class_id and k.church_id = public.current_church_id()))
        and (public.has_perm('ens.editar') or (class_id is not null and public.is_teacher_of(class_id))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memory_verses' and policyname = 'memory_verses_update') then
    create policy memory_verses_update on public.memory_verses for update to authenticated
      using (church_id = public.current_church_id() and (public.has_perm('ens.editar') or (class_id is not null and public.is_teacher_of(class_id))))
      with check (church_id = public.current_church_id() and (public.has_perm('ens.editar') or (class_id is not null and public.is_teacher_of(class_id))));
  end if;
  -- Quién ve lo que aprendió un chico: el que puede ver su ficha (la regla de las fichas decide).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memory_verse_done' and policyname = 'memory_verse_done_select') then
    create policy memory_verse_done_select on public.memory_verse_done for select to authenticated
      using (church_id = public.current_church_id() and exists (select 1 from public.contacts c where c.id = contact_id));
  end if;
  -- Quién tilda: el maestro del chico o un líder de enseñanza. El versículo tiene que ser de la misma iglesia.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memory_verse_done' and policyname = 'memory_verse_done_insert') then
    create policy memory_verse_done_insert on public.memory_verse_done for insert to authenticated
      with check (church_id = public.current_church_id()
        and (public.has_perm('ens.editar') or public.teaches_contact(contact_id))
        and exists (select 1 from public.memory_verses v where v.id = verse_id and v.church_id = public.current_church_id())
        and exists (select 1 from public.contacts c where c.id = contact_id and c.church_id = public.current_church_id()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memory_verse_done' and policyname = 'memory_verse_done_remove') then
    create policy memory_verse_done_remove on public.memory_verse_done for delete to authenticated
      using (church_id = public.current_church_id() and (public.has_perm('ens.editar') or public.teaches_contact(contact_id)));
  end if;
end $$;
revoke all on public.memory_verses, public.memory_verse_done from anon;
grant select, insert, update on public.memory_verses to authenticated;
grant select, insert, delete on public.memory_verse_done to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Caja de preguntas
-- ---------------------------------------------------------------------------
-- Si la pregunta es anónima, user_id queda vacío: no se guarda quién la hizo (ni el pastor ni nadie lo puede saber).
create table if not exists public.bible_questions (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  user_id     uuid references public.profiles(id) on delete set null,
  body        text not null check (char_length(body) between 5 and 1000),
  status      text not null default 'new' check (status in ('new', 'answered')),
  answer      text check (answer is null or char_length(answer) <= 3000),
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists bible_questions_idx on public.bible_questions (church_id, created_at desc);
alter table public.bible_questions enable row level security;

do $$ begin
  -- La ven: quien la hizo (si dejó su nombre), quien modera, y toda la iglesia cuando ya tiene una respuesta escrita.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bible_questions' and policyname = 'bible_questions_select') then
    create policy bible_questions_select on public.bible_questions for select to authenticated
      using (church_id = public.current_church_id()
        and (user_id = auth.uid() or public.has_perm('com.moderar') or (status = 'answered' and answer is not null)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bible_questions' and policyname = 'bible_questions_insert') then
    create policy bible_questions_insert on public.bible_questions for insert to authenticated
      with check (church_id = public.current_church_id() and (user_id is null or user_id = auth.uid())
        and status = 'new' and answer is null and answered_by is null and answered_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bible_questions' and policyname = 'bible_questions_update') then
    create policy bible_questions_update on public.bible_questions for update to authenticated
      using (church_id = public.current_church_id() and public.has_perm('com.moderar'))
      with check (church_id = public.current_church_id() and public.has_perm('com.moderar'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bible_questions' and policyname = 'bible_questions_remove') then
    create policy bible_questions_remove on public.bible_questions for delete to authenticated
      using (church_id = public.current_church_id() and (public.has_perm('com.moderar') or (user_id = auth.uid() and status = 'new')));
  end if;
end $$;
revoke all on public.bible_questions from anon;
revoke all on public.bible_questions from authenticated;
-- Leer directo de la tabla no deja ver quién preguntó ni quién respondió: esas columnas no se dan.
grant select (id, church_id, body, status, answer, answered_at, created_at) on public.bible_questions to authenticated;
grant insert, delete on public.bible_questions to authenticated;
-- El que modera solo cambia el estado y la respuesta (no puede ponerle un nombre a una pregunta anónima).
grant update (status, answer, answered_by, answered_at) on public.bible_questions to authenticated;

-- La lista para la pantalla: sin el id de quien preguntó. El nombre solo lo ve quien modera, y solo si la persona lo dejó.
create or replace function public.culto_questions_list()
returns table (id uuid, body text, status text, answer text, answered_at timestamptz, created_at timestamptz, mine boolean, author text, anonymous boolean)
language sql stable security definer set search_path = public as $$
  select q.id, q.body, q.status, q.answer, q.answered_at, q.created_at,
         coalesce(q.user_id = auth.uid(), false),
         case when q.user_id is not null and public.has_perm('com.moderar') then p.display_name end,
         q.user_id is null
  from public.bible_questions q left join public.profiles p on p.id = q.user_id
  where q.church_id = public.current_church_id()
    and (q.user_id = auth.uid() or public.has_perm('com.moderar') or (q.status = 'answered' and q.answer is not null))
  order by q.created_at desc limit 300
$$;
revoke all on function public.culto_questions_list() from public, anon;
grant execute on function public.culto_questions_list() to authenticated;

create or replace function public.culto_question_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to uuid;
begin
  if tg_op = 'INSERT' then
    -- Igual que las sugerencias: le llega al pastor. El aviso no dice quién preguntó.
    for v_to in select id from public.profiles where church_id = new.church_id and role::text = 'admin' and disabled_at is null
                  and id is distinct from new.user_id loop
      perform public.notify(v_to, 'question', 'Pregunta nueva', left(new.body, 160), '/preguntas');
    end loop;
  elsif new.status = 'answered' and old.status is distinct from 'answered' and new.user_id is not null then
    perform public.notify(new.user_id, 'question', 'Respondieron tu pregunta', left(new.body, 120), '/preguntas');
  end if;
  return new;
end $$;
revoke all on function public.culto_question_notify() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'culto_question_notify' and tgrelid = 'public.bible_questions'::regclass) then
    create trigger culto_question_notify after insert or update on public.bible_questions
      for each row execute function public.culto_question_notify();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Aviso del día antes para los que sirven
-- ---------------------------------------------------------------------------
-- Una fila por aviso mandado: así nadie recibe dos veces el mismo, aunque la tarea corra de nuevo.
create table if not exists public.culto_reminders_sent (
  kind     text not null,
  ref      uuid not null,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  on_date  date not null,
  sent_at  timestamptz not null default now(),
  primary key (kind, ref, user_id, on_date)
);
alter table public.culto_reminders_sent enable row level security;
revoke all on public.culto_reminders_sent from anon, authenticated;

create or replace function public.culto_duty_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  c record; r record; v_tomorrow date; v_new integer; n integer := 0; v_parts text;
begin
  for c in select id, coalesce(timezone, 'America/Argentina/Buenos_Aires') as tz, coalesce(disabled_features, '{}') as off from public.churches loop
    v_tomorrow := (now() at time zone c.tz)::date + 1;

    -- Turnos de los ministerios
    if not ('ministerios' = any(c.off)) then
      for r in
        select d.id, d.profile_id, d.task, d.arrive_time, d.ministry_id, m.name
        from public.duties d join public.ministries m on m.id = d.ministry_id
        join public.profiles p on p.id = d.profile_id and p.disabled_at is null
        where d.church_id = c.id and d.on_date = v_tomorrow
      loop
        insert into public.culto_reminders_sent (kind, ref, user_id, on_date) values ('duty', r.id, r.profile_id, v_tomorrow) on conflict do nothing;
        get diagnostics v_new = row_count;
        if v_new = 1 then
          perform public.notify(r.profile_id, 'duty', 'Mañana servís en ' || lower(r.name),
            initcap(r.task) || coalesce('. Llegá a las ' || r.arrive_time, '') || '.', '/ministerio/' || r.ministry_id);
          n := n + 1;
        end if;
      end loop;
    end if;

    -- Maestros y ayudantes de las clases
    if not ('clases' = any(c.off)) then
      for r in
        select s.id, s.class_id, s.material_id, k.name, mt.title as lesson, x.who, x.helper
        from public.class_schedule s join public.classes k on k.id = s.class_id
        left join public.materials mt on mt.id = s.material_id
        cross join lateral (values (s.teacher_id, false), (s.helper_id, true)) as x(who, helper)
        join public.profiles p on p.id = x.who and p.disabled_at is null
        where s.church_id = c.id and s.on_date = v_tomorrow
      loop
        insert into public.culto_reminders_sent (kind, ref, user_id, on_date) values ('class', r.id, r.who, v_tomorrow) on conflict do nothing;
        get diagnostics v_new = row_count;
        if v_new = 1 then
          perform public.notify(r.who, 'class',
            case when r.helper then 'Mañana ayudás en ' else 'Mañana das la clase ' end || r.name,
            coalesce('Lección: ' || r.lesson || '. Tocá para verla.', 'Todavía no tiene lección cargada.'),
            '/clase/leccion?id=' || r.class_id || '&date=' || v_tomorrow);
          n := n + 1;
        end if;
      end loop;
    end if;

    -- Los que tienen una parte en el orden del culto (un aviso por persona y por culto, con todas sus partes)
    if not ('culto' = any(c.off)) then
      for r in
        select sp.id, sp.title, u.who
        from public.service_plans sp cross join lateral unnest(sp.people) as u(who)
        join public.profiles p on p.id = u.who and p.disabled_at is null
        where sp.church_id = c.id and sp.service_date = v_tomorrow
      loop
        insert into public.culto_reminders_sent (kind, ref, user_id, on_date) values ('plan', r.id, r.who, v_tomorrow) on conflict do nothing;
        get diagnostics v_new = row_count;
        if v_new = 1 then
          select string_agg(coalesce(nullif(e->>'title', ''), 'Una parte'), ', ' order by ord) into v_parts
          from public.service_plans sp, jsonb_array_elements(sp.items) with ordinality as t(e, ord)
          where sp.id = r.id and e->>'whoId' = r.who::text;
          perform public.notify(r.who, 'duty', 'Mañana tenés una parte en ' || lower(r.title),
            'Te toca: ' || left(coalesce(v_parts, 'una parte'), 200) || '. Orá y vení preparado.', '/culto/' || r.id);
          n := n + 1;
        end if;
      end loop;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.culto_duty_reminders() from public, anon, authenticated;

-- Una vez por día, a las 21:00 UTC (las 18:00 en Argentina): avisa lo de mañana.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'lamies-servir-manana';
    perform cron.schedule('lamies-servir-manana', '0 21 * * *', 'select public.culto_duty_reminders()');
  end if;
end $$;
