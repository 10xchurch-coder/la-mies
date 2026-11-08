// El devocional del día a pantalla completa, como en la app de la Biblia.
// Se pasa con el dedo: versículo → frase → lectura de hoy → devocional completo (lectura + estudio + oración).
// Abajo: compartir (la diapositiva como imagen), comentarios del día (un chat de 24 horas para la iglesia),
// corazón y días anteriores (hasta 31 días). Abrir el de hoy cuenta para la racha.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayBackground, VerseCard } from '@/components/VerseCard';
import { Face } from '@/components/Face';
import { Button } from '@/components/ui';
import {
  dailyComments, dailyFor, dailyRange, dailySocial, deleteDailyComment, markReading, readingStreak, sendDailyComment, setDailyLike,
} from '@/lib/api';
import { shareImage, shareText, WEB_URL } from '@/lib/share';
import { supabase, errorMessage } from '@/lib/supabase';
import { addDays, fmtDateShort, fmtTime, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useKeyboardHeight } from '@/lib/keyboard';
import { colors, themed } from '@/theme';
import type { DailyComment, DailyContent, DailySocial, ReadingStreak } from '@/types';
import { moderate } from '@/lib/moderation';

type Slide = 'verse' | 'phrase' | 'reading' | 'full';

/** Párrafos del texto. Un párrafo escrito entre ** ** es un título; **palabra** sale en negrita. */
function Paragraphs({ text, size = 16, color, headingColor }: { text: string; size?: number; color?: string; headingColor?: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((raw, i) => {
        const p = raw.trim();
        const heading = p.match(/^\*\*(.+)\*\*$/);
        if (heading) return <Text key={i} style={[styles.heading, { color: headingColor ?? colors.text }, i === 0 && { marginTop: 0 }]}>{heading[1]}</Text>;
        const parts = p.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        return (
          <Text key={i} style={{ fontSize: size, lineHeight: Math.round(size * 1.55), color: color ?? colors.text }}>
            {parts.map((part, j) => (part.startsWith('**') ? <Text key={j} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text> : part))}
          </Text>
        );
      })}
    </>
  );
}

/** Texto plano para compartir (sin los ** de los títulos). */
function plain(text: string): string {
  return text.split(/\n{2,}/).map((p) => {
    const t = p.trim();
    const h = t.match(/^\*\*(.+)\*\*$/);
    return h ? h[1].toUpperCase() : t.replace(/\*\*([^*]+)\*\*/g, '$1');
  }).join('\n\n');
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === isoDate(addDays(new Date(`${today}T12:00:00`), -1))) return 'Ayer';
  return fmtDateShort(date);
}

export default function Devocional() {
  const router = useRouter();
  const { fecha } = useLocalSearchParams<{ fecha?: string }>();
  const { church, isStaff } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const W = Math.min(winW, 520);
  const H = winH;
  const today = isoDate(new Date());
  const [date, setDate] = useState<string>(fecha || today);
  const [item, setItem] = useState<DailyContent | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [social, setSocial] = useState<DailySocial>({ comments: 0, likes: 0, liked: false, open: false });
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState<null | 'comments' | 'days' | 'streak' | 'reader'>(null);
  const pager = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const slideRefs = useRef<Record<string, React.ComponentRef<typeof View> | null>>({});

  const load = useCallback(async (d: string) => {
    setItem(undefined);
    setFailed(false);
    try {
      const it = await dailyFor(d === today ? null : d);
      setItem(it);
      dailySocial(it?.on_date ?? d).then(setSocial).catch(() => undefined);
    } catch {
      setFailed(true);
      setItem(null);
    }
    (d === today ? markReading() : readingStreak()).then(setStreak).catch(() => undefined);
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      load(date);
    }, [date, load]),
  );

  useEffect(() => {
    if (streak?.read_today && streak.current > 0 && [7, 30, 365].includes(streak.current) && date === today) {
      const label = streak.current === 7 ? 'una semana' : streak.current === 30 ? 'un mes' : 'un año';
      Alert.alert('¡Felicitaciones!', `Llevás ${label} seguida leyendo la Palabra cada día. Seguí así.`);
    }
  }, [streak?.current, streak?.read_today]);

  const slides: Slide[] = useMemo(() => (item
    ? ['verse', ...(item.message ? ['phrase' as const] : []), ...(item.devotional ? ['reading' as const] : []), ...(item.study || item.prayer || item.devotional ? ['full' as const] : [])]
    : []), [item]);

  const goTo = (i: number) => {
    pager.current?.scrollTo({ x: i * W, animated: true });
    setPage(i);
  };

  const openDay = (d: string) => {
    setSheet(null);
    setPage(0);
    pager.current?.scrollTo({ x: 0, animated: false });
    setDate(d);
  };

  const churchName = church?.name ?? 'La Mies';
  const verseText = item ? `"${item.verse}"\n${item.reference} (RV1960)` : '';
  const fullText = item
    ? [
      `${item.reference} (RV1960)`, `"${item.verse}"`, item.message ?? '',
      item.devotional ? `LECTURA DE HOY\n${plain(item.devotional)}` : '',
      item.study ? `ESTUDIO\n${plain(item.study)}` : '',
      item.prayer ? `ORACIÓN\n${item.prayer}` : '',
      `${churchName} · ${WEB_URL}`,
    ].filter(Boolean).join('\n\n')
    : '';

  const share = async () => {
    if (!item) return;
    const kind = slides[page] ?? 'verse';
    if (kind === 'full') return shareFull();
    const fallback = kind === 'phrase'
      ? `${item.message}\n${item.reference}\n\n${churchName} · ${WEB_URL}`
      : kind === 'reading'
        ? `${verseText}\n\n${plain(item.devotional ?? '')}\n\n${churchName} · ${WEB_URL}`
        : `${verseText}${item.message ? `\n\n${item.message}` : ''}\n\n${churchName} · ${WEB_URL}`;
    try {
      const ref = slideRefs.current[kind];
      const ok = ref
        ? await shareImage(async () => {
          const { captureRef } = await import('react-native-view-shot');
          return captureRef(ref as unknown as number, { format: 'png', quality: 1, result: 'tmpfile' });
        })
        : false;
      if (!ok) {
        const r = await shareText(fallback);
        if (r === 'copied') Alert.alert('Texto copiado', 'Quedó copiado para pegarlo donde quieras. Para compartirlo como imagen, usá la app del teléfono.');
      }
    } catch (e) {
      Alert.alert('No se pudo compartir', errorMessage(e));
    }
  };

  const shareFull = async () => {
    if (!item) return;
    const r = await shareText(fullText, `Devocional · ${item.reference}`);
    if (r === 'copied') Alert.alert('Copiado', 'El devocional completo quedó copiado para pegarlo donde quieras.');
  };

  const toggleLike = async () => {
    if (!item) return;
    const next = !social.liked;
    setSocial({ ...social, liked: next, likes: Math.max(0, social.likes + (next ? 1 : -1)) });
    try {
      await setDailyLike(item.on_date, next);
    } catch (e) {
      setSocial(social);
      Alert.alert('No se pudo', errorMessage(e));
    }
  };

  // ---------- pantallas de carga y error ----------
  if (item === undefined) {
    return (
      <View style={styles.black}>
        <StatusBar style="light" />
        <ActivityIndicator color="#FFF" />
      </View>
    );
  }
  if (!item) {
    return (
      <View style={[styles.black, { padding: 32, gap: 14 }]}>
        <StatusBar style="light" />
        <Feather name={failed ? 'wifi-off' : 'book-open'} size={40} color="#FFF" />
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
          {failed ? 'No se pudo cargar el devocional' : 'Todavía no hay versículo para este día'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          {failed ? 'Revisá la conexión y probá de nuevo. Si sigue igual, cerrá la app y volvé a abrirla.' : isStaff ? 'Cargalo desde Iglesia → Devocionales.' : 'El pastor o la secretaría lo van a cargar.'}
        </Text>
        {failed ? <Button title="Reintentar" icon="refresh-cw" onPress={() => load(date)} /> : null}
        <Button title="Cerrar" variant="outline" onPress={() => router.back()} />
      </View>
    );
  }

  const slideH = H;
  const padTop = insets.top + 92;
  const padBottom = insets.bottom + 104;

  return (
    <View style={styles.black}>
      <StatusBar style="light" />
      <View style={{ width: W, height: H, alignSelf: 'center' }}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
          onScroll={Platform.OS === 'web' ? (e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W)) : undefined}
          scrollEventThrottle={64}
          style={{ width: W, height: H }}
        >
          {slides.map((s) => (
            <View key={s} style={{ width: W, height: slideH }}>
              {s === 'verse' ? (
                <View ref={(r) => { slideRefs.current.verse = r; }} collapsable={false} style={{ flex: 1 }}>
                  <VerseCard item={item} church={churchName} hideMessage={!!item.message} width={W} height={H}
                    style={{ paddingTop: padTop, paddingBottom: padBottom }} />
                </View>
              ) : s === 'phrase' ? (
                <View ref={(r) => { slideRefs.current.phrase = r; }} collapsable={false} style={[styles.slide, { paddingTop: padTop, paddingBottom: padBottom }]}>
                  <DayBackground background={item.background} date={item.on_date} width={W} height={H} />
                  <Text style={styles.slideLabel}>Para pensar hoy</Text>
                  <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
                    <Text style={styles.phrase}>{item.message}</Text>
                    <Text style={styles.slideRef}>{item.reference}</Text>
                  </View>
                  <Text style={styles.foot}>{churchName} · RV1960</Text>
                </View>
              ) : s === 'reading' ? (
                <View ref={(r) => { slideRefs.current.reading = r; }} collapsable={false} style={[styles.slide, { paddingTop: padTop, paddingBottom: padBottom }]}>
                  <DayBackground background={item.background} date={item.on_date} width={W} height={H} dim="strong" />
                  <Text style={styles.slideLabel}>Lectura de hoy · {item.reference}</Text>
                  <ScrollView style={{ flex: 1, marginVertical: 14 }} contentContainerStyle={{ gap: 14, flexGrow: 1, justifyContent: 'center' }} nestedScrollEnabled>
                    <Paragraphs text={item.devotional as string} size={18} color="#FFFFFF" headingColor="#FFFFFF" />
                  </ScrollView>
                  <Text style={styles.foot}>{churchName}</Text>
                </View>
              ) : (
                <View style={[styles.slide, { paddingTop: padTop, paddingBottom: padBottom, alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
                  <DayBackground background={item.background} date={item.on_date} width={W} height={H} dim="strong" />
                  <Feather name="book-open" size={50} color="#FFFFFF" />
                  <Text style={styles.fullTitle}>Devocional completo</Text>
                  <Text style={styles.fullText}>
                    La lectura de hoy, {item.study ? 'el estudio de 5 a 10 minutos ' : ''}y una oración para terminar. Para leer con calma y compartir.
                  </Text>
                  <Pressable onPress={() => setSheet('reader')} style={styles.readBtn} accessibilityRole="button">
                    <Feather name="maximize-2" size={17} color="#1F6B45" />
                    <Text style={{ color: '#1F6B45', fontWeight: '800', fontSize: 16 }}>Leer ahora</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Tocar a los costados también pasa de página (como los estados de WhatsApp). */}
        {slides.length > 1 ? (
          <>
            <Pressable onPress={() => page > 0 && goTo(page - 1)} accessibilityRole="button" accessibilityLabel="Página anterior"
              style={{ position: 'absolute', left: 0, top: padTop, bottom: padBottom, width: W * (slides[page] === 'reading' ? 0.16 : 0.26) }} />
            <Pressable onPress={() => page < slides.length - 1 && goTo(page + 1)} accessibilityRole="button" accessibilityLabel="Página siguiente"
              style={{ position: 'absolute', right: 0, top: padTop, bottom: padBottom, width: W * (slides[page] === 'reading' ? 0.16 : 0.26) }} />
          </>
        ) : null}

        {/* Arriba: barras de avance, cerrar, día y racha. */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {slides.map((s, i) => (
              <Pressable key={s} onPress={() => goTo(i)} style={{ flex: 1, paddingVertical: 6 }} accessibilityLabel={`Ir a la parte ${i + 1}`}>
                <View style={[styles.seg, i <= page && styles.segOn]} />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => router.back()} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Feather name="x" size={22} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{dayLabel(item.on_date, today)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }} numberOfLines={1}>Devocional · {churchName}</Text>
            </View>
            {isStaff ? (
              <Pressable onPress={() => router.push('/admin/devocionales')} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Cargar devocionales">
                <Feather name="edit-3" size={18} color="#FFF" />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setSheet('streak')} style={styles.streakChip} accessibilityRole="button" accessibilityLabel="Mi racha">
              <Feather name="zap" size={15} color="#FFD54A" />
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>{streak?.current ?? 0}</Text>
            </Pressable>
          </View>
        </View>

        {/* Abajo: compartir, comentarios, corazón y días anteriores. */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
          <Action icon={<Feather name="share-2" size={24} color="#FFF" />} label="Compartir" onPress={share} />
          <Action icon={<Feather name="message-circle" size={24} color="#FFF" />} label={social.comments ? String(social.comments) : 'Comentar'} onPress={() => setSheet('comments')} />
          <Action
            icon={<Ionicons name={social.liked ? 'heart' : 'heart-outline'} size={26} color={social.liked ? '#FF5A6E' : '#FFF'} />}
            label={social.likes ? String(social.likes) : 'Me gusta'}
            onPress={toggleLike}
          />
          <Action icon={<Feather name="calendar" size={24} color="#FFF" />} label="Días anteriores" onPress={() => setSheet('days')} />
        </View>
      </View>

      <CommentsSheet visible={sheet === 'comments'} date={item.on_date} today={today} isStaff={isStaff} onClose={() => setSheet(null)}
        onCount={(n) => setSocial((s) => ({ ...s, comments: n }))} />
      <DaysSheet visible={sheet === 'days'} current={item.on_date} today={today} onPick={openDay} onClose={() => setSheet(null)} />
      <StreakSheet visible={sheet === 'streak'} streak={streak} onClose={() => setSheet(null)} onBoard={() => { setSheet(null); router.push('/devocional/lectores'); }} />
      <ReaderSheet visible={sheet === 'reader'} item={item} label={dayLabel(item.on_date, today)} social={social}
        onShare={shareFull} onComments={() => setSheet('comments')} onClose={() => setSheet(null)} />
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.action} accessibilityRole="button" accessibilityLabel={label}>
      {icon}
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ---------- Devocional completo (lectura + estudio + oración) ----------
function ReaderSheet({ visible, item, label, social, onShare, onComments, onClose }: {
  visible: boolean; item: DailyContent; label: string; social: DailySocial; onShare: () => void; onComments: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <StatusBar style="auto" />
        <View style={styles.readerBar}>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Feather name="x" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.green, textTransform: 'uppercase', letterSpacing: 1 }}>Devocional completo</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{item.reference} · {label}</Text>
          </View>
          <Pressable onPress={onShare} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Compartir el devocional completo">
            <Feather name="share-2" size={20} color={colors.green} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
          <View style={styles.readerVerse}>
            <Text style={{ fontSize: 17, lineHeight: 27, color: colors.text, fontWeight: '600', fontStyle: 'italic' }}>{item.verse}</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green, marginTop: 8 }}>{item.reference} · RV1960</Text>
          </View>
          {item.devotional ? (
            <>
              <Text style={styles.readerSection}>Lectura de hoy</Text>
              <Paragraphs text={item.devotional} size={17} />
            </>
          ) : null}
          {item.study ? (
            <>
              <Text style={styles.readerSection}>Estudio</Text>
              <Paragraphs text={item.study} size={17} />
            </>
          ) : null}
          {item.prayer ? (
            <View style={styles.prayer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="heart" size={16} color={colors.greenText} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText, textTransform: 'uppercase', letterSpacing: 1 }}>Oración</Text>
              </View>
              <Text style={{ fontSize: 17, lineHeight: 27, color: colors.text, fontStyle: 'italic' }}>{item.prayer}</Text>
            </View>
          ) : null}
          <Button title="Compartir el devocional completo" icon="share-2" onPress={onShare} />
          <Button title={social.comments ? `Comentarios del día (${social.comments})` : 'Comentar con la iglesia'} icon="message-circle" variant="outline" onPress={onComments} />
          <Button title="Terminé de leer" variant="ghost" icon="check" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------- Comentarios del día ----------
function CommentsSheet({ visible, date, today, isStaff, onClose, onCount }: {
  visible: boolean; date: string; today: string; isStaff: boolean; onClose: () => void; onCount: (n: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [rows, setRows] = useState<DailyComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const open = date === today;

  // onCount viene de la pantalla de arriba y cambia en cada dibujo: se guarda aparte para que
  // la carga no se vuelva a disparar sola (eso hacía parpadear toda la pantalla).
  const countRef = useRef(onCount);
  countRef.current = onCount;
  const load = useCallback(() => {
    dailyComments(date).then((r) => { setRows(r); countRef.current(r.length); }).catch(() => setRows([]));
  }, [date]);

  useEffect(() => {
    if (!visible) return;
    setRows(null);
    load();
    const ch = supabase
      .channel(`daily-comments-${date}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_comments', filter: `on_date=eq.${date}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [visible, date, load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await sendDailyComment(date, body);
      setText('');
      load();
    } catch (e) {
      Alert.alert('No se envió', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (c: DailyComment) => {
    if (!c.mine && !isStaff) return;
    Alert.alert('Borrar comentario', '¿Borrar este comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => deleteDailyComment(c.id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: kb ? 10 : insets.bottom + 10, marginBottom: kb, height: kb ? '62%' : '78%' }]}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Comentarios del día{rows?.length ? ` · ${rows.length}` : ''}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{open ? 'Lo ve toda la iglesia. Se puede comentar hasta la medianoche.' : 'Este día ya cerró: se puede leer lo que comentaron.'}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Cerrar"><Feather name="x" size={20} color={colors.text} /></Pressable>
        </View>
        {rows === null ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={colors.green} />
        ) : !rows.length ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
            <Feather name="message-circle" size={34} color={colors.muted} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{open ? 'Sé el primero en comentar' : 'Nadie comentó este día'}</Text>
            {open ? <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>¿Qué te habló Dios hoy con este pasaje?</Text> : null}
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 16, gap: 14 }}
            renderItem={({ item: c }) => (
              <Pressable onLongPress={() => remove(c)} style={{ flexDirection: 'row', gap: 10 }}>
                <Face name={c.name} path={c.photo_path} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
                    {c.name}<Text style={{ fontWeight: '500', color: colors.muted }}>  {fmtTime(c.created_at)}</Text>
                  </Text>
                  <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>{c.body}</Text>
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 2 }}>
                    {c.mine || isStaff ? <Text onPress={() => remove(c)} style={{ fontSize: 11, color: colors.muted }}>Borrar</Text> : null}
                    {!c.mine ? <Text onPress={() => moderate({ kind: 'comment', targetId: c.id, authorId: c.user_id, authorName: c.name, excerpt: c.body, onChange: load })} style={{ fontSize: 11, color: colors.muted }}>Denunciar o bloquear</Text> : null}
                  </View>
                </View>
              </Pressable>
            )}
          />
        )}
        {open ? (
          <View style={styles.inputRow}>
            <TextInput value={text} onChangeText={setText} placeholder="Escribí un comentario…" placeholderTextColor="#8B918C" multiline maxLength={1000}
              style={styles.input} />
            <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.5 }]} accessibilityLabel="Enviar">
              {busy ? <ActivityIndicator color="#FFF" /> : <Feather name="send" size={19} color="#FFF" />}
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------- Días anteriores ----------
function DaysSheet({ visible, current, today, onPick, onClose }: { visible: boolean; current: string; today: string; onPick: (d: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<DailyContent[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    setRows(null);
    dailyRange(31).then(setRows).catch(() => setRows([]));
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 10, height: '80%' }]}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Días anteriores</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>El último mes. Tocá uno para volver a leerlo o compartirlo.</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Cerrar"><Feather name="x" size={20} color={colors.text} /></Pressable>
        </View>
        {rows === null ? <ActivityIndicator style={{ marginTop: 30 }} color={colors.green} /> : (
          <FlatList
            data={rows}
            keyExtractor={(d) => d.on_date}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            renderItem={({ item: d }) => (
              <Pressable onPress={() => onPick(d.on_date)} style={[styles.dayRow, d.on_date === current && { borderColor: colors.green, backgroundColor: colors.greenSoft }]} accessibilityRole="button">
                <View style={styles.dayThumb}><DayBackground background={d.background} date={d.on_date} width={60} height={80} /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.green, textTransform: 'uppercase' }}>{dayLabel(d.on_date, today)}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{d.reference}</Text>
                  {d.message ? <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={2}>{d.message}</Text> : null}
                </View>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

// ---------- Mi racha ----------
function StreakSheet({ visible, streak, onClose, onBoard }: { visible: boolean; streak: ReadingStreak | null; onClose: () => void; onBoard: () => void }) {
  const insets = useSafeAreaInsets();
  const rewards = streak?.rewards ?? [{ days: 7, label: 'Una semana', earned: false }, { days: 30, label: 'Un mes', earned: false }, { days: 365, label: 'Un año', earned: false }];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, gap: 14, padding: 18 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={styles.flame}><Feather name="zap" size={26} color={streak?.current ? '#FFF' : colors.muted} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{streak?.current ?? 0} {streak?.current === 1 ? 'día' : 'días'} seguidos</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>Mejor racha: {streak?.best ?? 0} · Total leídos: {streak?.total ?? 0}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {rewards.map((r) => (
            <View key={r.days} style={[styles.reward, r.earned && styles.rewardOn]}>
              <Feather name={r.earned ? 'award' : 'lock'} size={20} color={r.earned ? '#FFF' : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: r.earned ? '#FFF' : colors.muted, textAlign: 'center' }}>{r.label}</Text>
              <Text style={{ fontSize: 10, color: r.earned ? 'rgba(255,255,255,0.9)' : colors.muted }}>{r.days} días</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          La racha cuenta cada día que abrís el devocional de hoy. Si un día no lo abrís, vuelve a cero, pero la mejor racha y los premios quedan.
        </Text>
        <Button title="Ver los lectores de la iglesia" variant="outline" icon="users" onPress={onBoard} />
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  slide: { flex: 1, overflow: 'hidden', paddingHorizontal: 28, backgroundColor: '#1F3B2C' },
  slideLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  phrase: { color: '#FFFFFF', fontSize: 30, lineHeight: 40, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  slideRef: { color: 'rgba(255,255,255,0.95)', fontSize: 15, fontWeight: '700' },
  foot: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  fullTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  fullText: { color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', paddingHorizontal: 22, height: 48, borderRadius: 999, marginTop: 6 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, gap: 6 },
  seg: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  segOn: { backgroundColor: '#FFFFFF' },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, paddingHorizontal: 8 },
  action: { alignItems: 'center', gap: 4, minWidth: 70, paddingVertical: 4 },
  actionLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  heading: { fontSize: 18, fontWeight: '800', marginTop: 10 },
  readerBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg },
  closeBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSoft },
  readerVerse: { padding: 16, borderRadius: 14, backgroundColor: colors.bgSoft, borderLeftWidth: 4, borderLeftColor: colors.green },
  readerSection: { fontSize: 13, fontWeight: '800', color: colors.green, textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 },
  prayer: { gap: 10, padding: 18, borderRadius: 16, backgroundColor: colors.greenSoft, marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxWidth: 640, alignSelf: 'center', width: '100%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1.5, borderColor: colors.input, borderRadius: 14, paddingHorizontal: 12, paddingTop: 11, fontSize: 15, color: colors.text },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSoft },
  dayThumb: { width: 54, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1F3B2C' },
  flame: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  reward: { flex: 1, alignItems: 'center', gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSoft },
  rewardOn: { backgroundColor: colors.green, borderColor: colors.green },
}));
