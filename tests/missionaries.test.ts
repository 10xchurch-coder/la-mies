import test from 'node:test';
import assert from 'node:assert/strict';
import { monthLabel, monthStart, recentMonths, newestFirst, pdfLabel } from '../src/lib/missionaries';
import { classify } from '../src/lib/offlineCore';

test('monthLabel escribe el mes en castellano', () => {
  assert.equal(monthLabel('2026-11-01'), 'noviembre de 2026');
  assert.equal(monthLabel('2027-01-01'), 'enero de 2027');
  assert.equal(monthLabel('algo'), 'algo');
});

test('monthStart y recentMonths cruzan el año', () => {
  assert.equal(monthStart(new Date(2026, 10, 19)), '2026-11-01');
  assert.deepEqual(recentMonths(new Date(2026, 1, 15), 4), ['2026-02-01', '2026-01-01', '2025-12-01', '2025-11-01']);
});

test('newestFirst ordena del más nuevo y no toca la lista original', () => {
  const rows = [{ month: '2026-09-01' }, { month: '2026-11-01' }, { month: '2026-10-01' }];
  assert.deepEqual(newestFirst(rows).map((r) => r.month), ['2026-11-01', '2026-10-01', '2026-09-01']);
  assert.equal(rows[0].month, '2026-09-01');
});

test('pdfLabel usa el nombre del archivo o arma uno', () => {
  assert.equal(pdfLabel('Informe nov.pdf', '2026-11-01'), 'Informe nov.pdf');
  assert.equal(pdfLabel(null, '2026-11-01'), 'informe-noviembre-2026.pdf');
});

// Los mensajes privados al pastor nunca se guardan en el teléfono para usar sin internet.
test('los mensajes al pastor no se guardan ni se encolan sin internet', () => {
  for (const fn of ['pastor_thread', 'pastor_inbox', 'pastor_unread', 'send_pastor_message', 'read_pastor_thread']) {
    assert.equal(classify('POST', `rpc/${fn}`), 'pass', fn);
  }
});
