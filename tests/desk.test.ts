import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOf, canUseDesk, daysSince, delta, deskNavFor, filterPeople, mondayOf, sortPeople, toCsv, type DeskPerson, type PersonFilter } from '../src/lib/desk';

const p = (o: Partial<DeskPerson> & { id: string; name: string }): DeskPerson => ({
  status: 'member', phone: null, email: null, address: null, address_hint: null, group_id: null, birthdate: null, age: null,
  baptized: false, baptized_on: null, member_since: null, created_at: '2026-01-01T00:00:00Z', profile_id: null, ...o,
});
const F: PersonFilter = { q: '', status: 'all', group: 'all', extra: 'all' };
const today = new Date(2026, 10, 12);

test('el escritorio es para quien ve a todos, el panel, las finanzas o administra', () => {
  assert.equal(canUseDesk([]), false);
  assert.equal(canUseDesk(['com.anuncios', 'ens.ver']), false);
  assert.equal(canUseDesk(['inf.panel']), true);
  assert.equal(canUseDesk(['fin.ver']), true);
  assert.equal(canUseDesk(['admin.iglesia']), true);
});

test('el menú muestra solo lo que cada uno puede abrir', () => {
  const keys = (perms: string[]) => deskNavFor(perms).flatMap((g) => g.items.map((i) => i.key));
  const deacon = keys(['personas.ver_todas', 'personas.asistencia', 'personas.privados', 'ens.ver', 'inf.panel']);
  assert.ok(deacon.includes('personas') && deacon.includes('asistencia') && deacon.includes('reporte'));
  assert.ok(!deacon.includes('finanzas') && !deacon.includes('roles') && !deacon.includes('importar'));
  assert.ok(keys(['fin.ver']).includes('finanzas'));
  assert.ok(!deskNavFor(['fin.ver']).some((g) => g.items.length === 0));
});

test('busca sin importar acentos ni mayúsculas, en nombre, teléfono y domicilio', () => {
  const rows = [p({ id: '1', name: 'José Pérez', phone: '3764 111' }), p({ id: '2', name: 'Ana', address: 'Av. Uruguay 100' })];
  const last = new Map<string, string | null>();
  assert.deepEqual(filterPeople(rows, { ...F, q: 'jose perez' }, last).map((r) => r.id), ['1']);
  assert.deepEqual(filterPeople(rows, { ...F, q: 'URUGUAY' }, last).map((r) => r.id), ['2']);
  assert.deepEqual(filterPeople(rows, { ...F, q: '3764' }, last).map((r) => r.id), ['1']);
});

test('filtra por estado, grupo y lo que falta', () => {
  const rows = [
    p({ id: '1', name: 'A', status: 'member', group_id: 'g1', baptized: true, phone: '1', profile_id: 'u' }),
    p({ id: '2', name: 'B', status: 'visitor' }),
    p({ id: '3', name: 'C', status: 'contact', group_id: 'g1' }),
  ];
  const last = new Map<string, string | null>([['1', '2026-11-08'], ['2', '2026-09-01']]);
  const ids = (f: Partial<PersonFilter>) => filterPeople(rows, { ...F, ...f }, last, today).map((r) => r.id);
  assert.deepEqual(ids({ status: 'visitor' }), ['2']);
  assert.deepEqual(ids({ group: 'g1' }), ['1', '3']);
  assert.deepEqual(ids({ group: 'none' }), ['2']);
  assert.deepEqual(ids({ extra: 'unbaptized' }), ['2', '3']);
  assert.deepEqual(ids({ extra: 'no_phone' }), ['2', '3']);
  assert.deepEqual(ids({ extra: 'no_account' }), ['2', '3']);
  // Ausente: miembro o visita que hace 3 semanas o más que no viene (o nunca vino). Los contactos de la calle no cuentan.
  assert.deepEqual(ids({ extra: 'absent' }), ['2']);
});

test('ordena y deja al final a los que no tienen el dato', () => {
  const rows = [p({ id: '1', name: 'Beto', age: 40 }), p({ id: '2', name: 'Ana' }), p({ id: '3', name: 'Caro', age: 20 })];
  const ctx = { groupName: new Map<string, string>(), last: new Map<string, string | null>([['1', '2026-11-01'], ['3', '2026-11-08']]), pct: new Map<string, number>() };
  assert.deepEqual(sortPeople(rows, 'name', 1, ctx).map((r) => r.id), ['2', '1', '3']);
  assert.deepEqual(sortPeople(rows, 'name', -1, ctx).map((r) => r.id), ['3', '1', '2']);
  assert.deepEqual(sortPeople(rows, 'age', 1, ctx).map((r) => r.id), ['3', '1', '2']);
  assert.deepEqual(sortPeople(rows, 'age', -1, ctx).map((r) => r.id), ['1', '3', '2']);
  assert.deepEqual(sortPeople(rows, 'last', -1, ctx).map((r) => r.id), ['3', '1', '2']);
});

test('edad por fecha de nacimiento y días desde la última vez', () => {
  assert.equal(ageOf({ birthdate: '1993-12-08', age: null }, today), 32);
  assert.equal(ageOf({ birthdate: '1993-11-12', age: null }, today), 33);
  assert.equal(ageOf({ birthdate: null, age: 50 }, today), 50);
  assert.equal(daysSince('2026-11-05', today), 6);
  assert.equal(daysSince(null, today), null);
});

test('CSV para Excel: punto y coma, comillas dobladas', () => {
  const csv = toCsv(['Nombre', 'Nota'], [['Ana', 'dijo "hola"; vino'], ['Beto', null]]);
  assert.equal(csv, '﻿Nombre;Nota\r\nAna;"dijo ""hola""; vino"\r\nBeto;');
});

test('cambio contra la semana anterior y lunes de la semana', () => {
  assert.deepEqual(delta(10, 7), { text: '+3', dir: 'up' });
  assert.deepEqual(delta(5, 7), { text: '−2', dir: 'down' });
  assert.deepEqual(delta(5, 5), { text: 'igual', dir: 'same' });
  assert.equal(delta(5, null), null);
  assert.equal(mondayOf(new Date(2026, 10, 12)), '2026-11-09');
  assert.equal(mondayOf(new Date(2026, 10, 15)), '2026-11-09');
  assert.equal(mondayOf(new Date(2026, 10, 9)), '2026-11-09');
});
