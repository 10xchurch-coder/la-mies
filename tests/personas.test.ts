import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MEMBER_LESSONS, agoText, cleanLessons, daysSinceDay, filterCare, isStale, lessonNames, lessonProgress, memberLessons, nameProblem, nextSteps, parseDay,
  showDay, sortDisciples, visitUrl,
} from '../src/lib/personas';
import { areaOf } from '../src/lib/areas';
import { featureOfPath } from '../src/lib/features';
import { deskNavFor } from '../src/lib/desk';

const HOY = new Date(2026, 10, 24, 15); // 24 de noviembre de 2026

test('nombres de las lecciones: los de la iglesia y, donde falta, "Lección N"', () => {
  assert.deepEqual(lessonNames(null, 3), ['Lección 1', 'Lección 2', 'Lección 3']);
  assert.deepEqual(lessonNames(['El evangelio', ' ', 'La fe'], 4), ['El evangelio', 'Lección 2', 'La fe', 'Lección 4']);
  assert.deepEqual(lessonNames(['a', 'b', 'c'], 2), ['a', 'b']);
  assert.equal(lessonNames([], 99).length, 20);
  assert.deepEqual(lessonNames([], 0), []);
});

test('clase de miembros: las lecciones de siempre son 4 (lo mismo que cuenta la base)', () => {
  assert.equal(DEFAULT_MEMBER_LESSONS.length, 4);
  assert.deepEqual(memberLessons([]), DEFAULT_MEMBER_LESSONS);
  assert.deepEqual(memberLessons(['Uno', '', 'Dos']), ['Uno', 'Dos']);
});

test('cleanLessons avisa qué falta', () => {
  assert.deepEqual(cleanLessons([' Uno ', 'Dos']), { ok: true, names: ['Uno', 'Dos'] });
  assert.equal(cleanLessons([]).ok, false);
  assert.equal(cleanLessons(['Uno', '  ']).ok, false);
  assert.equal(cleanLessons(Array.from({ length: 21 }, (_, i) => `L${i}`)).ok, false);
  assert.equal(cleanLessons(['x'.repeat(81)]).ok, false);
});

test('progreso: cuántas hizo, cuál sigue y si terminó', () => {
  assert.deepEqual(lessonProgress(null, 4), { done: 0, next: 1, complete: false });
  assert.deepEqual(lessonProgress({ '1': '2026-11-01', '3': '2026-11-15' }, 4), { done: 2, next: 2, complete: false });
  assert.deepEqual(lessonProgress({ '1': 'a', '2': 'b', '9': 'c' }, 2), { done: 2, next: null, complete: true });
  assert.deepEqual(lessonProgress({}, 0), { done: 0, next: null, complete: false });
});

test('días sin juntarse: se resalta con más de 14', () => {
  assert.equal(daysSinceDay('2026-11-24', HOY), 0);
  assert.equal(daysSinceDay('2026-11-10', HOY), 14);
  assert.equal(daysSinceDay('2026-12-01', HOY), 0);
  assert.equal(daysSinceDay(null, HOY), null);
  assert.equal(daysSinceDay('ayer', HOY), null);
  assert.equal(isStale('2026-11-10', '2026-10-01', HOY), false);   // justo 14 días: todavía no
  assert.equal(isStale('2026-11-09', '2026-10-01', HOY), true);
  assert.equal(isStale(null, '2026-11-01', HOY), true);            // nunca se juntaron: cuenta desde que empezó
  assert.equal(isStale(null, '2026-11-20', HOY), false);
  assert.equal(agoText(0), 'hoy');
  assert.equal(agoText(1), 'ayer');
  assert.equal(agoText(15), 'hace 15 días');
  assert.equal(agoText(null), 'todavía no');
});

test('la lista pone arriba a los que hace más que no se juntan', () => {
  const rows = [
    { name: 'Zulma', last_met: '2026-11-20', started_on: '2026-10-01' },
    { name: 'Abel', last_met: '2026-11-22', started_on: '2026-10-01' },
    { name: 'Mirta', last_met: '2026-11-01', started_on: '2026-10-01' },
    { name: 'Bruno', last_met: null, started_on: '2026-10-01' },
  ];
  assert.deepEqual(sortDisciples(rows, HOY).map((r) => r.name), ['Bruno', 'Mirta', 'Abel', 'Zulma']);
});

test('después de cada decisión se ofrece solo lo que falta', () => {
  const nada = { in_discipleship: false, has_followup: false, in_member_class: false, is_member: false, baptized: false };
  assert.deepEqual(nextSteps('saved', nada), ['discipleship', 'followup']);
  assert.deepEqual(nextSteps('saved', { ...nada, in_discipleship: true, has_followup: true }), []);
  assert.deepEqual(nextSteps('baptized', nada), ['certificate_baptism', 'member_class', 'discipleship']);
  assert.deepEqual(nextSteps('baptized', { ...nada, is_member: true, in_discipleship: true }), ['certificate_baptism']);
  assert.deepEqual(nextSteps('member', nada), ['certificate_member']);
  assert.deepEqual(nextSteps('rededicated', nada), ['followup']);
  assert.deepEqual(nextSteps('rededicated', { ...nada, has_followup: true }), []);
});

test('fechas escritas a mano', () => {
  assert.equal(parseDay('', HOY), null);
  assert.equal(parseDay('15/03/2026', HOY), '2026-03-15');
  assert.equal(parseDay('5-3-26', HOY), '2026-03-05');
  assert.equal(parseDay('24/11/2026', HOY), '2026-11-24');
  assert.equal(parseDay('25/11/2026', HOY), undefined);   // todavía no llegó
  assert.equal(parseDay('31/02/2026', HOY), undefined);
  assert.equal(parseDay('marzo', HOY), undefined);
  assert.equal(showDay('2026-03-15'), '15/03/2026');
  assert.equal(showDay(null), '');
});

test('filtro "sin regalo" y "sin visita"', () => {
  const rows = [{ id: 'a', gift_on: '2026-11-01', visit_on: null }, { id: 'b', gift_on: null, visit_on: '2026-11-02' }, { id: 'c', gift_on: null, visit_on: null }];
  assert.deepEqual(filterCare(rows, 'no_gift').map((r) => r.id), ['b', 'c']);
  assert.deepEqual(filterCare(rows, 'no_visit').map((r) => r.id), ['a', 'c']);
  assert.equal(filterCare(rows, 'all').length, 3);
});

test('tarjeta de visita: dirección del QR y control del nombre', () => {
  assert.equal(visitUrl('https://ejemplo.org/app/', 'abc123'), 'https://ejemplo.org/app/visita/abc123');
  assert.equal(nameProblem('Ana Ruiz'), null);
  assert.equal(nameProblem('  Li  Wu '), null);
  assert.ok(nameProblem('A'));
  assert.ok(nameProblem('12345'));
  assert.ok(nameProblem('mirá www.algo.com'));
  assert.ok(nameProblem('x'.repeat(81)));
});

test('las pantallas nuevas están en su función, con el color de Personas y en el escritorio', () => {
  for (const p of ['/discipulado', '/discipulado/lecciones', '/decisiones', '/bienvenida', '/tarjeta-visita', '/visita/abc', '/clase-miembros']) {
    assert.equal(featureOfPath(p), 'discipulado', p);
    assert.equal(areaOf(p.split('/').filter(Boolean)), 'amber', p);
  }
  assert.equal(featureOfPath('/certificado/imprimir'), 'bautismos');
  const amber = deskNavFor(['personas.ver_todas']).find((g) => g.tone === 'amber')!;
  for (const to of ['/discipulado', '/decisiones', '/bienvenida', '/tarjeta-visita', '/clase-miembros']) assert.ok(amber.items.some((i) => i.to === to), to);
  assert.equal(deskNavFor(['personas.ver_todas'], ['discipulado']).flatMap((g) => g.items).some((i) => i.to === '/discipulado'), false);
});
