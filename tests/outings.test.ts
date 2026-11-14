import test from 'node:test';
import assert from 'node:assert/strict';
import { countContacts, countOutings } from '../src/lib/outings';

const s = (a: string, b: string | null, contacts = 0) => ({ started_at: a, ended_at: b, contacts });

test('varios hermanos a la misma hora son una sola salida', () => {
  const viernes = [
    s('2026-11-13T20:20:11Z', '2026-11-13T21:05:59Z', 4),
    s('2026-11-13T20:20:55Z', '2026-11-13T20:46:52Z', 1),
    s('2026-11-13T20:20:59Z', '2026-11-13T20:48:49Z', 0),
  ];
  assert.equal(countOutings(viernes), 1);
  assert.equal(countContacts(viernes), 5);
});
test('otro día u otra hora del mismo día es otra salida', () => {
  const dos = [s('2026-11-06T20:38:00Z', '2026-11-06T21:23:00Z'), s('2026-11-06T20:54:00Z', '2026-11-06T21:24:00Z'), s('2026-11-13T20:20:00Z', '2026-11-13T21:05:00Z')];
  assert.equal(countOutings(dos), 2);
  assert.equal(countOutings([s('2026-11-13T13:00:00Z', '2026-11-13T14:00:00Z'), s('2026-11-13T20:00:00Z', '2026-11-13T21:00:00Z')]), 2);
});
test('el que llega tarde (dentro de la hora) sigue siendo la misma salida', () => {
  assert.equal(countOutings([s('2026-11-13T20:00:00Z', '2026-11-13T20:30:00Z'), s('2026-11-13T21:10:00Z', '2026-11-13T21:40:00Z')]), 1);
});
test('sin salidas, cero; una en curso cuenta', () => {
  assert.equal(countOutings([]), 0);
  assert.equal(countOutings([s('2026-11-13T20:00:00Z', null)], new Date('2026-11-13T20:30:00Z')), 1);
});
