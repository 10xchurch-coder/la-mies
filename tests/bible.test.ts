import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS } from '../src/lib/biblePlan';
import { VERSIONS, chapterText, cleanPlace, findBook, neighbor, parseReading, shareVerses, verseSpan } from '../src/lib/bible';
import { planReadings } from '../src/lib/biblePlan';

const rv = VERSIONS[0];

test('la RV1909 trae los 66 libros con todos sus capítulos y ningún versículo vacío', () => {
  assert.equal(rv.books.length, 66);
  let verses = 0;
  BOOKS.forEach(([, n], i) => {
    const book = rv.books[i]();
    assert.equal(book.length, n, BOOKS[i][0]);
    for (const ch of book) { assert.ok(ch.length > 0); assert.ok(ch.every((t) => t.length > 0)); verses += ch.length; }
  });
  assert.equal(verses, 31084);
});

test('textos conocidos de la RV1909', () => {
  assert.equal(chapterText(rv, findBook('Génesis'), 1)[0], 'EN el principio crió Dios los cielos y la tierra.');
  assert.equal(chapterText(rv, findBook('Juan'), 3)[15], 'Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.');
  assert.equal(chapterText(rv, findBook('Apocalipsis'), 22).at(-1), 'La gracia de nuestro Señor Jesucristo sea con todos vosotros. Amén.');
  assert.deepEqual(chapterText(rv, 0, 51), []);
  assert.deepEqual(chapterText(rv, 99, 1), []);
});

test('findBook ignora tildes y mayúsculas', () => {
  assert.equal(findBook('genesis'), 0);
  assert.equal(findBook('1 Corintios'), BOOKS.findIndex((b) => b[0] === '1 Corintios'));
  assert.equal(findBook('Apocalipsis'), 65);
  assert.equal(findBook('nada'), -1);
});

test('parseReading entiende las lecturas de los planes', () => {
  assert.deepEqual(parseReading('Génesis 1–4'), { book: 0, chapter: 1 });
  assert.deepEqual(parseReading('Génesis 50; Éxodo 1–2'), { book: 0, chapter: 50 });
  assert.deepEqual(parseReading('Judas'), { book: findBook('Judas'), chapter: 1 });
  assert.deepEqual(parseReading('Hechos 3 · Salmo 5 · Proverbios 3'), { book: findBook('Hechos'), chapter: 3 });
  assert.deepEqual(parseReading('Salmo 5'), { book: findBook('Salmos'), chapter: 5 });
  assert.equal(parseReading('Juan 99'), null);
  assert.equal(parseReading(''), null);
});

test('toda lectura de todos los planes se puede abrir en la Biblia', () => {
  for (const plan of ['new30', 'new90', 'new180', 'bible', 'psalms', 'chrono', 'nt', 'ot'] as const) {
    for (const r of planReadings(plan).filter(Boolean)) assert.ok(parseReading(r), `${plan}: ${r}`);
  }
});

test('capítulo anterior y siguiente pasan de un libro al otro', () => {
  assert.deepEqual(neighbor(0, 50, 1), { book: 1, chapter: 1 });
  assert.deepEqual(neighbor(1, 1, -1), { book: 0, chapter: 50 });
  assert.equal(neighbor(0, 1, -1), null);
  assert.equal(neighbor(65, 22, 1), null);
  assert.deepEqual(neighbor(findBook('Judas'), 1, 1), { book: 65, chapter: 1 });
});

test('cleanPlace revisa lo que llega por la dirección', () => {
  assert.deepEqual(cleanPlace('42', '3'), { book: 42, chapter: 3 });
  assert.deepEqual(cleanPlace('42', undefined), { book: 42, chapter: 1 });
  assert.equal(cleanPlace('66', '1'), null);
  assert.equal(cleanPlace('42', '40'), null);
  assert.equal(cleanPlace('x', '1'), null);
});

test('verseSpan junta los versículos seguidos', () => {
  assert.equal(verseSpan([16]), '16');
  assert.equal(verseSpan([18, 16, 17]), '16–18');
  assert.equal(verseSpan([1, 2]), '1, 2');
  assert.equal(verseSpan([1, 3, 4, 5, 9]), '1, 3–5, 9');
});

test('al compartir va el texto completo y la cita con la sigla', () => {
  const juan = findBook('Juan');
  const one = shareVerses(rv, juan, 3, [16]);
  assert.ok(one.startsWith('“Porque de tal manera amó Dios'));
  assert.ok(one.endsWith('— Juan 3:16 (RV1909)'));
  const two = shareVerses(rv, juan, 3, [17, 16]);
  assert.ok(two.includes('16 Porque de tal manera') && two.includes(' 17 Porque no envió'));
  assert.ok(two.endsWith('— Juan 3:16, 17 (RV1909)'));
  assert.ok(shareVerses(rv, findBook('Judas'), 1, [3]).endsWith('— Judas 3 (RV1909)'));
  assert.equal(shareVerses(rv, juan, 3, [999]), '');
});
