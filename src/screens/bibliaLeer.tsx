// Leer la Biblia, limpio como un libro: el texto corre seguido, con el número chiquito de cada versículo.
// Arriba: el libro y capítulo (abre la lista de libros) y la versión. Abajo flotan anterior, escuchar y siguiente.
// Arriba a la derecha (los tres puntos) se elige letra, tamaño, fondo y espacio entre líneas; el parlante lo lee en voz alta.
// Al tocar versículos quedan subrayados con puntitos y abajo se abre la barra: color para resaltar, nota, copiar, compartir y guardar.
// Lo que se marca va por libro, capítulo y versículo, así se ve igual en cualquier versión. Lo leído se anota solo en el plan de lectura.
// "Referencias" abre los versículos relacionados con el que se tocó. La versión (español o inglés) se cambia en los tres puntos.
// "Palabras originales" muestra el versículo en hebreo o griego con los números de Strong.
// En los tres puntos también está "Comparar dos versiones": las dos a la vez, versículo por versículo. Si no se compara, la segunda ni se carga.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { BibleRefsSheet } from '@/components/BibleRefsSheet';
import { BibleWordsSheet, wordsTitle } from '@/components/BibleWordsSheet';
import { Button } from '@/components/ui';
import { myBiblePlan, type BiblePlanRow } from '@/lib/api';
import { OT_COUNT, allowedVersions, bookName, bookNameIn, chapterDays, chapterKey, chapterText, chaptersIn, neighbor, shareVerses, versionOf } from '@/lib/bible';
import { BOOKS } from '@/lib/biblePlan';
import { alignVerses, compareColumns, compareNotice, compareVersion, COMPARE_WIDE } from '@/lib/bibleCompare';
import { loadBibleFont } from '@/lib/bibleFonts';
import { useBibleReady } from '@/lib/bibleReady';
import { BIBLE_FONTS, BIBLE_THEMES, MARK_COLORS, SPACINGS, fontOf, markBg, spacingOf, themeOf, type BibleFontId, type BibleTheme } from '@/lib/bibleLook';
import { chapterMarks, setMarks, type BibleMark } from '@/lib/bibleMarks';
import { markChapterRead, loadRead, onPlanMarked, recentPlanNote } from '@/lib/bibleRead';
import { DEFAULT_PREFS, SIZES, loadBiblePrefs, saveBiblePrefs } from '@/lib/bibleStore';
import { shareText } from '@/lib/share';
import { speakAvailable, speakParts, stopSpeaking } from '@/lib/speak';
import { loadNarrated, narratedUrl, playNarration, stopNarration } from '@/lib/bibleAudio';
import { useFeatures } from '@/lib/useFeatures';
import { colors, getThemeMode } from '@/theme';
import { tx } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Feather>['name'];

export type ReaderStart = { book: number; chapter: number; version?: string; verse?: number };

/** `embedded`: está en la barra de abajo (sin flecha para volver). */
export function BibleReader({ start, embedded }: { start: ReaderStart; embedded?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [place, setPlace] = useState({ book: start.book, chapter: start.chapter });
  const [versionId, setVersionId] = useState<string | undefined>(start.version);
  const [firstVerse, setFirstVerse] = useState<number | undefined>(start.verse);
  const { book, chapter } = place;
  const version = versionOf(versionId);
  const [booksOpen, setBooksOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState<number | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [size, setSize] = useState(DEFAULT_PREFS.size);
  const [fontId, setFontId] = useState<BibleFontId>('sistema');
  const [fontReady, setFontReady] = useState<BibleFontId>('sistema');
  const [themeId, setThemeId] = useState<string>('auto');
  const [spacing, setSpacing] = useState<string>('normal');
  const [loaded, setLoaded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [marks, setMarksState] = useState<Record<number, BibleMark>>({});
  // Las ayudas de estudio que la iglesia dejó prendidas (referencias, palabras originales, notas, imagen, audio).
  const { on: fOn } = useFeatures();
  const [refsOpen, setRefsOpen] = useState(false);
  const [wordsOpen, setWordsOpen] = useState(false);
  // Comparar dos versiones: cuál es la segunda (nada = no se compara) y si en el teléfono van en dos columnas.
  const [compareId, setCompareId] = useState<string | undefined>(undefined);
  const [compareCols, setCompareCols] = useState(false);
  // Cómo se acomoda el texto: seguido como en un libro, o cada versículo en su renglón.
  const [byLine, setByLine] = useState(false);
  const { width } = useWindowDimensions();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [speaking, setSpeaking] = useState(-1);
  // La grabación con varias voces, si este capítulo ya la tiene. Si no, lee la voz del teléfono.
  const [narrReady, setNarrReady] = useState(0);
  useEffect(() => { loadNarrated().then(() => setNarrReady((n) => n + 1)); }, []);
  const [plan, setPlan] = useState<BiblePlanRow | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(recentPlanNote());

  // La King James se baja de a un libro: cuando llega, el capítulo se arma de nuevo.
  // La segunda versión solo se pide (y se dibuja) si la persona eligió comparar.
  const second = compareVersion(version.id, compareId);
  const bibleReady = useBibleReady(second ? [[version.id, book], [second.id, book]] : [[version.id, book]]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const verses = useMemo(() => chapterText(version, book, chapter), [version, book, chapter, bibleReady]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (second ? alignVerses(verses, chapterText(second, book, chapter)) : null), [second, verses, book, chapter, bibleReady]);
  const twoCols = compareColumns(width, compareCols);
  const prev = neighbor(book, chapter, -1);
  const next = neighbor(book, chapter, 1);
  const single = chaptersIn(book) === 1;
  const inPlan = !!plan && chapterDays(plan.plan, book, chapter).length > 0;
  const isRead = read.has(chapterKey(book, chapter));

  // Los colores de lectura: el fondo elegido, o los de la app si quedó en "Automático".
  const look: BibleTheme = themeOf(themeId) ?? { id: 'auto', label: tx('Automático'), bg: colors.bg, text: colors.text, muted: colors.muted, accent: colors.blueText, line: colors.border, dark: getThemeMode() === 'dark' };
  const font = fontOf(fontReady);
  const fs = Math.round(size * font.scale);
  const lh = Math.round(fs * spacingOf(spacing));

  // Lo elegido se recuerda; y dónde se quedó, para "Seguir leyendo".
  useEffect(() => {
    loadBiblePrefs().then((p) => {
      setSize(p.size);
      setFontId(fontOf(p.font ?? 'lora').id);
      setThemeId(themeOf(p.theme)?.id ?? 'auto');
      setSpacing(p.spacing ?? 'normal');
      setCompareId(p.compare);
      setCompareCols(!!p.compareCols);
      setByLine(!!p.byLine);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (loaded) saveBiblePrefs({ version: version.id, book, chapter, size, font: fontId, theme: themeId, spacing, compare: compareId, compareCols: compareCols || undefined, byLine: byLine || undefined });
  }, [loaded, version.id, book, chapter, size, fontId, themeId, spacing, compareId, compareCols, byLine]);
  // La letra se baja recién cuando se elige. Mientras tanto se sigue leyendo con la anterior.
  useEffect(() => {
    let alive = true;
    loadBibleFont(fontId).then((ok) => { if (alive) setFontReady(ok ? fontId : 'sistema'); });
    return () => { alive = false; };
  }, [fontId]);
  useEffect(() => {
    setPicked(firstVerse ? [firstVerse].filter((n) => n >= 1 && (!verses.length || n <= verses.length)) : []);
    setFirstVerse(undefined);
    setCopied(false);
    setMarksState({});
    chapterMarks(book, chapter).then(setMarksState).catch(() => undefined);
    return () => { stopSpeaking(); stopNarration(); setSpeaking(-1); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapter]);
  // El plan de lectura de la persona (si tiene uno) y lo que ya leyó de él.
  useEffect(() => {
    myBiblePlan().then(async (r) => { setPlan(r); if (r) setRead(await loadRead(r)); }).catch(() => undefined);
    const off = onPlanMarked(setNote);
    const t = setTimeout(() => setNote(null), 6000);
    return () => { off(); clearTimeout(t); };
  }, []);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 5000); return () => clearTimeout(t); } }, [note]);

  const open = (p: { book: number; chapter: number }) => { setBooksOpen(false); setPlace({ book: p.book, chapter: p.chapter }); };

  /** Anota este capítulo como leído en el plan. Si no es parte del plan, no hace nada. */
  const markRead = async () => {
    if (!plan || !inPlan) return;
    try {
      const r = await markChapterRead(plan, book, chapter);
      setRead(r.read);
      setPlan({ ...plan, done: r.done });
    } catch {
      // Sin internet o sin sesión: se vuelve a intentar la próxima vez que lea este capítulo.
    }
  };
  const goNext = () => {
    if (!next) return;
    // Pasar al capítulo siguiente es haber leído este.
    markRead();
    open(next);
  };

  const bump = (dir: 1 | -1) => {
    const i = SIZES.indexOf(size);
    setSize(SIZES[Math.max(0, Math.min(SIZES.length - 1, (i < 0 ? 3 : i) + dir))]);
  };
  const toggle = (n: number) => { setCopied(false); setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n])); };
  const text = () => shareVerses(version, book, chapter, picked);
  const sorted = [...picked].sort((a, b) => a - b);

  /** Guarda un cambio (color, nota o guardado) en los versículos tocados. Se ve al instante; si falla, vuelve atrás. */
  const apply = (patch: Partial<Pick<BibleMark, 'color' | 'note' | 'saved'>>, on = sorted) => {
    const before = marks;
    const optimistic = { ...marks };
    for (const v of on) {
      const m: BibleMark = { ...(marks[v] ?? { book, chapter, verse: v, color: null, note: null, saved: false }), ...patch };
      if (!m.color && !m.note && !m.saved) delete optimistic[v]; else optimistic[v] = m;
    }
    setMarksState(optimistic);
    setMarks(book, chapter, before, on, patch).then(setMarksState).catch(() => setMarksState(before));
  };
  const allSaved = sorted.length > 0 && sorted.every((v) => marks[v]?.saved);
  const openNote = () => { setNoteText(marks[sorted[0]]?.note ?? ''); setNoteOpen(true); };

  const listen = () => {
    if (speaking >= 0) { stopSpeaking(); stopNarration(); setSpeaking(-1); return; }
    const url = narrReady ? narratedUrl(version.id, book, chapter) : null;
    if (url && !sorted.length) { setSpeaking(0); playNarration(url, () => setSpeaking(-1)); return; }
    const from = sorted.length ? sorted[0] - 1 : 0;
    speakParts(verses.slice(from), (i) => setSpeaking(i < 0 ? -1 : from + i + 1));
  };

  const family = (bold = false) => (font.regular ? { fontFamily: bold ? font.bold : font.regular } : bold ? { fontWeight: '800' as const } : null);
  const plainBtn = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={icon} size={22} color={look.text} />
    </Pressable>
  );
  const roundBtn = (icon: IconName, label: string, onPress: () => void, big = false, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: big ? 64 : 46, height: big ? 64 : 46, borderRadius: 32, backgroundColor: look.dark ? '#3A3F45' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1,
        shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
      <Feather name={icon} size={big ? 26 : 22} color={look.text} />
    </Pressable>
  );
  const barBtn = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 }}>
      <Feather name={icon} size={20} color={colors.text} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  const chip = (label: string, on: boolean, onPress: () => void, extra?: object) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? colors.blueSoft : colors.bg }}>
      <Text style={[{ fontSize: 14, fontWeight: '700', color: on ? colors.blueText : colors.text }, extra]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: look.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: look.line, backgroundColor: look.bg }}>
        {!embedded ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel={tx('Volver')} hitSlop={8} style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="chevron-left" size={26} color={look.text} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => { setBookOpen(book); setBooksOpen(true); }} accessibilityRole="button" accessibilityLabel={tx('Elegir libro y capítulo. Estás en {name}', { name: `${bookNameIn(version, book)} ${chapter}` })}
          style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: look.dark ? '#FFFFFF14' : '#00000008', flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: look.text }}>{(single ? bookNameIn(version, book) : `${bookNameIn(version, book)} ${chapter}`).toUpperCase()}</Text>
        </Pressable>
        <Pressable onPress={() => (allowedVersions().length > 1 ? setVersionsOpen(true) : undefined)} accessibilityRole="button" accessibilityLabel={tx('Versión: {name}', { name: version.name })}
          style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: look.dark ? '#FFFFFF14' : '#00000008' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: look.text }}>{second ? `${version.short} + ${second.short}` : version.short}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {fOn('biblia_buscar') ? plainBtn('search', tx('Buscar en la Biblia'), () => router.push({ pathname: '/biblia/buscar', params: { v: version.id } })) : null}
        {plainBtn('more-horizontal', tx('Letra, fondo, tamaño y comparar dos versiones'), () => setMenu(true))}
      </View>
      <ScrollView key={`${book}-${chapter}`} style={{ flex: 1, backgroundColor: look.bg }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: insets.bottom + 120, width: '100%', maxWidth: second && width >= COMPARE_WIDE ? 1180 : 760, alignSelf: 'center' }}>
        {note ? (
          <View style={{ backgroundColor: colors.greenSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.greenText }}>{note}</Text>
          </View>
        ) : null}
        {rows && second ? (
          <>
            {/* Dos versiones a la vez. La que se lee va primero (o a la izquierda); la segunda, un poco más clarita. */}
            <View style={{ flexDirection: 'row', gap: 14, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: look.line }}>
              {twoCols ? (
                <>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: look.accent }}>{version.name.toUpperCase()}</Text>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: look.muted }}>{second.name.toUpperCase()}</Text>
                </>
              ) : (
                <Text style={{ flex: 1, fontSize: 12, color: look.muted, lineHeight: 17 }}>
                  {tx('Cada versículo está dos veces: primero en')} <Text style={{ fontWeight: '800', color: look.accent }}>{version.short}</Text> {tx('y abajo, más clarito, en')} <Text style={{ fontWeight: '800' }}>{second.short}</Text>.
                </Text>
              )}
            </View>
            {compareNotice(book, chapter, version.id, second.id) ? (
              <View style={{ backgroundColor: look.dark ? '#3A3320' : '#FFF4D6', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 }}>
                <Text style={{ fontSize: 13, color: look.dark ? '#F1DFA8' : '#6B5200', lineHeight: 18 }}>{tx('En este capítulo las dos Biblias no cuentan igual los versículos. Algún versículo puede quedar al lado del de antes o del de después.')}</Text>
              </View>
            ) : null}
            {rows.map((r) => {
              const n = r.n;
              const on = picked.includes(n);
              const m = marks[n];
              const bg = speaking === n ? (look.dark ? '#3A4A2A' : '#E4F3D8') : markBg(m?.color, look.dark);
              const deco = on ? { textDecorationLine: 'underline' as const, textDecorationStyle: 'dotted' as const, textDecorationColor: look.accent } : null;
              const fsB = twoCols ? fs : Math.round(fs * 0.9);
              const lhB = twoCols ? lh : Math.round(lh * 0.9);
              // Lo que se marca, copia y comparte es de la versión que se lee: si ahí no está ese número, no se puede tocar.
              const press = r.a != null ? () => toggle(n) : undefined;
              const cellA = (
                <Text onPress={press} accessibilityRole={press ? 'button' : undefined} accessibilityLabel={tx('Versículo {n}, {short}. {a}', { n, short: version.short, a: r.a ?? tx('No está en esta Biblia.') })} suppressHighlighting
                  style={[{ fontSize: fs, lineHeight: lh, color: look.text }, twoCols ? { flex: 1 } : null, family()]}>
                  <Text style={[{ fontSize: Math.round(fs * 0.72), color: look.accent }, family(true)]}>{n}{' '}</Text>
                  {!twoCols ? <Text style={{ fontSize: Math.round(fs * 0.6), fontWeight: '800', color: look.accent }}>{version.short}{'  '}</Text> : null}
                  {r.a != null ? <Text style={[bg ? { backgroundColor: bg } : null, deco]}>{r.a}</Text> : <Text style={{ color: look.muted }}>—</Text>}
                  {m?.note ? <Text style={{ color: look.accent }}>{' ✎'}</Text> : null}
                  {m?.saved ? <Text style={{ color: look.accent }}>{' ★'}</Text> : null}
                </Text>
              );
              const cellB = (
                <Text onPress={press} accessibilityRole={press ? 'button' : undefined} accessibilityLabel={tx('Versículo {n}, {short}. {b}', { n, short: second.short, b: r.b ?? tx('No está en esta Biblia.') })} suppressHighlighting
                  style={[{ fontSize: fsB, lineHeight: lhB, color: look.muted }, twoCols ? { flex: 1 } : { marginTop: Math.round(fs * 0.12) }, family()]}>
                  {twoCols ? <Text style={[{ fontSize: Math.round(fs * 0.72) }, family(true)]}>{n}{' '}</Text>
                    : <Text style={{ fontSize: Math.round(fs * 0.6), fontWeight: '800' }}>{second.short}{'  '}</Text>}
                  {r.b != null ? <Text style={[bg ? { backgroundColor: bg } : null, deco]}>{r.b}</Text> : <Text>—</Text>}
                </Text>
              );
              return (
                <View key={n} style={twoCols
                  ? { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: Math.round(fs * 0.45) }
                  : { marginBottom: Math.round(fs * 0.6), paddingBottom: Math.round(fs * 0.45), borderBottomWidth: 1, borderBottomColor: look.line }}>
                  {cellA}
                  {cellB}
                </View>
              );
            })}
          </>
        ) : (
          <Text style={[{ fontSize: fs, lineHeight: lh, color: look.text }, family()]}>
            {verses.map((t, i) => {
              const n = i + 1;
              const on = picked.includes(n);
              const m = marks[n];
              const bg = speaking === n ? (look.dark ? '#3A4A2A' : '#E4F3D8') : markBg(m?.color, look.dark);
              return (
                <Text key={n} onPress={() => toggle(n)} accessibilityLabel={tx('Versículo {n}. {t}', { n, t })} suppressHighlighting>
                  {byLine && i ? '\n' : null}
                  <Text style={{ fontSize: Math.round(fs * 0.62), color: look.muted }}>{n}{'\u00A0'}</Text>
                  <Text style={[bg ? { backgroundColor: bg } : null, on ? { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: look.accent } : null]}>{t}</Text>
                  {m?.note ? <Text style={{ color: look.accent }}>{' ✎'}</Text> : null}
                  {m?.saved ? <Text style={{ color: look.accent }}>{' ★'}</Text> : null}
                  {' '}
                </Text>
              );
            })}
          </Text>
        )}
        {!verses.length ? <Text style={{ fontSize: 14, color: look.muted, textAlign: 'center', marginVertical: 24 }}>{tx('Cargando el texto…')}</Text> : null}
        {inPlan ? (
          isRead ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
              <Feather name="check-circle" size={16} color={look.accent} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: look.accent }}>{tx('Leído en tu plan')}</Text>
            </View>
          ) : (
            <Button title={tx('Marcar como leído en mi plan')} icon="check" variant="ghost" small onPress={() => { markRead(); }} style={{ marginTop: 10 }} />
          )
        ) : null}
        <Text style={{ fontSize: 12, color: look.muted, textAlign: 'center', marginTop: 28 }}>{tx(version.notice)}{second ? `\n${tx(second.notice)}` : ''}</Text>
      </ScrollView>

      {/* Flotando abajo: capítulo anterior, escuchar y capítulo siguiente */}
      {!picked.length ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: (embedded ? 0 : insets.bottom) + 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 }}>
          {roundBtn('chevron-left', tx('Capítulo anterior'), () => prev && open(prev), false, !prev)}
          {(speakAvailable || (narrReady > 0 && !!narratedUrl(version.id, book, chapter))) && fOn('biblia_audio') ? roundBtn(speaking >= 0 ? 'square' : 'play', speaking >= 0 ? tx('Parar la lectura') : tx('Escuchar el capítulo'), listen, true) : <View />}
          {roundBtn('chevron-right', tx('Capítulo siguiente'), goNext, false, !next)}
        </View>
      ) : null}

      {/* La lista de libros: se toca el libro y después el capítulo */}
      <Modal visible={booksOpen} animationType="slide" onRequestClose={() => setBooksOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 8 }}>
            <Pressable onPress={() => setBooksOpen(false)} accessibilityRole="button" accessibilityLabel={tx('Cerrar')} hitSlop={8} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={22} color={colors.text} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text, marginRight: 44 }}>{tx('Libros')}</Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: insets.bottom + 30, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
            {BOOKS.map((_, i) => {
              const isOpen = bookOpen === i;
              const one = chaptersIn(i) === 1;
              return (
                <View key={i}>
                  {i === OT_COUNT ? <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} /> : null}
                  <Pressable onPress={() => (one ? open({ book: i, chapter: 1 }) : setBookOpen(isOpen ? null : i))} accessibilityRole="button" accessibilityLabel={bookNameIn(version, i)} style={{ paddingVertical: 13 }}>
                    <Text style={{ fontSize: 20, fontWeight: i === book ? '800' : '500', color: colors.text }}>{bookNameIn(version, i).toUpperCase()}</Text>
                  </Pressable>
                  {isOpen ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
                      {Array.from({ length: chaptersIn(i) }, (_x, k) => k + 1).map((c) => {
                        const here = i === book && c === chapter;
                        return (
                          <Pressable key={c} onPress={() => open({ book: i, chapter: c })} accessibilityRole="button" accessibilityLabel={`${bookNameIn(version, i)} ${c}`}
                            style={{ minWidth: 50, height: 46, paddingHorizontal: 8, borderRadius: 12, backgroundColor: here ? colors.text : colors.input, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: here ? colors.bg : colors.text }}>{c}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Elegir la versión */}
      <Modal visible={versionsOpen} transparent animationType="fade" onRequestClose={() => setVersionsOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setVersionsOpen(false)} accessibilityLabel={tx('Cerrar')}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: insets.bottom + 18, gap: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 }}>{tx('Versión')}</Text>
            {allowedVersions().map((v) => (
              <Pressable key={v.id} onPress={() => { setVersionId(v.id); setVersionsOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: v.id === version.id }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 17, fontWeight: v.id === version.id ? '800' : '500', color: colors.text }}>{v.name}</Text>
                {v.id === version.id ? <Feather name="check" size={20} color={colors.text} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {picked.length ? (
        <View style={{ paddingTop: 10, paddingHorizontal: 12, paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }} numberOfLines={1}>{text().split('\n').pop()}</Text>
            <Pressable onPress={() => { setPicked([]); setCopied(false); }} accessibilityRole="button" accessibilityLabel={tx('Quitar selección')} hitSlop={10}>
              <Feather name="x" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {fOn('biblia_referencias') ? (
            <Pressable onPress={() => setRefsOpen(true)} accessibilityRole="button" accessibilityLabel={tx('Referencias: versículos que hablan de lo mismo')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: colors.blueSoft }}>
              <Feather name="link" size={14} color={colors.blueText} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.blueText }}>{tx('Referencias')}</Text>
            </Pressable>
            ) : null}
            {fOn('biblia_originales') ? (
            <Pressable onPress={() => setWordsOpen(true)} accessibilityRole="button" accessibilityLabel={tx('{wordsTitle}: el versículo en hebreo o griego, con los números de Strong', { wordsTitle: wordsTitle(version) })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: colors.blueSoft }}>
              <Feather name="book-open" size={14} color={colors.blueText} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.blueText }}>{wordsTitle(version)}</Text>
            </Pressable>
            ) : null}
          </View>
          {fOn('biblia_marcas') ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {MARK_COLORS.map((c) => {
              const on = sorted.every((v) => marks[v]?.color === c.id);
              return (
                <Pressable key={c.id} onPress={() => apply({ color: on ? null : c.id })} accessibilityRole="button" accessibilityLabel={tx('Resaltar en {label}', { label: c.label.toLowerCase() })}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.dot, borderWidth: on ? 3 : 1, borderColor: on ? colors.text : colors.border }} />
              );
            })}
            <Pressable onPress={() => apply({ color: null })} accessibilityRole="button" accessibilityLabel={tx('Quitar el color')}
              style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="slash" size={16} color={colors.muted} />
            </Pressable>
          </View>
          ) : null}
          <View style={{ flexDirection: 'row' }}>
            {fOn('biblia_marcas') ? barBtn('edit-3', marks[sorted[0]]?.note ? tx('Ver nota') : tx('Nota'), openNote) : null}
            {barBtn(copied ? 'check' : 'copy', copied ? tx('Copiado') : tx('Copiar'), () => { Clipboard.setStringAsync(text()).then(() => setCopied(true)).catch(() => undefined); })}
            {barBtn('share-2', tx('Compartir'), () => { shareText(text(), `${bookName(book)} ${chapter}`).catch(() => undefined); })}
            {fOn('biblia_marcas') ? barBtn('star', allSaved ? tx('Guardado') : tx('Guardar'), () => apply({ saved: !allSaved })) : null}
            {!fOn('biblia_imagen') ? null : barBtn('image', tx('Imagen'), () => router.push({ pathname: '/biblia/imagen', params: { libro: String(book), cap: String(chapter), vs: sorted.join(','), v: version.id } }))}
          </View>
        </View>
      ) : null}

      <BibleRefsSheet visible={refsOpen} onClose={() => setRefsOpen(false)} version={version} book={book} chapter={chapter} verses={sorted}
        onOpen={(r) => { setRefsOpen(false); router.push({ pathname: '/biblia/leer', params: { libro: String(r.book), cap: String(r.chapter), v: version.id, ver: String(r.verse) } }); }} />

      <BibleWordsSheet visible={wordsOpen} onClose={() => setWordsOpen(false)} version={version} book={book} chapter={chapter} verses={sorted}
        onOpen={(r) => { setWordsOpen(false); router.push({ pathname: '/biblia/leer', params: { libro: String(r.book), cap: String(r.chapter), v: version.id, ver: String(r.verse) } }); }} />

      {/* Letra, tamaño, fondo y espacio entre líneas */}
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setMenu(false)} accessibilityLabel={tx('Cerrar')} />
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '78%' }}>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 18, gap: 16, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.text }}>{tx('Cómo querés leer')}</Text>
              <Pressable onPress={() => setMenu(false)} accessibilityRole="button" accessibilityLabel={tx('Cerrar')} hitSlop={10}><Feather name="x" size={24} color={colors.muted} /></Pressable>
            </View>
            {fOn('biblia_marcas') ? (
              <Pressable onPress={() => { setMenu(false); router.push('/biblia/marcas'); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
                <Feather name="edit-3" size={20} color={colors.text} />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{tx('Mis notas y resaltados')}</Text>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => { setMenu(false); router.push('/biblia/textos'); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
              <Feather name="info" size={20} color={colors.text} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{tx('Acerca de los textos')}</Text>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {allowedVersions().length > 1 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{tx('COMPARAR DOS VERSIONES')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {chip(tx('No comparar'), !second, () => setCompareId(undefined))}
                  {allowedVersions().filter((v) => v.id !== version.id).map((v) => chip(`Con ${v.name}`, second?.id === v.id, () => setCompareId(v.id)))}
                </View>
                {second ? (
                  width >= COMPARE_WIDE ? (
                    <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Se ven las dos a la vez, una al lado de la otra. Lo que resaltás, anotás, copiás o compartís es de la {name}.', { name: version.name })}</Text>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {chip(tx('Una debajo de la otra'), !compareCols, () => setCompareCols(false))}
                        {chip(tx('En dos columnas'), compareCols, () => setCompareCols(true))}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.muted }}>{tx('En el teléfono se lee mejor una debajo de la otra. Lo que resaltás, anotás, copiás o compartís es de la {name}.', { name: version.name })}</Text>
                    </>
                  )
                ) : (
                  <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Para leer el mismo capítulo en dos Biblias a la vez, versículo por versículo.')}</Text>
                )}
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{tx('CÓMO SE VE EL TEXTO')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {chip(tx('Seguido, como un libro'), !byLine, () => setByLine(false))}
                {chip(tx('Cada versículo en su renglón'), byLine, () => setByLine(true))}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{tx('TAMAÑO DE LA LETRA')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Button title="A" variant="outline" small disabled={size <= SIZES[0]} onPress={() => bump(-1)} style={{ width: 64 }} />
                <Text style={{ flex: 1, textAlign: 'center', fontSize: size, color: colors.text }}>{tx('Aa')}</Text>
                <Button title="A" variant="outline" disabled={size >= SIZES[SIZES.length - 1]} onPress={() => bump(1)} style={{ width: 64 }} />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{tx('LETRA')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {BIBLE_FONTS.map((f) => chip(f.label, fontId === f.id, () => setFontId(f.id)))}
              </View>
              <Text style={{ fontSize: 12, color: colors.muted }}>{fontOf(fontId).hint}{fontId !== fontReady ? tx(' · cargando…') : ''}</Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{tx('FONDO')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {chip(tx('Automático'), themeId === 'auto', () => setThemeId('auto'))}
                {BIBLE_THEMES.map((t) => (
                  <Pressable key={t.id} onPress={() => setThemeId(t.id)} accessibilityRole="button" accessibilityLabel={tx('Fondo {label}', { label: t.label.toLowerCase() })} accessibilityState={{ selected: themeId === t.id }}
                    style={{ alignItems: 'center', gap: 4, width: 66 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.bg, borderWidth: themeId === t.id ? 3 : 1, borderColor: themeId === t.id ? colors.blue : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>A</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.text, textAlign: 'center' }} numberOfLines={1}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{tx('ESPACIO ENTRE LÍNEAS')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {SPACINGS.map((s) => chip(s.label, spacing === s.id, () => setSpacing(s.id)))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* La nota del versículo */}
      <Modal visible={noteOpen} transparent animationType="slide" onRequestClose={() => setNoteOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setNoteOpen(false)} accessibilityLabel={tx('Cerrar')} />
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: insets.bottom + 18, gap: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{tx('Nota en {bookName} {chapter}:{sorted}', { bookName: bookName(book), chapter, sorted: sorted[0] })}</Text>
          <TextInput value={noteText} onChangeText={setNoteText} multiline autoFocus placeholder={tx('Escribí lo que querés recordar de este versículo')} placeholderTextColor={colors.muted}
            style={{ minHeight: 120, maxHeight: 260, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {marks[sorted[0]]?.note ? <Button title={tx('Borrar')} icon="trash-2" variant="outline" onPress={() => { apply({ note: null }, [sorted[0]]); setNoteOpen(false); }} /> : null}
            <Button title={tx('Guardar la nota')} icon="check" style={{ flex: 1 }} onPress={() => { apply({ note: noteText.trim() || null }, [sorted[0]]); setNoteOpen(false); }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Solo vos ves tus notas. Quedan guardadas en tu cuenta y se ven en cualquier versión de la Biblia.')}</Text>
        </View>
      </Modal>
    </View>
  );
}
