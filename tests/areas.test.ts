import test from 'node:test';
import assert from 'node:assert/strict';
import { areaOf } from '../src/lib/areas';

test('cada pantalla toma el color de su área', () => {
  assert.equal(areaOf(['finanzas', 'movimiento']), 'pink');
  assert.equal(areaOf(['(tabs)', 't-chat']), 'violet');
  assert.equal(areaOf(['admin', 'miembros']), 'amber');
  assert.equal(areaOf(['admin', 'roles']), 'pink');
  assert.equal(areaOf(['seguimiento']), 'amber');
  assert.equal(areaOf(['algo-nuevo']), 'green');
});
