import test from 'node:test';
import assert from 'node:assert/strict';
import { socialLinks } from '../src/lib/social';

test('muestra solo las redes cargadas, en orden, y el sitio al final', () => {
  const l = socialLinks({ youtube: 'https://youtube.com/@x', instagram: 'instagram.com/y', podcast: ' ', x: null }, 'iglesia.com');
  assert.deepEqual(l.map((i) => i.key), ['instagram', 'youtube', 'web']);
  assert.equal(l[0].url, 'https://instagram.com/y');
  assert.equal(l[2].url, 'https://iglesia.com');
});
test('el podcast usa su nombre propio', () => {
  assert.equal(socialLinks({ podcast: 'x.podbean.com', podcast_name: 'Mensajes de Victoria' })[0].label, 'Mensajes de Victoria');
  assert.equal(socialLinks({ podcast: 'x.podbean.com' })[0].label, 'Podcast');
});
test('sin nada cargado no muestra nada', () => {
  assert.deepEqual(socialLinks(null), []);
  assert.deepEqual(socialLinks({}, ''), []);
});
