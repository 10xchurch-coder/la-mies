import test from 'node:test';
import assert from 'node:assert/strict';
import { adultProof, childPayload, cleanEntrance, cleanPickupCode, doorTotals, entranceLabel, fillPercent, parsePerson, parseTag, personPayload, pickupCheck, pickupPayload, scanFlash } from '../src/lib/tags';
import { ticketPayload } from '../src/lib/ticket';

const A = '0123456789abcdef0123456789abcdef';
const B = 'ffffffffffffffffffffffffffffffff';

test('lo que se graba en un chip se lee de vuelta', () => {
  assert.deepEqual(parseTag(personPayload(A)), { kind: 'persona', value: A });
  assert.deepEqual(parseTag(childPayload(A.toUpperCase())), { kind: 'nino', value: A });
  assert.deepEqual(parseTag(` ${pickupPayload(B)} `), { kind: 'retiro', value: B });
  assert.deepEqual(parseTag(ticketPayload('1a2b3c4d')), { kind: 'ticket', value: '1A2B3C4D' });
  assert.equal(parsePerson(personPayload(A)), A);
  assert.equal(parsePerson(childPayload(A)), null);
});

test('un chip vacío, de otra cosa o con la clave rota no sirve', () => {
  assert.equal(parseTag(null), null);
  assert.equal(parseTag(''), null);
  assert.equal(parseTag('https://ejemplo.com'), null);
  assert.equal(parseTag('lamies:persona:123'), null);
  assert.equal(parseTag(`lamies:persona:${A}zz`), null);
  assert.equal(parseTag('lamies:ticket:XYZ'), null);
});

test('el código para retirar son 4 números', () => {
  assert.equal(cleanPickupCode(' 0 4 7 1 '), '0471');
  assert.equal(cleanPickupCode('471'), null);
  assert.equal(cleanPickupCode('04711'), null);
  assert.equal(cleanPickupCode(null), null);
});

test('lo que trae el adulto: código o su etiqueta, nunca la del chico', () => {
  assert.equal(adultProof('0471'), '0471');
  assert.equal(adultProof(pickupPayload(B)), B);
  assert.equal(adultProof(childPayload(A)), null);
  assert.equal(adultProof(personPayload(A)), null);
  assert.equal(adultProof('hola'), null);
});

test('la etiqueta del adulto tiene que coincidir con el chico', () => {
  const chico = { code: '0471', pickupTag: B };
  assert.equal(pickupCheck(chico, '0471'), 'ok');
  assert.equal(pickupCheck(chico, '04-71'), 'ok');
  assert.equal(pickupCheck(chico, '0472'), 'no');
  assert.equal(pickupCheck(chico, ''), 'no');
  assert.equal(pickupCheck(chico, pickupPayload(B)), 'ok');
  assert.equal(pickupCheck(chico, pickupPayload(A)), 'no');
  // La etiqueta del propio chico no sirve para retirarlo.
  assert.equal(pickupCheck(chico, childPayload(B)), 'no');
  // Sin saber la etiqueta del adulto acá, decide la base.
  assert.equal(pickupCheck({ code: '0471' }, pickupPayload(B)), 'ask');
  assert.equal(pickupCheck({ code: '0471' }, '0471'), 'ok');
});

test('cuántos hay adentro ahora: cuenta personas y descuenta a los que salieron', () => {
  const t = doorTotals([
    { people: 3, checked_in_at: '2027-01-18T19:00:00Z', checked_out_at: null, entrance: 'Puerta principal' },
    { people: 2, checked_in_at: '2027-01-18T19:05:00Z', checked_out_at: '2027-01-18T20:00:00Z', entrance: 'Puerta principal' },
    { people: 1, checked_in_at: '2027-01-18T19:10:00Z', checked_out_at: null, entrance: ' Estacionamiento ' },
    { people: 4, checked_in_at: null, checked_out_at: null },
    { people: 1, checked_in_at: '2027-01-18T19:20:00Z', checked_out_at: null, entrance: null },
  ]);
  assert.equal(t.registered, 11);
  assert.equal(t.checked_in, 7);
  assert.equal(t.inside, 5);
  assert.equal(t.gone, 2);
  assert.deepEqual(t.by_entrance, [
    { name: 'Puerta principal', checked_in: 5, inside: 3 },
    { name: '', checked_in: 1, inside: 1 },
    { name: 'Estacionamiento', checked_in: 1, inside: 1 },
  ]);
  assert.equal(t.inside + t.gone, t.checked_in);
});

test('el que nunca entró no cuenta como adentro ni como que se fue', () => {
  const t = doorTotals([{ people: 2, checked_in_at: null, checked_out_at: '2027-01-18T20:00:00Z' }]);
  assert.deepEqual([t.registered, t.checked_in, t.inside, t.gone], [2, 0, 0, 0]);
  assert.deepEqual(doorTotals([]), { registered: 0, checked_in: 0, inside: 0, gone: 0, by_entrance: [] });
});

test('nombre de la entrada y qué tan lleno está', () => {
  assert.equal(cleanEntrance('  Puerta   de   atrás '), 'Puerta de atrás');
  assert.equal(cleanEntrance('x'.repeat(60)).length, 40);
  assert.equal(entranceLabel(''), 'Sin nombre');
  assert.equal(entranceLabel('Cancha'), 'Cancha');
  assert.equal(fillPercent(50, 200), 25);
  assert.equal(fillPercent(300, 200), 100);
  assert.equal(fillPercent(10, null), null);
  assert.equal(fillPercent(10, 0), null);
});

test('el cartel de la puerta', () => {
  assert.deepEqual(scanFlash('in', 'Persona Inventada', 3), { tone: 'green', text: '✓ Entró Persona Inventada (3 personas)' });
  assert.equal(scanFlash('already', 'Persona Inventada').tone, 'amber');
  assert.equal(scanFlash('out', 'Persona Inventada').text, '✓ Salió Persona Inventada');
  assert.equal(scanFlash('not_in', 'Persona Inventada').tone, 'red');
});
