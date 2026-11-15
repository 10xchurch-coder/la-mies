import test from 'node:test';
import assert from 'node:assert/strict';
import { hasStarted, partProgress, toggleClass } from '../src/lib/discipleship';

test('se marcan las clases y se completa la parte al llegar al total', () => {
  let d = toggleClass(null, 'one', 1, '2026-11-14');
  d = toggleClass(d, 'one', 2, '2026-11-21');
  assert.deepEqual(partProgress(d, 'one', 4), { done: 2, total: 4, complete: false, completedOn: null });
  d = toggleClass(toggleClass(d, 'one', 3, '2026-11-28'), 'one', 4, '2026-12-05');
  assert.deepEqual(partProgress(d, 'one', 4), { done: 4, total: 4, complete: true, completedOn: '2026-12-05' });
  assert.equal(partProgress(d, 'course', 13).done, 0);
  assert.equal(hasStarted(d), true);
});
test('se puede desmarcar, y si la iglesia achica el programa no cuentan las clases de más', () => {
  let d = toggleClass(toggleClass(null, 'course', 1, '2026-11-14'), 'course', 9, '2026-11-15');
  d = toggleClass(d, 'course', 1, '2026-11-16');
  assert.deepEqual(d.course, { '9': '2026-11-15' });
  assert.equal(partProgress(d, 'course', 8).done, 0);
  assert.equal(hasStarted(null), false);
});
