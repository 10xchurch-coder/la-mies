import test from 'node:test';
import assert from 'node:assert/strict';
import { headingFromOrientation, headingMoved, norm360, smoothHeading } from '../src/lib/heading';

test('rumbo en iPhone y en Android', () => {
  assert.equal(headingFromOrientation({ webkitCompassHeading: 90, alpha: 10 }), 90);
  assert.equal(headingFromOrientation({ alpha: 90, absolute: true }), 270);
  assert.equal(headingFromOrientation({ alpha: 0, absolute: true }), 0);
  // Sin brújula de verdad (alpha relativo) no se inventa un rumbo.
  assert.equal(headingFromOrientation({ alpha: 90, absolute: false }), null);
  assert.equal(headingFromOrientation({}), null);
  // Con el teléfono acostado (pantalla girada 90°) se corrige.
  assert.equal(headingFromOrientation({ webkitCompassHeading: 350 }, 90), 80);
});

test('suaviza por el camino corto', () => {
  assert.equal(smoothHeading(null, 370), 10);
  const s = smoothHeading(350, 10, 0.5);
  assert.equal(s, 0);
  assert.equal(smoothHeading(10, 350, 0.5), 0);
  assert.equal(norm360(-90), 270);
});

test('solo redibuja si giró lo suficiente', () => {
  assert.equal(headingMoved(null, 10), true);
  assert.equal(headingMoved(359, 1), false);
  assert.equal(headingMoved(350, 10), true);
});
