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

import { CHRONO, PLANS, chaptersOf, planDays } from '../src/lib/biblePlan';

test('el plan cronológico tiene los 1189 capítulos, cada uno una sola vez', () => {
  const chs = chaptersOf('chrono');
  assert.equal(chs.length, 1189);
  assert.equal(new Set(chs.map((c) => `${c.book} ${c.ch}`)).size, 1189);
  assert.ok(CHRONO.length > 66);
  const r = planReadings('chrono');
  assert.equal(r.length, 365);
  assert.ok(r[0].startsWith('Génesis 1'));
  assert.ok(r[364].includes('Apocalipsis') && r[364].endsWith('22'));
  assert.ok(r.some((x) => x.includes('Génesis') && x.includes('Job')));
});
test('la Biblia con un salmo y un proverbio: no repite Salmos ni Proverbios en la lectura principal', () => {
  assert.equal(chaptersOf('psalms').length, 1189 - 150 - 31);
  const r = planReadings('psalms');
  assert.ok(r[0].startsWith('Génesis 1') && r[0].endsWith(' · Salmo 1 · Proverbios 1'), r[0]);
  assert.ok(r[150].endsWith(' · Salmo 1 · Proverbios 27'), r[150]);
  assert.ok(r[364].includes('Apocalipsis') && r[364].endsWith(' · Salmo 65 · Proverbios 24'), r[364]);
  assert.ok(r.every((x) => !x.split(' · ')[0].includes('Salmos') && !x.split(' · ')[0].includes('Proverbios')));
});
test('planes para nuevos creyentes: libros enteros, sin días libres, y empiezan por Juan', () => {
  assert.equal(chaptersOf('new30').length, 30);
  const m = planReadings('new30');
  assert.equal(m.length, 30);
  assert.equal(m[0], 'Juan 1');
  assert.equal(m[21], '1 Juan 1');
  assert.equal(m[29], 'Filipenses 4');
  for (const id of ['new90', 'new180'] as const) {
    const r = planReadings(id);
    assert.equal(r.length, planDays(id));
    assert.ok(r[0].startsWith('Juan 1'));
    assert.ok(r.every(Boolean));
    assert.ok(chaptersOf(id).length >= planDays(id));
  }
  assert.ok(planReadings('new180')[179].endsWith('Proverbios 31') || planReadings('new180')[179].includes('Proverbios'));
  assert.equal(chaptersOf('new90').length, 90);
  assert.equal(planReadings('new90')[89], '1 Pedro 5');
  assert.equal(PLANS.filter((p) => p.group === 'new').length, 3);
});
test('un plan corto termina en su último día', () => {
  const s = planStatus('new30', '2026-11-15', [], '2027-03-01');
  assert.equal(s.day, 29);
  assert.equal(s.total, 30);
  assert.equal(s.behind.length, 29);
});
