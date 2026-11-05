import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chosenPhotoId, dailyPhotoId, photoUrl } from '../src/lib/backgrounds';

test('la foto elegida para un versículo se lee de "u:<id>"', () => {
  assert.equal(chosenPhotoId('u:photo-1766773725488-1a56bb11f4b1'), 'photo-1766773725488-1a56bb11f4b1');
  assert.equal(chosenPhotoId('auto'), null);
  assert.equal(chosenPhotoId('campo'), null);
  assert.equal(chosenPhotoId('u:'), null);
  assert.equal(chosenPhotoId(null), null);
  assert.equal(chosenPhotoId('2c35b2a1/devocional/foto.jpg'), null);
});

test('la foto del día es la misma en todos los aparatos para la misma fecha', () => {
  assert.equal(dailyPhotoId('2026-11-05'), dailyPhotoId('2026-11-05'));
  assert.notEqual(dailyPhotoId('2026-11-05'), dailyPhotoId('2026-11-06'));
  assert.match(photoUrl(dailyPhotoId('2026-11-05'), 540, 960), /^https:\/\/images\.unsplash\.com\/photo-/);
});
