// Leer un capítulo de la Biblia como en un libro: cada versículo empieza con su número, el texto corre seguido.
// Arriba a la derecha (los tres puntos) se elige letra, tamaño, fondo y espacio entre líneas; el parlante lo lee en voz alta.
// Al tocar versículos quedan subrayados con puntitos y abajo se abre la barra: color para resaltar, nota, copiar, compartir y guardar.
// Lo que se marca va por libro, capítulo y versículo, así se ve igual en cualquier versión. Lo leído se anota solo en el plan de lectura.
// "Referencias" abre los versículos relacionados con el que se tocó. La versión (español o inglés) se cambia en los tres puntos.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { BibleRefsSheet } from '@/components/BibleRefsSheet';
import { BibleVersionChips } from '@/components/BibleVersionChips';
import { Header } from '@/components/Screen';
import { Button } from '@/components/ui';
import { myBiblePlan, type BiblePlanRow } from '@/lib/api';
import { bookName, bookNameIn, chapterDays, chapterKey, chapterText, chaptersIn, cleanPlace, neighbor, shareVerses, versionOf } from '@/lib/bible';
import { loadBibleFont } from '@/lib/bibleFonts';
import { BIBLE_FONTS, BIBLE_THEMES, MARK_COLORS, SPACINGS, fontOf, markBg, spacingOf, themeOf, type BibleFontId, type BibleTheme } from '@/lib/bibleLook';
import { chapterMarks, setMarks, type BibleMark } from '@/lib/bibleMarks';
import { markChapterRead, loadRead, onPlanMarked, recentPlanNote } from '@/lib/bibleRead';
import { DEFAULT_PREFS, SIZES, loadBiblePrefs, saveBiblePrefs } from '@/lib/bibleStore';
import { shareText } from '@/lib/share';
import { speakAvailable, speakParts, stopSpeaking } from '@/lib/speak';
import { colors, getThemeMode } from '@/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

export default function LeerBiblia() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ libro?: string; cap?: string; v?: string; ver?: string }>();
  const place = cleanPlace(params.libro, params.cap) ?? { book: DEFAULT_PREFS.book, chapter: 1 };
  const { book, chapter } = place;
  const version = versionOf(params.v);
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
  const [refsOpen, setRefsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [speaking, setSpeaking] = useState(-1);
  const [plan, setPlan] = useState<BiblePlanRow | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(recentPlanNote());

  const verses = useMemo(() => chapterText(version, book, chapter), [version, book, chapter]);
  const prev = neighbor(book, chapter, -1);
  const next = neighbor(book, chapter, 1);
  const single = chaptersIn(book) === 1;
  const inPlan = !!plan && chapterDays(plan.plan, book, chapter).length > 0;
  const isRead = read.has(chapterKey(book, chapter));

  // Los colores de lectura: el fondo elegido, o los de la app si quedó en "Automático".
  const look: BibleTheme = themeOf(themeId) ?? { id: 'auto', label: 'Automático', bg: colors.bg, text: colors.text, muted: colors.muted, accent: colors.blueText, line: colors.border, dark: getThemeMode() === 'dark' };
  const font = fontOf(fontReady);
  const fs = Math.round(size * font.scale);
  const lh = Math.round(fs * spacingOf(spacing));

  // Lo elegido se recuerda; y dónde se quedó, para "Seguir leyendo".
  useEffect(() => {
    loadBiblePrefs().then((p) => {
      setSize(p.size);
      setFontId(fontOf(p.font).id);
      setThemeId(themeOf(p.theme)?.id ?? 'auto');
      setSpacing(p.spacing ?? 'normal');
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (loaded) saveBiblePrefs({ version: version.id, book, chapter, size, font: fontId, theme: themeId, spacing });
  }, [loaded, version.id, book, chapter, size, fontId, themeId, spacing]);
  // La letra se baja recién cuando se elige. Mientras tanto se sigue leyendo con la anterior.
  useEffect(() => {
    let alive = true;
    loadBibleFont(fontId).then((ok) => { if (alive) setFontReady(ok ? fontId : 'sistema'); });
    return () => { alive = false; };
  }, [fontId]);
  useEffect(() => {
    setPicked(params.ver ? [Number(params.ver)].filter((n) => n >= 1 && n <= verses.length) : []);
    setCopied(false);
    setMarksState({});
    chapterMarks(book, chapter).then(setMarksState).catch(() => undefined);
    return () => { stopSpeaking(); setSpeaking(-1); };
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

  const open = (p: { book: number; chapter: number }) =>
    router.replace({ pathname: '/biblia/leer', params: { libro: String(p.book), cap: String(p.chapter), v: version.id } });

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
    if (speaking >= 0) { stopSpeaking(); setSpeaking(-1); return; }
    const from = sorted.length ? sorted[0] - 1 : 0;
    speakParts(verses.slice(from), (i) => setSpeaking(i < 0 ? -1 : from + i + 1));
  };

  const family = (bold = false) => (font.regular ? { fontFamily: bold ? font.bold : font.regular } : bold ? { fontWeight: '800' as const } : null);
  const headBtn = (icon: IconName, label: string, onPress: () => void, active = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: active ? colors.blue : colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={icon} size={19} color={active ? '#FFFFFF' : colors.blueText} />
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
      <Header title={single ? bookNameIn(version, book) : `${bookNameIn(version, book)} ${chapter}`} subtitle={version.name} back
        right={<View style={{ flexDirection: 'row', gap: 8 }}>
          {speakAvailable ? headBtn(speaking >= 0 ? 'square' : 'volume-2', speaking >= 0 ? 'Parar la lectura' : 'Escuchar el capítulo', listen, speaking >= 0) : null}
          {headBtn('more-horizontal', 'Letra, fondo y tamaño', () => setMenu(true))}
        </View>} />
      <ScrollView key={`${book}-${chapter}`} style={{ flex: 1, backgroundColor: look.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: insets.bottom + 28, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        {note ? (
          <View style={{ backgroundColor: colors.greenSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.greenText }}>{note}</Text>
          </View>
        ) : null}
        {verses.map((t, i) => {
          const n = i + 1;
          const on = picked.includes(n);
          const m = marks[n];
          const bg = speaking === n ? (look.dark ? '#3A4A2A' : '#E4F3D8') : markBg(m?.color, look.dark);
          return (
            <Text key={n} onPress={() => toggle(n)} accessibilityRole="button" accessibilityLabel={`Versículo ${n}. ${t}`} suppressHighlighting
              style={[{ fontSize: fs, lineHeight: lh, color: look.text, marginBottom: Math.round(fs * 0.18) }, family()]}>
              <Text style={[{ fontSize: Math.round(fs * 0.72), color: look.accent }, family(true)]}>{n}{' '}</Text>
              <Text style={[bg ? { backgroundColor: bg } : null, on ? { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: look.accent } : null]}>{t}</Text>
              {m?.note ? <Text style={{ color: look.accent }}>{' ✎'}</Text> : null}
              {m?.saved ? <Text style={{ color: look.accent }}>{' ★'}</Text> : null}
            </Text>
          );
        })}
        {!picked.length ? <Text style={{ fontSize: 12, color: look.muted, textAlign: 'center', marginTop: 10 }}>Tocá un versículo para resaltarlo, anotarlo, copiarlo o compartirlo.</Text> : null}
        {inPlan ? (
          isRead ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
              <Feather name="check-circle" size={16} color={look.accent} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: look.accent }}>Leído en tu plan</Text>
            </View>
          ) : (
            <Button title="Marcar como leído en mi plan" icon="check" variant="ghost" small onPress={() => { markRead(); }} style={{ marginTop: 10 }} />
          )
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Button title="Anterior" icon="chevron-left" variant="outline" disabled={!prev} onPress={() => prev && open(prev)} style={{ flex: 1 }} />
          <Button title="Siguiente" icon="chevron-right" disabled={!next} onPress={goNext} style={{ flex: 1 }} />
        </View>
        <Text style={{ fontSize: 12, color: look.muted, textAlign: 'center', marginTop: 10 }}>{version.notice}</Text>
      </ScrollView>

      {picked.length ? (
        <View style={{ paddingTop: 10, paddingHorizontal: 12, paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }} numberOfLines={1}>{text().split('\n').pop()}</Text>
            <Pressable onPress={() => setRefsOpen(true)} accessibilityRole="button" accessibilityLabel="Referencias: versículos que hablan de lo mismo"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: colors.blueSoft }}>
              <Feather name="link" size={14} color={colors.blueText} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.blueText }}>Referencias</Text>
            </Pressable>
            <Pressable onPress={() => { setPicked([]); setCopied(false); }} accessibilityRole="button" accessibilityLabel="Quitar selección" hitSlop={10}>
              <Feather name="x" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {MARK_COLORS.map((c) => {
              const on = sorted.every((v) => marks[v]?.color === c.id);
              return (
                <Pressable key={c.id} onPress={() => apply({ color: on ? null : c.id })} accessibilityRole="button" accessibilityLabel={`Resaltar en ${c.label.toLowerCase()}`}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.dot, borderWidth: on ? 3 : 1, borderColor: on ? colors.text : colors.border }} />
              );
            })}
            <Pressable onPress={() => apply({ color: null })} accessibilityRole="button" accessibilityLabel="Quitar el color"
              style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="slash" size={16} color={colors.muted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {barBtn('edit-3', marks[sorted[0]]?.note ? 'Ver nota' : 'Nota', openNote)}
            {barBtn(copied ? 'check' : 'copy', copied ? 'Copiado' : 'Copiar', () => { Clipboard.setStringAsync(text()).then(() => setCopied(true)).catch(() => undefined); })}
            {barBtn('share-2', 'Compartir', () => { shareText(text(), `${bookName(book)} ${chapter}`).catch(() => undefined); })}
            {barBtn('star', allSaved ? 'Guardado' : 'Guardar', () => apply({ saved: !allSaved }))}
            {barBtn('image', 'Imagen', () => router.push({ pathname: '/biblia/imagen', params: { libro: String(book), cap: String(chapter), vs: sorted.join(','), v: version.id } }))}
          </View>
        </View>
      ) : null}

      <BibleRefsSheet visible={refsOpen} onClose={() => setRefsOpen(false)} version={version} book={book} chapter={chapter} verses={sorted}
        onOpen={(r) => { setRefsOpen(false); router.push({ pathname: '/biblia/leer', params: { libro: String(r.book), cap: String(r.chapter), v: version.id, ver: String(r.verse) } }); }} />

      {/* Letra, tamaño, fondo y espacio entre líneas */}
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setMenu(false)} accessibilityLabel="Cerrar" />
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '78%' }}>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 18, gap: 16, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.text }}>Cómo querés leer</Text>
              <Pressable onPress={() => setMenu(false)} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={10}><Feather name="x" size={24} color={colors.muted} /></Pressable>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>BIBLIA</Text>
              <BibleVersionChips value={version.id} onChange={(v) => router.replace({ pathname: '/biblia/leer', params: { libro: String(book), cap: String(chapter), v: v.id } })} />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>TAMAÑO DE LA LETRA</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Button title="A" variant="outline" small disabled={size <= SIZES[0]} onPress={() => bump(-1)} style={{ width: 64 }} />
                <Text style={{ flex: 1, textAlign: 'center', fontSize: size, color: colors.text }}>Aa</Text>
                <Button title="A" variant="outline" disabled={size >= SIZES[SIZES.length - 1]} onPress={() => bump(1)} style={{ width: 64 }} />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>LETRA</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {BIBLE_FONTS.map((f) => chip(f.label, fontId === f.id, () => setFontId(f.id)))}
              </View>
              <Text style={{ fontSize: 12, color: colors.muted }}>{fontOf(fontId).hint}{fontId !== fontReady ? ' · cargando…' : ''}</Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>FONDO</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {chip('Automático', themeId === 'auto', () => setThemeId('auto'))}
                {BIBLE_THEMES.map((t) => (
                  <Pressable key={t.id} onPress={() => setThemeId(t.id)} accessibilityRole="button" accessibilityLabel={`Fondo ${t.label.toLowerCase()}`} accessibilityState={{ selected: themeId === t.id }}
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
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>ESPACIO ENTRE LÍNEAS</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {SPACINGS.map((s) => chip(s.label, spacing === s.id, () => setSpacing(s.id)))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* La nota del versículo */}
      <Modal visible={noteOpen} transparent animationType="slide" onRequestClose={() => setNoteOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setNoteOpen(false)} accessibilityLabel="Cerrar" />
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: insets.bottom + 18, gap: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>Nota en {bookName(book)} {chapter}:{sorted[0]}</Text>
          <TextInput value={noteText} onChangeText={setNoteText} multiline autoFocus placeholder="Escribí lo que querés recordar de este versículo" placeholderTextColor={colors.muted}
            style={{ minHeight: 120, maxHeight: 260, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {marks[sorted[0]]?.note ? <Button title="Borrar" icon="trash-2" variant="outline" onPress={() => { apply({ note: null }, [sorted[0]]); setNoteOpen(false); }} /> : null}
            <Button title="Guardar la nota" icon="check" style={{ flex: 1 }} onPress={() => { apply({ note: noteText.trim() || null }, [sorted[0]]); setNoteOpen(false); }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.muted }}>Solo vos ves tus notas. Quedan guardadas en tu cuenta y se ven en cualquier versión de la Biblia.</Text>
        </View>
      </Modal>
    </View>
  );
}
