import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, detectFields, parseCsv, parseDate } from '../src/lib/importPeople';

test('parseCsv: punto y coma, comillas y saltos', () => {
  const r = parseCsv('Nombre;Celular\r\n"Pérez; Juan";376 455-1234\n\nAna;"a ""b"""\n');
  assert.deepEqual(r, [['Nombre', 'Celular'], ['Pérez; Juan', '376 455-1234'], ['Ana', 'a "b"']]);
});
test('parseCsv: comas', () => assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]));
test('detectFields: encabezados en español', () => {
  assert.deepEqual(detectFields(['Nombre', 'Apellido', 'Teléfono', 'E-mail', 'Domicilio', 'Fecha de nacimiento', 'Sexo', 'Estado civil', 'Fecha de bautismo', 'Notas']),
    ['name', 'lastname', 'phone', 'email', 'address', 'birthdate', 'sex', 'marital', 'baptized_on', 'skip']);
});
test('detectFields: nombre completo y no repite campos', () => {
  assert.deepEqual(detectFields(['Apellido y Nombre', 'Cel', 'Whatsapp']), ['name', 'phone', 'skip']);
});
test('parseDate', () => {
  assert.equal(parseDate('25/12/1980'), '1980-12-25');
  assert.equal(parseDate('5-3-85'), '1985-03-05');
  assert.equal(parseDate('1980-12-25'), '1980-12-25');
  assert.equal(parseDate('31/02/1990'), undefined);
  assert.equal(parseDate('basura'), undefined);
  assert.equal(parseDate('29221'), '1980-01-01');
});
test('buildRows: une nombre y apellido, descarta sin nombre', () => {
  const { rows, dropped } = buildRows(
    [['Ana', 'Gómez', '376 4551234', 'F', 'Casada'], ['', '', '123', '', ''], ['Luis', '', '', 'hombre', 'soltero']],
    ['name', 'lastname', 'phone', 'sex', 'marital']);
  assert.equal(dropped, 1);
  assert.equal(rows[0].name, 'Ana Gómez');
  assert.equal(rows[0].sex, 'f'); assert.equal(rows[0].marital, 'married');
  assert.equal(rows[1].sex, 'm'); assert.equal(rows[1].marital, 'single'); assert.equal(rows[1].phone, undefined);
});

import { detectFields as _df, detectSource, buildRows as _br } from '../src/lib/importPeople';
import test2 from 'node:test';
import assert2 from 'node:assert/strict';

test2('Planning Center: reconoce la planilla, prefiere celular y arma la dirección de casa', () => {
  const h = ['First Name', 'Last Name', 'Given Name', 'Nickname', 'Home Phone Number', 'Mobile Phone Number', 'Work Email', 'Home Email',
    'Home Address Street Line 1', 'Home Address City', 'Home Address State', 'Home Address Zip Code', 'Work Address City', 'Birthdate', 'Gender', 'Marital Status', 'Household ID'];
  assert.equal(detectSource(h), 'planning_center');
  const f = _df(h);
  assert.deepEqual(f, ['name', 'lastname', 'skip', 'skip', 'skip', 'phone', 'skip', 'email', 'address', 'address', 'address', 'address', 'skip', 'birthdate', 'sex', 'marital', 'skip']);
  const { rows } = _br([['Ana', 'Pérez', 'Anita', 'Ani', '555-1111', '376 455-1234', 'a@w.com', 'ana@casa.com', '12 Main St', 'Iowa City', 'IA', '52240', 'X', '03/05/1980', 'Female', 'Married', '7']], f);
  assert.equal(rows[0].name, 'Ana Pérez');
  assert.equal(rows[0].phone, '376 455-1234');
  assert.equal(rows[0].email, 'ana@casa.com');
  assert.equal(rows[0].address, '12 Main St, Iowa City, IA, 52240');
  assert.equal(rows[0].sex, 'f');
  assert.equal(rows[0].marital, 'married');
});

test2('Breeze: nombre, apellido, celular y correo; ignora Family Role, Tags y Breeze ID', () => {
  const h = ['Breeze ID', 'First Name', 'Last Name', 'Nickname', 'Family Role', 'Gender', 'Birthdate', 'Mobile', 'Email', 'Tags'];
  assert.equal(detectSource(h), 'breeze');
  assert.deepEqual(_df(h), ['skip', 'name', 'lastname', 'skip', 'skip', 'sex', 'birthdate', 'phone', 'email', 'skip']);
});

test2('Planilla propia en español sigue funcionando', () => {
  assert.equal(detectSource(['Nombre', 'Apellido', 'Celular']), 'generic');
  assert.deepEqual(_df(['Nombre', 'Apellido', 'Celular', 'Correo', 'Dirección']), ['name', 'lastname', 'phone', 'email', 'address']);
});
