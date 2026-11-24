// Idiomas: el ayudante t(), la lista de textos en inglés y las fechas, números y Biblia según el idioma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLang, holes, registerDict, setLangNow, t, tx, txList, txLocale } from '../src/lib/i18n';
import { fmtDateOnly, fmtDay, fmtDayYear, fmtDistance, fmtMoney, fmtRelativeDay, groupArticle, parseMoney } from '../src/lib/format';
import { bookName, findBook, versionOf } from '../src/lib/bible';

const dir = join(__dirname, '..', 'src', 'i18n');
const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')) as Record<string, string>;
const claves = JSON.parse(readFileSync(join(dir, 'claves.json'), 'utf8')) as string[];

/** Corre algo con la app en inglés y vuelve a dejarla en castellano. */
function inEnglish<T>(dict: Record<string, string>, fn: () => T): T {
  registerDict('en', dict);
  setLangNow('en');
  try { return fn(); } finally { setLangNow('es'); }
}

test('t: en castellano devuelve el mismo texto y completa los huecos', () => {
  assert.equal(getLang(), 'es');
  assert.equal(t('Guardar'), 'Guardar');
  assert.equal(t('Faltaron {n} personas', { n: 3 }), 'Faltaron 3 personas');
  assert.equal(tx('Hola {nombre}, soy {yo}'), 'Hola {nombre}, soy {yo}', 'los huecos sin valor quedan como están');
  assert.equal(t('{a}{b}{c}{d}', { a: null, b: undefined, c: false, d: 0 }), '0', 'null, undefined y false no se ven; el cero sí');
  assert.equal(t('Salida##puerta'), 'Salida', 'el contexto no se muestra');
});

test('t: en inglés traduce, y si falta la traducción queda el castellano', () => {
  const dict = {
    Guardar: 'Save',
    'Faltaron {n} personas': '{n} {n|person was|people were} absent',
    Salida: 'Outing',
    'Salida##puerta': 'Exit',
    'Entrar##puerta': 'Check in',
  };
  inEnglish(dict, () => {
    assert.equal(t('Guardar'), 'Save');
    assert.equal(t('Faltaron {n} personas', { n: 1 }), '1 person was absent');
    assert.equal(t('Faltaron {n} personas', { n: 4 }), '4 people were absent');
    assert.equal(t('Texto sin traducir'), 'Texto sin traducir');
    assert.equal(t('Sin traducir {n}', { n: 2 }), 'Sin traducir 2');
    assert.equal(t('Salida'), 'Outing');
    assert.equal(t('Salida##puerta'), 'Exit', 'la misma palabra con otro sentido');
    assert.equal(t('Salida##otro'), 'Outing', 'un contexto sin traducción propia usa la de la palabra sola');
    assert.equal(t('Nada##puerta'), 'Nada');
    assert.equal(txLocale(), 'en-US');
  });
  assert.equal(t('Guardar'), 'Guardar');
  assert.equal(txLocale(), 'es-AR');
});

test('txList: una lista creada una sola vez sale en el idioma del momento', () => {
  const dias = txList(['lunes', 'martes']);
  assert.deepEqual([...dias], ['lunes', 'martes']);
  assert.equal(dias.length, 2);
  inEnglish({ lunes: 'Monday', martes: 'Tuesday' }, () => {
    assert.equal(dias[0], 'Monday');
    assert.deepEqual(dias.map((d) => d.toUpperCase()), ['MONDAY', 'TUESDAY']);
    assert.equal(dias.join(' y '), 'Monday y Tuesday');
  });
  assert.equal(dias[1], 'martes');
});

test('en.json: cada traducción conserva los huecos de su texto en castellano', () => {
  const bad: string[] = [];
  for (const [es, english] of Object.entries(en)) {
    const want = holes(es);
    const got = holes(english);
    // {pl}, {pl2}: es un singular/plural armado en castellano; el inglés lo puede resolver con {n|uno|varios}.
    const missing = want.filter((h) => !got.includes(h) && !/^pl\d*$/.test(h));
    const extra = got.filter((h) => !want.includes(h));
    if (missing.length || extra.length) bad.push(`"${es}" -> faltan [${missing.join(', ')}] sobran [${extra.join(', ')}]`);
    const edge = (s: string) => [s.match(/^\s*/)?.[0], s.match(/\s*$/)?.[0]].join('|');
    if (edge(es.split('##')[0]) !== edge(english)) bad.push(`"${es}" -> los espacios de las puntas no son iguales`);
    if (!english.trim()) bad.push(`"${es}" -> traducción vacía`);
  }
  assert.deepEqual(bad, []);
});

test('en.json: informe de textos sin traducir (no falla, solo avisa)', () => {
  const missing = claves.filter((k) => en[k] === undefined);
  const unused = Object.keys(en).filter((k) => !claves.includes(k));
  if (missing.length) console.log(`  Inglés: faltan ${missing.length} de ${claves.length} textos. Los primeros: ${missing.slice(0, 15).map((k) => JSON.stringify(k)).join(', ')}. Correr: node scripts/i18n-extract.mjs`);
  if (unused.length) console.log(`  Inglés: ${unused.length} traducciones que la app ya no usa (node scripts/i18n-extract.mjs --limpiar).`);
  assert.ok(claves.length > 1000, 'claves.json tiene la lista de textos');
});

test('fechas y números según el idioma', () => {
  const d = new Date(2026, 9, 24, 12); // sábado 24 de octubre de 2026
  assert.equal(fmtDay(d), 'sáb 24 oct');
  assert.equal(fmtDayYear(d), 'sáb 24 oct 2026');
  assert.equal(fmtDateOnly('2026-10-24'), '24 oct 2026');
  assert.equal(fmtDistance(2300), '2,3 km');
  assert.equal(parseMoney('1.500,50'), 1500.5);
  assert.equal(parseMoney('1,500'), 1.5, 'en castellano la coma es decimal, como siempre');
  assert.equal(groupArticle('bus_routes', 'todo'), 'toda');
  inEnglish({}, () => {
    assert.equal(fmtDay(d), 'Sat, Oct 24');
    assert.equal(fmtDayYear(d), 'Sat, Oct 24, 2026');
    assert.equal(fmtDateOnly('2026-10-24'), 'Oct 24, 2026');
    assert.equal(fmtDistance(2300), '2.3 km');
    assert.equal(fmtMoney(1234.5), '$ 1,234.50');
    assert.equal(parseMoney('1,500'), 1500, 'en inglés la coma separa los miles');
    assert.equal(parseMoney('1,500.50'), 1500.5);
    assert.equal(parseMoney('12,345,678'), 12345678);
    assert.equal(parseMoney('1.500,50'), 1500.5, 'lo escrito a la manera argentina se sigue entendiendo');
    assert.equal(parseMoney('15000.50'), 15000.5);
    assert.equal(groupArticle('bus_routes', 'todo'), 'all');
    assert.equal(groupArticle(null, 'el'), 'the');
  });
  assert.equal(fmtMoney(1234.5), '$ 1.234,50');
  assert.equal(fmtRelativeDay(new Date()), 'hoy');
});

test('la Biblia según el idioma: King James y nombres en inglés si la persona no eligió', () => {
  assert.equal(versionOf(undefined).id, 'rv1909');
  assert.equal(bookName(42), 'Juan');
  inEnglish({}, () => {
    assert.equal(versionOf(undefined).id, 'kjv');
    assert.equal(versionOf('rv1909').id, 'rv1909', 'lo que la persona eligió no se toca');
    assert.equal(bookName(42), 'John');
    assert.equal(bookName(18), 'Psalms');
  });
  assert.equal(findBook('John'), 42, 'una cita con el nombre en inglés se sigue encontrando');
  assert.equal(findBook('Juan'), 42);
  assert.equal(findBook('Psalm'), 18);
});
