// Datos de la iglesia de ejemplo (demostración). Ver docs/DEMO.md.
//
//   node scripts/demo-seed.mjs            → escribe supabase/seed/demo/01_….sql, 02_….sql, …
//
// - Todo es inventado: los nombres salen de mezclar al azar listas de nombres y apellidos comunes.
// - El azar tiene semilla fija: correrlo dos veces da exactamente los mismos archivos.
// - Las fechas van relativas al día en que se carga (current_date - N), así los archivos sirven cualquier día.
// - Las tablas chicas (personas, familias…) van como inserts; la historia larga (más de un año de asistencia,
//   ofrendas, clases) va como "insert … select" que la base calcula con un azar que también es fijo (demo_h).
// - Cada archivo es una transacción y se puede volver a correr: usa ids fijos (demo_id) y "on conflict do nothing".
// - Se cargan en orden, como dueño de la base (SQL Editor de Supabase). Necesitan las migraciones 0085 y 0086
//   y las calles de Posadas en la tabla roads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = 20261124;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'seed', 'demo');

// ---------- azar con semilla ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (list) => list[Math.floor(rnd() * list.length)];
const chance = (p) => rnd() < p;

// ---------- constantes ----------
const CH = 'de300000-0000-4000-8000-000000000001';
const pid = (n) => `de300000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
// En el SQL, la iglesia y las cuentas se nombran con dos funciones cortas que se crean en el primer archivo.
const C = 'demo_c()';
const P = (n) => `demo_p(${n})`;

// Los lugares (calles, casas, paradas, zonas) no se inventan acá: la base los pone sobre las calles reales del centro de Posadas
// (migración 0086: demo_build_area, demo_place, demo_place_all).

// ---------- nombres (comunes en Argentina; se mezclan al azar) ----------
const MEN = ['Juan', 'Carlos', 'José', 'Luis', 'Miguel', 'Jorge', 'Roberto', 'Sergio', 'Marcelo', 'Diego', 'Martín', 'Alejandro', 'Fernando', 'Ramón', 'Oscar', 'Raúl', 'Walter', 'Néstor', 'Claudio', 'Fabián', 'Gabriel', 'Javier', 'Nicolás', 'Lucas', 'Facundo', 'Agustín', 'Franco', 'Emanuel', 'Ezequiel', 'Santiago', 'Joaquín', 'Bruno', 'Lautaro', 'Ignacio', 'Gonzalo', 'Maximiliano', 'Cristian', 'Ariel', 'Rodrigo', 'Mariano'];
const WOMEN = ['María', 'Laura', 'Silvia', 'Patricia', 'Mónica', 'Claudia', 'Norma', 'Susana', 'Liliana', 'Alicia', 'Rosa', 'Verónica', 'Andrea', 'Gabriela', 'Natalia', 'Valeria', 'Lorena', 'Paola', 'Romina', 'Florencia', 'Camila', 'Micaela', 'Agustina', 'Rocío', 'Milagros', 'Julieta', 'Abril', 'Martina', 'Valentina', 'Daiana', 'Yamila', 'Soledad', 'Celeste', 'Brenda', 'Antonella', 'Candela', 'Morena', 'Irma', 'Estela', 'Mirta', 'Olga'];
const LAST = ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Martínez', 'Pérez', 'García', 'Sánchez', 'Torres', 'Álvarez', 'Ruiz', 'Ramírez', 'Flores', 'Medina', 'Herrera', 'Aguirre', 'Pereyra', 'Gutiérrez', 'Molina', 'Silva', 'Castro', 'Rojas', 'Ortiz', 'Núñez', 'Luna', 'Juárez', 'Ríos', 'Morales', 'Godoy', 'Moreno', 'Ferreyra', 'Domínguez', 'Carrizo', 'Peralta', 'Castillo', 'Vega', 'Muñoz', 'Ponce', 'Cardozo', 'Coronel', 'Vázquez', 'Ramos', 'Vargas', 'Cáceres', 'Arias', 'Córdoba', 'Correa', 'Maldonado', 'Barrios', 'Bravo'];

// Las 14 cuentas de ejemplo. Solo las dos primeras sirven para entrar; las demás existen para que haya
// quien escriba en el chat, tome asistencia o tenga turnos. Ninguna puede guardar nada.
const ACCOUNTS = [
  { n: 1, mail: 'pastor', name: 'Ricardo Villalba', sex: 'm', role: 'admin', title: 'Pastor', age: 48 },
  { n: 2, mail: 'miembro', name: 'Lucía Benítez', sex: 'f', role: 'member', title: null, age: 34 },
  { n: 3, mail: 'cuenta03', name: 'Marta Quiroga', sex: 'f', role: 'secretary', title: 'Secretaria', age: 52 },
  { n: 4, mail: 'cuenta04', name: 'Daniel Acosta', sex: 'm', role: 'assistant_pastor', title: 'Pastor asistente', age: 39 },
  { n: 5, mail: 'cuenta05', name: 'Rubén Sosa', sex: 'm', role: 'deacon', title: 'Tesorero', fin: 'treasurer', age: 57 },
  { n: 6, mail: 'cuenta06', name: 'Hugo Maidana', sex: 'm', role: 'captain', title: 'Jefe de ruta', age: 44 },
  { n: 7, mail: 'cuenta07', name: 'Carina Ojeda', sex: 'f', role: 'captain', title: 'Jefa de ruta', age: 41 },
  { n: 8, mail: 'cuenta08', name: 'Tomás Giménez', sex: 'm', role: 'evangelism', title: 'Evangelismo', age: 29 },
  { n: 9, mail: 'cuenta09', name: 'Sofía Cabrera', sex: 'f', role: 'member', title: 'Maestra', age: 27 },
  { n: 10, mail: 'cuenta10', name: 'Gustavo Romero', sex: 'm', role: 'member', title: 'Música', age: 36 },
  { n: 11, mail: 'cuenta11', name: 'Noelia Paz', sex: 'f', role: 'member', title: 'Maestra', age: 31 },
  { n: 12, mail: 'cuenta12', name: 'Leandro Ledesma', sex: 'm', role: 'member', title: null, age: 33 },
  { n: 13, mail: 'cuenta13', name: 'Elena Figueroa', sex: 'f', role: 'member', title: null, age: 63 },
  { n: 14, mail: 'cuenta14', name: 'Julián Vera', sex: 'm', role: 'member', title: null, age: 21 },
];

// ---------- familias y personas ----------
const usedNames = new Set(ACCOUNTS.map((a) => a.name));
function fullName(sex, last) {
  for (let i = 0; i < 50; i++) {
    const name = `${pick(sex === 'm' ? MEN : WOMEN)} ${last}`;
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
  }
  throw new Error('sin nombres');
}
const usedLast = new Set();
function freshLast() {
  for (let i = 0; i < 200; i++) { const l = pick(LAST); if (!usedLast.has(l)) { usedLast.add(l); return l; } }
  return pick(LAST);
}

const houses = [];
const people = [];
let pk = 0;
// Antes acá se sorteaba un lugar en un pueblo inventado. Ahora el lugar lo pone la base sobre calles reales,
// pero se siguen tirando los mismos cuatro números al azar para que las personas salgan iguales a las ya cargadas.
const skipPlace = () => { int(0, 17); int(0, 7); rnd(); chance(0.5); };
/** kind: 'm' familia de miembros · 'a' vienen seguido pero no son miembros · 'n' visitas nuevas */
function addHouse(kind, last, build, longTime = false) {
  const hk = String(houses.length + 1);
  skipPlace();
  const old = longTime || (kind === 'm' ? chance(0.68) : false);
  // hace cuántos días empezaron a venir
  const created = old ? 520 : kind === 'm' ? int(9, 58) * 7 : kind === 'a' ? int(5, 50) * 7 : int(0, 4) * 7 + 3;
  const hp = kind === 'm' ? int(74, 97) * 10 : kind === 'a' ? int(38, 70) * 10 : 600;
  const h = { hk, name: `Familia ${last}`, hp, kind, created };
  houses.push(h);
  build((o) => {
    const age = o.age;
    const adult = age >= 18;
    const st = kind === 'm' ? 'member' : 'visitor';
    const p = {
      k: String(++pk), hk, name: o.name, sex: o.sex, ageD: age * 365 + int(0, 364), marital: o.marital ?? null,
      st, role: o.role, prof: o.prof ?? 0, adult,
      sinceD: st === 'member' ? (old ? int(700, 3000) : Math.max(created - int(40, 120), 7)) : 0,
      createdD: created,
      bapt: st === 'member' && age >= 9 ? (old ? (chance(0.5) ? int(600, 3000) : -1) : chance(0.75) ? Math.max(created - int(30, 90), 5) : 0) : 0,
      saved: !old && kind !== 'n' && age >= 7 && chance(0.55) ? Math.max(created - int(0, 30), 3) : 0,
      p: adult ? int(86, 100) * 10 : 960, stop: 0,
      bus: false,
    };
    people.push(p);
    return p;
  });
  return h;
}
const kidsOf = (add, last, n, maxAge) => {
  for (let i = 0; i < n; i++) {
    const sex = chance(0.5) ? 'm' : 'f';
    add({ name: fullName(sex, last), sex, age: int(1, maxAge), role: sex === 'm' ? 'hijo' : 'hija' });
  }
};

// Familias de las cuentas (para que el pastor y la hermana de ejemplo tengan casa, cónyuge e hijos).
addHouse('m', 'Villalba', (add) => {
  add({ name: 'Ricardo Villalba', sex: 'm', age: 48, marital: 'married', role: 'padre', prof: 1 });
  add({ name: fullName('f', 'Villalba'), sex: 'f', age: 46, marital: 'married', role: 'madre' });
  add({ name: fullName('f', 'Villalba'), sex: 'f', age: 16, role: 'hija' });
  add({ name: fullName('m', 'Villalba'), sex: 'm', age: 12, role: 'hijo' });
}, true);
addHouse('m', 'Benítez', (add) => {
  add({ name: fullName('m', 'Benítez'), sex: 'm', age: 37, marital: 'married', role: 'padre' });
  add({ name: 'Lucía Benítez', sex: 'f', age: 34, marital: 'married', role: 'madre', prof: 2 });
  add({ name: fullName('f', 'Benítez'), sex: 'f', age: 9, role: 'hija' });
  add({ name: fullName('m', 'Benítez'), sex: 'm', age: 6, role: 'hijo' });
  add({ name: fullName('f', 'Benítez'), sex: 'f', age: 2, role: 'hija' });
}, true);
for (const a of ACCOUNTS.slice(2)) {
  const last = a.name.split(' ').slice(1).join(' ');
  usedLast.add(last);
  addHouse('m', last, (add) => {
    const married = a.age >= 26 && a.age < 60 && chance(0.7);
    add({ name: a.name, sex: a.sex, age: a.age, marital: married ? 'married' : a.age > 60 ? 'widowed' : 'single', role: a.sex === 'm' ? 'padre' : 'madre', prof: a.n });
    if (married) {
      const s = a.sex === 'm' ? 'f' : 'm';
      add({ name: fullName(s, last), sex: s, age: a.age + int(-4, 4), marital: 'married', role: s === 'm' ? 'padre' : 'madre' });
      kidsOf(add, last, int(0, 3), Math.min(17, a.age - 22));
    }
  }, true);
}
['Villalba', 'Benítez'].forEach((l) => usedLast.add(l));
// El resto de las familias
const plan = [...Array(11).fill('m:pareja+hijos'), ...Array(4).fill('m:pareja'), ...Array(4).fill('m:sola+hijos'), ...Array(4).fill('m:solo'), ...Array(3).fill('m:mayores'),
  ...Array(5).fill('a:pareja+hijos'), ...Array(3).fill('a:sola+hijos'), ...Array(2).fill('a:solo'), ...Array(3).fill('n:pareja+hijos'), ...Array(2).fill('n:solo')];
for (const item of plan) {
  const [kind, shape] = item.split(':');
  const last = freshLast();
  addHouse(kind, last, (add) => {
    if (shape === 'pareja+hijos' || shape === 'pareja') {
      const age = int(26, 55);
      add({ name: fullName('m', last), sex: 'm', age, marital: 'married', role: 'padre' });
      add({ name: fullName('f', last), sex: 'f', age: age + int(-5, 3), marital: 'married', role: 'madre' });
      if (shape === 'pareja+hijos') kidsOf(add, last, int(1, 4), Math.min(17, age - 20));
    } else if (shape === 'sola+hijos') {
      const age = int(27, 48);
      add({ name: fullName('f', last), sex: 'f', age, marital: pick(['single', 'separated', 'widowed']), role: 'madre' });
      kidsOf(add, last, int(1, 3), Math.min(16, age - 19));
    } else if (shape === 'mayores') {
      const age = int(64, 82);
      add({ name: fullName('m', last), sex: 'm', age, marital: 'married', role: 'abuelo' });
      add({ name: fullName('f', last), sex: 'f', age: age - int(0, 6), marital: 'married', role: 'abuela' });
    } else {
      const sex = chance(0.45) ? 'm' : 'f';
      add({ name: fullName(sex, last), sex, age: int(19, 74), marital: pick(['single', 'single', 'widowed', 'divorced']), role: 'otro' });
    }
  });
}
// Algunos dejaron de venir: 1, 2, 3 o más semanas (para "Faltaron" y "Para atender").
const steady = houses.filter((h) => h.kind === 'm' && h.created > 200 && Number(h.hk) > 14);
[1, 1, 1, 2, 2, 3, 4, 6, 9, 15].forEach((w, i) => {
  const h = steady[(i * 3 + 1) % steady.length];
  for (const p of people.filter((x) => x.hk === h.hk)) p.stop = w;
});
// Los que vienen en el colectivo: familias sin auto, sobre todo chicos.
houses.filter((h) => h.kind !== 'n' && Number(h.hk) > 14).forEach((h, i) => {
  if (i % 4 === 0) for (const p of people.filter((x) => x.hk === h.hk)) p.bus = true;
});

// ---------- salida ----------
const files = [];
const batch = (name, sql) => files.push({ name, sql: `-- ${name} · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)\nbegin;\nset local session_replication_role = replica;\n${sql.trim()}\ncommit;\n` });
const D = (days) => `current_date - ${days}`;

// 01 · la iglesia, las reuniones, las cuentas
batch('01_iglesia_y_cuentas', `
create or replace function public.demo_c() returns uuid language sql immutable as $f$ select '${CH}'::uuid $f$;
create or replace function public.demo_p(n integer) returns uuid language sql immutable as $f$ select ('${pid(0).slice(0, -2)}' || lpad(n::text, 2, '0'))::uuid $f$;
revoke all on function public.demo_c() from public, anon, authenticated;
revoke all on function public.demo_p(integer) from public, anon, authenticated;
insert into public.churches (id, name, city, country, timezone, grouping, tracking_since, giving, inactive_months, fin_track_donors, certificate_pastor, absence_dow, absence_hour, reminder_dow, reminder_hour, created_at)
values (${C}, 'Iglesia Bautista Esperanza', 'Ciudad de ejemplo', 'AR', 'America/Argentina/Buenos_Aires', 'bus_routes', ${D(430)},
  '{"titular":"Iglesia Bautista Esperanza (ejemplo)","banco":"Banco de ejemplo","alias":"ESTO.ES.UN.EJEMPLO","nota":"Datos de ejemplo. No es una cuenta real."}'::jsonb,
  null, true, 'Ricardo Villalba', 0, 21, 1, 9, now() - interval '520 days')
on conflict (id) do nothing;
insert into public.demo_churches (church_id, pastor_id, member_id, note)
values (${C}, ${P(1)}, ${P(2)}, 'Iglesia de ejemplo para mostrar La Mies') on conflict (church_id) do nothing;
insert into public.admin_church_settings (church_id, my_giving_on, motto, setup_pending, setup_step, setup_done_at)
values (${C}, true, 'Una iglesia de ejemplo para conocer La Mies', false, 0, now() - interval '500 days') on conflict (church_id) do nothing;
insert into public.church_services (id, church_id, name, dow, time, main, active, sort_order) values
  (demo_id('s1'), ${C}, 'Domingo a la mañana', 0, '10:00', true, true, 10),
  (demo_id('s2'), ${C}, 'Domingo a la noche', 0, '19:30', true, true, 20),
  (demo_id('s3'), ${C}, 'Miércoles de oración', 3, '20:00', false, true, 30)
on conflict (id) do nothing;
insert into public.groups (id, church_id, name, captain_id) values
  (demo_id('g1'), ${C}, 'Ruta Norte', ${P(6)}), (demo_id('g2'), ${C}, 'Ruta Sur', ${P(7)})
on conflict (id) do nothing;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.mail || '@demo.lamies.invalid',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 10)), now() - interval '400 days',
  '{"provider":"email","providers":["email"],"lamies_demo":true}'::jsonb, '{}'::jsonb, now() - interval '400 days', now(), '', '', '', '', '', '', '', '', false, false
from (values ${ACCOUNTS.map((a) => `(${P(a.n)}, ${q(a.mail)})`).join(', ')}) v(id, mail)
on conflict (id) do nothing;
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false), 'email', now(), u.created_at, now()
from auth.users u where u.raw_app_meta_data ? 'lamies_demo' and not exists (select 1 from auth.identities i where i.user_id = u.id);
insert into public.profiles (id, church_id, group_id, role, display_name, title, directory_visible, finance_role, rules_accepted_at, biometric_lock, takes_attendance, created_at)
select v.id, ${C}, case v.n when 6 then demo_id('g1') when 7 then demo_id('g2') end, v.role::public.member_role, v.name, v.title, true, v.fin, now() - interval '390 days', false, v.n in (3, 6, 7), now() - interval '400 days'
from (values ${ACCOUNTS.map((a) => `(${a.n}, ${P(a.n)}, ${q(a.role)}, ${q(a.name)}, ${q(a.title)}, ${q(a.fin ?? null)})`).join(',\n  ')}) v(n, id, role, name, title, fin)
on conflict (id) do nothing;
select public.demo_new_entry_key();
-- La zona de ejemplo: las calles reales del centro de Posadas que ya están en la tabla roads (hay que tenerlas cargadas).
do $z$ begin if public.demo_build_area() < 300 then raise exception 'Faltan las calles del centro de Posadas en la tabla roads (correr scripts/import-roads.mjs)'; end if; end $z$;
`);

// 02 · familias y personas
const hRows = houses.map((h) => `(${q(h.hk)},${q(h.name)},${h.hp})`);
const pRows = people.map((p) => `(${q(p.k)},${q(p.hk)},${q(p.name)},${q(p.sex)},${p.ageD},${q(p.marital)},${q(p.st)},${p.sinceD},${p.createdD},${q(p.role)},${p.prof},${p.bus},${p.bapt},${p.saved},${p.p},${p.stop})`);
batch('02_familias_y_personas', `
create temp table t_h (hk text, name text, hp int) on commit drop;
insert into t_h values
${hRows.join(',\n')};
create temp table t_p (k text, hk text, name text, sex text, age_d int, marital text, st text, since_d int, created_d int, role text, prof int, bus boolean, bapt int, saved int, p int, stop_w int) on commit drop;
insert into t_p values
${pRows.join(',\n')};
insert into public.households (id, church_id, name, created_by, created_at)
select demo_id('h' || hk), ${C}, name, ${P(3)}, now() - interval '380 days' from t_h on conflict (id) do nothing;
insert into public.contacts (id, church_id, created_by, created_at, updated_at, name, age, sex, marital, phone, interest, status, member_since, birthdate,
  profile_id, baptized, baptized_here, baptized_on, saved_on, bus_rider, pickup_time, share_mode, baseline, gospel_presented)
select demo_id('c' || p.k), ${C}, ${P(3)}, (current_date - p.created_d) + time '11:00', now(), p.name, p.age_d / 365, p.sex, p.marital,
  case when p.age_d >= 14 * 365 then '+54 9 1005 55-' || lpad(p.k, 4, '0') end, 'very', p.st,
  case when p.since_d > 0 and p.age_d >= 12 * 365 then current_date - least(p.since_d, p.age_d - 9 * 365) end, current_date - p.age_d,
  case when p.prof > 0 then demo_p(p.prof) end,
  p.bapt <> 0, p.bapt > 0, case when p.bapt > 0 then current_date - p.bapt end, case when p.saved > 0 then current_date - p.saved end,
  p.bus, case when p.bus then '09:' || lpad((10 + demo_h('bt' || p.hk) % 40)::text, 2, '0') end, 'group',
  case when p.created_d >= 430 then case p.st when 'member' then 'member' else 'person' end end, true
from t_p p join t_h h using (hk) on conflict (id) do nothing;
update public.contacts c set spouse_id = demo_id('c' || o.k)
from t_p p join t_p o on o.hk = p.hk and o.k <> p.k and o.marital = 'married'
where p.marital = 'married' and c.id = demo_id('c' || p.k) and c.spouse_id is null;
update public.profiles pr set phone = c.phone from public.contacts c where c.profile_id = pr.id and c.church_id = ${C} and pr.phone is null;
insert into public.household_members (household_id, contact_id, role, can_pickup)
select demo_id('h' || hk), demo_id('c' || k), role, age_d >= 18 * 365 from t_p on conflict do nothing;
insert into public.contact_children (id, contact_id, name, age, birthdate, child_contact_id)
select demo_id('k' || a.k || '-' || k.k), demo_id('c' || a.k), split_part(k.name, ' ', 1), k.age_d / 365, current_date - k.age_d, demo_id('c' || k.k)
from t_p a join t_p k on k.hk = a.hk and k.role in ('hijo', 'hija') where a.role in ('padre', 'madre') on conflict (id) do nothing;
insert into public.demo_plan (contact_id, church_id, hk, p, hp, stop_on)
select demo_id('c' || p.k), ${C}, p.hk, p.p, h.hp, case when p.stop_w > 0 then current_date - p.stop_w * 7 end
from t_p p join t_h h using (hk) on conflict (contact_id) do nothing;
-- Cada familia a su lugar: una vereda de una calle real del centro (ver demo_place_all en la migración 0086).
select public.demo_place_all(${C});
`);

// Las demás partes están en demo-seed-partes.mjs (historia, clases, ministerios, eventos, finanzas, mapa, devocionales).
const { addParts } = await import('./demo-seed-partes.mjs');
addParts({ houses, people, batch, q, C, P, D, int, pick, chance, ACCOUNTS });

mkdirSync(OUT, { recursive: true });
for (const f of files) writeFileSync(join(OUT, `${f.name}.sql`), f.sql);
console.log(`${houses.length} familias, ${people.length} personas, ${files.length} archivos en supabase/seed/demo/`);
for (const f of files) console.log(`  ${f.name}.sql  ${(f.sql.length / 1024).toFixed(1)} KB`);
