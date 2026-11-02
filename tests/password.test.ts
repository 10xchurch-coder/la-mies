import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword } from '../src/lib/password';

test('rechaza contraseñas cortas, sin números o comunes', () => {
  assert.equal(checkPassword('corta1').ok, false);
  assert.equal(checkPassword('soloLetrasAca').ok, false);
  assert.equal(checkPassword('password1234').ok, false);
  assert.equal(checkPassword('benjamin2026', ['Benjamin']).ok, false);
});

test('acepta una buena contraseña y mide la fuerza', () => {
  assert.equal(checkPassword('mies2026fuerte').ok, true);
  assert.equal(checkPassword('mies2026fuerte').strength, 'buena');
  assert.equal(checkPassword('Mies-2026-Fuerte!').strength, 'fuerte');
});
