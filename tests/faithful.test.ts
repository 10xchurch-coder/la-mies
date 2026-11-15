import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byFaithfulness } from '../src/lib/faithful';

const people = ['Zulma', 'Ana', 'Mario', 'Bruno', 'Élida', 'Carla'].map((name, i) => ({ id: `p${i}`, name }));
const order = (times: Record<string, number>) => byFaithfulness(people, times, (p) => p.id, (p) => p.name).map((p) => p.name);

test('los más fieles van arriba, de más a menos', () => {
  assert.deepEqual(order({ p0: 3, p2: 9, p5: 5 }).slice(0, 3), ['Mario', 'Carla', 'Zulma']);
});

test('los que nunca participaron quedan después, por orden alfabético', () => {
  assert.deepEqual(order({ p0: 3, p2: 9 }), ['Mario', 'Zulma', 'Ana', 'Bruno', 'Carla', 'Élida']);
});

test('con la misma cantidad de veces, por orden alfabético', () => {
  assert.deepEqual(order({ p0: 4, p1: 4, p3: 4 }).slice(0, 3), ['Ana', 'Bruno', 'Zulma']);
});

test('sin datos, toda la lista queda alfabética y no cambia la original', () => {
  assert.deepEqual(order({}), ['Ana', 'Bruno', 'Carla', 'Élida', 'Mario', 'Zulma']);
  assert.equal(people[0].name, 'Zulma');
});
