import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthDates, planMonth } from '../src/lib/rota';

test('monthDates: sábados y domingos de diciembre 2026', () => {
  const d = monthDates(2026, 11, ['sat', 'sun']);
  assert.equal(d[0], '2026-12-05');
  assert.equal(d.length, 8);
});

test('planMonth: respeta límites, no repite día y reparte parejo', () => {
  const classes = [
    { id: 'A', days: ['sun'], teachers: ['ana', 'beto', 'caro'], helpers: [] },
    { id: 'B', days: ['sun'], teachers: ['ana', 'dani'], helpers: ['eli'] },
  ];
  const slots = planMonth({ year: 2026, month: 11, classes, limits: { ana: 1, eli: 2 }, existing: [], replace: false });
  assert.equal(slots.length, 8);
  const count = (p: string) => slots.filter((s) => s.teacher_id === p || s.helper_id === p).length;
  assert.equal(count('ana'), 1);
  assert.ok(count('eli') <= 2);
  for (const d of new Set(slots.map((s) => s.on_date))) {
    const ppl = slots.filter((s) => s.on_date === d).flatMap((s) => [s.teacher_id, s.helper_id]).filter(Boolean);
    assert.equal(new Set(ppl).size, ppl.length, `alguien repetido el ${d}`);
  }
  const a = slots.filter((s) => s.class_id === 'A').map((s) => s.teacher_id);
  assert.ok(a.every(Boolean));
});

test('planMonth: lo ya cargado se mantiene y cuenta', () => {
  const classes = [{ id: 'A', days: ['sun'], teachers: ['ana', 'beto'], helpers: [] }];
  const slots = planMonth({ year: 2026, month: 11, classes, limits: { ana: 1 }, existing: [{ class_id: 'A', on_date: '2026-12-06', teacher_id: 'ana', helper_id: null }], replace: false });
  assert.equal(slots[0].teacher_id, 'ana');
  assert.ok(slots[0].kept);
  assert.equal(slots.filter((s) => s.teacher_id === 'ana').length, 1);
});
