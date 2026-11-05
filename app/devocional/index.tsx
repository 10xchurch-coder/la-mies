// Devocional del día, en cuatro "diapositivas" que se pasan con el dedo:
// 1) el versículo (tarjeta para compartir), 2) la frase del día, 3) la lectura corta,
// 4) el estudio completo, que se abre a pantalla completa y termina con una oración.
// Abajo, la racha de días seguidos con sus premios. Abrir la lectura cuenta como "leído".
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen } from '@/components/Screen';
import { BACKGROUNDS, VerseCard, type CardHandle } from '@/components/VerseCard';
import { Button, Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { dailyFor, markReading, readingStreak } from '@/lib/api';
import { shareImage, shareText, WEB_URL } from '@/lib/share';
import { fmtDateShort, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { DailyContent, ReadingStreak } from '@/types';

/** Párrafos del texto. Un párrafo escrito entre ** ** es un título. */
function Paragraphs({ text, size = 16 }: { text: string; size?: number }) {
  return (
    <>
      {text.split(/\n{2,}/).map((raw, i) => {
        const p = raw.trim();
        const heading = p.match(/^\*\*(.+)\*\*$/);
        if (heading) return <Text key={i} style={[styles.heading, i === 0 && { marginTop: 0 }]}>{heading[1]}</Text>;
        // Negritas sueltas dentro del párrafo (**palabra**) se muestran en negrita.
        const parts = p.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        return (
          <Text key={i} style={[styles.para, { fontSize: size, lineHeight: Math.round(size * 1.55) }]}>
            {parts.map((part, j) => (part.startsWith('**') ? <Text key={j} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text> : part))}
          </Text>
        );
      })}
    </>
  );
}

export default function Devocional() {
  const router = useRouter();
  const { fecha } = useLocalSearchParams<{ fecha?: string }>();
  const { church, isStaff } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<DailyContent | null | undefined>(undefined);
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [big, setBig] = useState(false);
  const [reader, setReader] = useState(false);
  const [page, setPage] = useState(0);
  const cardRef = useRef<CardHandle>(null);
  const bigRef = useRef<CardHandle>(null);
  const isToday = !fecha || fecha === isoDate(new Date());
  const slideW = Math.min(width, 520) - 32;

  useFocusEffect(
    useCallback(() => {
      dailyFor(fecha ?? null).then(setItem).catch(() => setItem(null));
      (isToday ? markReading() : readingStreak()).then(setStreak).catch(() => undefined);
    }, [fecha, isToday]),
  );

  useEffect(() => {
    if (streak?.read_today && streak.current > 0 && [7, 30, 365].includes(streak.current)) {
      const label = streak.current === 7 ? 'una semana' : streak.current === 30 ? 'un mes' : 'un año';
      Alert.alert('¡Felicitaciones!', `Llevás ${label} seguida leyendo la Palabra cada día. Seguí así.`);
    }
  }, [streak?.current, streak?.read_today]);

  const text = item ? `"${item.verse}"\n${item.reference} (RV1960)${item.message ? `\n\n${item.message}` : ''}\n\n${church?.name ?? 'La Mies'} · ${WEB_URL}` : '';

  const shareStory = async () => {
    if (!item) return;
    try {
      const capture = async () => {
        const { captureRef } = await import('react-native-view-shot');
        return captureRef((bigRef.current ?? cardRef.current) as unknown as number, { format: 'png', quality: 1, result: 'tmpfile' });
      };
      const ok = await shareImage(capture);
      if (!ok) {
        const r = await shareText(text);
        if (r === 'copied') Alert.alert('Texto copiado', 'En la computadora se copia el texto del versículo. Para compartir la imagen, usá la app del teléfono.');
      }
    } catch (e) {
      Alert.alert('No se pudo compartir', e instanceof Error ? e.message : 'Probá de nuevo');
    }
  };

  const shareDevotional = async () => {
    if (!item) return;
    const r = await shareText(`${text}${item.devotional ? `\n\n${item.devotional}` : ''}`);
    if (r === 'copied') Alert.alert('Copiado', 'El devocional quedó copiado para pegarlo donde quieras.');
  };

  if (item === undefined) return <Loading />;

  if (big && item) {
    return (
      <Pressable onPress={() => setBig(false)} style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <View style={{ width: '100%', maxWidth: 420 }}>
          <VerseCard ref={bigRef} item={item} church={church?.name} style={{ maxHeight: 760 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button title="Compartir" icon="share-2" onPress={shareStory} />
          <Button title="Cerrar" variant="outline" onPress={() => setBig(false)} />
        </View>
      </Pressable>
    );
  }

  const bg = item ? BACKGROUNDS[item.background]?.colors ?? ['#1F6B45', '#2F8F5B', '#9CCB8E'] : null;
  const slides: ('verse' | 'phrase' | 'reading' | 'study')[] = item
    ? ['verse', ...(item.message ? ['phrase' as const] : []), ...(item.devotional ? ['reading' as const] : []), ...(item.study || item.prayer ? ['study' as const] : [])]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Devocional"
        subtitle={item ? (isToday ? 'Hoy' : fmtDateShort(item.on_date)) : undefined}
        back
        right={isStaff ? (
          <Pressable onPress={() => router.push('/admin/devocionales')} accessibilityRole="button" accessibilityLabel="Cargar devocionales" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="edit-3" size={22} color={colors.green} />
          </Pressable>
        ) : undefined}
      />
      <Screen>
        {!item ? (
          <Empty icon="book-open" title="Todavía no hay versículo para hoy" text={isStaff ? 'Cargalo tocando el lápiz arriba a la derecha.' : 'El pastor o la secretaría lo van a cargar.'} />
        ) : (
          <>
            {/* Las diapositivas: se pasan con el dedo, de a una. */}
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={slideW + 12}
              snapToAlignment="start"
              contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}
              style={{ marginHorizontal: -16 }}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (slideW + 12)))}
              onScroll={Platform.OS === 'web' ? (e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (slideW + 12))) : undefined}
              scrollEventThrottle={64}
            >
              {slides.map((s) => (
                <View key={s} style={{ width: slideW }}>
                  {s === 'verse' ? (
                    <Pressable onPress={() => setBig(true)} accessibilityRole="button" accessibilityLabel="Ver la tarjeta grande">
                      <VerseCard ref={cardRef} item={item} church={church?.name} compact lines={11} hideMessage={!!item.message} style={styles.slide} />
                    </Pressable>
                  ) : s === 'phrase' ? (
                    <View style={[styles.slide, styles.phraseCard]}>
                      <LinearGradient colors={bg as [string, string, string]} start={{ x: 0.9, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
                      <Text style={styles.slideLabel}>Para pensar hoy</Text>
                      <Text style={styles.phrase}>{item.message}</Text>
                      <Text style={styles.slideFoot}>{item.reference}</Text>
                    </View>
                  ) : s === 'reading' ? (
                    <View style={[styles.slide, styles.readingCard]}>
                      <Text style={styles.readingLabel}>Lectura de hoy</Text>
                      <ScrollView nestedScrollEnabled style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>
                        <Paragraphs text={item.devotional as string} size={16} />
                      </ScrollView>
                      <Button title="Compartir el devocional" variant="outline" icon="send" small onPress={shareDevotional} />
                    </View>
                  ) : (
                    <Pressable onPress={() => setReader(true)} style={[styles.slide, styles.studyCard]} accessibilityRole="button">
                      <LinearGradient colors={['#101512', '#1F6B45']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Feather name="book-open" size={44} color="#FFFFFF" />
                      <Text style={styles.studyTitle}>{item.study ? 'Devocional completo' : 'Oración del día'}</Text>
                      <Text style={styles.studyText}>
                        {item.study ? 'Un estudio de 5 a 10 minutos sobre el versículo, a pantalla completa, que termina con una oración.' : 'Una oración para cerrar la lectura de hoy.'}
                      </Text>
                      <View style={styles.studyBtn}>
                        <Feather name="maximize-2" size={16} color={colors.green} />
                        <Text style={{ color: colors.green, fontWeight: '800', fontSize: 14 }}>{item.study ? 'Leer ahora' : 'Abrir'}</Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
            {slides.length > 1 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                {slides.map((s, i) => <View key={s} style={[styles.dot, i === page && styles.dotOn]} />)}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title={Platform.OS === 'web' ? 'Compartir versículo' : 'Compartir como historia'} icon="share-2" onPress={shareStory} style={{ flex: 1 }} />
              <Button title="Ver grande" variant="outline" icon="maximize-2" onPress={() => setBig(true)} />
            </View>
          </>
        )}

        <SectionTitle right={<Pressable onPress={() => router.push('/devocional/lectores')}><Text style={{ color: colors.green, fontWeight: '700', fontSize: 13 }}>Ver la iglesia</Text></Pressable>}>Mi racha</SectionTitle>
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={styles.flame}>
              <Feather name="zap" size={26} color={streak?.current ? '#FFF' : colors.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{streak?.current ?? 0} {streak?.current === 1 ? 'día' : 'días'} seguidos</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>Mejor racha: {streak?.best ?? 0} · Total leídos: {streak?.total ?? 0}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(streak?.rewards ?? [{ days: 7, label: 'Una semana', earned: false }, { days: 30, label: 'Un mes', earned: false }, { days: 365, label: 'Un año', earned: false }]).map((r) => (
              <View key={r.days} style={[styles.reward, r.earned && styles.rewardOn]}>
                <Feather name={r.earned ? 'award' : 'lock'} size={20} color={r.earned ? '#FFF' : colors.muted} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: r.earned ? '#FFF' : colors.muted, textAlign: 'center' }}>{r.label}</Text>
                <Text style={{ fontSize: 10, color: r.earned ? 'rgba(255,255,255,0.9)' : colors.muted }}>{r.days} días</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            La racha cuenta cada día que abrís el devocional. Si un día no lo abrís, vuelve a cero, pero la mejor racha y los premios quedan.
          </Text>
        </Card>
      </Screen>

      {/* El devocional completo, a pantalla completa, que termina con la oración. */}
      <Modal visible={reader && !!item} animationType="slide" onRequestClose={() => setReader(false)} presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
          <View style={styles.readerBar}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.green, textTransform: 'uppercase', letterSpacing: 1 }}>Devocional completo</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{item?.reference}{item ? ` · ${isToday ? 'Hoy' : fmtDateShort(item.on_date)}` : ''}</Text>
            </View>
            <Pressable onPress={() => setReader(false)} accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.closeBtn}>
              <Feather name="x" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
            {item ? (
              <>
                <View style={styles.readerVerse}>
                  <Text style={{ fontSize: 17, lineHeight: 27, color: colors.text, fontWeight: '600', fontStyle: 'italic' }}>{item.verse}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green, marginTop: 8 }}>{item.reference} · RV1960</Text>
                </View>
                {item.study ? <Paragraphs text={item.study} size={17} /> : item.devotional ? <Paragraphs text={item.devotional} size={17} /> : null}
                {item.prayer ? (
                  <View style={styles.prayer}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="heart" size={16} color={colors.greenText} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText, textTransform: 'uppercase', letterSpacing: 1 }}>Oración</Text>
                    </View>
                    <Text style={{ fontSize: 17, lineHeight: 27, color: colors.text, fontStyle: 'italic' }}>{item.prayer}</Text>
                  </View>
                ) : null}
                <Button title="Terminé de leer" icon="check" onPress={() => setReader(false)} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  slide: { height: 340, maxHeight: 340, borderRadius: 18 },
  phraseCard: { overflow: 'hidden', padding: 22, justifyContent: 'center', gap: 14, backgroundColor: '#1F6B45' },
  slideLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  phrase: { color: '#FFFFFF', fontSize: 27, lineHeight: 36, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  slideFoot: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' },
  readingCard: { padding: 18, gap: 10, backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.border },
  readingLabel: { fontSize: 12, fontWeight: '800', color: colors.green, textTransform: 'uppercase', letterSpacing: 1 },
  studyCard: { overflow: 'hidden', padding: 22, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#1F6B45' },
  studyTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  studyText: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  studyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', paddingHorizontal: 18, height: 42, borderRadius: 999, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.input },
  dotOn: { backgroundColor: colors.green, width: 20 },
  heading: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 10 },
  para: { color: colors.text },
  readerBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSoft },
  readerVerse: { padding: 16, borderRadius: 14, backgroundColor: colors.bgSoft, borderLeftWidth: 4, borderLeftColor: colors.green },
  prayer: { gap: 10, padding: 18, borderRadius: 16, backgroundColor: colors.greenSoft, marginTop: 6 },
  flame: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  reward: { flex: 1, alignItems: 'center', gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSoft },
  rewardOn: { backgroundColor: colors.green, borderColor: colors.green },
}));
