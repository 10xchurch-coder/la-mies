import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTable, analyzeText, blocking, buildSmartRows, checkPhone, chunk, countRows, detectDelimiter, fieldOfHeader, findHeaderRow, guessByContent, isFileDup,
  mapColumns, markFileDuplicates, parseDelimited, rowsToSend, SMART_LABELS, templateCsv, TEMPLATE_HEADERS, TEMPLATE_ROWS, yesNo,
} from '../src/lib/importSmart';

test('reconoce los títulos más comunes en castellano y en inglés', () => {
  const cases: [string, string][] = [
    ['Nombre', 'name'], ['NOMBRES', 'name'], ['Nombre y Apellido', 'name'], ['Apellido y nombre', 'name'], ['Nombre completo', 'name'], ['Full Name', 'name'],
    ['Apellido', 'lastname'], ['Last name', 'lastname'], ['Teléfono', 'phone'], ['Celular', 'phone'], ['WhatsApp', 'phone'], ['Nro. de celular', 'phone'], ['Phone', 'phone'],
    ['Dirección', 'address'], ['Domicilio', 'address'], ['Barrio', 'barrio'], ['Fecha de nacimiento', 'birthdate'], ['Cumpleaños', 'birthdate'], ['Birthday', 'birthdate'],
    ['E-mail', 'email'], ['Correo electrónico', 'email'], ['Bautizado', 'baptized'], ['Fecha de bautismo', 'baptized_on'], ['Miembro', 'member'], ['Familia', 'family'],
    ['Estado civil', 'marital'], ['Sexo', 'sex'],
  ];
  for (const [h, f] of cases) assert.equal(fieldOfHeader(h), f, h);
  for (const h of ['', '   ', 'Observaciones', '2024', 'Talle de remera']) assert.equal(fieldOfHeader(h), null, h);
  assert.ok(SMART_LABELS.skip);
});

test('encuentra el separador: punto y coma, coma, tabulación', () => {
  assert.equal(detectDelimiter('Nombre;Celular\nAna;376'), ';');
  assert.equal(detectDelimiter('Nombre,Celular\nAna,376'), ',');
  assert.equal(detectDelimiter('Nombre\tCelular\nAna\t376'), '\t');
  // Un título suelto arriba con comas no confunde: las filas de datos mandan.
  assert.equal(detectDelimiter('Lista de miembros, año 2026\nNombre;Celular;Barrio\nAna;376;Centro\nBeto;377;Sur'), ';');
  // Direcciones con coma adentro de un archivo con punto y coma.
  assert.equal(detectDelimiter('Nombre;Dirección\nAna;Calle 1, casa 2\nBeto;Calle 3, casa 4'), ';');
});

test('lee el texto respetando comillas y sacando filas vacías', () => {
  assert.deepEqual(parseDelimited('a;b\r\n"x;1";"dijo ""hola"""\r\n\r\n;\r\nc;d'), [['a', 'b'], ['x;1', 'dijo "hola"'], ['c', 'd']]);
  assert.deepEqual(parseDelimited('﻿Nombre\tCel\n Ana \t 376 '), [['Nombre', 'Cel'], ['Ana', '376']]);
  assert.deepEqual(parseDelimited(''), []);
});

test('encuentra la fila de títulos aunque haya renglones de adorno arriba', () => {
  const t = [['Iglesia Inventada'], ['Lista de miembros 2026'], ['N°', 'Apellido', 'Nombre', 'Celular'], ['1', 'Quiroga', 'Marcela', '3764000001']];
  assert.equal(findHeaderRow(t), 2);
  assert.equal(findHeaderRow([['Marcela Quiroga', '3764000001'], ['Rubén Benítez', '3764000002']]), -1);
  // Una fila de datos que casualmente trae la palabra "nombre" no es título si también trae un teléfono.
  assert.equal(findHeaderRow([['Nombre de pila: Ana', '3764000001']]), -1);
});

test('adivina la columna mirando los datos cuando no hay título', () => {
  assert.equal(guessByContent(['3764000001', '376 400-0002', '', '+54 9 376 400-0003']), 'phone');
  assert.equal(guessByContent(['ana@ejemplo.com', 'beto@ejemplo.com']), 'email');
  assert.equal(guessByContent(['14/03/1985', '02/11/1982', '1999-09-30']), 'birthdate');
  assert.equal(guessByContent(['Centro', 'San Jorge']), null);
  assert.equal(guessByContent([]), null);
});

test('arma las columnas: por título, por datos, y cada campo una sola vez', () => {
  assert.deepEqual(mapColumns(['Apellido', 'Nombre', 'Tel', 'Tel 2', 'Notas'], [['Quiroga', 'Marcela', '3764000001', '3764000009', 'x']]),
    ['lastname', 'name', 'phone', 'skip', 'skip']);
  // Sin títulos: nombre por ser texto, celular y correo por los datos.
  assert.deepEqual(mapColumns([], [['Marcela Quiroga', '3764000001', 'marce@ejemplo.com'], ['Rubén Benítez', '3764000002', '']]), ['name', 'phone', 'email']);
  // "Bautizado" con fechas es la fecha; "Bautismo" con sí/no es la marca.
  assert.deepEqual(mapColumns(['Nombre', 'Bautizado'], [['Ana', '12/05/2010'], ['Beto', '01/02/2015']]), ['name', 'baptized_on']);
  assert.deepEqual(mapColumns(['Nombre', 'Bautismo'], [['Ana', 'Sí'], ['Beto', 'no']]), ['name', 'baptized']);
  // Una columna "Miembro" llena de nombres es la lista de nombres.
  assert.deepEqual(mapColumns(['Miembro', 'Celular'], [['Ana Inventada', '3764000001'], ['Beto Inventado', '3764000002']]), ['name', 'phone']);
  assert.deepEqual(mapColumns(['Nombre', 'Miembro'], [['Ana', 'si'], ['Beto', 'no']]), ['name', 'member']);
});

test('analiza una lista pegada desde una planilla (con tabulaciones)', () => {
  const t = analyzeText('Listado general\n\nNombre\tApellido\tWhatsApp\tBarrio\nMarcela\tQuiroga\t376 400-0001\tCentro\nRubén\tBenítez\t\tSur\n');
  assert.equal(t.hasHeader, true);
  assert.equal(t.skippedTop, 1);
  assert.deepEqual(t.fields, ['name', 'lastname', 'phone', 'barrio']);
  assert.equal(t.data.length, 2);
  const noHeader = analyzeTable([['Marcela Quiroga', '3764000001'], ['Rubén Benítez', '3764000002']]);
  assert.equal(noHeader.hasHeader, false);
  assert.deepEqual(noHeader.headers, ['Columna 1', 'Columna 2']);
  assert.deepEqual(noHeader.fields, ['name', 'phone']);
});

test('sí y no en varias formas', () => {
  for (const v of ['Sí', 'si', 'S', 'x', 'X', '1', 'Yes', 'Bautizado']) assert.equal(yesNo(v), true, v);
  for (const v of ['No', 'n', '0', 'visita']) assert.equal(yesNo(v), false, v);
  for (const v of ['', 'tal vez', '12/05/2010']) assert.equal(yesNo(v), undefined, v);
});

test('el celular se revisa con las reglas de la app', () => {
  assert.deepEqual(checkPhone('3764000001'), { phone: '+54 9 376 400-0001' });
  assert.deepEqual(checkPhone('0376 15 400-0001'), { phone: '+54 9 376 400-0001' });
  assert.deepEqual(checkPhone(''), {});
  assert.match(checkPhone('400-0001').problem ?? '', /se carga sin celular/);
  assert.match(checkPhone('no tiene').problem ?? '', /no se entiende/);
  assert.deepEqual(checkPhone('+595 981 123456'), { phone: '+595 981 123456' });
  // En una iglesia de otro país no se exige el formato argentino.
  assert.deepEqual(checkPhone('0981 123456', 'PY'), { phone: '0981 123456' });
  assert.ok(checkPhone('12345', 'PY').problem);
});

const FIELDS = ['name', 'lastname', 'phone', 'email', 'address', 'barrio', 'birthdate', 'baptized', 'member', 'family'] as const;

test('revisa cada fila y dice el problema en palabras simples', () => {
  const rows = buildSmartRows([
    ['Marcela', 'Quiroga', '376 400-0001', 'MARCE@Ejemplo.com', 'Av. Los Lapachos 123', 'Centro', '14/03/1985', 'Sí', 'Sí', 'Quiroga Benítez'],
    ['', '', '376 400-0002', '', '', '', '', '', '', ''],
    ['Rubén', 'Benítez', '400-0002', 'ruben@', '', 'B° Sur', '31/02/1990', 'no', 'no', ''],
  ], [...FIELDS], { firstLine: 2 });
  assert.equal(rows.length, 3);
  const [a, b, c] = rows;
  assert.deepEqual([a.line, a.name, a.phone, a.email, a.address, a.birthdate, a.baptized, a.member, a.family, a.problems.length],
    [2, 'Marcela Quiroga', '+54 9 376 400-0001', 'marce@ejemplo.com', 'Av. Los Lapachos 123, B° Centro', '1985-03-14', true, true, 'Quiroga Benítez', 0]);
  assert.equal(blocking(b), true);
  assert.equal(b.problems[0].kind, 'no_name');
  assert.equal(blocking(c), false);
  assert.deepEqual(c.problems.map((p) => p.kind), ['bad_phone', 'bad_email', 'bad_date']);
  assert.equal(c.phone, undefined); assert.equal(c.email, undefined); assert.equal(c.birthdate, undefined);
  assert.equal(c.address, 'B° Sur'); assert.equal(c.baptized, false); assert.equal(c.member, false);
  for (const p of c.problems) assert.match(p.text, /se carga sin/);
});

test('repetidos dentro del archivo: mismo celular, o mismo nombre sin celular', () => {
  const rows = buildSmartRows([
    ['Marcela Quiroga', '376 400-0001'],
    ['Marce Q.', '0376 15 4000001'],          // mismo celular escrito distinto
    ['Elvira Sosa', ''],
    ['ELVIRA  SOSÁ', ''],                      // mismo nombre, sin celular
    ['Elvira Sosa', '376 400-0005'],           // mismo nombre pero con otro celular: puede ser otra persona
    ['', ''],
  ], ['name', 'phone'], { firstLine: 2 });
  assert.deepEqual(rows.map(isFileDup), [false, true, false, true, false, false]);
  assert.match(rows[1].problems[0].text, /fila 2/);
  assert.match(rows[3].problems[0].text, /fila 4/);
  // Volver a marcar no duplica el aviso.
  assert.equal(markFileDuplicates(rows)[1].problems.filter((p) => p.kind === 'dup_file').length, 1);
  const c = countRows(rows);
  assert.deepEqual(c, { total: 6, ready: 3, noName: 1, fileDups: 2, warnings: 0 });
  const out = rowsToSend(rows);
  assert.deepEqual(out.lines, [2, 4, 6]);
  assert.deepEqual(out.send[0], { name: 'Marcela Quiroga', phone: '+54 9 376 400-0001' });
  assert.deepEqual(out.send[1], { name: 'Elvira Sosa' });
});

test('lo que se manda a la base no lleva campos vacíos ni datos de la pantalla', () => {
  const rows = buildSmartRows([['Tobías Benítez', '', 'No', 'No', 'Quiroga Benítez']], ['name', 'phone', 'baptized', 'member', 'family']);
  assert.deepEqual(rowsToSend(rows).send, [{ name: 'Tobías Benítez', baptized: false, member: false, family: 'Quiroga Benítez' }]);
});

test('tandas para la barra de avance', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 100), []);
  assert.equal(chunk(Array.from({ length: 250 }, (_, i) => i), 100).length, 3);
});

test('la planilla modelo se lee sola y no trae problemas', () => {
  const t = analyzeText(templateCsv());
  assert.equal(t.hasHeader, true);
  assert.deepEqual(t.headers, TEMPLATE_HEADERS);
  assert.deepEqual(t.fields, ['name', 'lastname', 'phone', 'email', 'address', 'barrio', 'birthdate', 'baptized', 'member', 'family']);
  const rows = buildSmartRows(t.data, t.fields, { firstLine: 2 });
  assert.equal(rows.length, TEMPLATE_ROWS.length);
  assert.deepEqual(rows.flatMap((r) => r.problems), []);
  assert.equal(countRows(rows).ready, TEMPLATE_ROWS.length);
});
