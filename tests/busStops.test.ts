import test from 'node:test';
import assert from 'node:assert/strict';
import { BUS_KMH, NOTICE_MINUTES, ROAD_FACTOR, etaLabel, etaMinutes, moveStop, orderStops, pendingStops, regionForPoints, routeEtas, stopsToNotify, type StopLike } from '../src/lib/busStops';
import { haversine } from '../src/lib/geo';

// Un punto de Posadas. 0,001 de latitud son unos 111 metros.
const iglesia = { lat: -27.4, lng: -55.9 };
const alNorte = (grados: number) => ({ lat: iglesia.lat + grados, lng: iglesia.lng });
const parada = (id: string, pos: number, grados: number | null, extra: Partial<StopLike> = {}): StopLike =>
  ({ id, pos, lat: grados == null ? null : iglesia.lat + grados, lng: grados == null ? null : iglesia.lng, ...extra });

test('la cuenta de los minutos: línea recta x 1,4 a 25 km/h', () => {
  assert.equal(ROAD_FACTOR, 1.4);
  assert.equal(BUS_KMH, 25);
  assert.equal(NOTICE_MINUTES, 10);
  // 25 km/h son 416,67 m por minuto. 1000 m en línea recta -> 1400 m de camino -> 3,36 minutos.
  assert.ok(Math.abs(etaMinutes(1000) - 3.36) < 0.001);
  // 10 minutos son unos 2976 m en línea recta.
  assert.ok(Math.abs(etaMinutes(2976.19) - 10) < 0.001);
  assert.equal(etaMinutes(0), 0);
  assert.equal(etaMinutes(-50), 0);
});

test('las paradas van por su número de orden', () => {
  const lista = [parada('c', 3, 0.03), parada('a', 1, 0.01), parada('b', 2, 0.02)];
  assert.deepEqual(orderStops(lista).map((s) => s.id), ['a', 'b', 'c']);
  // no cambia la lista original
  assert.deepEqual(lista.map((s) => s.id), ['c', 'a', 'b']);
});

test('subir y bajar una parada', () => {
  assert.deepEqual(moveStop(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moveStop(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(moveStop(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(moveStop(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
  assert.deepEqual(moveStop(['a', 'b', 'c'], 'x', 1), ['a', 'b', 'c']);
});

test('los minutos se suman parada por parada, en orden', () => {
  const paradas = [parada('a', 1, 0.01), parada('b', 2, 0.02), parada('c', 3, 0.005)];
  const etas = routeEtas(iglesia, paradas);
  const ab = etaMinutes(haversine(iglesia, alNorte(0.01)));
  assert.ok(Math.abs(etas.get('a')! - ab) < 1e-9);
  assert.ok(Math.abs(etas.get('b')! - ab * 2) < 0.01);
  // la "c" está cerca de la iglesia, pero el colectivo llega última: va hasta "b" y vuelve
  assert.ok(etas.get('c')! > etas.get('b')!);
  assert.ok(etas.get('c')! > etaMinutes(haversine(iglesia, alNorte(0.005))) * 3);
});

test('se avisa a los 10 minutos o menos, una sola vez', () => {
  // "a" a ~7,5 min; "b" ~1,9 min después (9,3); "c" mucho más lejos.
  const paradas = [parada('a', 1, 0.02), parada('b', 2, 0.025), parada('c', 3, 0.06)];
  assert.deepEqual(stopsToNotify(iglesia, paradas), ['a', 'b']);
  // desde más lejos (unos 7,8 km) todavía a nadie
  assert.deepEqual(stopsToNotify(alNorte(-0.05), paradas), []);
  // si ya se le avisó en este viaje, no se repite
  assert.deepEqual(stopsToNotify(iglesia, [{ ...paradas[0], notified: true }, paradas[1], paradas[2]]), ['b']);
  // justo en el límite: 2976 m en línea recta son 10 minutos
  const justo = routeEtas(iglesia, [parada('z', 1, 0.0267)]).get('z')!;
  assert.ok(justo > 9.9 && justo < 10.1, String(justo));
});

test('las paradas que ya no cuentan', () => {
  const base = [parada('a', 1, 0.01), parada('b', 2, 0.02), parada('c', 3, 0.03), parada('d', 4, null)];
  // sin lugar en el mapa no se puede calcular
  assert.deepEqual(pendingStops(base).map((s) => s.id), ['a', 'b', 'c']);
  // el colectivo ya pasó por "b": "a" quedó atrás (la saltearon) y sigue "c"
  const pasoB = [base[0], { ...base[1], reached: true }, base[2]];
  assert.deepEqual(pendingStops(pasoB).map((s) => s.id), ['c']);
  // "hoy no viene" en "b": "a" sigue esperando y "c" también
  const salteoB = [base[0], { ...base[1], reached: true, skipped: true }, base[2]];
  assert.deepEqual(pendingStops(salteoB).map((s) => s.id), ['a', 'c']);
  // con "b" salteada, a "c" se llega directo desde "a" (no se suma la vuelta por "b")
  const conB = routeEtas(iglesia, [parada('a', 1, 0.01), parada('b', 2, -0.02), parada('c', 3, 0.02)]).get('c')!;
  const sinB = routeEtas(iglesia, [parada('a', 1, 0.01), parada('b', 2, -0.02, { reached: true, skipped: true }), parada('c', 3, 0.02)]).get('c')!;
  assert.ok(sinB < conB / 2);
  // el que ya subió no espera más
  assert.deepEqual(pendingStops([{ ...base[0], picked: true }, base[1]]).map((s) => s.id), ['b']);
});

test('textos y mapa', () => {
  assert.equal(etaLabel(0.4), 'llega en 1 minuto');
  assert.equal(etaLabel(7.4), 'llega en unos 7 minutos');
  assert.equal(etaLabel(undefined), '');
  assert.equal(regionForPoints([]), null);
  const r = regionForPoints([{ latitude: -27.4, longitude: -55.9 }, { latitude: -27.36, longitude: -55.88 }])!;
  assert.ok(Math.abs(r.latitude - -27.38) < 1e-9 && Math.abs(r.longitude - -55.89) < 1e-9);
  assert.ok(r.latitudeDelta >= 0.04 && r.longitudeDelta >= 0.02);
  // un solo punto: igual se ve un pedazo de mapa
  assert.equal(regionForPoints([{ latitude: -27.4, longitude: -55.9 }])!.latitudeDelta, 0.01);
});
