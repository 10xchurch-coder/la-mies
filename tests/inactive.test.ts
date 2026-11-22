import test from 'node:test';
import assert from 'node:assert/strict';
import { monthsLabel, parseMonths, sinceLabel } from '../src/lib/inactive';

test('monthsLabel', () => {
  assert.equal(monthsLabel(1), '1 mes');
  assert.equal(monthsLabel(3), '3 meses');
  assert.equal(monthsLabel(12), '1 año');
  assert.equal(monthsLabel(18), '1 año y medio');
  assert.equal(monthsLabel(24), '2 años');
});

test('parseMonths acepta 1 a 120', () => {
  assert.equal(parseMonths('4'), 4);
  assert.equal(parseMonths(' 36 meses'), 36);
  assert.equal(parseMonths('0'), null);
  assert.equal(parseMonths('121'), null);
  assert.equal(parseMonths(''), null);
});

test('sinceLabel', () => {
  const today = new Date('2026-11-21T12:00:00');
  assert.equal(sinceLabel(null, today), 'Sin asistencia registrada');
  assert.equal(sinceLabel('2026-11-01', today), 'Vino hace 20 días');
  assert.equal(sinceLabel('2026-05-21', today), 'Vino hace 6 meses');
  assert.equal(sinceLabel('2023-11-21', today), 'Vino hace 3 años');
});
