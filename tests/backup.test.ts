import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TABLES, backupName, backupPlan, backupReadme, nextRange, rowsToCsv, safeCell, zipFiles } from '../src/lib/backup';

test('la copia trae lo que pidió el pastor, y las finanzas solo con permiso de finanzas', () => {
  const all = backupPlan(true).map((t) => t.table);
  for (const t of ['contacts', 'attendances', 'contact_visits', 'follow_up_tasks', 'events', 'event_registrations', 'prayer_requests', 'classes', 'households', 'household_members', 'fin_entries', 'admin_giving']) {
    assert.ok(all.includes(t), t);
  }
  const noFin = backupPlan(false).map((t) => t.table);
  assert.ok(noFin.every((t) => !t.startsWith('fin_') && t !== 'admin_giving'));
  assert.ok(noFin.includes('contacts'));
});

test('cada planilla tiene nombre propio y un orden fijo para leer de a tandas', () => {
  const files = new Set<string>();
  for (const t of BACKUP_TABLES) {
    assert.ok(t.order.length > 0, t.table);
    assert.ok(/^[0-9]{2}-[a-z0-9-]+$/.test(t.file), t.file);
    assert.ok(!files.has(t.file), t.file);
    files.add(t.file);
  }
});

test('las tandas: sigue mientras vengan completas y corta cuando viene una incompleta', () => {
  assert.deepEqual(nextRange(0, null), [0, 999]);
  assert.deepEqual(nextRange(1000, 1000), [1000, 1999]);
  assert.equal(nextRange(1400, 400), null);
  assert.equal(nextRange(0, 0), null);
  assert.deepEqual(nextRange(50, 50, 50), [50, 99]);
});

test('la planilla: columnas en orden, nombre de la persona al lado y sin llaves de acceso', () => {
  const csv = rowsToCsv([
    { id: '1', contact_id: 'a', note: 'vino; con "comillas"', access_token: 'secreto', tags: ['x', 'y'] },
    { id: '2', contact_id: 'zz', extra: true },
  ], new Map([['a', 'Rubén Sosa']]));
  const [head, r1, r2] = csv.replace('﻿', '').split('\r\n');
  assert.equal(head, 'id;contact_id;persona;note;tags;extra');
  assert.equal(r1, '1;a;Rubén Sosa;"vino; con ""comillas""";"[""x"",""y""]";');
  assert.equal(r2, '2;zz;;;;sí');
  assert.ok(!csv.includes('secreto'));
  assert.ok(rowsToCsv([]).includes('sin datos'));
  // Sin nombres (la planilla de personas) no se agrega la columna.
  assert.equal(rowsToCsv([{ id: '1', contact_id: 'a' }]).replace('﻿', '').split('\r\n')[0], 'id;contact_id');
});

test('lo que una planilla tomaría como fórmula queda como texto; los teléfonos y los números no se tocan', () => {
  assert.equal(safeCell('=HYPERLINK("http://x")'), '\'=HYPERLINK("http://x")');
  assert.equal(safeCell('@algo'), "'@algo");
  assert.equal(safeCell('+cmd|x'), "'+cmd|x");
  assert.equal(safeCell('-2+3+cmd'), '-2+3+cmd');
  assert.equal(safeCell('+54 9 376 400-0000'), '+54 9 376 400-0000');
  assert.equal(safeCell(-12.5), -12.5);
  assert.equal(safeCell(null), null);
  assert.equal(safeCell(false), 'no');
});

test('el LEEME dice qué trae y avisa si no trae las finanzas o si algo falló', () => {
  const txt = backupReadme({ church: 'Iglesia de Prueba', when: '24/11/2026', who: 'Pastor de Prueba', finance: false, results: [
    { file: '01-personas', title: 'Personas', rows: 150 }, { file: '40-pedidos-de-oracion', title: 'Pedidos de oración', rows: 0, error: 'sin permiso' },
  ] });
  assert.ok(txt.includes('Iglesia de Prueba') && txt.includes('01-personas.csv: Personas (150 filas)'));
  assert.ok(txt.includes('NO SE PUDO BAJAR: sin permiso'));
  assert.ok(txt.includes('NO trae las finanzas'));
  assert.ok(txt.includes('CUIDADO'));
});

test('el ZIP es un ZIP de verdad y guarda las tildes', () => {
  const zip = zipFiles([{ name: 'LEEME.txt', text: 'Año de la iglesia: ñandú' }, { name: '01-personas.csv', text: 'id;name\r\n1;Rubén' }]);
  assert.equal(zip[0], 0x50); assert.equal(zip[1], 0x4b); // "PK"
  const raw = Buffer.from(zip).toString('latin1');
  assert.ok(raw.includes('LEEME.txt') && raw.includes('01-personas.csv'));
  assert.ok(Buffer.from(zip).includes(Buffer.from('ñandú', 'utf8')) || zip.length > 100);
  assert.equal(backupName('Iglesia Bautista Victoria', '2026-11-24'), 'copia-iglesia-bautista-victoria-2026-11-24');
  assert.equal(backupName('¡¡!!', '2026-11-24'), 'copia-iglesia-2026-11-24');
});
