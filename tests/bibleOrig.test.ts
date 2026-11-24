import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterText, ensureBook, versionOf } from '../src/lib/bible';
import {
  buildBook, buildLex, decodeNums, defChunk, definition, encodeNum, ensureDefinition, ensureOrig, ensureStrong, hasDefinitions, origLang, origReady,
  parseStrong, strongBase, strongBooks, strongInBook, strongInfo, strongLabel, strongSenses, strongVerses, verseWords,
} from '../src/lib/bibleOrig';
import { BOOKS } from '../src/lib/biblePlan';
import { BIBLE_SOURCES } from '../src/lib/bibleSources';

const B = (name: string) => BOOKS.findIndex((b) => b[0] === name);
// Los datos guardan las letras con tilde en la forma normal de Unicode (NFC).
const N = (s: string) => s.normalize('NFC');

test('los números guardados como letras se leen bien, chicos y grandes', () => {
  for (const n of [0, 1, 44, 45, 46, 2024, 2025, 2026, 91124, 91125, 123456]) {
    assert.deepEqual(decodeNums(encodeNum(n)), [n], String(n));
  }
  assert.equal(encodeNum(0).length, 1);
  assert.equal(encodeNum(44).length, 1);
  assert.equal(encodeNum(45).length, 2);
  assert.equal(encodeNum(2025).length, 3);
  const list = [3, 0, 500, 44, 45, 70000, 7];
  assert.deepEqual(decodeNums(list.map(encodeNum).join('')), list);
  assert.deepEqual(decodeNums(''), []);
  // Lo que no es una letra de los datos se saltea, sin fallar.
  assert.deepEqual(decodeNums(` ${encodeNum(5)}\\"\n${encodeNum(6)}`), [5, 6]);
  // Ninguna letra usada necesita escaparse dentro de un JSON.
  for (let n = 0; n < 90 * 45; n++) assert.ok(!/["\\\s]/.test(encodeNum(n)));
});

test('los números de Strong se escriben y se entienden de varias formas', () => {
  assert.equal(strongBase('H7225G'), 'H7225');
  assert.equal(strongBase('G0026'), 'G0026');
  assert.equal(strongLabel('H0430G'), 'H430');
  assert.equal(strongLabel('G0026'), 'G26');
  assert.equal(strongLabel('G2424G'), 'G2424');
  assert.equal(strongLabel('hola'), '');
  assert.equal(parseStrong('h430'), 'H0430');
  assert.equal(parseStrong(' G26 '), 'G0026');
  assert.equal(parseStrong('H7225G'), 'H7225');
  assert.equal(parseStrong('G 3056'), 'G3056');
  assert.equal(parseStrong('X12'), null);
  assert.equal(parseStrong('H0'), null);
  assert.equal(parseStrong(''), null);
  assert.equal(origLang(B('Malaquías')), 'H');
  assert.equal(origLang(B('Mateo')), 'G');
  assert.equal(hasDefinitions('G0026'), true);
  assert.equal(hasDefinitions('H0430G'), false);
  assert.equal(defChunk('G0026'), 0);
  assert.equal(defChunk('G0499'), 0);
  assert.equal(defChunk('G0500'), 1);
  assert.equal(defChunk('G2424G'), 4);
  assert.equal(defChunk('G5547'), 11);
  assert.equal(defChunk('G6063'), 12);
  assert.equal(defChunk('G20077'), 12);
});

test('un libro y una tabla de lemas chicos, armados a mano', () => {
  const lex = buildLex({ s: 'H0001G\tH0002\tH0001H', w: 'a\tb\tc', t: 'ta\ttb\ttc', g: 'father\tson\tchief', b: `${encodeNum(0)}${encodeNum(65)}\t${encodeNum(1)}\t${encodeNum(2)}` });
  assert.deepEqual(lex.books, [[0, 65], [1], [2]]);
  assert.deepEqual(lex.byBase.get('H0001'), [0, 2]);
  assert.equal(lex.at.get('H0002'), 1);
  const book = buildBook({ w: 'uno dos tres', l: [0, 1, 2].map(encodeNum).join(''), c: [[[2, 0].map(encodeNum).join(''), '']] });
  assert.deepEqual(book.forms, ['uno', 'dos', 'tres']);
  assert.deepEqual(book.lemmaOf, [0, 1, 2]);
  assert.deepEqual(buildBook({ w: '', l: '', c: [] }).forms, []);
});

test('antes de pedirlas no hay palabras; después, Génesis 1:1 y Juan 3:16 están enteros y en orden', async () => {
  assert.deepEqual(verseWords(0, 1, 1), []);
  assert.equal(origReady(0), false);
  assert.deepEqual(strongSenses('H0430'), []);
  assert.equal(strongInfo('H0430'), null);
  assert.deepEqual(strongInBook(0, 'H0430'), { book: 0, hits: [], count: 0 });
  await ensureOrig(0);
  assert.equal(origReady(0), true);
  const gn = verseWords(0, 1, 1);
  assert.deepEqual(gn.map((w) => w.label), ['H7225', 'H1254', 'H430', 'H853', 'H8064', 'H853', 'H776']);
  assert.equal(gn[0].word, N('בְּרֵאשִׁית'));
  assert.equal(gn[0].strong, 'H7225G');
  assert.equal(gn[0].lemma, N('רֵאשִׁית'));
  assert.equal(gn[0].gloss, 'first: beginning');
  assert.equal(gn[1].gloss, 'to create');
  assert.equal(gn[2].translit, 'e.lo.him');
  assert.equal(gn[2].gloss, 'God');
  // Sin acentos de canto ni signos de puntuación en el hebreo.
  for (const w of gn) assert.ok(!/[֑-ֽ֯־׀׃]/.test(w.word), w.word);

  const jn = B('Juan');
  await ensureOrig(jn);
  const v = verseWords(jn, 3, 16);
  assert.equal(v.length, 25);
  assert.equal(v[0].word, N('οὕτως'));
  assert.ok(v.some((w) => w.label === 'G25' && w.lemma === N('ἀγαπάω') && w.gloss === 'to love'));
  assert.ok(v.some((w) => w.label === 'G2316' && w.translit === 'theos'));
  assert.ok(v.some((w) => w.label === 'G3439'));
  for (const w of v) assert.ok(w.word && w.strong && w.label && w.lemma && w.gloss && !/[.,;·]/.test(w.word), w.word);
  // Lugares que no existen no fallan.
  assert.deepEqual(verseWords(jn, 3, 99), []);
  assert.deepEqual(verseWords(jn, 99, 1), []);
  assert.deepEqual(verseWords(99, 1, 1), []);
  assert.deepEqual(verseWords(-1, 1, 1), []);
  assert.deepEqual(verseWords(jn, 1.5, 1), []);
  await ensureOrig(99);
  await ensureOrig(-1);
  await ensureOrig(2.5);
});

test('las palabras siguen la numeración de la King James: mismos capítulos y versículos, ninguno vacío', async () => {
  const kjv = versionOf('kjv');
  for (const b of [B('Números'), B('Salmos'), B('Joel'), B('Malaquías'), B('Hechos'), B('3 Juan'), B('Apocalipsis')]) {
    await ensureBook(kjv, b);
    await ensureOrig(b);
    for (let c = 1; c <= BOOKS[b][1]; c++) {
      const n = chapterText(kjv, b, c).length;
      assert.ok(n > 0);
      assert.ok(verseWords(b, c, n).length > 0, `${BOOKS[b][0]} ${c}:${n}`);
      assert.deepEqual(verseWords(b, c, n + 1), [], `${BOOKS[b][0]} ${c}:${n + 1}`);
      assert.ok(verseWords(b, c, 1).length > 0, `${BOOKS[b][0]} ${c}:1`);
    }
  }
  // El título del salmo va al principio del versículo 1, como en el texto de la app: Salmo 3:1 empieza con "salmo" (H4210).
  assert.equal(verseWords(B('Salmos'), 3, 1)[0].label, 'H4210');
  // 3 Juan termina en el versículo 14 (la King James no tiene 15), y Apocalipsis 12 en el 17.
  assert.equal(chapterText(kjv, B('3 Juan'), 1).length, 14);
  assert.equal(chapterText(kjv, B('Apocalipsis'), 12).length, 17);
});

test('todos los versículos con un número de Strong: cuenta, lista y solo abre los libros donde aparece', async () => {
  // G26 (agápē, "love") en el texto tradicional.
  await ensureStrong('G0026');
  const info = strongInfo('G0026');
  assert.equal(info?.lemma, N('ἀγάπη'));
  assert.equal(info?.gloss, 'love');
  const books = strongBooks('G0026');
  assert.ok(books.length > 15 && books.every((b) => b >= 39 && b < 66));
  assert.ok(!books.includes(B('Marcos')));
  const steps: number[] = [];
  const r = await strongVerses('G0026', () => true, (done) => steps.push(done));
  assert.ok(r);
  assert.ok(steps.length > 0);
  assert.ok(r.total >= 110 && r.total <= 120, String(r.total));
  assert.ok(r.verses <= r.total && r.verses > 95);
  assert.deepEqual(r.books.map((b) => b.book), books);
  assert.equal(r.total, r.books.reduce((n, b) => n + b.count, 0));
  const co = r.books.find((b) => b.book === B('1 Corintios'))!;
  assert.ok(co.hits.some((h) => h.chapter === 13 && h.verse === 13));
  // 1 Corintios 13:13 la tiene dos veces: cuenta 2 pero es un solo versículo.
  assert.equal(verseWords(B('1 Corintios'), 13, 13).filter((w) => w.label === 'G26').length, 2);
  // Con letra o sin letra busca lo mismo.
  assert.deepEqual(strongInBook(B('1 Corintios'), 'G0026'), co);
  // Un número del hebreo no aparece en un libro griego, y uno que no existe da vacío.
  assert.deepEqual(strongInBook(B('1 Corintios'), 'H0430'), { book: B('1 Corintios'), hits: [], count: 0 });
  assert.deepEqual(await strongVerses('G9999'), { total: 0, verses: 0, books: [] });
  assert.deepEqual(await strongVerses('nada'), { total: 0, verses: 0, books: [] });
  // Si la persona ya pidió otra cosa, se corta.
  assert.equal(await strongVerses('G0026', () => false), null);

  // Una palabra hebrea que está en pocos libros: H7225 ("principio"), 51 veces en la King James.
  const h = await strongVerses('H7225');
  assert.ok(h && h.total >= 49 && h.total <= 52, String(h?.total));
  assert.deepEqual(h!.books[0].hits[0], { chapter: 1, verse: 1 });
  // Un mismo número puede tener varios sentidos separados por STEPBible: se buscan todos juntos.
  await ensureStrong('H0001');
  assert.ok(strongSenses('H0001').length > 1);
  assert.equal(strongInfo('H0001G')?.gloss, 'father');
});

test('la definición está solo para el griego y se pide de a tandas', async () => {
  assert.equal(definition('G0026'), '');
  await ensureDefinition('G0026');
  const d = definition('G0026');
  assert.ok(d.startsWith(N('ἀγάπη')));
  assert.match(d, /love, goodwill, esteem/);
  assert.ok(!/<[a-z/]/i.test(d), 'sin marcas de formato');
  // Sin letra también la encuentra (Jesús es G2424G en los datos).
  await ensureStrong('G2424');
  await ensureDefinition('G2424');
  assert.ok(definition('G2424').includes(N('Ἰησοῦς')));
  // Del hebreo no hay definición larga: la de la fuente necesita un permiso aparte y no se incluye.
  await ensureDefinition('H0430G');
  assert.equal(definition('H0430G'), '');
});

test('lo que se incluye respeta el permiso: sin definiciones del hebreo, sin traducciones palabra por palabra, y con el reconocimiento', () => {
  const dir = new URL('../src/data/bible/orig/', import.meta.url);
  const lexH = JSON.parse(readFileSync(new URL('lex-h.json', dir), 'utf8'));
  assert.deepEqual(Object.keys(lexH).sort(), ['b', 'g', 's', 't', 'w']);
  const n = lexH.s.split('\t').length;
  for (const k of ['w', 't', 'g', 'b']) assert.equal(lexH[k].split('\t').length, n, k);
  // Las glosas son de una o pocas palabras (no las definiciones de Online Bible, que empiezan con "1) ...").
  assert.ok(!/\d\) /.test(lexH.g));
  assert.ok(lexH.g.split('\t').every((g: string) => g.length < 80));
  const gen = JSON.parse(readFileSync(new URL('00.json', dir), 'utf8'));
  assert.deepEqual(Object.keys(gen).sort(), ['c', 'l', 'w']);
  const src = BIBLE_SOURCES.find((s) => /Palabras originales/.test(s.title));
  assert.ok(src);
  assert.match(src.licence, /CC BY 4\.0/);
  assert.match(src.credit ?? '', /STEP Bible/);
  assert.match(src.credit ?? '', /Tyndale House/);
  assert.match(src.credit ?? '', /STEPBible\.org/);
  assert.match(src.source, /STEPBible\.github\.io\/STEPBible-Data/);
});
