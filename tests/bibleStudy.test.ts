import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS } from '../src/lib/biblePlan';
import { VERSIONS, chapterText, findBook, shareVerses, versionOf } from '../src/lib/bible';
import { EN_BOOKS, XREFS } from '../src/lib/bibleStudyData';
import { BIBLE_NOT_INCLUDED, BIBLE_SOURCES } from '../src/lib/bibleSources';
import {
  NUMBERING_DIFFS, concordance, crossRefs, decodeRef, findBookLoose, fold, makeQuery, numberingDiffers, parseRef, pieces,
  refLabel, refText, searchBible, searchBibleAsync, searchBook,
} from '../src/lib/bibleStudy';

const rv = versionOf('rv1909');
const kjv = versionOf('kjv');
const B = (name: string) => findBook(name);

test('la King James trae los 66 libros, 31102 versículos y ninguno vacío', () => {
  assert.equal(VERSIONS.length, 2);
  assert.equal(kjv.id, 'kjv');
  assert.equal(EN_BOOKS.length, 66);
  let verses = 0;
  BOOKS.forEach(([, n], i) => {
    const book = kjv.books[i]();
    assert.equal(book.length, n, EN_BOOKS[i]);
    for (const ch of book) { assert.ok(ch.length > 0); assert.ok(ch.every((t) => t.length > 0 && !/[<>&]/.test(t))); verses += ch.length; }
  });
  assert.equal(verses, 31102);
});

test('textos conocidos de la King James', () => {
  assert.equal(chapterText(kjv, 0, 1)[0], 'In the beginning God created the heaven and the earth.');
  assert.equal(chapterText(kjv, B('Juan'), 3)[15], 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.');
  assert.equal(chapterText(kjv, B('Romanos'), 8)[0], 'There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit.');
  assert.equal(chapterText(kjv, B('Apocalipsis'), 22).at(-1), 'The grace of our Lord Jesus Christ be with you all. Amen.');
  // El título del salmo va al principio del versículo 1, como en la RV1909.
  assert.ok(chapterText(kjv, B('Salmos'), 3)[0].startsWith('A Psalm of David, when he fled from Absalom his son. LORD, how are they increased'));
  assert.equal(shareVerses(kjv, B('Juan'), 11, [35]), '“Jesus wept.”\n— John 11:35 (KJV)');
  assert.equal(shareVerses(rv, B('Juan'), 11, [35]), '“Y lloró Jesús.”\n— Juan 11:35 (RV1909)');
});

test('la numeración de la RV1909 y la King James coincide salvo en los capítulos anotados', () => {
  const differ: string[] = [];
  BOOKS.forEach(([, n], i) => {
    for (let c = 1; c <= n; c++) if (chapterText(rv, i, c).length !== chapterText(kjv, i, c).length) differ.push(`${i}:${c}`);
  });
  assert.deepEqual(differ.sort(), NUMBERING_DIFFS.slice(0, 12).map(([b, c]) => `${b}:${c}`).sort());
  assert.equal(numberingDiffers(B('Jonás'), 1), true);
  assert.equal(numberingDiffers(B('Jonás'), 2), true);
  assert.equal(numberingDiffers(B('Juan'), 3), false);
});

test('fold saca tildes, mayúsculas y signos', () => {
  assert.equal(fold('¡OH Jehová, cuánto...!'), 'oh jehova cuanto');
  assert.equal(fold('  Señor   á  fué '), 'senor a fue');
  assert.equal(fold('fish’s belly'), 'fish s belly');
  assert.equal(fold(''), '');
});

test('findBookLoose: nombres, abreviaturas y principios, en español e inglés', () => {
  assert.equal(findBookLoose('Juan'), B('Juan'));
  assert.equal(findBookLoose('jn'), B('Juan'));
  assert.equal(findBookLoose('JOHN'), B('Juan'));
  assert.equal(findBookLoose('1 co'), B('1 Corintios'));
  assert.equal(findBookLoose('1Cor.'), B('1 Corintios'));
  assert.equal(findBookLoose('1 cr'), B('1 Crónicas'));
  assert.equal(findBookLoose('genesis'), 0);
  assert.equal(findBookLoose('Gén'), 0);
  assert.equal(findBookLoose('apoc'), 65);
  assert.equal(findBookLoose('Revelation'), 65);
  assert.equal(findBookLoose('salmo'), B('Salmos'));
  assert.equal(findBookLoose('Psalm'), B('Salmos'));
  assert.equal(findBookLoose('fil'), B('Filipenses'));
  assert.equal(findBookLoose('filem'), B('Filemón'));
  assert.equal(findBookLoose('Judges'), B('Jueces'));
  assert.equal(findBookLoose('jud'), B('Judas'));
  assert.equal(findBookLoose('Jude'), B('Judas'));
  assert.equal(findBookLoose('Song of Solomon'), B('Cantares'));
  // Lo que puede ser dos libros no se adivina.
  assert.equal(findBookLoose('j'), -1);
  assert.equal(findBookLoose('jo'), -1);
  assert.equal(findBookLoose('1 c'), -1);
  assert.equal(findBookLoose('amor'), -1);
  assert.equal(findBookLoose(''), -1);
});

test('parseRef entiende citas escritas de varias formas', () => {
  const juan = B('Juan');
  assert.deepEqual(parseRef('Juan 3:16'), { book: juan, chapter: 3, verse: 16 });
  assert.deepEqual(parseRef('  juan 3 16 '), { book: juan, chapter: 3, verse: 16 });
  assert.deepEqual(parseRef('Jn. 3.16'), { book: juan, chapter: 3, verse: 16 });
  assert.deepEqual(parseRef('John 3:16', kjv), { book: juan, chapter: 3, verse: 16 });
  assert.deepEqual(parseRef('juan 3,16-18'), { book: juan, chapter: 3, verse: 16, end: 18 });
  assert.deepEqual(parseRef('1 Co 13:4–7'), { book: B('1 Corintios'), chapter: 13, verse: 4, end: 7 });
  assert.deepEqual(parseRef('1co13:4'), { book: B('1 Corintios'), chapter: 13, verse: 4 });
  assert.deepEqual(parseRef('Salmo 23'), { book: B('Salmos'), chapter: 23 });
  assert.deepEqual(parseRef('Génesis'), { book: 0, chapter: 1 });
  assert.deepEqual(parseRef('Juan 3-5'), { book: juan, chapter: 3 });
  // Libros de un solo capítulo.
  assert.deepEqual(parseRef('Judas 5'), { book: B('Judas'), chapter: 1, verse: 5 });
  assert.deepEqual(parseRef('Judas 5-7'), { book: B('Judas'), chapter: 1, verse: 5, end: 7 });
  assert.deepEqual(parseRef('Judas 1:5'), { book: B('Judas'), chapter: 1, verse: 5 });
  assert.deepEqual(parseRef('Filemón'), { book: B('Filemón'), chapter: 1 });
});

test('parseRef devuelve null si no es una cita o no existe', () => {
  assert.equal(parseRef(''), null);
  assert.equal(parseRef('amor'), null);
  assert.equal(parseRef('de tal manera amó Dios'), null);
  assert.equal(parseRef('Juan 22'), null);
  assert.equal(parseRef('Juan 0'), null);
  assert.equal(parseRef('Juan 3:0'), null);
  assert.equal(parseRef('3:16'), null);
  assert.equal(parseRef('Judas 2:3'), null);
  // Con la versión se revisa también el versículo.
  assert.equal(parseRef('Juan 3:99', rv), null);
  assert.deepEqual(parseRef('Juan 3:30-99', rv), { book: B('Juan'), chapter: 3, verse: 30, end: 36 });
  assert.deepEqual(parseRef('Juan 3:99'), { book: B('Juan'), chapter: 3, verse: 99 });
});

test('makeQuery: palabras sueltas o frase exacta', () => {
  assert.equal(makeQuery('   '), null);
  assert.equal(makeQuery('¿?'), null);
  assert.deepEqual(makeQuery('Amó Dios'), { words: ['amo', 'dios'], phrase: false });
  assert.deepEqual(makeQuery('dios Dios DIOS'), { words: ['dios'], phrase: false });
  assert.deepEqual(makeQuery('"de tal manera"'), { words: ['de', 'tal', 'manera'], phrase: true });
  assert.deepEqual(makeQuery('de tal manera', true), { words: ['de', 'tal', 'manera'], phrase: true });
  assert.deepEqual(makeQuery('"amor"'), { words: ['amor'], phrase: false });
});

test('buscar una palabra: sin tildes, palabra entera, agrupado por libro', () => {
  const juan = B('Juan');
  const r = searchBook(rv, juan, makeQuery('unigenito')!);
  assert.deepEqual(r.hits, [{ chapter: 1, verse: 14 }, { chapter: 1, verse: 18 }, { chapter: 3, verse: 16 }, { chapter: 3, verse: 18 }]);
  // Con tilde, mayúsculas o sin nada da lo mismo.
  assert.deepEqual(searchBook(rv, juan, makeQuery('UNIGÉNITO')!).hits, r.hits);
  // Palabra entera: "amor" no trae "amorreo".
  const amor = searchBible(rv, makeQuery('amor')!);
  const amorreo = searchBible(rv, makeQuery('amorrheo')!);
  assert.ok(amor.verses > 100 && amorreo.verses > 30);
  for (const b of amor.books) for (const h of b.hits.slice(0, 5)) assert.match(` ${fold(chapterText(rv, b.book, h.chapter)[h.verse - 1])} `, / amor /);
  // Los libros salen en orden y sin libros vacíos.
  assert.deepEqual(amor.books.map((b) => b.book), [...amor.books.map((b) => b.book)].sort((a, b) => a - b));
  assert.ok(amor.books.every((b) => b.hits.length > 0));
  assert.equal(amor.verses, amor.books.reduce((n, b) => n + b.hits.length, 0));
  assert.equal(searchBible(rv, makeQuery('xyzzy')!).verses, 0);
});

test('buscar varias palabras o una frase exacta', () => {
  const juan = B('Juan');
  // Todas las palabras, en cualquier orden.
  const all = searchBible(rv, makeQuery('mundo amó Dios')!, [juan]);
  assert.deepEqual(all.books[0].hits, [{ chapter: 3, verse: 16 }]);
  // Frase exacta.
  const phrase = searchBible(rv, makeQuery('"de tal manera amó Dios"')!);
  assert.equal(phrase.verses, 1);
  assert.deepEqual(phrase.books[0], { book: juan, hits: [{ chapter: 3, verse: 16 }], count: 1 });
  // Las mismas palabras en otro orden no son la frase.
  assert.equal(searchBible(rv, makeQuery('"Dios amó manera"')!).verses, 0);
  // La frase puede cruzar una coma.
  assert.equal(searchBible(rv, makeQuery('"no se pierda, mas tenga vida eterna"')!).verses, 1);
  // En inglés.
  const en = searchBible(kjv, makeQuery('"God so loved the world"')!);
  assert.deepEqual(en.books.map((b) => [b.book, b.hits]), [[juan, [{ chapter: 3, verse: 16 }]]]);
  assert.equal(searchBible(kjv, makeQuery('Jesus wept')!, [juan]).books[0].hits[0].verse, 35);
});

test('concordancia: cuenta las veces, no solo los versículos', () => {
  const c = concordance(rv, 'Unigénito');
  assert.equal(c.verses, c.books.reduce((n, b) => n + b.hits.length, 0));
  assert.ok(c.total >= c.verses);
  const juan = c.books.find((b) => b.book === B('Juan'))!;
  assert.equal(juan.count, 4);
  // "santo, santo, santo" en Isaías 6:3 cuenta tres veces en un versículo.
  const santo = concordance(rv, 'santo').books.find((b) => b.book === B('Isaías'))!;
  const solo63 = searchBook(rv, B('Isaías'), makeQuery('santo')!);
  assert.equal(santo.count, solo63.count);
  assert.ok(solo63.count >= solo63.hits.length + 2);
  assert.deepEqual(concordance(rv, '  '), { total: 0, verses: 0, books: [] });
  const wept = concordance(kjv, 'wept');
  assert.ok(wept.books.some((b) => b.book === B('Juan') && b.hits.some((h) => h.chapter === 11 && h.verse === 35)));
});

test('pieces parte el versículo y marca lo buscado', () => {
  const t = 'Porque de tal manera amó Dios al mundo,';
  const p = pieces(t, makeQuery('dios mundo'));
  assert.equal(p.map((x) => x.text).join(''), t);
  assert.deepEqual(p.filter((x) => x.hit).map((x) => x.text), ['Dios', 'mundo']);
  assert.equal(p.find((x) => x.text === 'amó')!.word, 'amo');
  assert.equal(p.find((x) => x.text === ' ')!.word, '');
  // En una frase solo se marcan las palabras juntas.
  const f = pieces('de Dios, y de tal manera de', makeQuery('"de tal manera"'));
  assert.deepEqual(f.map((x) => (x.hit ? x.text : '')).filter(Boolean), ['de', 'tal', 'manera']);
  assert.equal(f.filter((x) => x.text === 'de' && x.hit).length, 1);
  assert.equal(pieces('Hola', null).every((x) => !x.hit), true);
});

test('las referencias cruzadas cubren los 66 libros y apuntan a lugares que existen', () => {
  assert.equal(XREFS.length, 66);
  let total = 0;
  BOOKS.forEach(([, n], i) => {
    const book = XREFS[i]();
    assert.equal(book.length, n, BOOKS[i][0]);
    book.forEach((ch, c) => {
      assert.ok(ch.length <= chapterText(kjv, i, c + 1).length, `${BOOKS[i][0]} ${c + 1}`);
      for (const v of ch) for (const x of v) {
        const r = decodeRef(x);
        total++;
        assert.ok(r.book >= 0 && r.book < 66 && r.chapter >= 1 && r.chapter <= BOOKS[r.book][1] && r.verse >= 1 && r.end >= r.verse, String(x));
        // En la King James (la numeración de la fuente) el versículo siempre existe.
        assert.ok(r.end <= chapterText(kjv, r.book, r.chapter).length, String(x));
      }
    });
  });
  assert.ok(total > 300000);
});

test('crossRefs: busca las de un versículo y no falla con lugares raros', () => {
  const juan = B('Juan');
  const refs = crossRefs(juan, 3, 16);
  assert.ok(refs.length >= 10);
  // Romanos 5:8 y 1 Juan 4:9 son referencias conocidas de Juan 3:16.
  assert.ok(refs.some((r) => r.book === B('Romanos') && r.chapter === 5 && r.verse === 8));
  assert.ok(refs.some((r) => r.book === B('1 Juan') && r.chapter === 4 && r.verse <= 9 && r.end >= 9));
  assert.deepEqual(decodeRef(4200301600), { book: 42, chapter: 3, verse: 16, end: 16 });
  assert.deepEqual(decodeRef(100100), { book: 0, chapter: 1, verse: 1, end: 1 });
  assert.deepEqual(decodeRef(1900802208), { book: 19, chapter: 8, verse: 22, end: 30 });
  assert.deepEqual(crossRefs(juan, 3, 999), []);
  assert.deepEqual(crossRefs(juan, 99, 1), []);
  assert.deepEqual(crossRefs(-1, 1, 1), []);
  assert.deepEqual(crossRefs(66, 1, 1), []);
  assert.deepEqual(crossRefs(1.5, 1, 1), []);
  assert.deepEqual(crossRefs(juan, 0, 0), []);
});

test('refLabel y refText: el texto en la versión elegida, sin fallar si la numeración no coincide', () => {
  const juan = B('Juan');
  assert.equal(refLabel(rv, { book: juan, chapter: 3, verse: 16, end: 16 }), 'Juan 3:16');
  assert.equal(refLabel(kjv, { book: juan, chapter: 3, verse: 16, end: 18 }), 'John 3:16–18');
  assert.equal(refLabel(rv, { book: B('Judas'), chapter: 1, verse: 5, end: 5 }), 'Judas 5');
  assert.equal(refText(rv, { book: juan, chapter: 11, verse: 35, end: 35 }), 'Y lloró Jesús.');
  assert.equal(refText(kjv, { book: juan, chapter: 11, verse: 35, end: 35 }), 'Jesus wept.');
  assert.match(refText(rv, { book: juan, chapter: 11, verse: 35, end: 36 }), /^35 Y lloró Jesús\. 36 /);
  // Un tramo que pasa del final del capítulo se corta ahí.
  const last = chapterText(rv, juan, 3).length;
  assert.equal(refText(rv, { book: juan, chapter: 3, verse: last, end: last + 40 }), chapterText(rv, juan, 3)[last - 1]);
  // Jonás 1:17 existe en la King James pero no en la RV1909 de la app (ahí es 2:1): devuelve '' y no falla.
  assert.ok(refText(kjv, { book: B('Jonás'), chapter: 1, verse: 17, end: 17 }).length > 0);
  assert.equal(refText(rv, { book: B('Jonás'), chapter: 1, verse: 17, end: 17 }), '');
  assert.equal(refText(rv, { book: 99, chapter: 1, verse: 1, end: 1 }), '');
  assert.equal(refText(rv, { book: 0, chapter: 1, verse: 0, end: 0 }), '');
  // Todas las referencias de un capítulo con numeración distinta se pueden pedir en las dos versiones.
  for (const [b, c] of NUMBERING_DIFFS) {
    for (let v = 1; v <= chapterText(kjv, b, c).length; v++) for (const r of crossRefs(b, c, v)) { refText(rv, r); refText(kjv, r); }
  }
});

test('searchBibleAsync da lo mismo que searchBible y se puede cortar', async () => {
  const q = makeQuery('unigénito')!;
  const seen: number[] = [];
  const a = await searchBibleAsync(rv, q, () => true, (n) => seen.push(n));
  assert.deepEqual(a, searchBible(rv, q));
  assert.deepEqual(seen.slice(0, 3), [0, 6, 12]);
  // Si la persona ya pidió otra búsqueda, la vieja no devuelve nada.
  assert.equal(await searchBibleAsync(rv, q, () => false), null);
  let calls = 0;
  assert.equal(await searchBibleAsync(rv, q, () => ++calls < 3), null);
});

test('"Acerca de los textos" nombra cada versión y cada ayuda con su permiso y su fuente', () => {
  for (const v of VERSIONS) assert.ok(BIBLE_SOURCES.some((s) => s.version === v.id), v.id);
  for (const s of BIBLE_SOURCES) assert.ok(s.title && s.what && s.licence && s.detail && s.source, s.title);
  // La licencia CC BY pide reconocimiento: tiene que estar escrito.
  for (const s of BIBLE_SOURCES.filter((x) => x.licence.includes('CC BY'))) assert.ok(s.credit && /OpenBible\.info/.test(s.credit));
  // Nada con derechos reservados entre lo incluido.
  assert.ok(!BIBLE_SOURCES.some((s) => /1960/.test(s.title)));
  assert.ok(BIBLE_NOT_INCLUDED.some((s) => /1960/.test(s.title)));
});
