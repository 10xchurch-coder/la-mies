import test from 'node:test';
import assert from 'node:assert/strict';
import { OPEN_BIBLE, allowedOf, bibleConfigToSave, churchDefault, cleanBibleConfig, pickVersion } from '../src/lib/bibleChurch';
import { VERSIONS, allowedVersions, canChooseVersion, setChurchBible, versionOf } from '../src/lib/bible';
import { compareVersion } from '../src/lib/bibleCompare';
import { setLangNow as setLang } from '../src/lib/i18n';

// Tres versiones de mentira, para probar que una versión nueva entra sola en la lista.
const ALL = [{ id: 'rv1909' }, { id: 'kjv', lang: 'en' as const }, { id: 'nueva' }];
const ids = ALL.map((v) => v.id);

test('lo que guarda la base se limpia: solo versiones que existen, y nunca queda vacío', () => {
  assert.deepEqual(cleanBibleConfig(null, ids), OPEN_BIBLE);
  assert.deepEqual(cleanBibleConfig({}, ids), { versions: null, def: null });
  assert.deepEqual(cleanBibleConfig({ versions: ['kjv', 'no-existe'], default: 'kjv' }, ids), { versions: ['kjv'], def: 'kjv' });
  // La de inicio tiene que estar entre las permitidas.
  assert.deepEqual(cleanBibleConfig({ versions: ['kjv'], default: 'rv1909' }, ids), { versions: ['kjv'], def: null });
  // Ninguna válida: es como no haber elegido (todas).
  assert.deepEqual(cleanBibleConfig({ versions: ['x'], default: 'x' }, ids), { versions: null, def: null });
  assert.deepEqual(cleanBibleConfig({ versions: 'kjv' }, ids), { versions: null, def: null });
  // Todas elegidas a mano: también es "todas", así una versión futura entra sola.
  assert.deepEqual(cleanBibleConfig({ versions: ['nueva', 'kjv', 'rv1909'], default: 'nueva' }, ids), { versions: null, def: 'nueva' });
});

test('las permitidas van en el orden de la app, y una versión nueva entra sola si la iglesia no eligió', () => {
  assert.deepEqual(allowedOf(ALL, OPEN_BIBLE).map((v) => v.id), ['rv1909', 'kjv', 'nueva']);
  assert.deepEqual(allowedOf(ALL, { versions: ['nueva', 'rv1909'], def: null }).map((v) => v.id), ['rv1909', 'nueva']);
  assert.equal(churchDefault(ALL, { versions: ['kjv', 'nueva'], def: 'nueva' }).id, 'nueva');
  assert.equal(churchDefault(ALL, { versions: ['kjv', 'nueva'], def: null }).id, 'kjv');
});

test('en qué versión lee cada uno', () => {
  const both = { versions: null, def: 'rv1909' };
  const onlyRv = { versions: ['rv1909'], def: 'rv1909' };
  const onlyKjv = { versions: ['kjv'], def: 'kjv' };
  // La que eligió, si está permitida.
  assert.equal(pickVersion(ALL, both, 'kjv', 'es').id, 'kjv');
  // Tenía una que ya no se permite: va la de la iglesia.
  assert.equal(pickVersion(ALL, onlyRv, 'kjv', 'es').id, 'rv1909');
  assert.equal(pickVersion(ALL, onlyRv, 'kjv', 'en').id, 'rv1909');
  assert.equal(pickVersion(ALL, { versions: ['rv1909', 'nueva'], def: 'nueva' }, 'kjv', 'en').id, 'nueva');
  // Nunca eligió, app en inglés: King James solo si la iglesia la permite.
  assert.equal(pickVersion(ALL, both, undefined, 'en').id, 'kjv');
  assert.equal(pickVersion(ALL, onlyRv, undefined, 'en').id, 'rv1909');
  assert.equal(pickVersion(ALL, onlyKjv, undefined, 'es').id, 'kjv');
  // Nunca eligió, app en castellano: la de la iglesia.
  assert.equal(pickVersion(ALL, both, undefined, 'es').id, 'rv1909');
  assert.equal(pickVersion(ALL, { versions: null, def: 'kjv' }, undefined, 'es').id, 'kjv');
});

test('lo que se manda a guardar', () => {
  assert.deepEqual(bibleConfigToSave(ids, ['kjv', 'rv1909'], 'kjv'), { versions: ['rv1909', 'kjv'], default: 'kjv' });
  assert.deepEqual(bibleConfigToSave(ids, ['kjv'], 'rv1909'), { versions: ['kjv'], default: 'kjv' });
  assert.throws(() => bibleConfigToSave(ids, [], null));
});

test('con la Biblia de verdad: una sola versión permitida esconde el elegir y el comparar', () => {
  try {
    setChurchBible(null);
    assert.equal(allowedVersions().length, VERSIONS.length);
    assert.equal(canChooseVersion(), true);
    assert.equal(compareVersion('rv1909', 'kjv')?.id, 'kjv');

    setChurchBible({ versions: ['rv1909'], default: 'rv1909' });
    assert.deepEqual(allowedVersions().map((v) => v.id), ['rv1909']);
    assert.equal(canChooseVersion(), false);
    assert.equal(versionOf('kjv').id, 'rv1909', 'la guardada ya no se permite');
    assert.equal(compareVersion('rv1909', 'kjv'), null, 'no hay con qué comparar');
    setLang('en');
    assert.equal(versionOf(undefined).id, 'rv1909', 'en inglés tampoco se abre una versión que la iglesia no permite');

    setChurchBible({ versions: ['kjv'], default: 'kjv' });
    setLang('es');
    assert.equal(versionOf(undefined).id, 'kjv');
    assert.equal(versionOf('rv1909').id, 'kjv');

    setChurchBible(null);
    setLang('en');
    assert.equal(versionOf(undefined).id, 'kjv', 'sin elegir, en inglés va King James (como antes)');
    setLang('es');
    assert.equal(versionOf(undefined).id, 'rv1909');
    assert.equal(versionOf('cualquier-cosa').id, 'rv1909');
  } finally {
    setChurchBible(null);
    setLang('es');
  }
});
