import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MENU, layout, moved, normalizeMenu } from '../src/lib/menuPref';

const t = (k: string, show = true) => ({ k, show });
const groups = [{ title: 'A', tiles: [t('1'), t('2'), t('3', false)] }, { title: 'B', tiles: [t('4'), t('5')] }];
const keyOf = (x: { k: string }) => x.k;
const names = (g: { tiles: { k: string }[] }[]) => g.map((x) => x.tiles.map((y) => y.k).join(''));

test('sin cambios queda igual', () => {
  assert.deepEqual(names(layout(groups, keyOf, DEFAULT_MENU)), ['123', '45']);
});
test('favoritos van primero y no se repiten', () => {
  const r = layout(groups, keyOf, { ...DEFAULT_MENU, fav: ['5', '1', '3'] });
  assert.deepEqual(r.map((g) => g.title), ['Favoritos', 'A', 'B']);
  assert.deepEqual(names(r), ['51', '23', '4']); // el 3 no se ve para este usuario: no aparece
});
test('orden de botones y de grupos', () => {
  const r = layout(groups, keyOf, { ...DEFAULT_MENU, order: { A: ['2', '1'] }, groups: ['B', 'A'] });
  assert.deepEqual(r.map((g) => g.title), ['B', 'A']);
  assert.deepEqual(names(r), ['45', '213']);
});
test('botones nuevos van al final de su grupo', () => {
  const r = layout(groups, keyOf, { ...DEFAULT_MENU, order: { B: ['5'] } });
  assert.deepEqual(names(r), ['123', '54']);
});
test('moved cambia de lugar y respeta los bordes', () => {
  assert.deepEqual(moved(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moved(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(moved(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
});
test('normalizeMenu limpia datos raros', () => {
  assert.deepEqual(normalizeMenu({ fav: ['x', 'x', 5], order: { A: 'no' }, groups: null, top: 1 }), { fav: ['x'], order: { A: [] }, groups: [], top: true });
  assert.deepEqual(normalizeMenu(null), DEFAULT_MENU);
});
