import test from 'node:test';
import assert from 'node:assert/strict';
import { areaOf } from '../src/lib/areas';

test('cada pantalla toma el color de su área', () => {
  assert.equal(areaOf(['finanzas', 'movimiento']), 'pink');
  assert.equal(areaOf(['(tabs)', 't-chat']), 'violet');
  assert.equal(areaOf(['admin', 'miembros']), 'amber');
  assert.equal(areaOf(['admin', 'roles']), 'pink');
  assert.equal(areaOf(['seguimiento']), 'amber');
  assert.equal(areaOf(['algo-nuevo']), 'green');
});

// Cada pantalla del menú del escritorio se pinta con el color de su grupo: el menú y la pantalla tienen que coincidir.
import { DESK_NAV } from '../src/lib/desk';
test('el color de cada pantalla coincide con su grupo en el menú', () => {
  for (const g of DESK_NAV) for (const i of g.items) {
    if (i.to === '/escritorio' || i.to === '/escritorio/asistencia') continue;
    assert.equal(areaOf(i.to.split('/').filter(Boolean)), g.tone, `${i.label} (${i.to})`);
  }
});
// Lo mismo para el menú del teléfono: se leen los grupos del archivo.
import { readFileSync } from 'node:fs';
test('el menú del teléfono usa los mismos colores', () => {
  const src = readFileSync('app/(tabs)/iglesia.tsx', 'utf8');
  let tone = '';
  for (const line of src.split('\n')) {
    const t = line.match(/title: '[^']+', tone: '(\w+)'/); if (t) tone = t[1];
    const r = line.match(/to: '(\/[^'?]+)/);
    if (r && tone && /icon: '/.test(line)) assert.equal(areaOf(r[1].split('/').filter(Boolean)), tone, line.trim().slice(0, 80));
  }
});
