-- ============================================================================
-- La Mies · Parte 2 · Datos iniciales de Iglesia Bautista Victoria
-- Se puede correr más de una vez: no duplica nada.
-- ============================================================================
do $$
declare
  v_church uuid;
begin
  select id into v_church from public.churches order by created_at limit 1;
  if v_church is null then
    raise notice 'No hay iglesia todavía';
    return;
  end if;

  update public.churches set name = 'Iglesia Bautista Victoria', city = coalesce(city, 'Posadas'), grouping = 'bus_routes'
  where id = v_church and name ilike '%victoria%';

  -- Colectivo
  if not exists (select 1 from public.groups where church_id = v_church and name = 'El Porvenir') then
    insert into public.groups (church_id, name) values (v_church, 'El Porvenir');
  end if;

  -- Reuniones (reemplaza las dos de fábrica si todavía no se usaron)
  if not exists (select 1 from public.church_services where church_id = v_church and name = 'Jóvenes') then
    delete from public.church_services s where s.church_id = v_church
      and s.name in ('Culto del sábado', 'Culto del domingo')
      and not exists (select 1 from public.attendances a where a.service_id = s.id);
    insert into public.church_services (church_id, name, dow, time, main, sort_order)
    select v_church, x.name, x.dow, x.time, x.main, x.sort_order
    from (values
      ('Jóvenes', 6, '10:00', false, 10),
      ('Oración', 6, '17:30', false, 20),
      ('Culto del sábado', 6, '19:00', true, 30),
      ('Culto del domingo', 0, '10:00', true, 40)
    ) as x(name, dow, time, main, sort_order)
    where not exists (select 1 from public.church_services s where s.church_id = v_church and s.name = x.name);
  end if;

  -- Clases de escuela dominical (sábado y domingo)
  insert into public.classes (church_id, name, age_min, age_max, days, sort_order)
  select v_church, x.name, x.a, x.b, '{sat,sun}', x.o
  from (values ('Cuna (0 a 2 años)', 0, 2, 10), ('Niños (2 a 6 años)', 2, 6, 20), ('Niños (6 a 12 años)', 6, 12, 30))
    as x(name, a, b, o)
  where not exists (select 1 from public.classes k where k.church_id = v_church and k.name = x.name);

  -- Ministerios
  insert into public.ministries (church_id, name, description, icon, can_take_attendance, is_teaching, sort_order)
  select v_church, x.name, x.d, x.icon, x.att, x.teach, x.o
  from (values
    ('Enseñanza', 'Maestros y ayudantes de las clases de los chicos.', 'book-open', false, true, 10),
    ('Recepción', 'Recibir a cada persona en la puerta, saludar a las visitas y tomar asistencia.', 'smile', true, false, 20),
    ('Oración', 'Orar por la iglesia, las visitas y las salidas de evangelismo.', 'heart', false, false, 30),
    ('Limpieza', 'Dejar el templo limpio y listo antes y después de cada reunión.', 'droplet', false, false, 40),
    ('Desayuno', 'Preparar y servir el desayuno del domingo a las 9:30.', 'coffee', false, false, 50)
  ) as x(name, d, icon, att, teach, o)
  where not exists (select 1 from public.ministries m where m.church_id = v_church and m.name = x.name);

  -- Recomendaciones de ejemplo (el líder las puede borrar o cambiar)
  if exists (select 1 from public.profiles where church_id = v_church) then
    insert into public.ministry_messages (church_id, ministry_id, user_id, kind, body)
    select v_church, m.id, (select id from public.profiles where church_id = v_church order by (role::text = 'admin') desc, created_at limit 1),
           'recommendation', x.body
    from public.ministries m
    join (values
      ('Recepción', 'Llegá una hora antes. Saludá a cada persona por su nombre, sonreí y ayudá a las visitas a encontrar lugar. Anotá a cada visita nueva en la app.'),
      ('Limpieza', 'Revisá baños, sillas y el piso del templo antes de cada reunión. Avisá al líder si falta algún producto.'),
      ('Desayuno', 'Llegá a las 8:30. Tené todo listo a las 9:30 y dejá la cocina limpia antes del culto de las 10.'),
      ('Enseñanza', 'Estudiá el capítulo de la semana con tiempo y llegá 20 minutos antes para preparar el aula.')
    ) as x(name, body) on x.name = m.name
    where m.church_id = v_church
      and not exists (select 1 from public.ministry_messages mm where mm.ministry_id = m.id and mm.kind = 'recommendation');
  end if;
end $$;

select c.name as iglesia,
       (select count(*) from public.church_services s where s.church_id = c.id) as reuniones,
       (select count(*) from public.classes k where k.church_id = c.id) as clases,
       (select count(*) from public.ministries m where m.church_id = c.id) as ministerios
from public.churches c;
