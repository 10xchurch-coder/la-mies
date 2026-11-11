import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoords } from '../src/lib/geoLink';

test('coordenadas sueltas', () => {
  assert.deepEqual(parseCoords('-27.3671, -55.8961'), { lat: -27.3671, lng: -55.8961 });
  assert.deepEqual(parseCoords('-27.3671,-55.8961'), { lat: -27.3671, lng: -55.8961 });
});
test('enlace largo de Google Maps', () => {
  assert.deepEqual(parseCoords('https://www.google.com/maps/place/Plaza/@-27.3671,-55.8961,17z/data=!3m1'), { lat: -27.3671, lng: -55.8961 });
  assert.deepEqual(parseCoords('https://www.google.com/maps?q=-27.37,-55.9'), { lat: -27.37, lng: -55.9 });
  assert.deepEqual(parseCoords('https://www.google.com/maps/place/X/data=!3d-27.36!4d-55.89'), { lat: -27.36, lng: -55.89 });
});
test('geo: y basura', () => {
  assert.deepEqual(parseCoords('geo:-27.36,-55.89'), { lat: -27.36, lng: -55.89 });
  assert.equal(parseCoords('hola'), null);
  assert.equal(parseCoords('200, 300'), null);
  assert.equal(parseCoords('0,0'), null);
});
