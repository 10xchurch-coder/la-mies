import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityLabel, autoDone, BASIC_ON, cleanFacts, COUNTRIES, draftFromMeta, helpLinks, joinLink, joinMessage, LA_MIES_TEAM, NO_FACTS, presetChanges, presetOff,
  PRESETS, progress, signupProblems, SIZES, STEPS, stepState, timezoneForCountry, type Facts, type SignupForm,
} from '../src/lib/alta';
import { FEATURES, featureOfPath, isFeatureKey, CORE_ROUTES } from '../src/lib/features';

const OK: SignupForm = { church: 'Iglesia Bautista Esperanza', city: 'Oberá', province: 'Misiones', country: 'AR', pastor: 'Ramiro Inventado', email: 'ramiro@ejemplo.com', whatsapp: '376 400-0001', size: '31-80' };

test('el formulario de /empezar: bien lleno no tiene problemas', () => {
  assert.deepEqual(signupProblems(OK), {});
  assert.deepEqual(signupProblems({ ...OK, province: '', size: '' }), {});
});

test('el formulario avisa qué falta, campo por campo', () => {
  assert.ok(signupProblems({ ...OK, church: 'ab' }).church);
  assert.ok(signupProblems({ ...OK, church: '12345' }).church);
  assert.ok(signupProblems({ ...OK, church: 'Mirá http://cosa.com' }).church);
  assert.ok(signupProblems({ ...OK, church: 'x'.repeat(121) }).church);
  assert.ok(signupProblems({ ...OK, city: ' ' }).city);
  assert.ok(signupProblems({ ...OK, country: 'ZZ' }).country);
  assert.ok(signupProblems({ ...OK, pastor: 'R' }).pastor);
  assert.ok(signupProblems({ ...OK, email: 'ramiro@' }).email);
  assert.ok(signupProblems({ ...OK, whatsapp: '400-0001' }).whatsapp); // en Argentina, con el código de área
  assert.equal(signupProblems({ ...OK, country: 'PY', whatsapp: '0981 123456' }).whatsapp, undefined);
  assert.equal(signupProblems({ ...OK, whatsapp: '+595 981 123456' }).whatsapp, undefined);
  assert.ok(signupProblems({ ...OK, country: 'PY', whatsapp: '12345' }).whatsapp);
});

test('la zona horaria sale del país', () => {
  assert.equal(timezoneForCountry('AR'), 'America/Argentina/Buenos_Aires');
  assert.equal(timezoneForCountry('py'), 'America/Asuncion');
  assert.equal(timezoneForCountry('XX'), 'America/Argentina/Buenos_Aires');
  assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length);
  for (const c of COUNTRIES) assert.match(c.code, /^[A-Z]{2}$/);
  // Los tamaños son los mismos que acepta la base (0084).
  assert.deepEqual(SIZES.map((s) => s.value), ['1-30', '31-80', '81-200', '201-500', '500+']);
});

test('los datos guardados con la cuenta mientras se confirma el correo', () => {
  assert.equal(draftFromMeta(null), null);
  assert.equal(draftFromMeta({ display_name: 'x', join_code: 'ABC' }), null);
  assert.equal(draftFromMeta({ alta: { church: 'Iglesia' } }), null);
  const d = draftFromMeta({ alta: { church: 'Iglesia Uno', pastor: 'Ramiro', city: 'Oberá', whatsapp: '376', size: 5 } });
  assert.deepEqual(d, { church: 'Iglesia Uno', city: 'Oberá', province: '', country: 'AR', pastor: 'Ramiro', whatsapp: '376', size: '' });
});

const facts = (o: Partial<Facts> = {}): Facts => ({ ...NO_FACTS, ...o });

test('la lista tiene 8 pasos, cada uno con su porqué', () => {
  assert.equal(STEPS.length, 8);
  assert.equal(new Set(STEPS.map((s) => s.key)).size, 8);
  for (const s of STEPS) { assert.ok(s.title.length > 5); assert.ok(s.why.length > 20 && s.why.endsWith('.'), s.key); assert.match(s.key, /^[a-z_]{2,24}$/); }
});

test('estado de cada paso: lo guardado, y lo que la app sabe sola', () => {
  assert.equal(stepState('iglesia', {}, facts()), 'todo');
  assert.equal(stepState('iglesia', { iglesia: 'done' }, facts()), 'done');
  assert.equal(stepState('personas', { personas: 'skipped' }, facts()), 'skipped');
  assert.equal(stepState('personas', { personas: 'cualquiera' }, facts()), 'todo');
  assert.equal(stepState('personas', null, facts({ people: 4 })), 'todo');
  assert.equal(stepState('personas', null, facts({ people: 5 })), 'done');
  // Lo que pasó de verdad gana sobre "lo salteo".
  assert.equal(stepState('personas', { personas: 'skipped' }, facts({ people: 40 })), 'done');
  assert.equal(stepState('lideres', {}, facts({ leaders: 1 })), 'done');
  assert.equal(stepState('domingo', {}, facts({ attendance: 3 })), 'done');
  assert.equal(autoDone('iglesia', facts({ logo: true })), false); // el nombre y la ciudad los confirma el pastor
  assert.equal(autoDone('codigo', facts({ accounts: 50 })), false);
});

test('el avance: "4 de 8 pasos", cuál sigue y cuándo termina', () => {
  const p0 = progress({}, facts());
  assert.deepEqual([p0.done, p0.skipped, p0.resolved, p0.finished, p0.next, p0.label], [0, 0, 0, false, 'iglesia', '0 de 8 pasos']);
  const p4 = progress({ iglesia: 'done', reuniones: 'done', funciones: 'done', personas: 'skipped' }, facts());
  assert.deepEqual([p4.done, p4.skipped, p4.label, p4.next, p4.finished], [3, 1, '4 de 8 pasos', 'lideres', false]);
  const all = Object.fromEntries(STEPS.map((s) => [s.key, s.canSkip ? 'skipped' : 'done']));
  const pf = progress(all, facts());
  assert.equal(pf.finished, true); assert.equal(pf.next, null); assert.equal(pf.label, '8 de 8 pasos');
  // Un paso de más en la base (de una versión futura) no rompe la cuenta.
  assert.equal(progress({ ...all, otro: 'done' }, facts()).resolved, 8);
  assert.equal(progress(undefined, facts({ people: 10, leaders: 2, attendance: 1, accounts: 5 })).done, 4);
});

test('cleanFacts aguanta cualquier cosa que venga de la base', () => {
  assert.deepEqual(cleanFacts(null), NO_FACTS);
  assert.deepEqual(cleanFacts({ logo: true, people: '12', accounts: -3, leaders: 1.9, last_activity: '2026-11-01T10:00:00Z', features_set: 'si' }),
    { logo: true, people: 12, accounts: 0, leaders: 1, services: 0, attendance: 0, features_set: false, last_activity: '2026-11-01T10:00:00Z' });
});

test('los tres modelos de funciones', () => {
  assert.deepEqual(PRESETS.map((p) => p.key), ['basico', 'completa', 'elijo']);
  for (const k of BASIC_ON) assert.ok(isFeatureKey(k), k);
  const basic = presetOff('basico');
  assert.equal(basic.length, FEATURES.length - BASIC_ON.length);
  assert.ok(!basic.includes('asistencia') && basic.includes('finanzas') && basic.includes('radio'));
  const full = presetOff('completa');
  assert.ok(full.length <= 4 && !full.includes('finanzas'));
  for (const k of full) assert.ok(isFeatureKey(k), k);
  assert.deepEqual(presetOff('elijo', ['chat', 'nada']), ['chat']);
});

test('los cambios para pasar a un modelo: solo lo que cambia', () => {
  assert.deepEqual(presetChanges([], []), []);
  assert.deepEqual(presetChanges(['radio', 'chat'], ['radio']), [{ key: 'chat', enabled: true }]);
  assert.deepEqual(presetChanges(['radio'], ['radio', 'vivo']), [{ key: 'vivo', enabled: false }]);
  const toBasic = presetChanges(['vivo', 'musica', 'radio'], presetOff('basico'));
  assert.equal(toBasic.length, FEATURES.length - BASIC_ON.length - 3);
  assert.ok(toBasic.every((c) => c.enabled === false));
  // Aplicar los cambios deja exactamente lo que se quería.
  const now = new Set<string>(['chat', 'radio']);
  for (const c of presetChanges([...now], presetOff('completa'))) { if (c.enabled) now.delete(c.key); else now.add(c.key); }
  assert.deepEqual([...now].sort(), [...presetOff('completa')].sort());
});

test('el mensaje para compartir el código', () => {
  assert.equal(joinLink('https://ejemplo.org/la-mies/', ' esperanza-2026 '), 'https://ejemplo.org/la-mies/registro?invitacion=ESPERANZA-2026');
  const m = joinMessage({ church: 'Iglesia Esperanza', code: 'esperanza-2026', webUrl: 'https://ejemplo.org/la-mies' });
  assert.ok(m.includes('Iglesia Esperanza') && m.includes('ESPERANZA-2026') && m.includes('https://ejemplo.org/la-mies/registro?invitacion=ESPERANZA-2026'));
  assert.ok(!m.includes('Android'));
  const withStores = joinMessage({ church: 'X', code: 'ABCDEF', webUrl: 'https://a.b', stores: { ios: 'https://apple.ejemplo/app', android: 'https://play.ejemplo/app' } });
  assert.ok(withStores.includes('https://apple.ejemplo/app') && withStores.includes('https://play.ejemplo/app'));
});

test('"Necesito ayuda": un solo lugar para el contacto, sin nombres ni teléfonos personales', () => {
  assert.equal(LA_MIES_TEAM.email, 'info@iglesiavictoria.com');
  assert.equal(LA_MIES_TEAM.whatsapp, '');
  const h = helpLinks({ church: 'Iglesia Esperanza', step: 'Traé a tu gente' });
  assert.ok(h.mailto.startsWith('mailto:info@iglesiavictoria.com?subject='));
  assert.equal(h.whatsapp, null);
  assert.ok(h.text.includes('Iglesia Esperanza') && h.text.includes('Traé a tu gente'));
  const w = helpLinks({ team: { name: 'equipo', email: 'a@b.co', whatsapp: '+54 9 11 0000-0000' } });
  assert.ok(w.whatsapp?.startsWith('https://wa.me/5491100000000?text='));
});

test('último movimiento en palabras', () => {
  const now = new Date('2026-11-20T15:00:00Z');
  assert.equal(activityLabel(null, now), 'sin movimiento');
  assert.equal(activityLabel('2026-11-20T09:00:00Z', now), 'hoy');
  assert.equal(activityLabel('2026-11-19T10:00:00Z', now), 'ayer');
  assert.equal(activityLabel('2026-11-10T15:00:00Z', now), 'hace 10 días');
  assert.equal(activityLabel('cualquier cosa', now), 'sin movimiento');
});

test('las pantallas nuevas son de la base de la app (no se pueden apagar)', () => {
  for (const r of ['/empezar', '/admin/alta', '/admin/importar', '/admin/importar-ayuda', '/admin/importacion', '/admin/cartel']) {
    assert.equal(featureOfPath(r), null, r);
    assert.ok(CORE_ROUTES.some((c) => r === c || r.startsWith(`${c}/`)), r);
  }
});
