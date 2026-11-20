import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_ROUTES, FEATURES, cleanDisabled, cleanPath, featureOfPath, featureOn, pathOn, toggled } from '../src/lib/features';
import { deskNavFor } from '../src/lib/desk';

test('cada función tiene nombre, explicación y pantallas, sin repetir', () => {
  const keys = new Set<string>();
  const routes = new Set<string>();
  for (const f of FEATURES) {
    assert.ok(f.label.length > 3 && f.hint.length > 10 && f.routes.length > 0, f.key);
    assert.ok(!keys.has(f.key), `repetida ${f.key}`);
    keys.add(f.key);
    for (const r of f.routes) { assert.ok(r.startsWith('/'), r); assert.ok(!routes.has(r), `pantalla repetida ${r}`); routes.add(r); }
  }
});

test('cleanPath y featureOfPath', () => {
  assert.equal(cleanPath('/(tabs)/mapa?x=1'), '/mapa');
  assert.equal(cleanPath('finanzas/'), '/finanzas');
  assert.equal(featureOfPath('/finanzas/movimiento'), 'finanzas');
  assert.equal(featureOfPath('/salida'), 'evangelismo');
  assert.equal(featureOfPath('/salidas'), 'evangelismo');
  assert.equal(featureOfPath('/salida-chat'), 'evangelismo');
  assert.equal(featureOfPath('/escritorio/asistencia'), 'asistencia');
  assert.equal(featureOfPath('/escritorio/personas'), null);
  assert.equal(featureOfPath('/misioneros/abc'), 'misioneros');
  assert.equal(featureOfPath('/ajustes'), null);
  assert.equal(featureOfPath('/admin/funciones'), null);
  assert.equal(featureOfPath('/admin/roles'), null);
});

test('lo apagado se bloquea y lo demás sigue', () => {
  const off = ['finanzas', 'evangelismo'];
  assert.equal(pathOn(off, '/finanzas'), false);
  assert.equal(pathOn(off, '/finanzas/informe'), false);
  assert.equal(pathOn(off, '/mapa'), false);
  assert.equal(pathOn(off, '/eventos'), true);
  assert.equal(pathOn(off, '/ajustes'), true);
  assert.equal(pathOn(null, '/finanzas'), true);
  assert.equal(featureOn(undefined, 'chat'), true);
  assert.equal(featureOn(['chat'], 'chat'), false);
});

test('cleanDisabled y toggled', () => {
  assert.deepEqual(cleanDisabled(['chat', 'chat', 'nada', 5, 'finanzas']), ['chat', 'finanzas']);
  assert.deepEqual(cleanDisabled(null), []);
  assert.deepEqual(toggled(['chat'], 'finanzas', false), ['chat', 'finanzas']);
  assert.deepEqual(toggled(['chat', 'finanzas'], 'chat', true), ['finanzas']);
  assert.deepEqual(toggled([], 'chat', true), []);
});

// Si se agrega una pantalla nueva y nadie la puso en una función (ni en la base de la app), este test avisa.
function routesIn(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { out.push(...routesIn(full, `${base}/${name}`)); continue; }
    if (!/\.tsx?$/.test(name) || name.startsWith('_') || name.startsWith('+')) continue;
    const stem = name.replace(/\.tsx?$/, '');
    out.push((stem === 'index' ? base : `${base}/${stem}`).replace(/\/\([^/]*\)/g, '') || '/');
  }
  return out;
}
test('todas las pantallas de la app están en una función o en la base', () => {
  const all = routesIn(join(__dirname, '..', 'app'));
  assert.ok(all.length > 50);
  const loose = all.filter((r) => featureOfPath(r) === null && !CORE_ROUTES.some((c) => r === c || r.startsWith(`${c}/`)));
  assert.deepEqual(loose, [], `Pantallas sin función: ${loose.join(', ')}`);
});

test('el menú del escritorio puede esconder lo apagado', () => {
  const all = deskNavFor(['admin.permisos', 'fin.ver', 'inf.panel', 'personas.ver_todas', 'personas.editar', 'personas.asistencia', 'com.moderar', 'com.anuncios', 'ens.ver', 'devocional.editar', 'evang.ver_salidas', 'evang.zonas', 'admin.iglesia']);
  const items = all.flatMap((g) => g.items);
  const finance = items.find((i) => i.key === 'finanzas')!;
  assert.equal(featureOfPath(finance.to), 'finanzas');
  const missions = items.find((i) => i.key === 'misioneros')!;
  assert.equal(featureOfPath(missions.to), 'misioneros');
  const funciones = items.find((i) => i.key === 'funciones');
  assert.ok(funciones, 'el escritorio tiene el botón de Funciones');
  assert.equal(featureOfPath(funciones!.to), null);
});
