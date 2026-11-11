import test from 'node:test';
import assert from 'node:assert/strict';
import { appleStopUrl, googleRouteUrls, googleStopUrl, moved } from '../src/lib/busRoute';

const P = (n: number) => ({ lat: -27.3 - n / 100, lng: -55.9 });

test('recorrido corto: un solo enlace con paradas intermedias y destino', () => {
  const u = googleRouteUrls([P(1), P(2), P(3)]);
  assert.equal(u.length, 1);
  assert.equal(u[0], 'https://www.google.com/maps/dir/?api=1&destination=-27.33,-55.9&waypoints=-27.31,-55.9%7C-27.32,-55.9&travelmode=driving');
});
test('una sola parada: sin paradas intermedias', () => {
  assert.equal(googleRouteUrls([P(1)])[0], 'https://www.google.com/maps/dir/?api=1&destination=-27.31,-55.9&travelmode=driving');
  assert.deepEqual(googleRouteUrls([]), []);
});
test('recorrido largo: se parte en tramos y cada tramo sale de la última parada del anterior', () => {
  const stops = Array.from({ length: 23 }, (_, i) => P(i));
  const u = googleRouteUrls(stops);
  assert.equal(u.length, 3);
  assert.ok(!u[0].includes('origin='));
  assert.ok(u[1].includes(`origin=${(-27.3 - 9 / 100).toFixed(2)},-55.9`));
  assert.equal(u[0].split('%7C').length, 9); // 9 intermedias + destino = 10 paradas
  assert.equal(u[2].split('%7C').length, 2); // 3 paradas en el último tramo
});
test('enlaces de una parada y mover', () => {
  assert.equal(googleStopUrl(P(1)), 'https://www.google.com/maps/dir/?api=1&destination=-27.31,-55.9&travelmode=driving');
  assert.equal(appleStopUrl(P(1)), 'https://maps.apple.com/?daddr=-27.31,-55.9&dirflg=d');
  assert.deepEqual(moved(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moved(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
});
