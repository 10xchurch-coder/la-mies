import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BG_MIN_BUILD, activeViewers, agoText, applyChoices, backgroundAllowed, canSee, isPaused, isStale, leaveDistance, pauseUntil,
  placeChange, placeEventText, placeEvents, regionFor, sharingLine, shouldSend, type Place, type ViewerRow,
} from '../src/lib/famLoc';

const YO = 'yo';
const ESPOSA = 'esposa', HIJO = 'hijo', PASTOR = 'pastor', AMIGO = 'amigo', OTRO = 'otro';

test('segundo plano: solo en las versiones nuevas de la tienda; nunca en la web', () => {
  assert.equal(backgroundAllowed('ios', 10), false);
  assert.equal(backgroundAllowed('ios', BG_MIN_BUILD.ios), true);
  assert.equal(backgroundAllowed('ios', '12'), true);
  assert.equal(backgroundAllowed('android', 17), false);
  assert.equal(backgroundAllowed('android', 18), true);
  assert.equal(backgroundAllowed('android', null), false);
  assert.equal(backgroundAllowed('android', 'no-se'), false);
  assert.equal(backgroundAllowed('android', 0), false);
  assert.equal(backgroundAllowed('web', 999), false);
});

test('quién me ve: apagado, nadie; prendido sin elegir a nadie, nadie', () => {
  assert.equal(canSee(null, ESPOSA), false);
  assert.equal(canSee({ enabled: false, viewers: [{ id: ESPOSA, via: 'familia', status: 'on' }] }, ESPOSA), false);
  assert.equal(canSee({ enabled: true, viewers: [] }, ESPOSA), false);
  assert.equal(canSee({ enabled: true, viewers: [] }, PASTOR), false);
});

test('quién me ve: la familia solo si elegí familia; el pastor solo si elegí pastores', () => {
  const ids = { familyIds: [ESPOSA, HIJO], pastorIds: [PASTOR] };
  const soloFamilia = applyChoices([], YO, { family: true, pastors: false, ...ids });
  assert.deepEqual(activeViewers(soloFamilia).sort(), [ESPOSA, HIJO].sort());
  const share = { enabled: true, viewers: soloFamilia };
  assert.equal(canSee(share, ESPOSA), true);
  assert.equal(canSee(share, PASTOR), false);
  assert.equal(canSee(share, OTRO), false);

  const conPastores = applyChoices(soloFamilia, YO, { family: true, pastors: true, ...ids });
  assert.equal(canSee({ enabled: true, viewers: conPastores }, PASTOR), true);

  const sinFamilia = applyChoices(conPastores, YO, { family: false, pastors: true, ...ids });
  assert.equal(canSee({ enabled: true, viewers: sinFamilia }, ESPOSA), false);
  assert.equal(canSee({ enabled: true, viewers: sinFamilia }, PASTOR), true);

  const nada = applyChoices(conPastores, YO, { family: false, pastors: false, ...ids });
  assert.deepEqual(activeViewers(nada), []);
});

test('quién me ve: a quien saqué a mano no vuelve solo; un familiar nuevo no entra hasta que yo guarde de nuevo', () => {
  let rows: ViewerRow[] = applyChoices([], YO, { family: true, pastors: false, familyIds: [ESPOSA, HIJO], pastorIds: [] });
  rows = rows.map((r) => (r.id === HIJO ? { ...r, status: 'removed' } : r));
  rows = applyChoices(rows, YO, { family: true, pastors: false, familyIds: [ESPOSA, HIJO], pastorIds: [] });
  assert.deepEqual(activeViewers(rows), [ESPOSA]);
  // Alguien sumó a OTRO a mi familia: mi lista no cambia sola.
  assert.equal(canSee({ enabled: true, viewers: rows }, OTRO), false);
  // Nunca me agrego a mí mismo.
  assert.deepEqual(activeViewers(applyChoices([], YO, { family: true, pastors: true, familyIds: [YO], pastorIds: [YO] })), []);
});

test('quién me ve: una persona elegida por nombre sigue aunque apague los grupos', () => {
  const rows: ViewerRow[] = [{ id: AMIGO, via: 'persona', status: 'on' }, { id: ESPOSA, via: 'familia', status: 'on' }];
  const out = applyChoices(rows, YO, { family: false, pastors: false, familyIds: [ESPOSA], pastorIds: [] });
  assert.deepEqual(activeViewers(out), [AMIGO]);
  // Quien es familiar Y pastor queda prendido si uno de los dos grupos sigue elegido.
  const both = applyChoices([{ id: PASTOR, via: 'pastor', status: 'on' }], YO, { family: true, pastors: false, familyIds: [PASTOR], pastorIds: [PASTOR] });
  assert.deepEqual(activeViewers(both), [PASTOR]);
});

test('pausa: esconde a todos hasta que se vence', () => {
  const now = Date.UTC(2026, 10, 24, 15, 0, 0);
  const viewers: ViewerRow[] = [{ id: ESPOSA, via: 'familia', status: 'on' }];
  assert.equal(isPaused(null, now), false);
  assert.equal(isPaused(new Date(now + 1000).toISOString(), now), true);
  assert.equal(isPaused(new Date(now - 1000).toISOString(), now), false);
  assert.equal(isPaused('cualquier cosa', now), false);
  assert.equal(canSee({ enabled: true, pausedUntil: now + 60_000, viewers }, ESPOSA, now), false);
  assert.equal(canSee({ enabled: true, pausedUntil: now - 60_000, viewers }, ESPOSA, now), true);
});

test('pausa: una hora, o hasta mañana a las 6', () => {
  const now = new Date(2026, 10, 24, 22, 30, 0);
  assert.equal(pauseUntil('hora', now).getTime() - now.getTime(), 3_600_000);
  const m = pauseUntil('manana', now);
  assert.equal(m.getDate(), 25);
  assert.equal(m.getHours(), 6);
  assert.equal(m.getMinutes(), 0);
  // De madrugada también es "mañana" (el día siguiente), nunca en el pasado.
  assert.ok(pauseUntil('manana', new Date(2026, 10, 24, 1, 0, 0)).getTime() > new Date(2026, 10, 24, 1, 0, 0).getTime());
});

const IGLESIA: Place = { id: 'iglesia', name: 'Iglesia', lat: -27.45, lng: -55.9, radius_m: 150 };
const CASA: Place = { id: 'casa', name: 'Casa', lat: -27.4, lng: -55.95, radius_m: 100 };
// ~111 m por cada 0.001 de latitud
const at = (place: Place, metersNorth: number) => ({ lat: place.lat + metersNorth / 111_320, lng: place.lng });

test('lugares: llegar y salir, con margen en el borde', () => {
  assert.equal(placeChange(false, 100, 150), 'llego');
  assert.equal(placeChange(false, 151, 150), null);
  assert.equal(placeChange(true, 160, 150), null); // en el borde no avisa que salió
  assert.equal(placeChange(true, leaveDistance(150) + 1, 150), 'salio');
  assert.equal(placeChange(true, 10, 150), null);
});

test('lugares: de una posición a la otra', () => {
  const lejos = { lat: -27.3, lng: -55.8 };
  let r = placeEvents([], [IGLESIA, CASA], at(IGLESIA, 20));
  assert.deepEqual(r.inside, ['iglesia']);
  assert.deepEqual(r.events.map((e) => placeEventText('Rubén', e)), ['Rubén llegó a Iglesia']);
  r = placeEvents(r.inside, [IGLESIA, CASA], at(IGLESIA, 170)); // apenas afuera: todavía cuenta adentro
  assert.deepEqual(r.inside, ['iglesia']);
  assert.deepEqual(r.events, []);
  r = placeEvents(r.inside, [IGLESIA, CASA], lejos);
  assert.deepEqual(r.inside, []);
  assert.deepEqual(r.events.map((e) => placeEventText('Rubén', e)), ['Rubén salió de Iglesia']);
  r = placeEvents(r.inside, [IGLESIA, CASA], at(CASA, 0));
  assert.deepEqual(r.events.map((e) => placeEventText('Rubén', e)), ['Rubén llegó a Casa']);
});

test('lugares: la primera posición no avisa, y con GPS flojo no se decide nada', () => {
  const first = placeEvents([], [IGLESIA], at(IGLESIA, 0), { first: true });
  assert.deepEqual(first.inside, ['iglesia']);
  assert.deepEqual(first.events, []);
  const flojo = placeEvents(['iglesia'], [IGLESIA], { lat: 0, lng: 0 }, { accuracy: 900 });
  assert.deepEqual(flojo.inside, ['iglesia']);
  assert.deepEqual(flojo.events, []);
});

test('batería: quieto manda poco; si se mueve, manda', () => {
  const now = 1_000_000_000;
  const last = { t: now - 60_000, lat: -27.4, lng: -55.9 };
  assert.equal(shouldSend(null, { lat: 1, lng: 1 }, now), true);
  assert.equal(shouldSend(last, { lat: -27.4, lng: -55.9 }, now), false);             // quieto, 1 minuto
  assert.equal(shouldSend({ ...last, t: now - 6 * 60_000 }, { lat: -27.4, lng: -55.9 }, now), true); // quieto, 6 minutos
  assert.equal(shouldSend(last, { lat: -27.402, lng: -55.9 }, now), true);            // ~220 m
  assert.equal(shouldSend({ ...last, t: now - 5_000 }, { lat: -27.41, lng: -55.9 }, now), false);   // demasiado seguido
});

test('textos', () => {
  const now = Date.UTC(2026, 10, 24, 15, 0, 0);
  const ago = (s: number) => agoText(new Date(now - s * 1000).toISOString(), now);
  assert.equal(ago(20), 'recién');
  assert.equal(ago(180), 'hace 3 min');
  assert.equal(ago(2 * 3600), 'hace 2 h');
  assert.equal(ago(26 * 3600), 'hace 1 día');
  assert.equal(ago(3 * 86400), 'hace 3 días');
  assert.equal(agoText(null, now), 'sin ubicación todavía');
  assert.equal(isStale(new Date(now - 5 * 60_000).toISOString(), now), false);
  assert.equal(isStale(new Date(now - 20 * 60_000).toISOString(), now), true);
  assert.equal(isStale(null, now), true);
  assert.equal(sharingLine(3), 'Estás compartiendo tu ubicación con 3 personas');
  assert.equal(sharingLine(1), 'Estás compartiendo tu ubicación con 1 persona');
  assert.match(sharingLine(0), /no la ve nadie/);
});

test('el mapa entra a todos', () => {
  assert.equal(regionFor([]), null);
  const one = regionFor([{ lat: -27.4, lng: -55.9 }])!;
  assert.equal(one.latitude, -27.4);
  assert.ok(one.latitudeDelta >= 0.01);
  const two = regionFor([{ lat: -27.4, lng: -55.9 }, { lat: -27.5, lng: -55.8 }])!;
  assert.ok(Math.abs(two.latitude - -27.45) < 1e-9);
  assert.ok(two.latitudeDelta > 0.1 && two.longitudeDelta > 0.1);
});

// Los permisos que muestra el teléfono tienen que decir para qué es el GPS de fondo (lo piden las tiendas).
import { readFileSync } from 'node:fs';
test('app.json: los textos de permiso de ubicación nombran compartir con la familia', () => {
  const cfg = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const loc = (cfg.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === 'expo-location') as [string, Record<string, string>];
  const texts = [
    cfg.ios.infoPlist.NSLocationWhenInUseUsageDescription, cfg.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription,
    loc[1].locationWhenInUsePermission, loc[1].locationAlwaysAndWhenInUsePermission,
  ];
  for (const t of texts) assert.match(t, /familia/i);
  for (const t of texts) assert.match(t, /evangelismo/i); // lo de antes sigue dicho
  assert.equal(cfg.ios.infoPlist.NSLocationWhenInUseUsageDescription, loc[1].locationWhenInUsePermission);
  assert.equal(cfg.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription, loc[1].locationAlwaysAndWhenInUsePermission);
});
