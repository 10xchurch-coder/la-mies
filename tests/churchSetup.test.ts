import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDEAS, clampStep, cleanTime, inviteLink, inviteMessage, isPastorInvite, joinCodeProblem, missingIdeas, SERVICE_IDEAS, SETUP_STEPS, START_OFF, suggestJoinCode, TIMEZONES, VICTORIA_OFF } from '../src/lib/churchSetup';
import { isFeatureKey } from '../src/lib/features';

test('la invitación de pastor se reconoce por cómo empieza, y un código de miembros nunca empieza así', () => {
  assert.equal(isPastorInvite('PASTOR-ABCDEFGH2345'), true);
  assert.equal(isPastorInvite('  pastor-abcdefgh2345 '), true);
  assert.equal(isPastorInvite('VICTORIA-2026'), false);
  assert.equal(isPastorInvite(''), false);
  assert.equal(isPastorInvite(null), false);
  assert.match(joinCodeProblem('PASTOR-2026')!, /PASTOR/);
});

test('el código para los hermanos: letras, números y guiones, de 6 a 24', () => {
  assert.equal(joinCodeProblem(''), null); // vacío: la app inventa uno
  assert.equal(joinCodeProblem('esperanza-2026'), null);
  assert.ok(joinCodeProblem('CORTO'));
  assert.ok(joinCodeProblem('CON ESPACIO 1'));
  assert.ok(joinCodeProblem('-EMPIEZA-MAL'));
  assert.ok(joinCodeProblem('X'.repeat(25)));
});

test('la idea de código sale del nombre de la iglesia y siempre sirve', () => {
  assert.equal(suggestJoinCode('Iglesia Bautista Esperanza', 2027), 'ESPERANZA-2027');
  assert.equal(suggestJoinCode('Iglesia Bautista Fe y Gracia de Oberá', 2027), 'OBERA-2027');
  assert.equal(suggestJoinCode('', 2027), 'IGLESIA-2027');
  for (const n of ['Iglesia', 'La Fe', 'Misión Ñandú', 'Templo Bíblico El Buen Pastor']) assert.equal(joinCodeProblem(suggestJoinCode(n, 2027)), null, n);
});

test('el enlace y el mensaje de la invitación llevan el código', () => {
  const link = inviteLink('https://ejemplo.invalid/la-mies/', 'pastor-abcdefgh2345');
  assert.equal(link, 'https://ejemplo.invalid/la-mies/registro?invitacion=PASTOR-ABCDEFGH2345');
  const msg = inviteMessage({ church: 'Iglesia de Prueba', token: 'PASTOR-ABCDEFGH2345', link, days: 14 });
  assert.ok(msg.includes('Iglesia de Prueba') && msg.includes(link) && msg.includes('PASTOR-ABCDEFGH2345') && msg.includes('14 días'));
});

test('los valores de inicio existen y son funciones de verdad', () => {
  for (const k of [...VICTORIA_OFF, ...START_OFF]) assert.ok(isFeatureKey(k), k);
  assert.equal(new Set(START_OFF).size, START_OFF.length);
  // Nunca se apaga de entrada lo básico de una iglesia.
  for (const k of ['asistencia', 'seguimiento', 'anuncios', 'oracion', 'devocional']) assert.ok(!(START_OFF as string[]).includes(k), k);
  for (const s of SERVICE_IDEAS) { assert.ok(s.dow >= 0 && s.dow <= 6); assert.equal(cleanTime(s.time), s.time); }
  assert.ok(SERVICE_IDEAS.filter((s) => s.main).length >= 2);
  for (const c of CLASS_IDEAS) assert.ok(c.age_min < c.age_max);
  assert.equal(TIMEZONES[0].value, 'America/Argentina/Buenos_Aires');
  assert.equal(SETUP_STEPS.length, 5);
});

test('solo se ofrecen las ideas que la iglesia todavía no tiene', () => {
  const left = missingIdeas(SERVICE_IDEAS, [{ name: 'culto del sábado ' }, { name: 'Culto del domingo' }]);
  assert.ok(!left.some((s) => s.name === 'Culto del sábado'));
  assert.ok(left.some((s) => s.name === 'Jóvenes'));
  assert.deepEqual(missingIdeas(CLASS_IDEAS, CLASS_IDEAS), []);
});

test('el paso guardado y la hora se acomodan', () => {
  assert.equal(clampStep(null), 0);
  assert.equal(clampStep(-3), 0);
  assert.equal(clampStep(2), 2);
  assert.equal(clampStep(99), 4);
  assert.equal(cleanTime('9'), '09:00');
  assert.equal(cleanTime('19.5'), '19:05');
  assert.equal(cleanTime('19:30'), '19:30');
  assert.equal(cleanTime('25:00'), null);
  assert.equal(cleanTime('a las 8'), null);
});
