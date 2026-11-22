import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanUrl, kindFromUrl, sortLinks, isMusic, isRadio } from '../src/lib/links';
import { parseTicket, ticketPayload, showCode } from '../src/lib/ticket';
import { raffleProblem, needsEvent, needsClass } from '../src/lib/raffle';

test('cleanUrl agrega https y rechaza lo que no es una página', () => {
  assert.equal(cleanUrl('open.spotify.com/playlist/abc'), 'https://open.spotify.com/playlist/abc');
  assert.equal(cleanUrl('  https://music.youtube.com/playlist?list=PL1 '), 'https://music.youtube.com/playlist?list=PL1');
  assert.equal(cleanUrl(''), null);
  assert.equal(cleanUrl('hola que tal'), null);
  assert.equal(cleanUrl('javascript:alert(1)'), null);
  assert.equal(cleanUrl('ftp://sitio.com/a'), null);
  assert.equal(cleanUrl('localhost'), null);
});

test('kindFromUrl reconoce Spotify y YouTube Music', () => {
  assert.equal(kindFromUrl('https://open.spotify.com/playlist/x'), 'spotify');
  assert.equal(kindFromUrl('https://music.youtube.com/playlist?list=x'), 'youtube_music');
  assert.equal(kindFromUrl('https://www.youtube.com/watch?v=x'), null);
  assert.equal(kindFromUrl('no es un link'), null);
});

test('sortLinks ordena por tipo y posición; isMusic / isRadio', () => {
  const rows = [
    { kind: 'youtube_music', position: 0, title: 'B' },
    { kind: 'spotify', position: 2, title: 'C' },
    { kind: 'spotify', position: 1, title: 'A' },
  ];
  assert.deepEqual(sortLinks(rows).map((r) => r.title), ['A', 'C', 'B']);
  assert.ok(isMusic('spotify') && !isMusic('radio_fm') && isRadio('radio_stream'));
});

test('entrada: el QR se lee de vuelta y se acepta el código a mano', () => {
  assert.equal(ticketPayload('1a2b3c4d'), 'lamies:ticket:1A2B3C4D');
  assert.equal(parseTicket(ticketPayload('1A2B3C4D')), '1A2B3C4D');
  assert.equal(parseTicket('1a2b-3c4d'), '1A2B3C4D');
  assert.equal(parseTicket(' 1A2B 3C4D '), '1A2B3C4D');
  assert.equal(parseTicket('https://sitio.com'), null);
  assert.equal(parseTicket('1A2B3C4'), null);
  assert.equal(parseTicket(''), null);
  assert.equal(showCode('1A2B3C4D'), '1A2B-3C4D');
});

test('rifa: avisa lo que falta', () => {
  assert.equal(raffleProblem({ title: 'B', pool: 'bus', eventId: null, classId: null }), 'Ponele un nombre al sorteo');
  assert.equal(raffleProblem({ title: 'Biblia', pool: 'event_checkins', eventId: null, classId: null }), 'Elegí el evento');
  assert.equal(raffleProblem({ title: 'Biblia', pool: 'class', eventId: null, classId: null }), 'Elegí la clase');
  assert.equal(raffleProblem({ title: 'Biblia', pool: 'bus', eventId: null, classId: null }), null);
  assert.ok(needsEvent('event_registered') && needsClass('class') && !needsEvent('bus'));
});
