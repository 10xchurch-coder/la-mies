// La hoja de "Palabras originales": cada palabra del versículo en hebreo o griego, con su número de Strong y qué quiere decir.
// Tocar una palabra muestra la explicación del léxico (solo griego) y todos los versículos donde está ese número; tocar uno lo abre.
// Los datos son de STEP Bible (CC BY 4.0) y se cargan recién cuando la hoja se abre. Las explicaciones están en inglés.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { bookNameIn, type BibleVersion } from '@/lib/bible';
import { useBibleReady } from '@/lib/bibleReady';
import {
  definition, ensureDefinition, ensureOrig, hasDefinitions, origLang, strongInfo, strongLabel, strongSenses, strongVerses, verseWords,
  type OrigWord, type StrongResult,
} from '@/lib/bibleOrig';
import { numberingDiffers, refLabel, refText } from '@/lib/bibleStudy';
import { colors } from '@/theme';

const STEP = 20;
/** Más de esto de una vez no se lee cómodo en una hoja. */
const MAX_VERSES = 6;
export const WORDS_CREDIT = 'Palabras originales: STEP Bible (www.STEPBible.org), con datos de Tyndale House, Cambridge. Licencia CC BY 4.0.';

/** El nombre del botón que abre la hoja: en español, o en inglés si se lee la King James. */
export const wordsTitle = (version: BibleVersion): string => (version.lang === 'en' ? 'Original words / Strong’s' : 'Palabras originales');

export function BibleWordsSheet({ visible, onClose, version, book, chapter, verses, onOpen }: {
  visible: boolean; onClose: () => void; version: BibleVersion; book: number; chapter: number; verses: number[];
  onOpen: (r: { book: number; chapter: number; verse: number }) => void;
}) {
  const insets = useSafeAreaInsets();
  const key = verses.join(',');
  const lang = origLang(book);
  const langName = lang === 'H' ? 'hebreo' : 'griego';
  /** La palabra tocada (su número con letra), o null si se ve la lista del versículo. */
  const [open, setOpen] = useState<OrigWord | null>(null);
  const [shown, setShown] = useState(STEP);
  const [found, setFound] = useState<StrongResult | null>(null);
  const [progress, setProgress] = useState('');
  const [defReady, setDefReady] = useState(0);
  useEffect(() => { if (visible) { setOpen(null); setFound(null); } }, [visible, key, book, chapter]);

  // Las palabras de este libro se piden recién cuando la hoja se abre.
  const [ready, setReady] = useState(-1);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    ensureOrig(book).then(() => { if (alive) setReady(book); });
    return () => { alive = false; };
  }, [visible, book]);
  const loading = visible && ready !== book;

  const list = verses.slice(0, MAX_VERSES);
  const groups = useMemo(() => {
    if (!visible || ready !== book) return [];
    return list.map((v) => ({ verse: v, words: verseWords(book, chapter, v) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ready, key, book, chapter]);
  const total = groups.reduce((n, g) => n + g.words.length, 0);

  // Al tocar una palabra: su explicación (si es griego) y todos los versículos con ese número.
  const strong = open?.strong ?? '';
  useEffect(() => {
    if (!strong) return;
    let alive = true;
    setFound(null);
    setShown(STEP);
    setProgress('');
    ensureDefinition(strong).then(() => { if (alive) setDefReady((n) => n + 1); });
    strongVerses(strong, () => alive, (done, of) => { if (alive && of > 4) setProgress(`${done} de ${of} libros`); })
      .then((r) => { if (alive && r) setFound(r); });
    return () => { alive = false; };
  }, [strong]);

  const info = strong ? strongInfo(strong) : null;
  const senses = strong ? strongSenses(strong) : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const def = useMemo(() => (strong ? definition(strong) : ''), [strong, defReady]);
  const flat = useMemo(() => (found ? found.books.flatMap((b) => b.hits.map((h) => ({ book: b.book, chapter: h.chapter, verse: h.verse, end: h.verse }))) : []), [found]);
  const visibleHits = flat.slice(0, shown);
  // El texto de los versículos que se ven, en la versión que se está leyendo (la King James se baja de a un libro).
  useBibleReady(visibleHits.map((r) => [version.id, r.book]));
  const offNumbers = version.id !== 'kjv';

  const title = open ? `Strong ${strongLabel(strong)}` : wordsTitle(version);
  const sub = open
    ? `Palabra en ${langName}`
    : total ? `Así está escrito en ${langName}. Tocá una palabra para ver más.` : `El versículo en ${langName}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => (open ? setOpen(null) : onClose())}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '86%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
          {open ? (
            <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Volver a las palabras del versículo" hitSlop={10}>
              <Feather name="arrow-left" size={24} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{title}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{sub}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={10}><Feather name="x" size={24} color={colors.muted} /></Pressable>
        </View>

        {!open ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 18, gap: 10, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
            {loading ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 24 }} /> : null}
            {!total && !loading ? (
              <Text style={{ fontSize: 15, color: colors.text, paddingVertical: 16 }}>
                No hay palabras para {verses.length > 1 ? 'estos versículos' : 'este versículo'}.{offNumbers && numberingDiffers(book, chapter) ? ' En este capítulo los números no son iguales en todas las Biblias: probá con el versículo de al lado.' : ''}
              </Text>
            ) : null}
            {total ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.blueSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}>
                <Feather name="info" size={15} color={colors.blueText} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.blueText }}>Lo que quiere decir cada palabra está en inglés.</Text>
              </View>
            ) : null}
            {total && offNumbers && numberingDiffers(book, chapter) ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>En este capítulo los números de versículo no son iguales en todas las Biblias. Las palabras pueden ser las del versículo de antes o de después.</Text>
            ) : null}
            {groups.map((g) => (g.words.length ? (
              <View key={g.verse} style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: 4 }}>{refLabel(version, { book, chapter, verse: g.verse, end: g.verse }).toUpperCase()}</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }} numberOfLines={4}>{refText(version, { book, chapter, verse: g.verse, end: g.verse })}</Text>
                {g.words.map((w, i) => (
                  <Pressable key={`${g.verse}-${i}`} onPress={() => setOpen(w)} accessibilityRole="button"
                    accessibilityLabel={`${w.lemma}, ${w.translit}. Strong ${w.label}. ${w.gloss}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted, width: 18, textAlign: 'center' }}>{i + 1}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 22, lineHeight: 32, color: colors.text, textAlign: 'left', writingDirection: 'ltr' }}>{w.word}</Text>
                      {/* En dos textos separados: si van juntos, el hebreo (que se escribe de derecha a izquierda) da vuelta el renglón. */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {w.lemma !== w.word ? <Text style={{ fontSize: 15, color: colors.muted }}>{w.lemma}</Text> : null}
                        <Text style={{ fontSize: 13, fontStyle: 'italic', color: colors.muted }}>{w.translit}</Text>
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{w.gloss}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.blueSoft }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.blueText }}>{w.label}</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.muted} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null))}
            {verses.length > MAX_VERSES ? <Text style={{ fontSize: 12, color: colors.muted }}>Se muestran los primeros {MAX_VERSES} versículos que tocaste.</Text> : null}
            {total ? (
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>
                {lang === 'G' ? 'Griego del texto tradicional (el de la Reina-Valera y la King James). ' : ''}{WORDS_CREDIT}
              </Text>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 18, gap: 12, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 30, lineHeight: 44, color: colors.text, textAlign: 'left', writingDirection: 'ltr' }}>{info?.lemma || open.lemma}</Text>
              <Text style={{ fontSize: 15, fontStyle: 'italic', color: colors.muted }}>{info?.translit || open.translit}</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4 }}>{info?.gloss || open.gloss}</Text>
              {open.word !== (info?.lemma || open.lemma) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>En el versículo está escrita así:</Text>
                  <Text style={{ fontSize: 17, color: colors.text }}>{open.word}</Text>
                </View>
              ) : null}
            </View>
            {senses.length > 1 ? (
              <View style={{ gap: 3 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>ESTE NÚMERO SE USA PARA</Text>
                {senses.slice(0, 8).map((s) => (
                  <Text key={s.strong} style={{ fontSize: 14, color: colors.text, fontWeight: s.strong === strong ? '800' : '400' }}>• {s.gloss}{s.strong === strong ? '  (acá)' : ''}</Text>
                ))}
                {senses.length > 8 ? <Text style={{ fontSize: 13, color: colors.muted }}>y {senses.length - 8} más</Text> : null}
              </View>
            ) : null}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>EXPLICACIÓN (EN INGLÉS)</Text>
              {hasDefinitions(strong) ? (
                def ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{def}</Text>
                  : <Text style={{ fontSize: 14, color: colors.muted }}>{defReady ? 'No hay una explicación más larga para esta palabra.' : 'Cargando…'}</Text>
              ) : (
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>Para el hebreo la app trae solo el significado corto de arriba. La explicación larga tiene dueño y hace falta pedir permiso para usarla.</Text>
              )}
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>DÓNDE MÁS ESTÁ</Text>
              {!found ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <ActivityIndicator color={colors.blue} />
                  <Text style={{ fontSize: 14, color: colors.muted }}>Buscando en toda la Biblia…{progress ? ` ${progress}` : ''}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 15, color: colors.text }}>
                  <Text style={{ fontWeight: '800' }}>{found.total === 1 ? 'Aparece 1 vez' : `Aparece ${found.total.toLocaleString('es-AR')} veces`}</Text>
                  {found.verses !== found.total ? `, en ${found.verses.toLocaleString('es-AR')} versículos` : ''}
                  {found.books.length > 1 ? ` de ${found.books.length} libros` : found.books.length === 1 ? `, en ${bookNameIn(version, found.books[0].book)}` : ''}. Tocá un versículo para abrirlo.
                </Text>
              )}
              {visibleHits.map((r) => {
                const text = refText(version, r);
                const label = refLabel(version, r);
                return (
                  <Pressable key={`${r.book}-${r.chapter}-${r.verse}`} onPress={() => onOpen(r)} accessibilityRole="button" accessibilityLabel={`${label}. ${text}`}
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.blueText }}>{label}</Text>
                      <Feather name="chevron-right" size={18} color={colors.muted} />
                    </View>
                    <Text style={{ fontSize: 15, lineHeight: 21, color: text ? colors.text : colors.muted }} numberOfLines={4}>
                      {text || (version.load && !version.books[r.book]().length ? 'Cargando…' : 'En esta Biblia este versículo tiene otro número. Tocá para abrir el capítulo.')}
                    </Text>
                  </Pressable>
                );
              })}
              {flat.length > shown ? <Button title={`Ver más (${(flat.length - shown).toLocaleString('es-AR')})`} variant="outline" icon="chevron-down" onPress={() => setShown(shown + STEP * 2)} /> : null}
              {found && offNumbers ? <Text style={{ fontSize: 12, color: colors.muted }}>Los números de versículo son los de la King James. En muy pocos capítulos tu Biblia los cuenta distinto y el versículo puede ser el de al lado.</Text> : null}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>{WORDS_CREDIT}</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
