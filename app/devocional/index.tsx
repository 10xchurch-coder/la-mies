// Devocional del día: la tarjeta del versículo (para compartir como historia), la lectura,
// y la racha de días seguidos con sus premios. Abrir la lectura cuenta como "leído".
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { VerseCard, type CardHandle } from '@/components/VerseCard';
import { Button, Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { dailyFor, markReading, readingStreak } from '@/lib/api';
import { shareImage, shareText, WEB_URL } from '@/lib/share';
import { fmtDateShort, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { DailyContent, ReadingStreak } from '@/types';

export default function Devocional() {
  const router = useRouter();
  const { fecha } = useLocalSearchParams<{ fecha?: string }>();
  const { church, isStaff } = useAuth();
  const [item, setItem] = useState<DailyContent | null | undefined>(undefined);
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [big, setBig] = useState(false);
  const cardRef = useRef<CardHandle>(null);
  const bigRef = useRef<CardHandle>(null);
  const isToday = !fecha || fecha === isoDate(new Date());

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
            <Pressable onPress={() => setBig(true)} accessibilityRole="button" accessibilityLabel="Ver la tarjeta grande">
              <VerseCard ref={cardRef} item={item} church={church?.name} compact />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title={Platform.OS === 'web' ? 'Compartir versículo' : 'Compartir como historia'} icon="share-2" onPress={shareStory} style={{ flex: 1 }} />
              <Button title="Ver grande" variant="outline" icon="maximize-2" onPress={() => setBig(true)} />
            </View>

            <Card style={{ gap: 10 }}>
              <Text style={styles.verse}>{item.verse}</Text>
              <Text style={styles.ref}>{item.reference} · RV1960</Text>
            </Card>

            {item.devotional ? (
              <>
                <SectionTitle>Lectura de hoy</SectionTitle>
                <Card style={{ gap: 12 }}>
                  {item.devotional.split(/\n{2,}/).map((p, i) => (
                    <Text key={i} style={styles.para}>{p.trim()}</Text>
                  ))}
                  <Button title="Compartir el devocional" variant="outline" icon="send" onPress={shareDevotional} />
                </Card>
              </>
            ) : (
              <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Feather name="book-open" size={22} color={colors.green} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                  Hoy solo hay versículo. Leelo despacio, pensá qué te dice Dios con él y orá un momento.
                </Text>
              </Card>
            )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  verse: { fontSize: 17, lineHeight: 26, color: colors.text, fontWeight: '600' },
  ref: { fontSize: 13, fontWeight: '800', color: colors.green },
  para: { fontSize: 16, lineHeight: 25, color: colors.text },
  flame: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  reward: { flex: 1, alignItems: 'center', gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSoft },
  rewardOn: { backgroundColor: colors.green, borderColor: colors.green },
});
