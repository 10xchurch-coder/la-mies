import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSIONS } from '../src/lib/bible';
import {
  autoMs, cleanItems, cleanLive, clock, fitFont, isNewer, itemSlides, newItem, parsePassage, passageSlides, songSlides, splitLines, step, textSlides,
  type LiveState,
} from '../src/lib/present';

const rv = VERSIONS[0];

test('songSlides: una diapositiva por estrofa o coro, con su título', () => {
  const s = songSlides('Línea uno\nLínea dos\n\n[Coro]\nAleluya\nAleluya\n\nEstrofa 2:\nFin');
  assert.equal(s.length, 3);
  assert.deepEqual(s[0], { kind: 'text', text: 'Línea uno\nLínea dos', label: null, footer: null });
  assert.deepEqual(s[1], { kind: 'text', text: 'Aleluya\nAleluya', label: 'Coro', footer: null });
  assert.equal(s[2].kind === 'text' && s[2].label, 'Estrofa 2');
  assert.deepEqual(songSlides('  \n\n '), []);
});

test('las estrofas largas se parten parejo', () => {
  const eight = ['1', '2', '3', '4', '5', '6', '7', '8'];
  assert.deepEqual(splitLines(eight, 6).map((p) => p.length), [4, 4]);
  assert.deepEqual(splitLines(['a', 'b'], 6), [['a', 'b']]);
  assert.equal(songSlides(eight.join('\n')).length, 2);
  assert.equal(songSlides(Array.from({ length: 13 }, (_, i) => `l${i}`).join('\n')).length, 3);
});

test('parsePassage entiende las citas comunes', () => {
  const juan = parsePassage('Juan 3:16-18')!;
  assert.deepEqual([juan.chapter, juan.from, juan.to], [3, 16, 18]);
  assert.deepEqual(parsePassage('juan 3:16'), { ...juan, to: 16 });
  assert.deepEqual(parsePassage('  Juan   3 : 16 – 18 '), juan);
  assert.equal(parsePassage('1 Juan 1.9')!.from, 9);
  assert.deepEqual([parsePassage('Salmo 23')!.from, parsePassage('Salmo 23')!.to], [1, null]);
  const judas = parsePassage('Judas 3')!;
  assert.deepEqual([judas.chapter, judas.from, judas.to], [1, 3, 3]);
  assert.equal(parsePassage('Juan 99:1'), null);
  assert.equal(parsePassage('Juan 3:18-16'), null);
  assert.equal(parsePassage('Libro Inventado 1:1'), null);
  assert.equal(parsePassage('Juan'), null);
  assert.equal(parsePassage(''), null);
});

test('passageSlides arma una diapositiva por versículo con la cita', () => {
  const s = passageSlides(rv, parsePassage('Juan 3:16-18'), 1);
  assert.equal(s.length, 3);
  assert.ok(s[0].kind === 'text' && s[0].text.length > 20 && !/^\d/.test(s[0].text));
  assert.equal(s[0].kind === 'text' && s[0].footer, `Juan 3:16 (${rv.short})`);
  assert.equal(s[2].kind === 'text' && s[2].footer, `Juan 3:18 (${rv.short})`);
  // De a dos: 16–17 y 18, con el número adelante de cada versículo.
  const two = passageSlides(rv, parsePassage('Juan 3:16-18'), 2);
  assert.equal(two.length, 2);
  assert.ok(two[0].kind === 'text' && two[0].text.startsWith('16 ') && two[0].text.includes(' 17 '));
  assert.equal(two[0].kind === 'text' && two[0].footer, `Juan 3:16–17 (${rv.short})`);
  // Capítulo entero y versículos que no existen.
  assert.equal(passageSlides(rv, parsePassage('Salmo 117'), 1).length, 2);
  assert.equal(passageSlides(rv, parsePassage('Juan 3:30-99'), 1).length, 7);
  assert.deepEqual(passageSlides(rv, parsePassage('Juan 3:99'), 1), []);
  assert.deepEqual(passageSlides(rv, null, 1), []);
});

test('textSlides separa por línea vacía', () => {
  assert.deepEqual(textSlides('Hola\n mundo \n\n\nChau').map((s) => s.kind === 'text' && s.text), ['Hola\nmundo', 'Chau']);
});

test('itemSlides por tipo', () => {
  assert.equal(itemSlides({ ...newItem('countdown') }, rv).length, 1);
  assert.equal(itemSlides(newItem('image'), rv).length, 0);
  assert.equal(itemSlides({ id: 'a', type: 'video', title: 'v', media: { path: 'x/y.mp4', name: 'y.mp4' } }, rv).length, 1);
  assert.equal(itemSlides({ id: 'm', type: 'music', title: 'm', media: { path: 'x/y.mp3', name: 'y.mp3' } }, rv).length, 0);
  assert.equal(itemSlides({ id: 'n', type: 'notice', title: 'Reunión', body: '' }, rv).length, 1);
});

test('step pasa de diapositiva y de parte, salteando las vacías', () => {
  const counts = [2, 0, 3];
  assert.deepEqual(step(counts, null, 1), { item: 0, slide: 0 });
  assert.equal(step(counts, null, -1), null);
  assert.deepEqual(step(counts, { item: 0, slide: 0 }, 1), { item: 0, slide: 1 });
  assert.deepEqual(step(counts, { item: 0, slide: 1 }, 1), { item: 2, slide: 0 });
  assert.deepEqual(step(counts, { item: 2, slide: 0 }, -1), { item: 0, slide: 1 });
  assert.equal(step(counts, { item: 2, slide: 2 }, 1), null);
  assert.equal(step(counts, { item: 0, slide: 0 }, -1), null);
  assert.equal(step([0, 0], null, 1), null);
});

test('autoMs: segundos y velocidad, con topes', () => {
  assert.equal(autoMs(10, 1), 10000);
  assert.equal(autoMs(10, 2), 5000);
  assert.equal(autoMs(10, 0.5), 20000);
  assert.equal(autoMs(0.1, 9), 1000);
});

test('clock y fitFont', () => {
  assert.equal(clock(75), '1:15');
  assert.equal(clock(-3), '0:00');
  assert.equal(clock(3600), '1:00:00');
  const short = fitFont('Aleluya', 1600, 900);
  const long = fitFont(Array.from({ length: 8 }, () => 'Una línea bastante larga de una canción cualquiera').join('\n'), 1600, 900);
  assert.ok(short > long && long >= 8);
});

test('cleanItems tira lo que no entiende y acomoda los números', () => {
  const items = cleanItems([
    { id: 'a', type: 'song', title: 'T', lyrics: 'x', auto: true, secs: 9999, speed: 7, audio: { path: 'c/p.mp3', name: 'p.mp3' } },
    { id: 'a', type: 'passage', ref: 'Juan 3:16', perSlide: 0 },
    { type: 'raro' }, null, 'texto',
  ]);
  assert.equal(items.length, 2);
  const song = items[0];
  assert.ok(song.type === 'song' && song.secs === 120 && song.speed === 2 && song.audio?.path === 'c/p.mp3');
  assert.ok(items[1].type === 'passage' && items[1].perSlide === 1 && items[1].id !== 'a');
  assert.deepEqual(cleanItems('nada'), []);
});

test('cleanLive e isNewer', () => {
  const a: LiveState = { v: 1, mode: 'slide', slide: { kind: 'text', text: 'Hola', label: null, footer: null }, stamp: 'a', at: 100 };
  assert.deepEqual(cleanLive(a), a);
  assert.equal(cleanLive({ ...a, slide: null }), null);
  assert.equal(cleanLive({ ...a, slide: { kind: 'image', url: 'javascript:alert(1)' } }), null);
  assert.equal(cleanLive({ v: 2 }), null);
  assert.equal(cleanLive({ v: 1, mode: 'black', slide: { kind: 'text', text: 'x' }, stamp: 'b', at: 5 })!.slide, null);
  assert.equal(isNewer(null, a), true);
  assert.equal(isNewer(a, { ...a, at: 200 }), false); // el mismo sello repetido
  assert.equal(isNewer(a, { ...a, stamp: 'b', at: 200 }), true);
  assert.equal(isNewer(a, { ...a, stamp: 'b', at: 50 }), false);
});
