import test from 'node:test';
import assert from 'node:assert/strict';
import { draftGuide, guideQuestions, guideShareText, nextMeeting, parseGuide, sermonForMeeting } from '../src/lib/groupGuide';

test('guía: títulos con #, preguntas con - o número, y texto suelto', () => {
  const g = parseGuide('# Para empezar\n- ¿Qué te quedó?\n\n2) Otra\nUn comentario');
  assert.deepEqual(g.map((p) => p.kind), ['title', 'item', 'item', 'text']);
  assert.equal(g[0].text, 'Para empezar');
  assert.equal(g[2].text, 'Otra');
  assert.equal(guideQuestions('# A\n- uno\n- dos'), 2);
  assert.deepEqual(parseGuide(null), []);
});

test('borrador: usa el pasaje, los puntos del bosquejo y saca los espacios ___', () => {
  const d = draftGuide({ title: 'El hijo pródigo', passage: 'Lucas 15:11-32', notes_outline: 'El hijo pródigo\n1. El hijo se ___ de casa\n2. El padre lo esperaba (Lucas 15:20)' });
  assert.match(d, /# Para empezar/);
  assert.match(d, /"El hijo pródigo"/);
  assert.match(d, /- Lucas 15:11-32/);
  assert.match(d, /El hijo se … de casa: ¿qué nos enseña esto\?/);
  assert.ok(!d.includes('___'));
  assert.match(d, /# Oremos/);
  assert.ok(guideQuestions(d) >= 6);
});

test('borrador sin bosquejo: igual trae preguntas para repasar', () => {
  const d = draftGuide({ title: 'Fe' });
  assert.match(d, /idea principal/);
  assert.ok(!d.includes('Leamos juntos'));
});

test('para WhatsApp: títulos en negrita y viñetas', () => {
  const t = guideShareText('Grupo Centro', '# Para empezar\n- ¿Qué te quedó?');
  assert.equal(t, '*Grupo Centro*\n*Para empezar*\n• ¿Qué te quedó?');
});

test('próxima reunión: hoy si toca hoy; si no, el próximo día del grupo', () => {
  const mon = new Date(2026, 10, 23); // lunes 23/11/2026
  assert.equal(nextMeeting(['mon'], mon).getDate(), 23);
  assert.equal(nextMeeting(['wed'], mon).getDate(), 25);
  assert.equal(nextMeeting(['sun'], mon).getDate(), 29);
  assert.equal(nextMeeting([], mon).getDate(), 23);
});

test('la prédica que toca: la última hasta el día de la reunión', () => {
  const s = [{ preached_on: '2026-11-15' }, { preached_on: '2026-11-22' }, { preached_on: '2026-11-29' }];
  assert.equal(sermonForMeeting(s, '2026-11-25')?.preached_on, '2026-11-22');
  assert.equal(sermonForMeeting(s, '2026-11-29')?.preached_on, '2026-11-29');
  assert.equal(sermonForMeeting(s, '2026-11-01'), null);
});

test('borrador: el primer punto también cuenta y se sacan los números y los "(v. 3)"', () => {
  const d = draftGuide({ title: 'El buen pastor', passage: 'Juan 10:1-18', notes_outline: '1. El pastor ___ a sus ovejas (v. 3)\n2. Las ovejas ___ su voz (v. 4)\n   - un sub-punto' });
  assert.match(d, /- El pastor … a sus ovejas: ¿qué nos enseña esto\?/);
  assert.match(d, /- Las ovejas … su voz: ¿qué nos enseña esto\?/);
  assert.ok(!/\(v\./.test(d));
  assert.ok(!d.includes('sub-punto'));
});
