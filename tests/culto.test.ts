import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItems, mainRoles, moveItem, myParts, newItem, patchItem, removeItem, starterItems, titleFor } from '../src/lib/servicePlan';
import { BADGES, badgesEarned, countByChild, nextBadge, progressText, topBadge, versesLabel } from '../src/lib/verses';
import { blankCount, filledCount, filledOutline, hasNotes } from '../src/lib/sermonNotes';
import { featureOfPath } from '../src/lib/features';
import { areaOf } from '../src/lib/areas';

test('orden del culto: el culto de arranque tiene las partes de siempre, con ids distintos', () => {
  const items = starterItems();
  assert.deepEqual(items.map((x) => x.type), ['prayer', 'song', 'song', 'notices', 'offering', 'reading', 'sermon', 'prayer']);
  assert.equal(new Set(items.map((x) => x.id)).size, items.length);
  assert.equal(items[0].title, 'Oración');
  assert.equal(items[0].whoId, null);
});

test('orden del culto: cleanItems aguanta datos rotos', () => {
  assert.deepEqual(cleanItems(null), []);
  assert.deepEqual(cleanItems('x'), []);
  const got = cleanItems([
    { id: 'a', type: 'song', title: '  Cuán grande es Él ', songId: 's1', whoId: 'p1', whoName: 'Marta Ejemplo' },
    { id: 'a', type: 'cosa-rara', title: '' },
    null, 7,
    { type: 'reading', ref: 'Salmos 23', songId: 'no-va' },
  ]);
  assert.equal(got.length, 3);
  assert.deepEqual(got[0], { id: 'a', type: 'song', title: 'Cuán grande es Él', songId: 's1', ref: null, whoId: 'p1', whoName: 'Marta Ejemplo', note: null });
  assert.equal(got[1].type, 'other');
  assert.equal(got[1].title, 'Otro');
  assert.notEqual(got[1].id, 'a');
  assert.equal(got[2].ref, 'Salmos 23');
  assert.equal(got[2].songId, null);
});

test('orden del culto: mover, cambiar y sacar partes', () => {
  const a = newItem('prayer', 'a'); const b = newItem('song', 'b'); const c = newItem('sermon', 'c');
  const items = [a, b, c];
  assert.deepEqual(moveItem(items, 'c', -1).map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(items, 'a', 1).map((x) => x.id), ['b', 'a', 'c']);
  assert.equal(moveItem(items, 'a', -1), items);
  assert.equal(moveItem(items, 'c', 1), items);
  assert.equal(moveItem(items, 'zz', 1), items);
  assert.equal(patchItem(items, 'b', { title: 'Sublime gracia' })[1].title, 'Sublime gracia');
  assert.equal(items[1].title, 'Canción');
  assert.deepEqual(removeItem(items, 'b').map((x) => x.id), ['a', 'c']);
});

test('orden del culto: mis partes y quién hace qué', () => {
  const items = [
    { ...newItem('song', '1'), whoId: 'p1', whoName: 'Marta Ejemplo' },
    { ...newItem('song', '2'), whoId: 'p1', whoName: 'Marta Ejemplo' },
    { ...newItem('notices', '3'), whoName: 'Raúl Prueba' },
    { ...newItem('sermon', '4'), whoId: 'p2', whoName: 'Pastor Ejemplo' },
    newItem('offering', '5'),
  ];
  assert.deepEqual(myParts(items, 'p1').map((x) => x.id), ['1', '2']);
  assert.deepEqual(myParts(items, null), []);
  assert.deepEqual(mainRoles(items), [
    { label: 'Predica', names: ['Pastor Ejemplo'] },
    { label: 'Dirige las canciones', names: ['Marta Ejemplo'] },
    { label: 'Anuncios', names: ['Raúl Prueba'] },
  ]);
  assert.deepEqual(mainRoles([newItem('song', 'x')]), []);
  assert.equal(titleFor('2026-11-29'), 'Culto del domingo');
  assert.equal(titleFor('2026-11-28'), 'Culto del sábado');
});

test('versículos: premios a los 5, 10 y 25', () => {
  assert.deepEqual(BADGES.map((b) => b.at), [5, 10, 25]);
  assert.equal(topBadge(0), null);
  assert.equal(topBadge(4), null);
  assert.equal(topBadge(5)?.at, 5);
  assert.equal(topBadge(9)?.at, 5);
  assert.equal(topBadge(10)?.at, 10);
  assert.equal(topBadge(24)?.at, 10);
  assert.equal(topBadge(25)?.at, 25);
  assert.equal(topBadge(90)?.at, 25);
  assert.equal(badgesEarned(12).length, 2);
  assert.deepEqual(nextBadge(3) && { at: nextBadge(3)!.badge.at, missing: nextBadge(3)!.missing }, { at: 5, missing: 2 });
  assert.equal(nextBadge(10)?.missing, 15);
  assert.equal(nextBadge(25), null);
  assert.match(progressText(4), /^Le falta 1 versículo para el premio/);
  assert.match(progressText(0), /^Le faltan 5 versículos/);
  assert.equal(progressText(30), '¡Ganó todos los premios!');
  assert.equal(versesLabel(1), '1 versículo');
  assert.equal(versesLabel(7), '7 versículos');
});

test('versículos: contar por chico, sin repetidos y sin los que se sacaron de la lista', () => {
  const done = [
    { verse_id: 'v1', contact_id: 'c1' }, { verse_id: 'v2', contact_id: 'c1' }, { verse_id: 'v1', contact_id: 'c1' },
    { verse_id: 'v1', contact_id: 'c2' }, { verse_id: 'v9', contact_id: 'c2' },
  ];
  const all = countByChild(done);
  assert.equal(all.get('c1'), 2);
  assert.equal(all.get('c2'), 2);
  const active = countByChild(done, ['v1', 'v2']);
  assert.equal(active.get('c2'), 1);
  assert.equal(active.get('c3'), undefined);
});

test('apuntes de prédicas: el bosquejo con las respuestas en su lugar', () => {
  const outline = '1. Jesús vino a buscar y a ___ lo perdido\n\n2. La fe viene por el ___ y el oír por la ___ de Dios\nSin espacios';
  assert.equal(blankCount(outline), 3);
  assert.equal(blankCount(null), 0);
  assert.equal(filledOutline(outline, ['salvar', '', ' palabra ']),
    '1. Jesús vino a buscar y a salvar lo perdido\n2. La fe viene por el ____ y el oír por la palabra de Dios\nSin espacios');
  assert.equal(filledOutline(outline, null).includes('____'), true);
  assert.equal(filledCount(outline, ['salvar', '', 'palabra', 'de más']), 2);
  assert.equal(hasNotes([], null), false);
  assert.equal(hasNotes(['', '  '], '  '), false);
  assert.equal(hasNotes(['', 'x'], null), true);
  assert.equal(hasNotes(null, 'Dios me habló'), true);
});

test('las pantallas nuevas tienen su función y su color', () => {
  assert.equal(featureOfPath('/culto'), 'culto');
  assert.equal(featureOfPath('/culto/abc'), 'culto');
  assert.equal(featureOfPath('/preguntas'), 'preguntas');
  assert.equal(featureOfPath('/oraciones-respondidas'), 'oracion_respondidas');
  assert.equal(featureOfPath('/predica/mis-notas'), 'predica_notas');
  assert.equal(featureOfPath('/clase/leccion'), 'clase_lecciones');
  assert.equal(featureOfPath('/clase/versiculos'), 'clase_versiculos');
  assert.equal(areaOf(['culto', '[id]']), 'green');
  assert.equal(areaOf(['preguntas']), 'blue');
  assert.equal(areaOf(['oraciones-respondidas']), 'blue');
  assert.equal(areaOf(['predica', 'mis-notas']), 'blue');
});
