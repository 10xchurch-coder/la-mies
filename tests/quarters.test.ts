import test from 'node:test';
import assert from 'node:assert/strict';
import { closedPeriods } from '../src/lib/quarters';

test('en noviembre: el último cerrado es el 3.er trimestre', () => {
  const p = closedPeriods(new Date(2026, 10, 11));
  assert.deepEqual(p[0], { key: '2026-T3', label: '3.º trimestre 2026', from: '2026-07-01', to: '2026-09-30' });
  assert.equal(p[3].key, '2025-T4');
  assert.deepEqual(p[4], { key: '2025', label: 'Año 2025', from: '2025-01-01', to: '2025-12-31' });
});
test('en enero: el último cerrado es el 4.º del año anterior, y ya está el año completo', () => {
  const p = closedPeriods(new Date(2027, 0, 10));
  assert.equal(p[0].key, '2026-T4');
  assert.equal(p[0].to, '2026-12-31');
  assert.ok(p.some((x) => x.key === '2026'));
});
test('febrero bisiesto', () => {
  assert.equal(closedPeriods(new Date(2028, 3, 2))[0].to, '2028-03-31');
});
