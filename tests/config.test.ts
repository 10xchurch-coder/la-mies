import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appConfig = require('../app.config.js') as (a: { config: Record<string, any> }) => Record<string, any>;

// La app no puede leer la clave de Google Maps (Expo la quita), así que depende de esta marca.
test('app.config: con la clave, el mapa de Android queda marcado como activo', () => {
  const prev = process.env.GOOGLE_MAPS_ANDROID_KEY;
  process.env.GOOGLE_MAPS_ANDROID_KEY = 'clave-de-prueba';
  const c = appConfig({ config: { extra: { a: 1 } } });
  assert.equal(c.extra.googleMapsAndroid, true);
  assert.equal(c.extra.a, 1);
  assert.equal(c.android.config.googleMaps.apiKey, 'clave-de-prueba');
  if (prev === undefined) delete process.env.GOOGLE_MAPS_ANDROID_KEY; else process.env.GOOGLE_MAPS_ANDROID_KEY = prev;
});

test('app.config: sin la clave, el mapa de Android queda apagado (no se cierra la app)', () => {
  const prev = process.env.GOOGLE_MAPS_ANDROID_KEY;
  delete process.env.GOOGLE_MAPS_ANDROID_KEY;
  const c = appConfig({ config: {} });
  assert.equal(c.extra.googleMapsAndroid, false);
  assert.equal(c.android, undefined);
  if (prev !== undefined) process.env.GOOGLE_MAPS_ANDROID_KEY = prev;
});
