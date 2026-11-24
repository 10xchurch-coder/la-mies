import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSIONS, chapterText, ensureBook, versionOf } from '../src/lib/bible';
import { COMPARE_WIDE, alignVerses, compareColumns, compareNotice, compareVersion } from '../src/lib/bibleCompare';
import { NUMBERING_DIFFS } from '../src/lib/bibleStudy';
import { BOOKS } from '../src/lib/biblePlan';

const rv = versionOf('rv1909');
const kjv = versionOf('kjv');
const B = (name: string) => BOOKS.findIndex((b) => b[0] === name);

test('la segunda versión: la elegida, nunca la misma que se lee, y nada si no se compara', () => {
  assert.equal(compareVersion('rv1909', undefined), null);
  assert.equal(compareVersion('rv1909', null), null);
  assert.equal(compareVersion('rv1909', ''), null);
  assert.equal(compareVersion('rv1909', 'kjv')?.id, 'kjv');
  // Si pasa a leer la que tenía de segunda, la segunda es la otra.
  assert.equal(compareVersion('kjv', 'kjv')?.id, 'rv1909');
  // Una versión que ya no existe no rompe nada.
  assert.equal(compareVersion('rv1909', 'no-existe')?.id, VERSIONS.find((v) => v.id !== 'rv1909')!.id);
  for (const v of VERSIONS) assert.notEqual(compareVersion(v.id, v.id)?.id, v.id);
});

test('los versículos se ponen lado a lado por número', () => {
  assert.deepEqual(alignVerses(['a1', 'a2'], ['b1', 'b2']), [{ n: 1, a: 'a1', b: 'b1' }, { n: 2, a: 'a2', b: 'b2' }]);
  // Si una versión tiene un versículo de más, queda solo.
  assert.deepEqual(alignVerses(['a1'], ['b1', 'b2']), [{ n: 1, a: 'a1', b: 'b1' }, { n: 2, a: null, b: 'b2' }]);
  assert.deepEqual(alignVerses(['a1', 'a2'], ['b1']), [{ n: 1, a: 'a1', b: 'b1' }, { n: 2, a: 'a2', b: null }]);
  // La segunda todavía no llegó (se baja de a un libro): se ve la primera sola.
  assert.deepEqual(alignVerses(['a1'], []), [{ n: 1, a: 'a1', b: null }]);
  assert.deepEqual(alignVerses([], []), []);
  assert.deepEqual(alignVerses(null, undefined), []);
});

test('Juan 3 en las dos versiones: 36 versículos, cada uno con su par', async () => {
  await ensureBook(kjv, B('Juan'));
  const rows = alignVerses(chapterText(rv, B('Juan'), 3), chapterText(kjv, B('Juan'), 3));
  assert.equal(rows.length, 36);
  assert.match(rows[15].a!, /de tal manera amó Dios al mundo/);
  assert.match(rows[15].b!, /God so loved the world/);
  assert.ok(rows.every((r, i) => r.n === i + 1 && r.a && r.b));
});

test('los 19 capítulos con otra numeración se alinean sin fallar y llevan aviso', async () => {
  assert.equal(NUMBERING_DIFFS.length, 19);
  let distinto = 0;
  for (const [b, c] of NUMBERING_DIFFS) {
    await ensureBook(kjv, b);
    const a = chapterText(rv, b, c);
    const k = chapterText(kjv, b, c);
    assert.ok(a.length > 0 && k.length > 0);
    for (const [x, y] of [[a, k], [k, a]]) {
      const rows = alignVerses(x, y);
      assert.equal(rows.length, Math.max(a.length, k.length), `${BOOKS[b][0]} ${c}`);
      rows.forEach((r, i) => {
        assert.equal(r.n, i + 1);
        // Ningún número queda vacío de los dos lados, y lo que falta es null (no undefined ni '').
        assert.ok(r.a !== null || r.b !== null);
        assert.ok(r.a === null || r.a.length > 0);
        assert.ok(r.b === null || r.b.length > 0);
      });
      assert.equal(rows.filter((r) => r.a === null).length, Math.max(0, y.length - x.length));
      assert.equal(rows.filter((r) => r.b === null).length, Math.max(0, x.length - y.length));
    }
    if (a.length !== k.length) distinto++;
    assert.equal(compareNotice(b, c, 'rv1909', 'kjv'), true);
    assert.equal(compareNotice(b, c, 'kjv', 'rv1909'), true);
    // Comparar una versión con ella misma no pasa, pero si pasara no hay nada que avisar.
    assert.equal(compareNotice(b, c, 'kjv', 'kjv'), false);
  }
  // En 12 de los 19 cambia la cantidad de versículos; en los otros 7 solo se corre el comienzo.
  assert.equal(distinto, 12);
  assert.equal(compareNotice(B('Juan'), 3, 'rv1909', 'kjv'), false);
});

test('dos columnas en pantalla ancha; en el teléfono, solo si se pide', () => {
  assert.equal(compareColumns(390, undefined), false);
  assert.equal(compareColumns(390, false), false);
  assert.equal(compareColumns(390, true), true);
  assert.equal(compareColumns(COMPARE_WIDE, undefined), true);
  assert.equal(compareColumns(1280, false), true);
});
