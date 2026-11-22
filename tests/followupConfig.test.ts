import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FOLLOWUP, fillMessage, followupOverrides, mergeFollowup, missedKind } from '../src/lib/followupConfig';

test('sin nada guardado, valen los valores de siempre: visitar después de la 2ª visita', () => {
  const c = mergeFollowup(null);
  assert.equal(c.visit_after_visits, 2);
  assert.equal(c.write_hours, 48);
  assert.equal(c.absent_visit_weeks, 2);
  assert.equal(c.disc_one_classes, 4);
  assert.equal(c.disc_course_classes, 13);
  assert.equal(c.messages.firstvisit, DEFAULT_FOLLOWUP.messages.firstvisit);
});
test('la iglesia cambia números y mensajes; lo raro o vacío vuelve al valor de siempre', () => {
  const c = mergeFollowup({ visit_after_visits: 3, write_hours: 'x', visit_days: 0, messages: { missed1: ' Hola {nombre}, te extrañamos. ', missed2: '   ', otro: 'x' } });
  assert.equal(c.visit_after_visits, 3);
  assert.equal(c.write_hours, 48);
  assert.equal(c.visit_days, 7);
  assert.equal(c.messages.missed1, 'Hola {nombre}, te extrañamos.');
  assert.equal(c.messages.missed2, DEFAULT_FOLLOWUP.messages.missed2);
});
test('se guarda solo lo que cambió', () => {
  assert.deepEqual(followupOverrides(mergeFollowup(null)), {});
  const c = mergeFollowup({ visit_days: 10, messages: { visit: 'Hola {nombre}' } });
  assert.deepEqual(followupOverrides(c), { visit_days: 10, messages: { visit: 'Hola {nombre}' } });
});
test('arma el mensaje con los datos de la persona', () => {
  assert.equal(fillMessage('Hola {nombre}, soy {yo} de {iglesia}. Te esperamos {cuando}. {otra}', { nombre: 'Ana', yo: 'Beto', iglesia: 'Victoria', cuando: 'el domingo a las 10:00' }),
    'Hola Ana, soy Beto de Victoria. Te esperamos el domingo a las 10:00. {otra}');
});
test('el mensaje cambia según cuánto faltó', () => {
  assert.deepEqual([1, 2, 3, 5].map(missedKind), ['missed1', 'missed2', 'missed3', 'missed3']);
});

test('{reuniones} lista el sábado y el domingo con su hora', async () => {
  const { serviceList } = await import('../src/lib/followupConfig');
  const s = (dow: number, time: string, main = true) => ({ id: String(dow), church_id: 'c', name: 'x', dow, time, main, active: true, sort_order: 0 });
  assert.equal(serviceList([s(0, '10:00'), s(6, '20:00'), s(6, '18:30', false)] as never), 'el sábado a las 20:00 y el domingo a las 10:00');
  assert.equal(serviceList([] as never), 'el domingo');
  assert.equal(fillMessage('Te esperamos {reuniones}.', { nombre: 'A', yo: 'B', iglesia: 'C', cuando: 'el domingo', reuniones: 'el sábado y el domingo' }), 'Te esperamos el sábado y el domingo.');
});
