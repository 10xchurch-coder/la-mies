import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversine, projectOnSegment, sideOfSegment, bearing, sideName, matchPoint, offsetSegment, type Road,
} from '../src/lib/geo';
import { walkedDistance, detectVehicle, coverageFromTrack, type TrackPoint } from '../src/lib/track';

// Una calle de oeste a este (como "Calle 137") en Posadas.
const calle: Road = {
  id: 1,
  name: 'Calle 137',
  coords: [
    [-27.4000, -55.9000],
    [-27.4000, -55.8990],
    [-27.4000, -55.8980],
  ],
};
// Una calle de norte a sur que la cruza.
const transversal: Road = {
  id: 2,
  name: 'Calle 135',
  coords: [
    [-27.3990, -55.8990],
    [-27.4010, -55.8990],
  ],
};

test('haversine: 1 cuadra de 100 m', () => {
  const d = haversine({ lat: -27.4, lng: -55.9 }, { lat: -27.4, lng: -55.898984 });
  assert.ok(Math.abs(d - 100) < 2, `fue ${d}`);
});

test('projectOnSegment: punto a 5 m al norte del eje', () => {
  const p = { lat: -27.4000 + 5 / 111320, lng: -55.8995 };
  const r = projectOnSegment(p, { lat: -27.4, lng: -55.9 }, { lat: -27.4, lng: -55.899 });
  assert.ok(Math.abs(r.dist - 5) < 0.2, `dist ${r.dist}`);
  assert.ok(Math.abs(r.t - 0.5) < 0.01, `t ${r.t}`);
});

test('sideOfSegment y sideName: la calle va hacia el este, el norte queda a la izquierda', () => {
  const a = { lat: -27.4, lng: -55.9 };
  const b = { lat: -27.4, lng: -55.899 };
  const norte = { lat: -27.4 + 5 / 111320, lng: -55.8995 };
  const sur = { lat: -27.4 - 5 / 111320, lng: -55.8995 };
  assert.equal(Math.round(bearing(a, b)), 90);
  assert.equal(sideOfSegment(norte, a, b), 1);
  assert.equal(sideOfSegment(sur, a, b), -1);
  assert.equal(sideName(a, b, 1), 'norte');
  assert.equal(sideName(a, b, -1), 'sur');
});

test('sideName en una calle norte-sur: este / oeste', () => {
  const a = { lat: -27.399, lng: -55.899 };
  const b = { lat: -27.401, lng: -55.899 }; // va hacia el sur
  assert.equal(sideName(a, b, 1), 'este'); // izquierda yendo al sur = este
  assert.equal(sideName(a, b, -1), 'oeste');
});

test('matchPoint elige la calle y el tramo correctos', () => {
  const p = { lat: -27.4000 - 4 / 111320, lng: -55.8985 }; // sobre el 2º tramo, vereda sur
  const m = matchPoint(p, [calle, transversal]);
  assert.ok(m);
  assert.equal(m.roadId, 1);
  assert.equal(m.seg, 1);
  assert.equal(m.side, -1);
  assert.ok(m.dist < 5);
});

test('matchPoint: lejos de toda calle devuelve null', () => {
  assert.equal(matchPoint({ lat: -27.41, lng: -55.95 }, [calle, transversal]), null);
});

test('offsetSegment corre el tramo 3 m hacia la vereda pedida', () => {
  const [a2, b2] = offsetSegment({ lat: -27.4, lng: -55.9 }, { lat: -27.4, lng: -55.899 }, 1, 3);
  assert.ok(a2.lat > -27.4 && b2.lat > -27.4, 'hacia el norte');
  assert.ok(Math.abs(haversine({ lat: -27.4, lng: -55.9 }, a2) - 3) < 0.1);
});

function walk(n: number, stepM: number, dtMs: number, lat = -27.4000 - 4 / 111320): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ t: i * dtMs, lat, lng: -55.9 + (i * stepM) / (111320 * Math.cos((lat * Math.PI) / 180)), acc: 8 });
  }
  return pts;
}

test('walkedDistance suma el recorrido e ignora saltos del GPS', () => {
  const pts = walk(21, 5, 5000); // 20 pasos de 5 m = 100 m
  const d = walkedDistance(pts);
  assert.ok(Math.abs(d - 100) < 2, `fue ${d}`);
  const withGlitch = [...pts, { t: 21 * 5000, lat: -27.5, lng: -56, acc: 8 }];
  assert.ok(Math.abs(walkedDistance(withGlitch) - 100) < 2, 'el salto no debería sumar');
});

test('detectVehicle: caminando no dispara, en auto sí y recorta en el último punto lento', () => {
  const walking = walk(10, 6, 5000); // 1,2 m/s
  assert.equal(detectVehicle(walking).vehicle, false);
  const driving = [...walking];
  const last = walking[walking.length - 1];
  for (let i = 1; i <= 6; i++) {
    driving.push({ t: last.t + i * 5000, lat: last.lat, lng: last.lng + (i * 60) / 111320 / Math.cos((last.lat * Math.PI) / 180), acc: 8, spd: 12 });
  }
  const r = detectVehicle(driving);
  assert.equal(r.vehicle, true);
  assert.equal(r.lastWalkingIndex, walking.length - 1);
});

test('detectVehicle: un solo salto rápido no cuenta', () => {
  const pts = walk(8, 6, 5000);
  pts.push({ t: 8 * 5000, lat: pts[7].lat, lng: pts[7].lng + 80 / 111320, acc: 8 });
  pts.push({ t: 9 * 5000, lat: pts[8].lat, lng: pts[8].lng + 5 / 111320, acc: 8 });
  assert.equal(detectVehicle(pts).vehicle, false);
});

test('coverageFromTrack marca la vereda sur del tramo caminado, no la calle que cruza ni los 20 m del tramo siguiente', () => {
  const pts = walk(25, 5, 5000); // 120 m sobre el 1er tramo (100 m) y entra 20 m al 2º
  const r = coverageFromTrack(pts, [calle, transversal]);
  const keys = r.events.map((e) => `${e.road_id}:${e.seg}:${e.side}`).sort();
  assert.deepEqual(keys, ['1:0:-1']);
  assert.equal(r.blocks, 1);
});

test('coverageFromTrack: el GPS que salta a la vereda de enfrente no la marca', () => {
  // camina por la vereda sur (4 m) y cada 5 puntos el GPS lo tira 6 m al norte del eje
  const pts = walk(21, 5, 5000).map((p, i) => (i % 5 === 2 ? { ...p, lat: -27.4000 + 6 / 111320 } : p));
  const r = coverageFromTrack(pts, [calle]);
  assert.deepEqual(r.events.map((e) => `${e.road_id}:${e.seg}:${e.side}`), ['1:0:-1']);
});

test('coverageFromTrack: cruzar una calle no la marca', () => {
  // cruza la transversal (norte-sur) caminando de oeste a este, a 4 m de la calle 137
  const pts = walk(41, 5, 5000);
  const r = coverageFromTrack(pts, [transversal]);
  assert.equal(r.events.length, 0);
});

test('coverageFromTrack: pasar solo por una punta del tramo no lo marca', () => {
  const pts = walk(4, 5, 5000); // 15 m de una cuadra de 100 m
  const r = coverageFromTrack(pts, [calle]);
  assert.equal(r.events.length, 0);
});

test('coverageFromTrack: con GPS impreciso (40 m) no marca nada', () => {
  const pts = walk(21, 5, 5000).map((p) => ({ ...p, acc: 40 }));
  assert.equal(coverageFromTrack(pts, [calle]).events.length, 0);
});

test('coverageFromTrack respeta la corrección manual de vereda', () => {
  const pts = walk(16, 5, 5000);
  const r = coverageFromTrack(pts, [calle], [{ roadId: 1, since: 0, side: 1 }]);
  assert.deepEqual(r.events.map((e) => e.side), [1]);
});
