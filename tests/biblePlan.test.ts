import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS, planDay, planReadings, planStatus } from '../src/lib/biblePlan';

test('la Biblia tiene 66 libros y 1189 capítulos (929 + 260)', () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(BOOKS.reduce((n, b) => n + b[1], 0), 1189);
  assert.equal(BOOKS.slice(0, 39).reduce((n, b) => n + b[1], 0), 929);
  assert.equal(BOOKS.slice(39).reduce((n, b) => n + b[1], 0), 260);
});
test('toda la Biblia: 365 días, empieza en Génesis y termina en Apocalipsis 22, sin días libres', () => {
  const r = planReadings('bible');
  assert.equal(r.length, 365);
  assert.equal(r[0], 'Génesis 1–4');
  assert.ok(r[364].endsWith('Apocalipsis 20–22') || r[364].endsWith('–22'), r[364]);
  assert.ok(r.every(Boolean));
});
test('Nuevo Testamento: 260 capítulos, uno por lectura, con días libres; termina en Apocalipsis 22', () => {
  const r = planReadings('nt');
  assert.equal(r.filter(Boolean).length, 260);
  assert.equal(r[0], 'Mateo 1');
  assert.equal(r.filter(Boolean).pop(), 'Apocalipsis 22');
  assert.ok(r.includes('Judas') && r.includes('Filemón'));
});
test('Antiguo Testamento: termina en Malaquías y junta libros cuando hace falta', () => {
  const r = planReadings('ot');
  assert.ok(r[364].endsWith('Malaquías 3–4') || r[364].includes('Malaquías'), r[364]);
  assert.ok(r.some((x) => x.includes('; ')));
});
test('qué día es hoy y qué quedó atrasado', () => {
  assert.equal(planDay('2026-11-14', '2026-11-14'), 0);
  assert.equal(planDay('2026-11-14', '2026-11-17'), 3);
  assert.equal(planDay('2026-11-14', '2028-01-01'), 364);
  const s = planStatus('bible', '2026-11-14', [0, 2], '2026-11-17');
  assert.equal(s.day, 3);
  assert.deepEqual(s.behind, [1]);
  assert.equal(s.todayDone, false);
  assert.equal(s.done, 2);
  assert.equal(s.total, 365);
});
