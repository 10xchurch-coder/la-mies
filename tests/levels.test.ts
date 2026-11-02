import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelFor, badgesFor, points } from '../src/lib/levels';

test('points: presentación 1, promesa 3, vino 10', () => {
  assert.equal(points({ presentations: 2, promises: 1, came: 1 }), 15);
});

test('levelFor', () => {
  assert.equal(levelFor(0).current, null);
  assert.equal(levelFor(0).next?.name, 'Sembrador');
  assert.equal(levelFor(12).current?.name, 'Segador');
  assert.equal(levelFor(12).next?.name, 'Obrero fiel');
  assert.equal(levelFor(500).next, null);
});

test('badgesFor muestra progreso de las que faltan', () => {
  const b = badgesFor({ sessions: 3, minutes: 0, km: 0, presentations: 61, promises: 2, came: 0, discipleship: 0, baptisms: 0, streak_weeks: 4, last_session: null });
  const byId = Object.fromEntries(b.map((x) => [x.id, x]));
  assert.equal(byId.first.earned, true);
  assert.equal(byId.pres50.earned, true);
  assert.equal(byId.pres100.earned, false);
  assert.equal(byId.pres100.progress, '61 de 100');
  assert.equal(byId.streak5.progress, '4 de 5');
});
