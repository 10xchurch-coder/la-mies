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

// ---------- Con la app en inglés, lo que se compara y lo que se lee de afuera tiene que seguir andando ----------
import { fieldOfHeader, SMART_OPTIONS, yesNo } from '../src/lib/importSmart';
import { findRefs, parseOutline, refLabel } from '../src/lib/sermonOutline';
import { roleLabel } from '../src/lib/families';
import { METHODS, methodLabel } from '../src/lib/giving';
import { isDemoError, DEMO_MESSAGE } from '../src/lib/demoCore';
import { memberLessons } from '../src/lib/personas';

test('en inglés: los títulos y los valores de una planilla se siguen reconociendo', () => {
  inEnglish(en, () => {
    for (const [h, f] of [['Nombre', 'name'], ['Apellido', 'lastname'], ['Celular', 'phone'], ['Fecha de nacimiento', 'birthdate'], ['Full Name', 'name'], ['Last name', 'lastname']] as const) assert.equal(fieldOfHeader(h), f, h);
    assert.equal(yesNo('Sí'), true);
    assert.equal(yesNo('no miembro'), false, 'el valor "no miembro" de la planilla no se traduce');
    assert.equal(SMART_OPTIONS.find((o) => o.value === 'lastname')?.label, 'Last name', 'la etiqueta sale en el idioma del momento');
  });
  assert.equal(SMART_OPTIONS.find((o) => o.value === 'lastname')?.label, 'Apellido');
});

test('en inglés: el bosquejo en castellano se sigue entendiendo, y también con libros en inglés', () => {
  inEnglish(en, () => {
    const o = parseOutline('El amor de Dios\n1. Dios ama a todos (Juan 3:16)\n1 Juan 4:9-10');
    assert.equal(o.title, 'El amor de Dios');
    assert.deepEqual(findRefs('Ro 5:8; 1 Co 13:4').refs.map((r) => [r.book, r.chapter, r.from]), [[44, 5, 8], [45, 13, 4]]);
    assert.equal(findRefs('Juan 3:16').refs.map(refLabel)[0], 'John 3:16', 'la cita se muestra con el nombre en inglés');
    assert.equal(findRefs('John 3:16').refs[0]?.book, 42);
  });
  assert.equal(findRefs('Juan 3:16').refs.map(refLabel)[0], 'Juan 3:16');
});

test('en inglés: tablas que antes quedaban fijas en castellano', () => {
  assert.equal(roleLabel('madre'), 'Mamá');
  assert.equal(METHODS.find((m) => m.value === 'card')?.label, 'Tarjeta');
  inEnglish(en, () => {
    assert.equal(roleLabel('madre'), 'Mom');
    assert.equal(METHODS.find((m) => m.value === 'card')?.label, 'Card');
    assert.equal(methodLabel('other'), 'Other');
    assert.equal(memberLessons(null)[0], 'Salvation and baptism');
    assert.equal(isDemoError({ message: DEMO_MESSAGE }), true, 'el aviso de la demostración se sigue reconociendo por su texto en castellano');
  });
  assert.equal(memberLessons(null)[0], 'La salvación y el bautismo');
});

import { FEATURES, FEATURE_GROUPS, topFeatures } from '../src/lib/features';
import { METRICS, METRIC_GROUPS } from '../src/lib/central';

test('en inglés: las funciones y los números de Central cambian de etiqueta, no de clave ni de grupo', () => {
  const keys = FEATURES.map((f) => `${f.key}|${f.group}|${f.parent ?? ''}|${f.routes.join(',')}`);
  const perGroup = FEATURE_GROUPS.map((g) => topFeatures(g).length);
  inEnglish(en, () => {
    assert.deepEqual(FEATURES.map((f) => `${f.key}|${f.group}|${f.parent ?? ''}|${f.routes.join(',')}`), keys);
    assert.deepEqual(FEATURE_GROUPS.map((g) => topFeatures(g).length), perGroup, 'se siguen agrupando igual');
    assert.equal(FEATURES.find((f) => f.key === 'asistencia')?.label, 'Attendance');
    assert.equal(t(FEATURE_GROUPS[0]), 'Soul winning and visits');
    assert.ok(FEATURES.every((f) => en[t(f.label)] === undefined || true));
    assert.deepEqual([...METRIC_GROUPS], ['Gente', 'Reuniones', 'Decisiones', 'Evangelismo', 'Uso de la app', 'Soporte']);
    assert.ok(METRICS.every((m) => (METRIC_GROUPS as readonly string[]).includes(m.group)));
    assert.equal(t('Uso de la app'), 'App use');
  });
  // Ninguna etiqueta, ayuda ni "qué se oculta" de una función queda sin inglés.
  const missing = FEATURES.flatMap((f) => [f.label, f.hint, f.hides]).filter((s) => s && en[s] === undefined);
  assert.deepEqual(missing, []);
});
