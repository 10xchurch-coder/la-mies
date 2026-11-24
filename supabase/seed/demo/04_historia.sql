-- 04_historia · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)
begin;
set local session_replication_role = replica;
select public.demo_fill(demo_c(), current_date - 434, current_date - 1);
set local session_replication_role = replica;
insert into public.decisions (id, church_id, contact_id, kind, on_date, created_by, created_at)
select demo_id('de' || ct.id::text || v.kind), demo_c(), ct.id, v.kind, v.d, demo_p(1), v.d + time '12:30'
from public.contacts ct cross join lateral (values ('saved', ct.saved_on), ('baptized', ct.baptized_on), ('member', ct.member_since)) v(kind, d)
where ct.church_id = demo_c() and v.d > current_date - 430 and exists (select 1 from public.demo_plan pl where pl.contact_id = ct.id)
on conflict (id) do nothing;
insert into public.follow_up_tasks (id, church_id, contact_id, assigned_to, kind, due_at, done_at, done_by, created_at)
select demo_id('ft' || ct.id::text || v.kind), demo_c(), ct.id, g.captain_id, v.kind, ct.created_at + v.due,
  case when ct.created_at + v.due < now() - interval '4 days' and demo_h('ftd' || ct.id::text || v.kind) < 600 then ct.created_at + v.due + interval '20 hours' end,
  case when ct.created_at + v.due < now() - interval '4 days' and demo_h('ftd' || ct.id::text || v.kind) < 600 then g.captain_id end, ct.created_at + interval '2 hours'
from public.contacts ct join public.groups g on g.id = ct.group_id
cross join (values ('call', interval '2 days'), ('visit', interval '7 days')) v(kind, due)
where ct.church_id = demo_c() and ct.status = 'visitor' and ct.age >= 18 and ct.created_at > now() - interval '40 days'
on conflict do nothing;
insert into public.follow_up_tasks (id, church_id, contact_id, assigned_to, kind, due_at, created_at)
select demo_id('fta' || ct.id::text), demo_c(), ct.id, g.captain_id, 'absent_visit', pl.stop_on + 21, pl.stop_on + 15
from public.demo_plan pl join public.contacts ct on ct.id = pl.contact_id join public.groups g on g.id = ct.group_id
where pl.church_id = demo_c() and pl.stop_on <= current_date - 20 and ct.age >= 18
on conflict do nothing;
insert into public.visitor_care (contact_id, church_id, gift_on, gift_by, visit_on, visit_by)
select ct.id, demo_c(), case when demo_h('vg' || ct.id::text) < 650 then ct.created_at::date end, case when demo_h('vg' || ct.id::text) < 650 then demo_p(3) end,
  case when demo_h('vv' || ct.id::text) < 350 and ct.created_at < now() - interval '8 days' then ct.created_at::date + 6 end,
  case when demo_h('vv' || ct.id::text) < 350 and ct.created_at < now() - interval '8 days' then g.captain_id end
from public.contacts ct join public.groups g on g.id = ct.group_id
where ct.church_id = demo_c() and ct.status = 'visitor' and ct.age >= 18 and ct.created_at > now() - interval '40 days'
on conflict do nothing;
insert into public.visit_cards (id, church_id, contact_id, name, phone, heard, prayer, is_new, created_at)
select demo_id('vc' || ct.id::text), demo_c(), ct.id, ct.name, ct.phone, (array['Me invitó un vecino', 'Vi el cartel del salón', 'Vine con una amiga', 'Pasaron por mi casa un sábado'])[1 + demo_h('vh' || ct.id::text) % 4],
  (array['Por mi trabajo', 'Por la salud de mi mamá', 'Por mis hijos', null])[1 + demo_h('vp' || ct.id::text) % 4], true, ct.created_at + interval '20 minutes'
from public.contacts ct where ct.church_id = demo_c() and ct.status = 'visitor' and ct.age >= 18 and ct.created_at > now() - interval '40 days'
on conflict (id) do nothing;
with t as (select ct.id, ct.saved_on, row_number() over (order by ct.saved_on desc, ct.id) as rn, 1 + demo_h('dl' || ct.id::text) % 4 as n
           from public.contacts ct where ct.church_id = demo_c() and ct.saved_on is not null and ct.age >= 12 and ct.saved_on < current_date - 10),
u as (update public.contacts ct set discipleship_since = t.saved_on + 7,
        discipleship = jsonb_build_object('one', coalesce((select jsonb_object_agg(i::text, (t.saved_on + 7 * i)::text) from generate_series(1, t.n) i where t.saved_on + 7 * i <= current_date), '{}'::jsonb))
      from t where ct.id = t.id and t.rn <= 10 returning ct.id, t.saved_on, t.n, t.rn)
insert into public.disciple_tracks (contact_id, church_id, teacher_contact_id, started_on, last_met_on, finished_on, active, updated_by)
select u.id, demo_c(), (array[demo_id('c11'), demo_id('c22'), demo_id('c6'), demo_id('c14')])[(1 + u.rn % 4)::int], u.saved_on + 7, least(u.saved_on + 7 * u.n, current_date - 2),
  case when u.n = 4 and u.saved_on + 28 <= current_date then u.saved_on + 28 end, not (u.n = 4 and u.saved_on + 28 <= current_date), demo_p(4)
from u on conflict (contact_id) do nothing;
insert into public.member_class (contact_id, church_id, started_on, done, final_on, final_by, updated_by)
select ct.id, demo_c(), ct.member_since - 35, jsonb_build_object('1', (ct.member_since - 28)::text, '2', (ct.member_since - 21)::text, '3', (ct.member_since - 14)::text, '4', (ct.member_since - 7)::text), ct.member_since, demo_p(1), demo_p(1)
from public.contacts ct where ct.church_id = demo_c() and ct.status = 'member' and ct.age >= 14 and ct.member_since > current_date - 150
on conflict (contact_id) do nothing;
insert into public.member_class (contact_id, church_id, started_on, done, updated_by)
select x.id, demo_c(), current_date - 24, case when x.rn % 2 = 0 then jsonb_build_object('1', (current_date - 17)::text, '2', (current_date - 10)::text, '3', (current_date - 3)::text) else jsonb_build_object('1', (current_date - 17)::text) end, demo_p(1)
from (select ct.id, row_number() over (order by demo_h('mc' || ct.id::text), ct.id) as rn from public.contacts ct
      where ct.church_id = demo_c() and ct.status = 'visitor' and ct.age >= 18 and ct.created_at < now() - interval '90 days') x where x.rn <= 6
on conflict (contact_id) do nothing;
insert into public.memory_verse_done (verse_id, contact_id, church_id, learned_on, marked_by)
select v.id, s.contact_id, demo_c(), current_date - (7 + demo_h('ml' || v.id::text || s.contact_id::text) % 120), demo_p(9)
from public.memory_verses v join public.class_students s on s.class_id = v.class_id
where v.church_id = demo_c() and demo_h('mv' || v.id::text || s.contact_id::text) < 560 on conflict do nothing;
insert into public.zones (id, church_id, name, color, polygon, assigned, note, created_by) values
  (demo_id('z1'), demo_c(), 'Barrio Norte', '#2F8F5B', '[[-37.4458,-66.6052],[-37.4458,-66.5998],[-37.4498,-66.5998],[-37.4498,-66.6052]]'::jsonb, array[demo_p(8), demo_p(6)], 'Empezar por Los Tilos.', demo_p(8)),
  (demo_id('z2'), demo_c(), 'Barrio Sur', '#C2410C', '[[-37.4502,-66.6002],[-37.4502,-66.5948],[-37.4542,-66.5948],[-37.4542,-66.6002]]'::jsonb, array[demo_p(7), demo_p(14)], null, demo_p(8))
on conflict (id) do nothing;
insert into public.bus_stops (id, church_id, group_id, household_id, sort_order, address, lat, lng, created_by)
select demo_id('bs' || x.hid::text), demo_c(), x.gid, x.hid, row_number() over (partition by x.gid order by x.lng), x.address, x.lat, x.lng, demo_p(6)
from (select distinct hm.household_id as hid, ct.group_id as gid, ct.address, ct.lat, ct.lng
      from public.contacts ct join public.household_members hm on hm.contact_id = ct.id where ct.church_id = demo_c() and ct.bus_rider) x
on conflict do nothing;
commit;
