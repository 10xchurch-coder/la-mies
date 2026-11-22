import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryForVendor, guessTotal, isoToDMY, methodForAccount, parseAmount, todayDMY, vendorKey } from '../src/lib/receipt';

test('vendorKey normaliza el comercio', () => {
  assert.equal(vendorKey('Ferretería El Tornillo S.R.L.'), 'ferreteria tornillo');
  assert.equal(vendorKey('EDENOR S.A.'), 'edenor');
  assert.equal(vendorKey(null), '');
});

test('categoryForVendor recuerda la última categoría del comercio', () => {
  const h = [
    { counterpart: 'Edenor SA Posadas', category_id: 'luz' },
    { counterpart: 'Ferretería El Tornillo', category_id: 'mantenimiento' },
    { counterpart: 'Edenor', category_id: 'viejo' },
  ];
  assert.equal(categoryForVendor('EDENOR', h), 'luz');
  assert.equal(categoryForVendor('ferreteria el tornillo srl', h), 'mantenimiento');
  assert.equal(categoryForVendor('Supermercado', h), null);
  assert.equal(categoryForVendor('', h), null);
});

test('parseAmount entiende pesos argentinos y dólares', () => {
  assert.equal(parseAmount('$ 12.345,67'), 12345.67);
  assert.equal(parseAmount('12,345.67'), 12345.67);
  assert.equal(parseAmount('1.500'), 1500);
  assert.equal(parseAmount('15000'), 15000);
  assert.equal(parseAmount('abc'), null);
});

test('guessTotal toma la línea TOTAL y no el subtotal', () => {
  const t = 'FERRETERIA EL TORNILLO\nTornillos x100   1.200,00\nPintura   8.500,50\nSUBTOTAL 9.700,50\nIVA 21% 2.037,11\nTOTAL $ 11.737,61\nGracias por su compra';
  assert.equal(guessTotal(t), 11737.61);
  assert.equal(guessTotal('TOTAL\n$ 4.250,00'), 4250);
  assert.equal(guessTotal('Ticket\nAlgo 1.000,00\nOtro 2.500,00'), 2500);
  assert.equal(guessTotal('sin numeros'), null);
});

test('fechas y modo de pago', () => {
  assert.equal(todayDMY(new Date(2026, 10, 2)), '02/11/2026');
  assert.equal(isoToDMY('2026-11-22'), '22/11/2026');
  assert.equal(methodForAccount('bank'), 'transfer');
  assert.equal(methodForAccount('cash'), 'cash');
});
