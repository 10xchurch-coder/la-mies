import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, evictions, hashKey, patchCached, replayOutcome, type Queued } from '../src/lib/offlineCore';

const q = (p: Partial<Queued>): Queued => ({ id: 'x', method: 'POST', path: '', query: '', body: null, prefer: '', at: 0, ...p });

test('las lecturas se guardan; los cambios comunes no', () => {
  assert.equal(classify('GET', 'contacts'), 'read');
  assert.equal(classify('HEAD', 'contact_visits'), 'read');
  assert.equal(classify('POST', 'rpc/attendance_sheet'), 'read');
  assert.equal(classify('POST', 'rpc/weekly_report'), 'read');
  assert.equal(classify('POST', 'rpc/start_session'), 'pass');
  assert.equal(classify('POST', 'rpc/team_live'), 'pass');
  assert.equal(classify('POST', 'contacts'), 'pass');
  assert.equal(classify('PATCH', 'contacts'), 'pass');
  assert.equal(classify('POST', 'fin_entries'), 'pass');
});

test('la asistencia y lo que se puede repetir se anota para subir después', () => {
  assert.equal(classify('POST', 'rpc/set_attendance'), 'queue');
  assert.equal(classify('POST', 'outing_attendance', 'resolution=ignore-duplicates'), 'queue');
  assert.equal(classify('DELETE', 'outing_attendance'), 'queue');
  assert.equal(classify('POST', 'class_attendance'), 'queue');
  assert.equal(classify('PATCH', 'bible_plans'), 'queue');
  assert.equal(classify('DELETE', 'bible_plans'), 'pass');
  assert.equal(classify('POST', 'class_attendance', 'return=representation'), 'pass');
});

test('la clave de cada pedido es estable y distinta', () => {
  assert.equal(hashKey('GET contacts?a=1'), hashKey('GET contacts?a=1'));
  assert.notEqual(hashKey('GET contacts?a=1'), hashKey('GET contacts?a=2'));
});

test('cuando falta espacio se borra lo que hace más que no se usa', () => {
  const index = { a: { n: 40, t: 3, p: '', a: '' }, b: { n: 40, t: 1, p: '', a: '' }, c: { n: 40, t: 2, p: '', a: '' } };
  assert.deepEqual(evictions(index, 200), []);
  assert.deepEqual(evictions(index, 90), ['b']);
  assert.deepEqual(evictions(index, 40), ['b', 'c']);
});

test('una marca de asistencia pendiente se ve en la planilla guardada', () => {
  const sheet = JSON.stringify([{ contact_id: 'c1', present: false }, { contact_id: 'c2', present: false }]);
  const args = JSON.stringify({ p_date: '2026-11-15', p_service: 's1' });
  const w = q({ path: 'rpc/set_attendance', body: JSON.stringify({ p_contact: 'c2', p_date: '2026-11-15', p_service: 's1', p_present: true }) });
  assert.deepEqual(JSON.parse(patchCached(w, 'rpc/attendance_sheet', args, sheet) as string), [{ contact_id: 'c1', present: false }, { contact_id: 'c2', present: true }]);
  // Otra reunión u otro día: no se toca.
  assert.equal(patchCached(w, 'rpc/attendance_sheet', JSON.stringify({ p_date: '2026-11-15', p_service: 's2' }), sheet), null);
  assert.equal(patchCached(w, 'rpc/outing_sheet', args, sheet), null);
});

test('marcar y desmarcar quién salió a evangelizar cambia la planilla y el total', () => {
  const sheet = JSON.stringify({ total: 2, rows: [{ contact_id: 'c1', marked: false, via_app: false }, { contact_id: 'c2', marked: true, via_app: false }, { contact_id: 'c3', marked: false, via_app: true }] });
  const args = JSON.stringify({ p_date: '2026-11-13' });
  const add = q({ path: 'outing_attendance', body: JSON.stringify({ contact_id: 'c1', went_on: '2026-11-13' }) });
  const a = JSON.parse(patchCached(add, 'rpc/outing_sheet', args, sheet) as string);
  assert.equal(a.total, 3);
  assert.equal(a.rows[0].marked, true);
  const del = q({ method: 'DELETE', path: 'outing_attendance', query: '?contact_id=eq.c2&went_on=eq.2026-11-13' });
  const d = JSON.parse(patchCached(del, 'rpc/outing_sheet', args, sheet) as string);
  assert.equal(d.total, 1);
  assert.equal(d.rows[1].marked, false);
  // El que salió con la app ya estaba contado.
  const app = q({ path: 'outing_attendance', body: JSON.stringify({ contact_id: 'c3', went_on: '2026-11-13' }) });
  assert.equal(JSON.parse(patchCached(app, 'rpc/outing_sheet', args, sheet) as string).total, 2);
  assert.equal(patchCached(add, 'rpc/outing_sheet', JSON.stringify({ p_date: '2026-11-12' }), sheet), null);
});

test('la asistencia de una clase pendiente se agrega o se corrige en la lista guardada', () => {
  const entry = '?select=*&class_id=eq.k1&on_date=eq.2026-11-15';
  const w = (contact: string, present: boolean) => q({ path: 'class_attendance', body: JSON.stringify({ class_id: 'k1', on_date: '2026-11-15', contact_id: contact, present, note: null }) });
  const one = JSON.parse(patchCached(w('c1', true), 'class_attendance', entry, '[]') as string);
  assert.equal(one.length, 1);
  assert.equal(one[0].present, true);
  const two = JSON.parse(patchCached(w('c1', false), 'class_attendance', entry, JSON.stringify(one)) as string);
  assert.equal(two.length, 1);
  assert.equal(two[0].present, false);
  assert.equal(patchCached(w('c1', true), 'class_attendance', '?select=*&class_id=eq.k2&on_date=eq.2026-11-15', '[]'), null);
});

test('al subir lo pendiente: se reintenta solo si puede andar más tarde', () => {
  assert.equal(replayOutcome(204), 'done');
  assert.equal(replayOutcome(409), 'done');
  assert.equal(replayOutcome(403), 'done');
  assert.equal(replayOutcome(401), 'retry');
  assert.equal(replayOutcome(503), 'retry');
});
