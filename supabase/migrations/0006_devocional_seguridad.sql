-- ============================================================================
-- La Mies · Parte 3 · Versículo del día, devocional, racha de lectura,
-- DNI y bautismo en la ficha, cuentas desactivadas.
-- Se puede correr más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Ficha: DNI (opcional) y bautismo como casilla
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column if not exists dni text,
  add column if not exists baptized boolean not null default false;
update public.contacts set baptized = true where baptized_on is not null and not baptized;

-- Cuentas desactivadas por el pastor: no pueden entrar a los datos de la iglesia.
alter table public.profiles add column if not exists disabled_at timestamptz;

create or replace function public.current_church_id() returns uuid
language sql stable security definer set search_path = public as $$
  select church_id from public.profiles where id = auth.uid() and disabled_at is null
$$;

create or replace function public.set_account_disabled(p_user uuid, p_disabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not public.is_admin() then raise exception 'Solo el pastor (administrador)'; end if;
  select role::text into v_role from public.profiles where id = p_user and church_id = public.current_church_id();
  if v_role is null then raise exception 'Esa persona no es de tu iglesia'; end if;
  if p_user = auth.uid() then raise exception 'No podés desactivar tu propia cuenta'; end if;
  perform set_config('lamies.bypass_guard', 'on', true);
  update public.profiles set disabled_at = case when p_disabled then now() end, push_token = case when p_disabled then null else push_token end where id = p_user;
  perform set_config('lamies.bypass_guard', 'off', true);
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'set_account_disabled', p_user::text, jsonb_build_object('disabled', p_disabled));
end $$;
grant execute on function public.set_account_disabled(uuid, boolean) to authenticated;

-- El guard de perfiles también protege disabled_at.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('lamies.bypass_guard', true) = 'on' then
    return new;
  end if;
  if new.id <> old.id then
    raise exception 'No se puede cambiar el id';
  end if;
  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id
      or new.group_id is distinct from old.group_id
      or new.is_network_admin is distinct from old.is_network_admin
      or new.takes_attendance is distinct from old.takes_attendance
      or new.disabled_at is distinct from old.disabled_at)
     and not public.is_staff() then
    raise exception 'Solo un administrador puede cambiar rol, iglesia, grupo o permisos';
  end if;
  if (new.role::text = 'admin' or old.role::text = 'admin') and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Solo el pastor (administrador) puede nombrar o quitar administradores';
  end if;
  if new.church_id is distinct from old.church_id and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar la iglesia';
  end if;
  if new.is_network_admin is distinct from old.is_network_admin then
    raise exception 'El administrador de la red se asigna desde la base de datos';
  end if;
  return new;
end $$;

-- Lista de cuentas con su estado (para el pastor): correo, 2FA, desactivada.
create or replace function public.accounts_overview()
returns table (id uuid, display_name text, email text, role text, disabled_at timestamptz, has_mfa boolean, last_sign_in timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.role::text, p.disabled_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
         u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_staff() and p.church_id = public.current_church_id()
  order by p.display_name
$$;
grant execute on function public.accounts_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Versículo del día y devocional
--   church_id null = contenido general para todas las iglesias.
--   Cada iglesia puede cargar el suyo para una fecha; si existe, gana sobre el general.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_content (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references public.churches(id) on delete cascade,
  on_date     date not null,
  reference   text not null,                 -- "Juan 3:16"
  verse       text not null,                 -- texto RV1960 completo
  message     text,                          -- frase corta para la tarjeta (historia)
  devotional  text,                          -- lectura del día (varios párrafos)
  background  text not null default 'campo', -- fondo: nombre de un fondo incluido o ruta en el bucket "photos"
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (church_id, on_date)
);
create unique index if not exists daily_content_global_idx on public.daily_content (on_date) where church_id is null;
alter table public.daily_content enable row level security;
drop policy if exists daily_content_select on public.daily_content;
create policy daily_content_select on public.daily_content for select to authenticated
  using (church_id is null or church_id = public.current_church_id());
drop policy if exists daily_content_write on public.daily_content;
create policy daily_content_write on public.daily_content for all to authenticated
  using (church_id = public.current_church_id() and public.is_staff())
  with check (church_id = public.current_church_id() and public.is_staff());
grant select, insert, update, delete on public.daily_content to authenticated;
grant all on public.daily_content to service_role;
-- Desde la app siempre se guarda para la iglesia de quien lo carga; el contenido general lo carga el sistema.
create or replace function public.daily_content_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.church_id := public.current_church_id();
    new.created_by := auth.uid();
    if new.church_id is null then raise exception 'La persona no pertenece a ninguna iglesia'; end if;
  end if;
  return new;
end $$;
drop trigger if exists daily_content_stamp on public.daily_content;
create trigger daily_content_stamp before insert on public.daily_content
  for each row execute function public.daily_content_stamp();

-- Lo de hoy (o de una fecha): primero lo de la iglesia, si no lo general,
-- si no hay nada para esa fecha, se elige uno general rotando por el día del año.
create or replace function public.daily_for(p_date date default null)
returns public.daily_content
language plpgsql stable security definer set search_path = public as $$
declare
  d date := coalesce(p_date, (now() at time zone coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires'))::date);
  r public.daily_content;
  n integer;
begin
  select * into r from public.daily_content where church_id = public.current_church_id() and on_date = d;
  if r.id is not null then return r; end if;
  select * into r from public.daily_content where church_id is null and on_date = d;
  if r.id is not null then return r; end if;
  select count(*) into n from public.daily_content where church_id is null;
  if n = 0 then return null; end if;
  select * into r from public.daily_content where church_id is null
  order by id offset (extract(doy from d)::int % n) limit 1;
  r.on_date := d;
  return r;
end $$;
grant execute on function public.daily_for(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Racha de lectura: un registro por persona y día en que abrió el devocional
-- ---------------------------------------------------------------------------
create table if not exists public.reading_log (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  on_date  date not null,
  read_at  timestamptz not null default now(),
  primary key (user_id, on_date)
);
alter table public.reading_log enable row level security;
drop policy if exists reading_log_own on public.reading_log;
create policy reading_log_own on public.reading_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.reading_log to authenticated;
grant all on public.reading_log to service_role;

-- Marca la lectura de hoy y devuelve la racha actual, la mejor y los premios.
create or replace function public.mark_reading()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  d date := (now() at time zone v_tz)::date;
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  insert into public.reading_log (user_id, on_date) values (auth.uid(), d) on conflict do nothing;
  return public.reading_streak();
end $$;
grant execute on function public.mark_reading() to authenticated;

create or replace function public.reading_streak()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires');
  today date := (now() at time zone v_tz)::date;
  cur integer := 0;
  best integer := 0;
  run integer := 0;
  prev date := null;
  r record;
  total integer := 0;
  read_today boolean := false;
begin
  for r in select on_date from public.reading_log where user_id = auth.uid() order by on_date loop
    total := total + 1;
    if prev is not null and r.on_date = prev + 1 then run := run + 1; else run := 1; end if;
    if run > best then best := run; end if;
    prev := r.on_date;
  end loop;
  -- La racha actual sigue viva si leyó hoy o ayer.
  if prev is not null and (prev = today or prev = today - 1) then cur := run; else cur := 0; end if;
  read_today := (prev = today);
  return jsonb_build_object(
    'current', cur, 'best', best, 'total', total, 'read_today', read_today,
    'rewards', jsonb_build_array(
      jsonb_build_object('days', 7,   'label', 'Una semana',  'earned', best >= 7),
      jsonb_build_object('days', 30,  'label', 'Un mes',      'earned', best >= 30),
      jsonb_build_object('days', 365, 'label', 'Un año',      'earned', best >= 365)));
end $$;
grant execute on function public.reading_streak() to authenticated;

-- Las rachas de la iglesia (para animar): quiénes van mejor.
create or replace function public.reading_board()
returns table (user_id uuid, display_name text, photo_path text, current_streak integer, best_streak integer)
language sql stable security definer set search_path = public as $$
  with tz as (select coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires') as tz),
  logs as (
    select l.user_id, l.on_date,
           l.on_date - (row_number() over (partition by l.user_id order by l.on_date))::int as grp
    from public.reading_log l join public.profiles p on p.id = l.user_id
    where p.church_id = public.current_church_id()
  ),
  runs as (select user_id, grp, count(*)::int as len, max(on_date) as last_day from logs group by user_id, grp)
  select p.id, p.display_name, c.photo_path,
         coalesce((select len from runs r, tz where r.user_id = p.id and r.last_day >= (now() at time zone tz.tz)::date - 1 order by last_day desc limit 1), 0),
         coalesce((select max(len) from runs r where r.user_id = p.id), 0)
  from public.profiles p
  left join public.contacts c on c.profile_id = p.id
  where p.church_id = public.current_church_id() and p.disabled_at is null
    and exists (select 1 from public.reading_log l where l.user_id = p.id)
  order by 4 desc, 5 desc, 2
$$;
grant execute on function public.reading_board() to authenticated;

-- ---------------------------------------------------------------------------
-- Versículos generales (RV1960) para que nunca falte el del día.
-- Las iglesias agregan los suyos con devocional desde la app.
-- ---------------------------------------------------------------------------
insert into public.daily_content (church_id, on_date, reference, verse, message, background)
select null, ('2026-01-01'::date + (row_number() over () - 1)::int), x.ref, x.verse, x.msg, x.bg
from (values
  ('Juan 3:16', 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.', 'Dios te amó primero.', 'cielo'),
  ('Mateo 9:37', 'Entonces dijo a sus discípulos: A la verdad la mies es mucha, mas los obreros pocos.', 'Hoy alguien necesita oír de Jesús.', 'campo'),
  ('Romanos 10:13', 'porque todo aquel que invocare el nombre del Señor, será salvo.', 'La puerta está abierta para todos.', 'amanecer'),
  ('Salmos 119:105', 'Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.', 'Dejá que la Biblia guíe tu día.', 'noche'),
  ('Proverbios 3:5-6', 'Fíate de Jehová de todo tu corazón, Y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, Y él enderezará tus veredas.', 'Confiá, aunque no entiendas.', 'rio'),
  ('Filipenses 4:13', 'Todo lo puedo en Cristo que me fortalece.', 'No estás solo en esto.', 'montana'),
  ('Isaías 41:10', 'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia.', 'Dios está con vos hoy.', 'cielo'),
  ('Salmos 23:1', 'Jehová es mi pastor; nada me faltará.', 'Él cuida de vos.', 'campo'),
  ('Romanos 8:28', 'Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.', 'Nada se desperdicia en las manos de Dios.', 'amanecer'),
  ('Mateo 11:28', 'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.', 'Descansá en Jesús.', 'rio'),
  ('Josué 1:9', 'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.', 'Sé valiente hoy.', 'montana'),
  ('Salmos 46:1', 'Dios es nuestro amparo y fortaleza, Nuestro pronto auxilio en las tribulaciones.', 'Él es tu refugio.', 'noche'),
  ('Juan 14:6', 'Jesús le dijo: Yo soy el camino, y la verdad, y la vida; nadie viene al Padre, sino por mí.', 'Un solo camino: Jesús.', 'cielo'),
  ('Hechos 1:8', 'pero recibiréis poder, cuando haya venido sobre vosotros el Espíritu Santo, y me seréis testigos en Jerusalén, en toda Judea, en Samaria, y hasta lo último de la tierra.', 'Sos testigo donde estás.', 'campo'),
  ('Romanos 5:8', 'Mas Dios muestra su amor para con nosotros, en que siendo aún pecadores, Cristo murió por nosotros.', 'Te amó cuando no lo merecías.', 'amanecer'),
  ('2 Corintios 5:17', 'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.', 'Hoy podés empezar de nuevo.', 'rio'),
  ('Salmos 37:5', 'Encomienda a Jehová tu camino, Y confía en él; y él hará.', 'Entregale tu día.', 'montana'),
  ('Marcos 16:15', 'Y les dijo: Id por todo el mundo y predicad el evangelio a toda criatura.', 'Contale a alguien hoy.', 'campo'),
  ('1 Juan 1:9', 'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados, y limpiarnos de toda maldad.', 'Hay perdón para vos.', 'noche'),
  ('Hebreos 13:8', 'Jesucristo es el mismo ayer, y hoy, y por los siglos.', 'Él no cambia.', 'cielo'),
  ('Salmos 118:24', 'Este es el día que hizo Jehová; Nos gozaremos y alegraremos en él.', 'Alegrate: hoy es un regalo.', 'amanecer'),
  ('Mateo 6:33', 'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.', 'Dios primero, lo demás viene.', 'campo'),
  ('Jeremías 29:11', 'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz, y no de mal, para daros el fin que esperáis.', 'Dios tiene un plan para vos.', 'rio'),
  ('Efesios 2:8-9', 'Porque por gracia sois salvos por medio de la fe; y esto no de vosotros, pues es don de Dios; no por obras, para que nadie se gloríe.', 'La salvación es un regalo.', 'cielo'),
  ('Santiago 1:5', 'Y si alguno de vosotros tiene falta de sabiduría, pídala a Dios, el cual da a todos abundantemente y sin reproche, y le será dada.', 'Pedile sabiduría hoy.', 'montana'),
  ('Salmos 34:8', 'Gustad, y ved que es bueno Jehová; Dichoso el hombre que confía en él.', 'Dios es bueno.', 'amanecer'),
  ('1 Pedro 5:7', 'echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.', 'Dale tus preocupaciones.', 'noche'),
  ('Lucas 19:10', 'Porque el Hijo del Hombre vino a buscar y a salvar lo que se había perdido.', 'Jesús vino por los perdidos.', 'campo'),
  ('Salmos 27:1', 'Jehová es mi luz y mi salvación; ¿de quién temeré? Jehová es la fortaleza de mi vida; ¿de quién he de atemorizarme?', 'Sin miedo.', 'cielo'),
  ('Gálatas 2:20', 'Con Cristo estoy juntamente crucificado, y ya no vivo yo, mas vive Cristo en mí; y lo que ahora vivo en la carne, lo vivo en la fe del Hijo de Dios, el cual me amó y se entregó a sí mismo por mí.', 'Cristo vive en vos.', 'rio'),
  ('Colosenses 3:23', 'Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres;', 'Trabajá hoy para el Señor.', 'montana'),
  ('Salmos 91:1', 'El que habita al abrigo del Altísimo Morará bajo la sombra del Omnipotente.', 'Quedate cerca de Él.', 'noche'),
  ('Juan 10:10', 'El ladrón no viene sino para hurtar y matar y destruir; yo he venido para que tengan vida, y para que la tengan en abundancia.', 'Jesús da vida en abundancia.', 'amanecer'),
  ('Romanos 12:2', 'No os conforméis a este siglo, sino transformaos por medio de la renovación de vuestro entendimiento, para que comprobéis cuál sea la buena voluntad de Dios, agradable y perfecta.', 'Renová tu mente hoy.', 'cielo'),
  ('Salmos 51:10', 'Crea en mí, oh Dios, un corazón limpio, Y renueva un espíritu recto dentro de mí.', 'Un corazón limpio.', 'rio'),
  ('Mateo 28:19-20', 'Por tanto, id, y haced discípulos a todas las naciones, bautizándolos en el nombre del Padre, y del Hijo, y del Espíritu Santo; enseñándoles que guarden todas las cosas que os he mandado; y he aquí yo estoy con vosotros todos los días, hasta el fin del mundo. Amén.', 'Él está con vos todos los días.', 'campo'),
  ('Proverbios 18:10', 'Torre fuerte es el nombre de Jehová; A él correrá el justo, y será levantado.', 'Corré a Él.', 'montana'),
  ('1 Tesalonicenses 5:16-18', 'Estad siempre gozosos. Orad sin cesar. Dad gracias en todo, porque esta es la voluntad de Dios para con vosotros en Cristo Jesús.', 'Gozo, oración, gratitud.', 'amanecer'),
  ('Salmos 100:4', 'Entrad por sus puertas con acción de gracias, Por sus atrios con alabanza; Alabadle, bendecid su nombre.', 'Empezá con gratitud.', 'cielo'),
  ('Isaías 40:31', 'pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.', 'Fuerzas nuevas para hoy.', 'montana')
) as x(ref, verse, msg, bg)
where not exists (select 1 from public.daily_content where church_id is null);
