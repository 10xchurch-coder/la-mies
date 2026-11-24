import test from 'node:test';
import assert from 'node:assert/strict';
import { FAMILY_ROLES, familyNameFor, groupByFamily, isChildRole, pickupAdults, roleLabel, sortFamily, suggestRole } from '../src/lib/families';

// Una familia inventada.
const familia = [
  { contact_id: 'h2', name: 'Tobías Ledesma', role: 'hijo', age: 6, can_pickup: false },
  { contact_id: 'ab', name: 'Elvira Quiroga', role: 'abuela', age: 70, can_pickup: true },
  { contact_id: 'ma', name: 'Noelia Quiroga', role: 'madre', age: 34, can_pickup: true },
  { contact_id: 'h1', name: 'Abril Ledesma', role: 'hija', age: 11, can_pickup: true }, // mal cargado a propósito
  { contact_id: 'pa', name: 'Darío Ledesma', role: 'padre', age: 36, can_pickup: false },
];

test('los lugares de la familia son los mismos que acepta la base', () => {
  assert.deepEqual(FAMILY_ROLES.map((r) => r.value), ['padre', 'madre', 'hijo', 'hija', 'abuelo', 'abuela', 'otro']);
  assert.equal(roleLabel('madre'), 'Mamá');
  assert.equal(roleLabel('algo-raro'), 'Familiar');
  assert.ok(isChildRole('hija') && isChildRole('hijo') && !isChildRole('abuela'));
});

test('la familia se ordena: papás, hijos de mayor a menor, abuelos', () => {
  assert.deepEqual(sortFamily(familia).map((m) => m.contact_id), ['pa', 'ma', 'h1', 'h2', 'ab']);
});

test('solo los grandes marcados pueden retirar a un chico', () => {
  assert.deepEqual(pickupAdults(familia, 'h2').map((m) => m.contact_id), ['ab', 'ma']);
  // un hijo nunca retira, aunque esté marcado por error
  assert.ok(!pickupAdults(familia).some((m) => m.contact_id === 'h1'));
  assert.deepEqual(pickupAdults([], 'h2'), []);
});

test('nombre y lugar sugeridos', () => {
  assert.equal(familyNameFor('Darío Ledesma'), 'Familia Ledesma');
  assert.equal(familyNameFor('  Noelia   Quiroga '), 'Familia Quiroga');
  assert.equal(familyNameFor('Tobías'), 'Familia');
  assert.equal(familyNameFor(null), 'Familia');
  assert.equal(suggestRole({ sex: 'f', age: 9 }), 'hija');
  assert.equal(suggestRole({ sex: null, age: 9 }), 'hijo');
  assert.equal(suggestRole({ sex: 'm', age: 40 }), 'padre');
  assert.equal(suggestRole({ sex: 'f', age: null }), 'madre');
  assert.equal(suggestRole({}), 'otro');
});

test('agrupar por familia: familias por nombre y al final los que no tienen', () => {
  const personas = [
    { id: '1', nombre: 'Zulma Paz', fam: null },
    { id: '2', nombre: 'Darío Ledesma', fam: { id: 'f2', name: 'Familia Ledesma' } },
    { id: '3', nombre: 'Ciro Acuña', fam: { id: 'f1', name: 'Familia Acuña' } },
    { id: '4', nombre: 'Noelia Quiroga', fam: { id: 'f2', name: 'Familia Ledesma' } },
  ];
  const g = groupByFamily(personas, (p) => p.fam);
  assert.deepEqual(g.map((x) => x.title), ['Familia Acuña', 'Familia Ledesma', 'Sin familia cargada']);
  assert.deepEqual(g[1].rows.map((p) => p.id), ['2', '4']);
  assert.deepEqual(g[2].rows.map((p) => p.id), ['1']);
  // no se pierde ni se repite nadie
  assert.equal(g.reduce((n, x) => n + x.rows.length, 0), personas.length);
  // si todos tienen familia, no aparece el grupo "sin familia"
  assert.equal(groupByFamily(personas.slice(1), (p) => p.fam).length, 2);
});
