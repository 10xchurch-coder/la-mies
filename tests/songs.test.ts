import test from 'node:test';
import assert from 'node:assert/strict';
import { lyricBlocks, searchKey } from '../src/lib/songs';

test('searchKey ignora tildes y mayúsculas', () => {
  assert.equal(searchKey('Canción del  SEÑOR'), 'cancion del senor');
});

test('lyricBlocks separa estrofas y reconoce el coro', () => {
  const b = lyricBlocks('Primera línea\nSegunda\n\n[Coro]\nAleluya\nAleluya\n\nCoro:\nOtra vez\n\nEstrofa 2:\nFin');
  assert.equal(b.length, 4);
  assert.deepEqual(b[0], { label: null, chorus: false, lines: ['Primera línea', 'Segunda'] });
  assert.equal(b[1].label, 'Coro'); assert.ok(b[1].chorus); assert.deepEqual(b[1].lines, ['Aleluya', 'Aleluya']);
  assert.equal(b[2].label, 'Coro');
  assert.equal(b[3].label, 'Estrofa 2'); assert.ok(!b[3].chorus);
  assert.deepEqual(lyricBlocks('   \n\n  '), []);
});
