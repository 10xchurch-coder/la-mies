import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ART, artFontSize, blurRadius, brightLayer, photoOpacity, shapeOf, step } from '../src/lib/verseArt';
import { BIBLE_FONTS, BIBLE_THEMES, MARK_COLORS, fontOf, markBg, spacingOf, themeOf } from '../src/lib/bibleLook';

test('la imagen del versículo: tamaños y capas', () => {
  assert.equal(shapeOf('3x4').h, 1920);
  assert.equal(shapeOf('nada').id, '1x1');
  assert.ok(artFontSize(40, DEFAULT_ART) > artFontSize(400, DEFAULT_ART));
  assert.ok(artFontSize(100, { ...DEFAULT_ART, size: 6 }) > artFontSize(100, { ...DEFAULT_ART, size: 0 }));
  assert.equal(brightLayer(DEFAULT_ART).alpha, 0);
  assert.equal(brightLayer({ ...DEFAULT_ART, bright: 0 }).color, '#000000');
  assert.equal(brightLayer({ ...DEFAULT_ART, bright: 4 }).color, '#FFFFFF');
  assert.equal(photoOpacity({ ...DEFAULT_ART, opacity: 4 }), 1);
  assert.equal(blurRadius(DEFAULT_ART), 0);
  assert.equal(step(0, -1, 4), 0);
  assert.equal(step(4, 1, 4), 4);
});

test('cómo se lee la Biblia: letras, fondos y colores', () => {
  assert.ok(BIBLE_FONTS.length >= 5 && BIBLE_FONTS.length <= 10);
  assert.ok(BIBLE_THEMES.length >= 6);
  assert.equal(fontOf('no-existe').id, 'sistema');
  assert.equal(themeOf('auto'), null);
  assert.equal(themeOf('negro')?.dark, true);
  assert.ok(spacingOf('amplio') > spacingOf('normal') && spacingOf('normal') > spacingOf('apretado'));
  assert.equal(markBg(null, false), undefined);
  for (const c of MARK_COLORS) assert.notEqual(markBg(c.id, false), markBg(c.id, true));
});
