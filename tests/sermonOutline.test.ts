import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSIONS, findBook } from '../src/lib/bible';
import { findBookLoose, findRefs, parseOutline, refLabel } from '../src/lib/sermonOutline';
import { SERMON_MAX_VERSES, itemSlides, itemTitle, newItem, sermonSlides } from '../src/lib/present';

const rv = VERSIONS[0];
const labels = (line: string) => findRefs(line).refs.map(refLabel);

test('findBookLoose: nombres completos, abreviaturas y números de libro', () => {
  const b = (n: string) => findBook(n);
  assert.equal(findBookLoose('Juan'), b('Juan'));
  assert.equal(findBookLoose('juan'), b('Juan'));
  assert.equal(findBookLoose('Jn'), b('Juan'));
  assert.equal(findBookLoose('Jn.'), b('Juan'));
  assert.equal(findBookLoose('S. Juan'), b('Juan'));
  assert.equal(findBookLoose('San Mateo'), b('Mateo'));
  assert.equal(findBookLoose('Santiago'), b('Santiago'));
  assert.equal(findBookLoose('Stg'), b('Santiago'));
  assert.equal(findBookLoose('1 Juan'), b('1 Juan'));
  assert.equal(findBookLoose('1 Jn'), b('1 Juan'));
  assert.equal(findBookLoose('I Juan'), b('1 Juan'));
  assert.equal(findBookLoose('1ra de Juan'), b('1 Juan'));
  assert.equal(findBookLoose('1ª Corintios'), b('1 Corintios'));
  assert.equal(findBookLoose('Segunda de Timoteo'), b('2 Timoteo'));
  assert.equal(findBookLoose('2Co'), b('2 Corintios'));
  assert.equal(findBookLoose('1 Co'), b('1 Corintios'));
  assert.equal(findBookLoose('Ro'), b('Romanos'));
  assert.equal(findBookLoose('Rom.'), b('Romanos'));
  assert.equal(findBookLoose('Génesis'), b('Génesis'));
  assert.equal(findBookLoose('Gn'), b('Génesis'));
  assert.equal(findBookLoose('Salmo'), b('Salmos'));
  assert.equal(findBookLoose('Sal'), b('Salmos'));
  assert.equal(findBookLoose('Hch'), b('Hechos'));
  assert.equal(findBookLoose('Apoc'), b('Apocalipsis'));
  assert.equal(findBookLoose('Filip'), b('Filipenses'));
  assert.equal(findBookLoose('Fil'), b('Filipenses'));
  assert.equal(findBookLoose('Flm'), b('Filemón'));
  assert.equal(findBookLoose('Cantar de los Cantares'), b('Cantares'));
  assert.equal(findBookLoose('Punto'), -1);
  assert.equal(findBookLoose('Dios'), -1);
  assert.equal(findBookLoose('J'), -1);
  assert.equal(findBookLoose(''), -1);
  // "Juan" con número adelante no se confunde con el evangelio.
  assert.notEqual(findBookLoose('2 Juan'), b('Juan'));
});

test('findRefs: una cita, rangos y varias en la misma línea', () => {
  assert.deepEqual(labels('Juan 3:16'), ['Juan 3:16']);
  assert.deepEqual(labels('Juan 3:16-18'), ['Juan 3:16–18']);
  assert.deepEqual(labels('juan 3 : 16 – 18'), ['Juan 3:16–18']);
  assert.deepEqual(labels('1 Juan 1.9'), ['1 Juan 1:9']);
  assert.deepEqual(labels('Juan 3:16; Romanos 5:8'), ['Juan 3:16', 'Romanos 5:8']);
  assert.deepEqual(labels('Juan 3:16-18; Ro 5:8, 10:9-10 y 1 Jn 1:9'), ['Juan 3:16–18', 'Romanos 5:8', 'Romanos 10:9–10', '1 Juan 1:9']);
  assert.deepEqual(labels('Juan 3:16, 18 y 20-21'), ['Juan 3:16', 'Juan 3:18', 'Juan 3:20–21']);
  assert.deepEqual(labels('Sal 23:1; 27:1'), ['Salmos 23:1', 'Salmos 27:1']);
  assert.deepEqual(labels('Efesios 2:8-9 y Tito 3:5'), ['Efesios 2:8–9', 'Tito 3:5']);
  assert.deepEqual(labels('1ª Corintios 13:4-7'), ['1 Corintios 13:4–7']);
  assert.deepEqual(labels('(S. Juan 14:6)'), ['Juan 14:6']);
});

test('findRefs: rango que cruza de capítulo', () => {
  const r = findRefs('Juan 3:35-4:2').refs;
  assert.deepEqual(r.map((x) => [x.chapter, x.from, x.to]), [[3, 35, null], [4, 1, 2]]);
});

test('findRefs: saca la cita y deja el texto del punto', () => {
  const a = findRefs('Dios ama al mundo (Juan 3:16; Ro 5:8)');
  assert.equal(a.rest, 'Dios ama al mundo');
  assert.equal(a.refs.length, 2);
  assert.equal(findRefs('Juan 3:16 (RV1960)').rest, '');
  assert.equal(findRefs('Leé Juan 3:16 con atención').rest, 'Leé con atención');
});

test('findRefs: no inventa citas donde no hay', () => {
  assert.deepEqual(labels('Nos vemos a las 10:30'), []);
  assert.deepEqual(labels('Punto 1.2 de la lista'), []);
  assert.deepEqual(labels('Juan 99:1'), []);
  assert.deepEqual(labels('Juan 3:18-16'), []);
  assert.deepEqual(labels('Tres razones: 1:1'), []);
  // Después de la coma, un número seguido de palabras no es otro versículo.
  assert.deepEqual(labels('Juan 3:16, 3 razones para creer'), ['Juan 3:16']);
  assert.deepEqual(labels(''), []);
});

test('parseOutline: título, puntos, sub-puntos y líneas de solo citas', () => {
  const o = parseOutline([
    'Título: El amor de Dios',
    '',
    '1. Dios ama a todos (Juan 3:16)',
    '- Nadie queda afuera',
    '• Ni los que están lejos (Ef 2:13)',
    '2. Juan 15:13',
    '3. Dios lo demostró',
    'Romanos 5:8; 1 Juan 4:9-10',
    'Salmo 117',
  ].join('\n'));
  assert.equal(o.title, 'El amor de Dios');
  assert.equal(o.parts.length, 7);
  assert.deepEqual(o.parts[0], { kind: 'point', text: '1. Dios ama a todos', parent: null, refs: [{ book: findBook('Juan'), chapter: 3, from: 16, to: 16 }] });
  assert.deepEqual(o.parts[1], { kind: 'point', text: 'Nadie queda afuera', parent: '1. Dios ama a todos', refs: [] });
  assert.ok(o.parts[2].kind === 'point' && o.parts[2].parent === '1. Dios ama a todos' && o.parts[2].refs.length === 1);
  // "2. Juan 15:13" es el punto 2 con Juan 15:13, no la carta de 2 Juan.
  assert.deepEqual(o.parts[3], { kind: 'refs', refs: [{ book: findBook('Juan'), chapter: 15, from: 13, to: 13 }] });
  assert.ok(o.parts[4].kind === 'point' && o.parts[4].text === '3. Dios lo demostró' && o.parts[4].parent === null);
  assert.ok(o.parts[5].kind === 'refs' && o.parts[5].refs.length === 2);
  // Capítulo entero, solo cuando la línea es nada más que la cita.
  assert.deepEqual(o.parts[6], { kind: 'refs', refs: [{ book: findBook('Salmos'), chapter: 117, from: 1, to: null }] });
  assert.deepEqual(parseOutline('  \n '), { title: '', parts: [] });
});

test('sermonSlides: título, un punto por diapositiva y los versículos con su texto', () => {
  const s = sermonSlides('El amor de Dios\n1. Dios ama a todos (Juan 3:16-17)\n- Nadie queda afuera\nRomanos 5:8', rv, 1);
  assert.deepEqual(s[0], { kind: 'notice', title: 'El amor de Dios', body: '' });
  assert.deepEqual(s[1], { kind: 'text', text: '1. Dios ama a todos', label: null, footer: 'Juan 3:16–17' });
  assert.ok(s[2].kind === 'text' && s[2].footer === `Juan 3:16 (${rv.short})` && s[2].text.length > 20);
  assert.ok(s[3].kind === 'text' && s[3].footer === `Juan 3:17 (${rv.short})`);
  // El sub-punto lleva arriba, en chico, el punto al que pertenece.
  assert.deepEqual(s[4], { kind: 'text', text: 'Nadie queda afuera', label: null, footer: null, head: '1. Dios ama a todos' });
  assert.ok(s[5].kind === 'text' && s[5].footer === `Romanos 5:8 (${rv.short})`);
  assert.equal(s.length, 6);
  // De a dos versículos por diapositiva.
  assert.equal(sermonSlides('T\nJuan 3:16-17', rv, 2).length, 2);
  // Un capítulo entero largo tiene tope.
  assert.equal(sermonSlides('T\nSalmo 119', rv, 1).length, 1 + SERMON_MAX_VERSES);
  assert.deepEqual(sermonSlides('', rv, 1), []);
});

test('la prédica en la lista: nombre y diapositivas', () => {
  const it = { ...newItem('sermon'), outline: 'Cántaros vacíos\n2 Reyes 4:1-2' };
  assert.equal(itemTitle(it), 'Cántaros vacíos');
  assert.equal(itemSlides(it, rv).length, 3);
  assert.equal(itemTitle(newItem('sermon')), 'Prédica');
});
