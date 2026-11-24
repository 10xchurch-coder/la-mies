import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterText, ensureBook, shareVerses, versionOf } from '../src/lib/bible';
import { crossRefs, ensureRefs, makeQuery, parseRef, searchBibleAsync, searchBook } from '../src/lib/bibleStudy';

// Va en un archivo aparte para arrancar sin nada cargado.
const rv = versionOf('rv1909');
const kjv = versionOf('kjv');

test('la King James y las referencias se piden libro por libro: antes de pedirlas están vacías y nada falla', async () => {
  assert.deepEqual(chapterText(kjv, 0, 1), []);
  assert.deepEqual(crossRefs(0, 1, 1), []);
  assert.equal(shareVerses(kjv, 0, 1, [1]), '');
  assert.deepEqual(searchBook(kjv, 0, makeQuery('beginning')!), { book: 0, hits: [], count: 0 });
  // Sin el libro cargado no se puede revisar el versículo: la cita se acepta igual.
  assert.deepEqual(parseRef('Genesis 1:1', kjv), { book: 0, chapter: 1, verse: 1 });
  await ensureBook(kjv, 0);
  await ensureRefs(0);
  assert.equal(chapterText(kjv, 0, 1).length, 31);
  assert.ok(crossRefs(0, 1, 1).length > 5);
  // Lo que se buscó antes de cargar no deja la búsqueda trabada en vacío.
  assert.equal(searchBook(kjv, 0, makeQuery('beginning')!).hits[0].verse, 1);
  // La RV1909 ya viene cargada: pedirla no hace nada. Y los lugares raros no fallan.
  await ensureBook(rv, 0);
  await ensureBook(kjv, 99);
  await ensureBook(kjv, -1);
  await ensureRefs(99);
  await ensureRefs(1.5);
});

test('searchBibleAsync trae solo los libros que le faltan', async () => {
  assert.deepEqual(chapterText(kjv, 42, 3), []);
  const r = await searchBibleAsync(kjv, makeQuery('"God so loved the world"')!);
  assert.deepEqual(r?.books, [{ book: 42, hits: [{ chapter: 3, verse: 16 }], count: 1 }]);
  assert.equal(chapterText(kjv, 42, 3).length, 36);
});
