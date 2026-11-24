import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attentionOf, buildReport, change, churchesCsv, cleanChurch, cleanWeek, errorSpike, filterChurches, inSetup, lastWeekAttendance, METRICS, mondayIso, periodOf,
  PRIVACY, replyMail, replyWhatsApp, reportCsv, reportHtml, series, shiftPeriod, sortChurches, stateOf, sumByWeek, totalsOf, type CentralChurch, type CentralWeek,
} from '../src/lib/central';
import { DESK_NAV, deskNavFor } from '../src/lib/desk';
import { CORE_ROUTES, featureOfPath, pathOn } from '../src/lib/features';
import { areaOf } from '../src/lib/areas';

const now = new Date('2026-11-24T15:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
// Iglesias inventadas.
const ch = (o: Partial<CentralChurch> & { id: string; name: string }): CentralChurch => ({
  ...cleanChurch({ id: o.id, name: o.name, created_at: ago(200), pastors: 1, last_activity: ago(1), facts: { accounts: 10, people: 40 } }), ...o,
});
const wk = (church_id: string, week_start: string, o: Partial<CentralWeek> = {}): CentralWeek => ({ ...cleanWeek({ church_id, week_start }), ...o });

test('lo que llega de la base se limpia y nunca rompe', () => {
  const c = cleanChurch({ id: 'a', name: 'Iglesia Roca Firme', status: 'raro', pastors: '2', facts: { accounts: 5 }, disabled_features: ['chat', 7] });
  assert.equal(c.status, 'invited');
  assert.equal(c.pastors, 2);
  assert.equal(c.facts.accounts, 5);
  assert.deepEqual(c.disabled_features, ['chat']);
  assert.equal(cleanChurch(null).name, 'Iglesia');
  const w = cleanWeek({ church_id: 'a', week_start: '2026-11-16T00:00:00', attendance: '12', services: [{ name: 'Domingo', dow: 0, count: 9 }, { dow: 1 }] });
  assert.equal(w.week_start, '2026-11-16');
  assert.equal(w.attendance, 12);
  assert.equal(w.baptisms, 0);
  assert.deepEqual(w.services, [{ name: 'Domingo', dow: 0, count: 9 }]);
});

test('estado de una iglesia: suspendida, sin pastor, primeros pasos, sin movimiento o en marcha', () => {
  assert.equal(stateOf(ch({ id: '1', name: 'A' }), now), 'ok');
  assert.equal(stateOf(ch({ id: '1', name: 'A', status: 'suspended' }), now), 'suspended');
  assert.equal(stateOf(ch({ id: '1', name: 'A', pastors: 0 }), now), 'no_pastor');
  assert.equal(stateOf(ch({ id: '1', name: 'A', last_activity: ago(20) }), now), 'quiet');
  assert.equal(stateOf(ch({ id: '1', name: 'A', last_activity: null }), now), 'quiet');
  const setup = ch({ id: '1', name: 'A', has_checklist: true, steps: {} });
  assert.equal(inSetup(setup), true);
  assert.equal(stateOf(setup, now), 'setup');
  // La iglesia que no tiene lista de primeros pasos (la que ya usaba la app) no está "con los primeros pasos".
  assert.equal(inSetup(ch({ id: '1', name: 'A' })), false);
  assert.equal(inSetup(ch({ id: '1', name: 'A', has_checklist: true, setup_done_at: ago(3) })), false);
});

test('necesita atención: pedidos, trabada, sin movimiento 14 días, salto de errores', () => {
  const keys = (c: CentralChurch) => attentionOf(c, now).map((a) => a.key);
  assert.deepEqual(keys(ch({ id: '1', name: 'A' })), []);
  assert.deepEqual(keys(ch({ id: '1', name: 'A', open_help: 2 })), ['help']);
  assert.match(attentionOf(ch({ id: '1', name: 'A', open_help: 2 }), now)[0].text, /2 pedidos/);
  assert.deepEqual(keys(ch({ id: '1', name: 'A', last_activity: ago(13) })), []);
  assert.deepEqual(keys(ch({ id: '1', name: 'A', last_activity: ago(14) })), ['quiet']);
  assert.deepEqual(keys(ch({ id: '1', name: 'A', has_checklist: true, steps: {}, created_at: ago(8) })), ['stuck']);
  // Recién entró: todavía no está "trabada" ni "sin movimiento".
  assert.deepEqual(keys(ch({ id: '1', name: 'A', has_checklist: true, steps: {}, created_at: ago(3), last_activity: null })), []);
  assert.deepEqual(keys(ch({ id: '1', name: 'A', pastors: 0, created_at: ago(9) })), ['no_pastor']);
  assert.deepEqual(keys(ch({ id: '1', name: 'A', errors_7: 8, errors_prev_7: 2 })), ['errors']);
  assert.deepEqual(keys(ch({ id: '1', name: 'A', status: 'pending', selfserve: true, import_help_at: ago(2) })), ['import', 'review']);
  // Una suspendida no vuelve a aparecer como pendiente de atención.
  assert.deepEqual(keys(ch({ id: '1', name: 'A', status: 'suspended', open_help: 3 })), []);
  assert.equal(errorSpike(5, 0), true);
  assert.equal(errorSpike(4, 0), false);
  assert.equal(errorSpike(9, 5), false);
  assert.equal(errorSpike(10, 5), true);
});

test('filtrar y ordenar la tabla de iglesias (solo por iglesia y ciudad)', () => {
  const rows = [
    ch({ id: '1', name: 'Iglesia Peña de Horeb', city: 'Oberá', active_7: 3 }),
    ch({ id: '2', name: 'Iglesia Agua Viva', city: 'Encarnación', open_help: 1, active_7: 9, pastor_name: 'Nombre Inventado' }),
    ch({ id: '3', name: 'Iglesia Monte Sion', city: 'Eldorado', status: 'suspended' }),
  ];
  const F = { q: '', state: 'all' as const, onlyAttention: false };
  assert.deepEqual(filterChurches(rows, { ...F, q: 'pena' }, now).map((c) => c.id), ['1']);
  assert.deepEqual(filterChurches(rows, { ...F, q: 'ENCARNACION' }, now).map((c) => c.id), ['2']);
  // No se busca por el nombre de una persona.
  assert.deepEqual(filterChurches(rows, { ...F, q: 'inventado' }, now), []);
  assert.deepEqual(filterChurches(rows, { ...F, state: 'suspended' }, now).map((c) => c.id), ['3']);
  assert.deepEqual(filterChurches(rows, { ...F, onlyAttention: true }, now).map((c) => c.id), ['2']);
  const att = new Map([['1', 50], ['2', 20]]);
  assert.deepEqual(sortChurches(rows, 'name', 1, att, now).map((c) => c.id), ['2', '3', '1']);
  assert.deepEqual(sortChurches(rows, 'attendance', -1, att, now).map((c) => c.id), ['1', '2', '3']);
  assert.deepEqual(sortChurches(rows, 'active', -1, att, now).map((c) => c.id), ['2', '1', '3']);
  assert.equal(sortChurches(rows, 'state', 1, att, now)[0].id, '3');
});

test('períodos: semana, mes y año con su período anterior', () => {
  assert.equal(mondayIso('2026-11-24'), '2026-11-23');
  assert.equal(mondayIso('2026-11-22'), '2026-11-16');
  const w = periodOf('week', '2026-11-18');
  assert.deepEqual([w.from, w.to, w.prevFrom, w.prevTo], ['2026-11-16', '2026-11-22', '2026-11-09', '2026-11-15']);
  const m = periodOf('month', '2026-01-10');
  assert.deepEqual([m.from, m.to, m.prevFrom, m.prevTo], ['2026-01-01', '2026-01-31', '2025-12-01', '2025-12-31']);
  assert.equal(m.label, 'enero de 2026');
  assert.equal(m.prevLabel, 'diciembre de 2025');
  const y = periodOf('year', '2026-06-01');
  assert.deepEqual([y.from, y.to, y.prevFrom, y.prevTo], ['2026-01-01', '2026-12-31', '2025-01-01', '2025-12-31']);
  assert.equal(shiftPeriod('week', '2026-11-18', -1), '2026-11-09');
  assert.equal(shiftPeriod('month', '2026-01-31', 1), '2026-02-01');
  assert.equal(shiftPeriod('year', '2026-06-01', -1), '2025-01-01');
});

test('sumar semanas: lo que se suma, lo que se promedia y lo que vale al final', () => {
  const weeks = [
    wk('a', '2026-11-02', { attendance: 100, baptisms: 1, accounts: 20, people: 80, active_users: 10, services: [{ name: 'Domingo', dow: 0, count: 80 }, { name: 'Miércoles', dow: 3, count: 20 }] }),
    wk('a', '2026-11-09', { attendance: 120, baptisms: 2, accounts: 22, people: 90, active_users: 14, services: [{ name: 'Domingo', dow: 0, count: 120 }] }),
    wk('a', '2026-10-26', { attendance: 60, baptisms: 5, accounts: 15, people: 70, active_users: 4 }),
  ];
  const t = totalsOf(weeks, '2026-11-01', '2026-11-30');
  assert.equal(t.weeks, 2);
  assert.equal(t.attendance, 110);     // promedio por semana
  assert.equal(t.active_users, 12);
  assert.equal(t.baptisms, 3);         // se suma
  assert.equal(t.accounts, 22);        // lo que había al final
  assert.equal(t.people, 90);
  assert.deepEqual(t.services, [{ name: 'Domingo', dow: 0, count: 200 }, { name: 'Miércoles', dow: 3, count: 20 }]);
  assert.equal(totalsOf(weeks, '2025-01-01', '2025-01-31').weeks, 0);
  // Toda la red: se suman las iglesias semana por semana.
  const net = sumByWeek([...weeks, wk('b', '2026-11-09', { attendance: 30, accounts: 5 })]);
  assert.deepEqual(net.map((w) => [w.week_start, w.attendance, w.accounts]), [['2026-10-26', 60, 15], ['2026-11-02', 100, 20], ['2026-11-09', 150, 27]]);
  assert.deepEqual(series(net, 'attendance', 2).map((p) => p.value), [100, 150]);
  assert.deepEqual(series(net, 'attendance', 5, '2026-11-02').map((p) => p.value), [60, 100]);
  // Cada número del informe tiene su forma de juntarse.
  assert.ok(METRICS.every((m) => ['sum', 'avg', 'last'].includes(m.how)));
});

test('informe con comparación, planilla y hoja para imprimir', () => {
  const weeks = [wk('a', '2026-11-09', { attendance: 80, errors: 4, baptisms: 1 }), wk('a', '2026-11-16', { attendance: 100, errors: 6, baptisms: 1 })];
  const p = periodOf('week', '2026-11-16');
  const r = buildReport(weeks, p);
  const row = (k: string) => r.rows.find((x) => x.key === k)!;
  assert.equal(row('attendance').value, 100);
  assert.equal(row('attendance').prev, 80);
  assert.equal(row('attendance').change?.text, '+20 (+25%)');
  assert.equal(row('attendance').good, true);
  assert.equal(row('errors').good, false);          // más errores es malo
  assert.equal(row('baptisms').change?.dir, 'same');
  assert.equal(row('help_requests').good, null);
  // Sin período anterior no se inventa una comparación.
  const first = buildReport(weeks, periodOf('week', '2026-11-09'));
  assert.equal(first.rows.find((x) => x.key === 'attendance')!.prev, null);
  assert.equal(first.rows.find((x) => x.key === 'attendance')!.change, null);
  assert.deepEqual(change(5, 7), { diff: -2, pct: -29, dir: 'down', text: '−2 (−29%)' });
  assert.equal(change(3, 0)?.text, '+3');
  const csv = reportCsv('Toda la red', p, r.rows);
  assert.ok(csv.includes('Informe;Período;Grupo;Dato;Valor;Período anterior;Cambio'));
  assert.ok(csv.includes('Toda la red;Semana del 16/11 al 22/11;Reuniones;Asistencia;100;80;+20 (+25%)'));
  const byChurch = churchesCsv(p, [ch({ id: 'a', name: 'Iglesia "Luz"; Centro', city: 'Posadas' })], weeks);
  assert.ok(byChurch.includes('"Iglesia ""Luz""; Centro";Posadas'));
  const html = reportHtml({ title: 'Iglesia <b>Prueba</b>', period: p, rows: r.rows, services: [{ name: 'Domingo', dow: 0, count: 100 }] });
  assert.ok(html.includes('Iglesia &lt;b&gt;Prueba&lt;/b&gt;') && !html.includes('<b>Prueba</b>'));
  assert.ok(html.includes('Asistencia por reunión') && html.includes('No incluye datos de personas ni de dinero'));
});

test('asistencia de la última semana completa', () => {
  const weeks = [wk('a', '2026-11-16', { attendance: 90 }), wk('a', '2026-11-23', { attendance: 5 }), wk('b', '2026-11-16', { attendance: 40 })];
  const m = lastWeekAttendance(weeks, new Date(2026, 10, 24));
  assert.equal(m.get('a'), 90);
  assert.equal(m.get('b'), 40);
});

test('responder un pedido de ayuda por WhatsApp o correo', () => {
  assert.equal(replyWhatsApp('12', 'Iglesia A'), null);
  assert.ok(replyWhatsApp('+54 9 376 400-0000', 'Iglesia A', 'Reuniones')!.startsWith('https://wa.me/5493764000000?text='));
  assert.equal(replyMail('no es un correo'), null);
  assert.ok(replyMail('alguien@example.com', 'Reuniones')!.startsWith('mailto:alguien@example.com?subject='));
});

test('la regla de privacidad está escrita y la plata queda afuera', () => {
  assert.ok(PRIVACY.no.some((t) => /plata/i.test(t)) && PRIVACY.no.some((t) => /tel[eé]fonos/i.test(t)) && PRIVACY.no.some((t) => /oraci[oó]n/i.test(t)));
  // Ningún número de los informes es de dinero ni de una persona.
  assert.ok(!METRICS.some((m) => /ofrenda|plata|dinero|ingreso|gasto|\$/i.test(m.label)));
});

test('menú: Central solo con la marca del equipo, y ninguna iglesia lo puede apagar', () => {
  const all = ['admin.permisos', 'admin.iglesia', 'fin.ver', 'inf.panel', 'personas.ver_todas', 'personas.editar'];
  const keys = (flags?: string[], off?: string[]) => deskNavFor(all, off, flags).flatMap((g) => g.items.map((i) => i.key));
  // Un pastor de otra iglesia, con todos los permisos de SU iglesia, no ve nada de Central.
  assert.ok(!keys().some((k) => k.startsWith('central') || k === 'red'));
  assert.ok(!deskNavFor(all).some((g) => g.title === 'La Mies Central'));
  const staff = keys(['central']);
  assert.ok(staff.includes('central') && staff.includes('central-ayuda') && staff.includes('central-informes') && staff.includes('central-equipo'));
  assert.ok(!staff.includes('red'));                       // crear iglesias: solo el dueño
  const owner = keys(['central', 'net']);
  assert.ok(owner.includes('central') && owner.includes('red'));
  // Alguien del equipo sin ningún permiso en la iglesia igual ve Central.
  assert.ok(deskNavFor([], undefined, ['central']).some((g) => g.items.some((i) => i.key === 'central')));
  // Aunque una iglesia apague todo, Central sigue (no es una función de la iglesia).
  assert.equal(featureOfPath('/central/iglesia/abc'), null);
  assert.ok(CORE_ROUTES.includes('/central'));
  assert.equal(pathOn(['informes', 'finanzas', 'sugerencias'], '/central/informes'), true);
  assert.ok(keys(['central'], ['informes', 'sugerencias', 'evangelismo']).includes('central-informes'));
  // Cada entrada que no es de permisos lleva su marca, y el color coincide con el del grupo.
  const group = DESK_NAV.find((g) => g.title === 'La Mies Central')!;
  assert.ok(group.items.every((i) => i.when === 'central' || i.when === 'net'));
  assert.equal(areaOf(['central', 'iglesias']), group.tone);
  // Pedir ayuda a La Mies sí está en el menú de cualquier iglesia (para quien administra).
  assert.ok(keys().includes('ayuda-lamies'));
  assert.ok(!deskNavFor(['inf.panel']).flatMap((g) => g.items.map((i) => i.key)).includes('ayuda-lamies'));
});
