import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageFrom, allGroupsLabel, displayAge, fmtDateAR, groupArticle, groupWord, maskDateOrAge, parseAgeOrBirthdate, parseDateAR } from '../src/lib/format';

test('parseDateAR: día/mes/año válido e inválido', () => {
  assert.equal(parseDateAR('15/03/2024'), '2024-03-15');
  assert.equal(parseDateAR('1/3/2024'), '2024-03-01');
  assert.equal(parseDateAR('31/02/2024'), null);
  assert.equal(parseDateAR('15/13/2024'), null);
  assert.equal(parseDateAR('15/03/1850'), null);
  assert.equal(parseDateAR('hola'), null);
});

test('ageFrom: edad cumplida', () => {
  const hoy = new Date(2026, 10, 5); // 5 de noviembre de 2026
  assert.equal(ageFrom('2000-11-05', hoy), 26);
  assert.equal(ageFrom('2000-11-06', hoy), 25);
  assert.equal(ageFrom('2026-11-01', hoy), 0);
  assert.equal(ageFrom(null, hoy), null);
});

test('parseAgeOrBirthdate: "7" es edad, "12/03/2018" es fecha', () => {
  assert.deepEqual(parseAgeOrBirthdate('7'), { age: 7, birthdate: null });
  const r = parseAgeOrBirthdate('12/03/2018');
  assert.equal(r.birthdate, '2018-03-12');
  assert.equal(typeof r.age, 'number');
  assert.deepEqual(parseAgeOrBirthdate(''), { age: null, birthdate: null });
  assert.deepEqual(parseAgeOrBirthdate('999'), { age: null, birthdate: null });
});

test('maskDateOrAge: pone las barras al tipear', () => {
  assert.equal(maskDateOrAge('7'), '7');
  assert.equal(maskDateOrAge('34'), '34');
  assert.equal(maskDateOrAge('1203'), '12/03');
  assert.equal(maskDateOrAge('12032018'), '12/03/2018');
  assert.equal(maskDateOrAge('12/03/20189'), '12/03/2018');
});

test('displayAge y fmtDateAR', () => {
  assert.equal(displayAge({ birthdate: null, age: 40 }), 40);
  assert.equal(displayAge({ birthdate: null, age: null }), null);
  assert.equal(fmtDateAR('2018-03-12'), '12/03/2018');
  assert.equal(fmtDateAR(null), '');
});

test('rutas: palabra, artículo y "Todas las rutas"', () => {
  assert.equal(groupWord('bus_routes'), 'Ruta');
  assert.equal(groupWord('bus_routes', true), 'Rutas');
  assert.equal(allGroupsLabel('bus_routes'), 'Todas las rutas');
  assert.equal(allGroupsLabel(null), 'Todos los grupos');
  assert.equal(groupArticle('bus_routes'), 'la');
  assert.equal(groupArticle(null), 'el');
});
