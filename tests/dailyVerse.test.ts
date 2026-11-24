import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSIONS } from '../src/lib/bible';
import { bibleOf, localizeDaily, setDailyVerseWritten, verseTextIn } from '../src/lib/dailyVerse';

const rv = VERSIONS[0];

test('versículo del día: se arma desde la Biblia de la iglesia', () => {
  assert.match(verseTextIn(rv, 'Juan 3:16') ?? '', /de tal manera amó Dios al mundo/);
  const two = verseTextIn(rv, 'Juan 3:16-17') ?? '';
  assert.ok(two.length > (verseTextIn(rv, 'Juan 3:16') ?? '').length);
  assert.equal(verseTextIn(rv, 'Salmos 23'), null);
  assert.equal(verseTextIn(rv, 'no es una cita'), null);
});

test('versículo del día: la iglesia que lo deja como se escribió no cambia nada', async () => {
  setDailyVerseWritten(true);
  const d = await localizeDaily({ reference: 'Juan 3:16', verse: 'texto escrito' });
  assert.equal(d.verse, 'texto escrito');
  assert.equal(bibleOf(d), 'RV1960');
});

test('versículo del día: las demás lo ven en su versión, y si la cita no se entiende queda el escrito con su sigla', async () => {
  setDailyVerseWritten(false);
  const d = await localizeDaily({ reference: 'Juan 3:16', verse: 'texto escrito' });
  assert.match(d.verse, /amó Dios al mundo/);
  assert.equal(bibleOf(d), rv.short);
  const raro = await localizeDaily({ reference: 'Salmos 23:1-3, 6', verse: 'texto escrito' });
  assert.equal(raro.verse, 'texto escrito');
  assert.equal(bibleOf(raro), 'RV1960');
  setDailyVerseWritten(true);
});
