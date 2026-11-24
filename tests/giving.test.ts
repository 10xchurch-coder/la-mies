import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, givingProblem, methodLabel, statementHtml, totalsByPerson, yearsOf, type StatementLine } from '../src/lib/giving';

const lines: StatementLine[] = [
  { on_date: '2026-03-08', amount: 10000.1, currency: 'ARS', method: 'cash', fund: 'General', note: null },
  { on_date: '2026-01-04', amount: 5000.2, currency: 'ARS', method: 'transfer', fund: 'General', note: 'diezmo de enero' },
  { on_date: '2026-05-10', amount: 3000, currency: 'ARS', method: 'cash', fund: 'Misiones', note: null },
  { on_date: '2026-06-01', amount: 50, currency: 'USD', method: 'other', fund: 'General (dólares)', note: null },
  { on_date: '2025-12-28', amount: 999, currency: 'ARS', method: 'cash', fund: 'General', note: null },
];

test('el estado del año suma por fondo y por moneda, sin mezclar años ni monedas', () => {
  const s = buildStatement(lines, 2026);
  assert.equal(s.count, 4);
  assert.deepEqual(s.lines.map((l) => l.on_date), ['2026-01-04', '2026-03-08', '2026-05-10', '2026-06-01']);
  assert.deepEqual(s.byFund, [
    { fund: 'General', currency: 'ARS', total: 15000.3, count: 2 },
    { fund: 'Misiones', currency: 'ARS', total: 3000, count: 1 },
    { fund: 'General (dólares)', currency: 'USD', total: 50, count: 1 },
  ]);
  assert.deepEqual(s.totals, [{ currency: 'ARS', total: 18000.3 }, { currency: 'USD', total: 50 }]);
  assert.equal(buildStatement(lines, 2025).totals[0].total, 999);
  assert.equal(buildStatement(lines, 2024).count, 0);
});

test('los centavos no se pierden al sumar', () => {
  const s = buildStatement([0.1, 0.2, 0.3].map((a) => ({ on_date: '2026-02-02', amount: a, currency: 'ARS', method: 'cash', fund: 'General', note: null })), 2026);
  assert.equal(s.totals[0].total, 0.6);
});

test('los años para elegir: siempre el actual, del más nuevo al más viejo', () => {
  assert.deepEqual(yearsOf(['2024-05-01', '2026-01-01', '2024-07-07'], new Date(2026, 10, 24)), [2026, 2024]);
  assert.deepEqual(yearsOf([], new Date(2027, 0, 1)), [2027]);
});

test('el total por persona no cuenta las anuladas y separa las monedas', () => {
  const t = totalsByPerson([
    { contact_id: 'a', person_name: 'Rubén Sosa', amount: 100, currency: 'ARS', voided_at: null },
    { contact_id: 'a', person_name: 'Rubén Sosa', amount: 50, currency: 'ARS', voided_at: '2026-01-01' },
    { contact_id: 'a', person_name: 'Rubén Sosa', amount: 20, currency: 'USD', voided_at: null },
    { contact_id: 'b', person_name: 'Ana Benítez', amount: 70, currency: 'ARS', voided_at: null },
    { contact_id: null, person_name: 'Ficha quitada', amount: 5, currency: 'ARS', voided_at: null },
  ]);
  assert.deepEqual(t.map((x) => [x.name, x.currency, x.total, x.count]), [
    ['Ana Benítez', 'ARS', 70, 1], ['Ficha quitada', 'ARS', 5, 1], ['Rubén Sosa', 'ARS', 100, 1], ['Rubén Sosa', 'USD', 20, 1],
  ]);
});

test('la hoja para imprimir trae la iglesia, la persona, el año, los totales y no deja pasar código', () => {
  const html = statementHtml({ church: 'Iglesia <b>Prueba</b>', motto: 'Lema & más', person: 'Rubén "Sosa"', statement: buildStatement(lines, 2026), printedOn: '24/11/2026' });
  assert.ok(html.includes('Iglesia &lt;b&gt;Prueba&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Prueba</b>'));
  assert.ok(html.includes('Rubén &quot;Sosa&quot;'));
  assert.ok(html.includes('Ofrendas del año 2026'));
  assert.ok(html.includes('Lema &amp; más'));
  assert.ok(html.includes('Total por fondo') && html.includes('Misiones') && html.includes('diezmo de enero'));
  assert.ok(html.includes('04/01/2026'));
  assert.ok(html.includes('US$ 50'));
  const empty = statementHtml({ church: 'Iglesia', person: 'Ana', statement: buildStatement([], 2026) });
  assert.ok(empty.includes('No hay ofrendas anotadas'));
});

test('antes de guardar se avisa lo que falta', () => {
  const today = new Date(2026, 10, 24);
  const base = { contactId: 'a', fundId: 'f', amount: 100, date: '2026-11-24' };
  assert.equal(givingProblem(base, today), null);
  assert.match(givingProblem({ ...base, contactId: null }, today)!, /persona/);
  assert.match(givingProblem({ ...base, fundId: null }, today)!, /fondo/);
  assert.match(givingProblem({ ...base, amount: 0 }, today)!, /monto/);
  assert.match(givingProblem({ ...base, date: null }, today)!, /fecha/);
  assert.match(givingProblem({ ...base, date: '2026-12-25' }, today)!, /todavía no llegó/);
  assert.equal(methodLabel('transfer'), 'Transferencia');
  assert.equal(methodLabel('raro'), 'Otro');
});
