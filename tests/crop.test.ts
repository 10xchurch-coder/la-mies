import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampOffset, cropRect, zoomAround } from '../src/lib/crop';

test('la foto tapa siempre el cuadro', () => {
  assert.deepEqual(clampOffset({ x: 50, y: -999 }, 600, 400, 300), { x: 0, y: -100 });
});

test('recorte centrado de una foto horizontal', () => {
  // 1200x800 en un cuadro de 300: escala 300/800
  const s = 300 / 800;
  const o = { x: (300 - 1200 * s) / 2, y: 0 };
  assert.deepEqual(cropRect(o, s, 300, 1200, 800), { originX: 200, originY: 0, width: 800, height: 800 });
});

test('acercar al doble desde el centro deja el centro quieto', () => {
  const o = zoomAround({ x: 0, y: 0 }, 1, 2, 150, 150);
  assert.deepEqual(o, { x: -150, y: -150 });
  assert.deepEqual(cropRect(o, 2, 300, 300, 300), { originX: 75, originY: 75, width: 150, height: 150 });
});
