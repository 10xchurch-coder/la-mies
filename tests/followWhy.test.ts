import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whyHere, type FollowContext } from '../src/lib/followWhy';

const base: FollowContext = { status: 'visitor', created_on: '2026-11-14', added_by: 'Santiago', added_by_me: false, from_outing: false, street: null, times: 0, first_on: null, last_on: null, last_service: null, note: null, last_note: null };
const day = (iso: string) => `[${iso}]`;

test('una visita que vino una vez dice a qué reunión y qué día', () => {
  const w = whyHere({ ...base, times: 1, first_on: '2026-11-14', last_on: '2026-11-14', last_service: 'Culto del sábado' }, { day });
  assert.equal(w.tag, 'Visita · vino 1 vez');
  assert.equal(w.origin, 'Vino por primera vez: Culto del sábado, [2026-11-14].');
  assert.match(w.todo, /agradecerle la visita/);
});

test('si vino varias veces muestra la última y la primera', () => {
  const w = whyHere({ ...base, times: 3, first_on: '2026-11-01', last_on: '2026-11-15', last_service: 'Culto del domingo' }, { day });
  assert.equal(w.tag, 'Visita · vino 3 veces');
  assert.equal(w.origin, 'Vino 3 veces. La última: Culto del domingo, [2026-11-15]. La primera: [2026-11-01].');
});

test('un contacto de la calle dice quién lo anotó, cuándo y dónde', () => {
  const w = whyHere({ ...base, status: 'contact', from_outing: true, added_by: 'Isaac', created_on: '2026-11-13', street: 'Colombia · vereda sur' }, { day });
  assert.equal(w.tag, 'Contacto de la calle');
  assert.equal(w.origin, 'Lo anotó Isaac en una salida, [2026-11-13] · Colombia · vereda sur. Todavía no vino a la iglesia.');
});

test('cargada a mano como visita y sin asistencia: avisa que no está marcada presente', () => {
  const w = whyHere({ ...base, added_by: 'Benjamin', added_by_me: true }, { day });
  assert.equal(w.tag, 'Visita sin asistencia');
  assert.equal(w.origin, 'Lo cargaste vos a mano, [2026-11-14]. No está marcado presente en ninguna reunión.');
  assert.match(w.todo, /marcalo presente en Asistencia/);
});

test('si prometió venir, lo primero es recordarle el culto', () => {
  const w = whyHere({ ...base, status: 'contact', from_outing: true }, { day, promised: true });
  assert.equal(w.todo, 'Prometió venir: recordale el culto.');
});
