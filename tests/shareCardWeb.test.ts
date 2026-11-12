import test from 'node:test';
import assert from 'node:assert/strict';
import { verseSize, wrapLines } from '../src/lib/shareCardWeb';

const m = (t: string) => t.length * 10; // cada letra mide 10

test('parte el texto en renglones que entran en el ancho', () => {
  assert.deepEqual(wrapLines(m, 'uno dos tres cuatro', 90), ['uno dos', 'tres', 'cuatro']);
  assert.deepEqual(wrapLines(m, 'hola', 100), ['hola']);
});
test('respeta los saltos de línea y no se cuelga con una palabra más larga que el ancho', () => {
  assert.deepEqual(wrapLines(m, 'a\nb', 100), ['a', 'b']);
  assert.deepEqual(wrapLines(m, 'supercalifragilistico y', 50), ['supercalifragilistico', 'y']);
});
test('la letra se achica con los versículos largos', () => {
  assert.equal(verseSize(100).size, 25);
  assert.equal(verseSize(300).size, 21);
  assert.equal(verseSize(500).size, 18);
});
