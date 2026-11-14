import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone, telDigits } from '../src/lib/phone';

test('agrega +54 9 y el código de área a un número de acá', () => {
  assert.equal(formatPhone('272200'), '+54 9 3764 27-2200');
  assert.equal(formatPhone('27-2200'), '+54 9 3764 27-2200');
  assert.equal(formatPhone('15 272200'), '+54 9 3764 27-2200');
});
test('acepta el número completo escrito de cualquier forma', () => {
  for (const s of ['3764 272200', '376 4272200', '+54 9 3764 27-2200', '5493764272200', '03764 15 272200', '(3764) 27-2200']) {
    assert.equal(formatPhone(s), '+54 9 3764 27-2200', s);
  }
});
test('respeta otro código de área y otros países', () => {
  assert.equal(formatPhone('3755 45-1234'), '+54 9 3755 45-1234');
  assert.equal(formatPhone('11 2345 6789'), '+54 9 11 2345-6789');
  assert.equal(formatPhone('+1 515 555 0100'), '+1 515 555 0100');
});
test('lo que no se entiende queda igual, y vacío queda vacío', () => {
  assert.equal(formatPhone('123'), '123');
  assert.equal(formatPhone('  '), '');
  assert.equal(formatPhone(null), '');
});
test('enlace de llamada sin espacios', () => {
  assert.equal(telDigits('+54 9 3764 27-2200'), '+5493764272200');
  assert.equal(telDigits('+1 515 555 0100'), '+15155550100');
});
