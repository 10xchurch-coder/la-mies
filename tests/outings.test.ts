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

import { panelItems, rankMembers, type PanelDetail } from '../src/lib/outings';

const v = (contact_id: string, user_id: string, gospel: boolean, promise: string | null, at = '2026-11-13T20:30:00Z') =>
  ({ contact_id, user_id, visited_at: at, gospel_presented: gospel, promise_day: promise, name: `P${contact_id}` });
const D: PanelDetail = {
  visits: [v('1', 'a', true, null), v('2', 'a', true, null), v('3', 'b', false, 'sunday'), v('1', 'a', true, null, '2026-11-14T20:00:00Z')],
  came: [{ contact_id: '3', name: 'P3', when: '2026-11-15', user_id: null }], discipleship: [], baptisms: [],
};
test('la lista detrás de cada número, y solo la de un hermano', () => {
  assert.deepEqual(panelItems('contacts', D).map((i) => i.contact_id), ['1', '2', '3']);
  assert.equal(panelItems('presentations', D).length, 3);
  assert.deepEqual(panelItems('promises', D).map((i) => i.user_id), ['b']);
  assert.deepEqual(panelItems('contacts', D, 'a').map((i) => i.contact_id), ['1', '2']);
  assert.equal(panelItems('presentations', D, 'b').length, 0);
  assert.equal(panelItems('came', D).length, 1);
});
test('arriba los hermanos que más hicieron; los que no salieron, al final', () => {
  const m = (user_id: string, display_name: string, sessions: number, presentations: number, promises: number) => ({ user_id, display_name, sessions, presentations, promises });
  const r = rankMembers([m('z', 'Ana', 0, 0, 0), m('b', 'Beto', 1, 0, 1), m('a', 'Caro', 1, 4, 0), m('c', 'Dani', 1, 0, 0)], new Map([['a', 4], ['b', 1]]));
  assert.deepEqual(r.map((x) => x.user_id), ['a', 'b', 'c', 'z']);
  assert.equal(r[0].contacts, 4);
});
