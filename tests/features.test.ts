import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_PARTS, CORE_ROUTES, FEATURES, FEATURE_GROUPS, childrenOf, cleanDisabled, cleanPath, countOn, featureInfo, featureOfPath, featureOn, pathOn, searchFeatures, switchesChanged, toggled, topFeatures } from '../src/lib/features';
import { DESK_NAV, deskNavFor } from '../src/lib/desk';

test('cada función tiene nombre, explicación, qué oculta y pantallas sin repetir', () => {
  const keys = new Set<string>();
  const routes = new Set<string>();
  for (const f of FEATURES) {
    assert.ok(f.label.length > 3 && f.hint.length > 10 && f.hides.length > 10, f.key);
    assert.ok(FEATURE_GROUPS.includes(f.group), f.key);
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

// ---------- Padres e hijos ----------
test('las partes cuelgan de una función principal del mismo grupo, y nunca de otra parte', () => {
  for (const f of FEATURES) {
    if (!f.parent) continue;
    const p = featureInfo(f.parent);
    assert.ok(p, `${f.key}: no existe ${f.parent}`);
    assert.equal(p.parent, undefined, `${f.key}: su principal no puede ser una parte`);
    assert.equal(p.group, f.group, f.key);
  }
  assert.deepEqual(childrenOf('oracion').map((f) => f.key), ['oracion_respondidas']);
  assert.ok(topFeatures('Dinero e informes').some((f) => f.key === 'ofrendas_persona'));
  // Entre todos los grupos están todas las funciones, una sola vez.
  const all = FEATURE_GROUPS.flatMap((g) => topFeatures(g).flatMap((f) => [f.key, ...childrenOf(f.key).map((c) => c.key)]));
  assert.deepEqual([...all].sort(), FEATURES.map((f) => f.key).sort());
});

test('con la principal apagada, sus partes quedan apagadas; al prenderla vuelven como estaban', () => {
  assert.equal(featureOn(['eventos'], 'evento_puerta'), false);
  assert.equal(pathOn(['eventos'], '/evento/puerta'), false);
  assert.equal(pathOn(['eventos'], '/e/mi-evento'), false);
  // La parte apagada sola no apaga a la principal ni a sus hermanas.
  assert.equal(featureOn(['evento_puerta'], 'eventos'), true);
  assert.equal(pathOn(['evento_puerta'], '/evento/abc'), true);
  assert.equal(pathOn(['evento_puerta'], '/evento/puerta'), false);
  assert.equal(pathOn(['evento_puerta'], '/evento/credenciales'), true);
  // Lo guardado no cambia: al prender la principal, la parte que estaba apagada sigue apagada y la otra prendida.
  const back = toggled(toggled(['evento_puerta'], 'eventos', false), 'eventos', true);
  assert.deepEqual(back, ['evento_puerta']);
  assert.equal(countOn([]), FEATURES.length);
  assert.equal(countOn(['biblia']), FEATURES.length - 1 - childrenOf('biblia').length);
});

test('las ofrendas por persona van aparte de las finanzas de la iglesia', () => {
  const off = ['ofrendas_persona'];
  assert.equal(pathOn(off, '/finanzas'), true);
  assert.equal(pathOn(off, '/finanzas/movimiento'), true);
  assert.equal(pathOn(off, '/finanzas/ofrendas'), false);
  assert.equal(pathOn(off, '/finanzas/ofrenda-estado'), false);
  assert.equal(pathOn(off, '/mis-ofrendas'), false);
  assert.equal(pathOn(['finanzas'], '/mis-ofrendas'), true);
  const items = (o: string[]) => deskNavFor(['fin.ver'], o).flatMap((g) => g.items).map((i) => i.key);
  assert.ok(items(off).includes('finanzas') && !items(off).includes('ofrendas'));
});

test('lo que se pidió poder apagar por separado tiene su propio interruptor', () => {
  const want: Record<string, string> = {
    '/familia-ubicacion': 'ubicacion_familia', '/presentar': 'presentar', '/culto': 'culto', '/preguntas': 'preguntas', '/oraciones-respondidas': 'oracion_respondidas',
    '/predica/mis-notas': 'predica_notas', '/discipulado': 'discipulado', '/decisiones': 'decisiones', '/tarjeta-visita': 'tarjeta_visita', '/visita/x': 'tarjeta_visita',
    '/bienvenida': 'bienvenida', '/clase-miembros': 'clase_miembros', '/certificado/x': 'bautismos', '/clase/versiculos': 'clase_versiculos', '/clase/lecciones': 'clase_lecciones',
    '/colectivo': 'colectivo', '/colectivo-paradas': 'colectivo_paradas', '/colectivo-vivo': 'colectivo_vivo', '/ninos': 'ninos', '/chips': 'asistencia_chips', '/asistencia-chip': 'asistencia_chips',
    '/eventos': 'eventos', '/evento/puerta': 'evento_puerta', '/evento/credenciales': 'evento_credenciales', '/evento/contador': 'evento_contador', '/evento/plan': 'evento_plan',
    '/chat': 'chat', '/directorio': 'directorio', '/misioneros': 'misioneros', '/radio': 'radio', '/musica': 'musica', '/vivo': 'vivo', '/devocional': 'devocional',
    '/plan-lectura': 'plan_lectura', '/biblia': 'biblia', '/biblia/buscar': 'biblia_buscar', '/biblia/imagen': 'biblia_imagen', '/biblia/marcas': 'biblia_marcas',
    '/mapa': 'evangelismo', '/zonas': 'evang_zonas', '/salidas': 'evangelismo', '/seguimiento': 'seguimiento', '/asistencia': 'asistencia', '/ausencias': 'ausencias',
    '/reporte': 'informes', '/finanzas/ofrendas': 'ofrendas_persona', '/mis-ofrendas': 'ofrendas_persona',
  };
  for (const [path, key] of Object.entries(want)) assert.equal(featureOfPath(path), key, path);
  for (const k of ['hogares', 'biblia_referencias', 'biblia_originales', 'biblia_audio'] as const) assert.ok(featureInfo(k), k);
  // La copia de todos los datos y los ajustes de siempre no dependen de ningún interruptor.
  for (const p of ['/admin/copia', '/admin/funciones', '/admin/roles', '/admin/reuniones', '/admin/alta', '/ajustes', '/login', '/personas', '/contacto/abc', '/avisos']) assert.equal(featureOfPath(p), null, p);
  assert.ok(CORE_PARTS.length >= 6 && CORE_PARTS.every((c) => c.label.length > 3 && c.why.length > 10));
});

// ---------- Menús: cada botón tiene su interruptor, o es de la base de la app ----------
const isCore = (r: string) => CORE_ROUTES.some((c) => r === c || r.startsWith(`${c}/`));
test('cada entrada del menú del escritorio tiene su interruptor o es de la base', () => {
  const loose = DESK_NAV.flatMap((g) => g.items).filter((i) => featureOfPath(i.to) === null && !isCore(cleanPath(i.to))).map((i) => i.to);
  assert.deepEqual(loose, []);
  // Y lo apagado desaparece: con todo apagado solo queda lo de la base.
  const all = FEATURES.map((f) => f.key);
  const perms = [...new Set(DESK_NAV.flatMap((g) => g.items).flatMap((i) => i.perms))];
  for (const i of deskNavFor(perms, all).flatMap((g) => g.items)) assert.ok(isCore(cleanPath(i.to)), i.to);
});

test('cada botón del menú del teléfono tiene su interruptor o es de la base', () => {
  const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'iglesia.tsx'), 'utf8');
  const start = src.indexOf('const groups: Group[] = [');
  const end = src.indexOf('// El menú: cada uno lo ordena');
  assert.ok(start > 0 && end > start, 'no encontré la lista de botones del menú');
  // Incluye el botón de ministerios, que se arma un poco antes.
  const block = src.slice(src.indexOf('const ministryTile'), end);
  const tos = [...block.matchAll(/(?:to|pathname): '([^']+)'/g)].map((m) => m[1].replace(/\/\[[^\]]+\]/g, '/x'));
  assert.ok(tos.length > 55, `pocos botones: ${tos.length}`);
  const loose = tos.filter((t) => featureOfPath(t) === null && !isCore(cleanPath(t)));
  assert.deepEqual(loose, []);
  // El menú pasa todos los botones por el filtro de funciones apagadas.
  assert.ok(src.includes("show: t.show && pathOn(church?.disabled_features, toPath(t.to))"));
});

// ---------- Buscador y aviso de cambios ----------
test('buscar una función por nombre o por lo que oculta, sin tildes', () => {
  assert.ok(searchFeatures('ofrendas').has('ofrendas_persona'));
  assert.ok(searchFeatures('BIBLIA').has('biblia'));
  const hit = searchFeatures('credenciales');
  assert.ok(hit.has('evento_credenciales') && hit.has('eventos'), 'una parte trae a su principal');
  assert.equal(searchFeatures('   ').size, 0);
  assert.equal(searchFeatures('zzzz no existe').size, 0);
});

test('los teléfonos se dan cuenta de que cambiaron las funciones o la Biblia', () => {
  assert.equal(switchesChanged({ disabled_features: ['a', 'b'] }, { disabled_features: ['b', 'a'] }), false);
  assert.equal(switchesChanged({ disabled_features: [] }, { disabled_features: null }), false);
  assert.equal(switchesChanged({ disabled_features: ['a'] }, { disabled_features: [] }), true);
  assert.equal(switchesChanged({ disabled_features: [], bible: { versions: ['kjv'], default: 'kjv' } }, { disabled_features: [], bible: null }), true);
  assert.equal(switchesChanged(null, { disabled_features: [] }), false);
});

// ---------- El servidor conoce las mismas funciones (avisos y tareas programadas) ----------
test('la base tiene cada pantalla en la misma función y cada parte con su principal', () => {
  const dir = join(__dirname, '..', 'supabase', 'migrations');
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  // Vale lo último que se escribió para cada pantalla (una migración nueva puede corregir a una vieja).
  const routes = new Map<string, string>();
  for (const m of sql.matchAll(/^\s*\('(\/[a-z0-9\-/]+)', '([a-z_]+)'\),?$/gm)) routes.set(m[1], m[2]);
  for (const f of FEATURES) for (const r of f.routes) assert.equal(routes.get(r), f.key, `Falta en una migración: ('${r}', '${f.key}') en feature_routes`);
  for (const [r, k] of routes) assert.ok(FEATURES.some((f) => f.key === k && f.routes.includes(r)), `La base tiene ${r} -> ${k} y la app no: hace falta una migración que lo corrija`);
  const parents = new Map<string, string>();
  for (const m of sql.matchAll(/^\s*when '([a-z_]+)' then '([a-z_]+)'$/gm)) parents.set(m[1], m[2]);
  for (const f of FEATURES) assert.equal(parents.get(f.key), f.parent, `feature_parent('${f.key}') en la base no coincide`);
});

