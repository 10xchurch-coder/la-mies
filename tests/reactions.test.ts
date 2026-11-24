import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReaction, myReaction, REACTIONS } from '../src/lib/reactionsCore';

test('reacciones: poner una en un mensaje sin reacciones', () => {
  const r = applyReaction(undefined, '❤️', 'Ana');
  assert.deepEqual(r, [{ emoji: '❤️', total: 1, mine: true, names: ['Ana'] }]);
  assert.equal(myReaction(r), '❤️');
});

test('reacciones: tocar la misma la saca', () => {
  const r = applyReaction([{ emoji: '❤️', total: 1, mine: true, names: ['Ana'] }], '❤️', 'Ana');
  assert.deepEqual(r, []);
  assert.equal(myReaction(r), null);
});

test('reacciones: tocar otra cambia la mía y no toca las de los demás', () => {
  const start = [{ emoji: '❤️', total: 3, mine: true, names: ['Luis', 'Ana', 'Marta'] }, { emoji: '🙏', total: 1, mine: false, names: ['Pedro'] }];
  const r = applyReaction(start, '🙏', 'Ana');
  assert.deepEqual(r, [{ emoji: '❤️', total: 2, mine: false, names: ['Luis', 'Marta'] }, { emoji: '🙏', total: 2, mine: true, names: ['Pedro', 'Ana'] }]);
});

test('reacciones: sumarme a una que puso otro', () => {
  const r = applyReaction([{ emoji: '👍', total: 2, mine: false, names: ['Luis', 'Marta'] }], '👍', 'Ana');
  assert.deepEqual(r, [{ emoji: '👍', total: 3, mine: true, names: ['Luis', 'Marta', 'Ana'] }]);
});

test('reacciones: las que se ofrecen no se repiten', () => {
  assert.equal(new Set(REACTIONS).size, REACTIONS.length);
});
