// La iglesia: la pantalla con la que abre la app. Saludo según la hora, el versículo del día,
// lo que me toca esta semana y todo lo de la iglesia (asistencia, clases, ministerios, material...).
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { supabase } from '@/lib/supabase';
import { addDays, isoDate } from '@/lib/format';
import { signedUrl } from '@/lib/files';
import { Card, SectionTitle } from '@/components/ui';
import { UpcomingList } from '@/components/Upcoming';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { dailyFor, listMinistries, ministryMembers, myUpcoming, readingStreak } from '@/lib/api';
import { VerseCard } from '@/components/VerseCard';
import type { DailyContent } from '@/types';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { Sermon, UpcomingItem } from '@/types';

type IconName = React.ComponentProps<typeof Feather>['name'];

/** "Buen día", "Buenas tardes" o "Buenas noches" según la hora del teléfono. */
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Iglesia() {
  const router = useRouter();
  const { profile, church, isStaff, isLeader } = useAuth();
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [takesAttendance, setTakesAttendance] = useState(false);
  const [daily, setDaily] = useState<DailyContent | null>(null);
  const [streak, setStreak] = useState(0);
  const [tomorrow, setTomorrow] = useState<Pick<Sermon, 'id' | 'title' | 'passage' | 'preacher'> | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const refresh = useCallback(() => {
    myUpcoming(21).then(setUpcoming).catch(() => undefined);
    dailyFor(null).then(setDaily).catch(() => undefined);
    readingStreak().then((r) => setStreak(r.current)).catch(() => undefined);
    // El sábado (o cualquier día antes de una prédica ya cargada) se ve el título del mensaje de mañana.
    supabase.from('sermons').select('id, title, passage, preacher').eq('preached_on', isoDate(addDays(new Date(), 1))).limit(1).maybeSingle()
      .then(({ data }) => setTomorrow((data as typeof tomorrow) ?? null));
    Promise.all([listMinistries(), ministryMembers()]).then(([ms, mm]) => {
      const att = new Set(ms.filter((m) => m.can_take_attendance).map((m) => m.id));
      setTakesAttendance(mm.some((x) => x.profile_id === profile?.id && att.has(x.ministry_id)));
    }).catch(() => undefined);
  }, [profile?.id]);
  useFocusEffect(refresh);
  // Si la app quedó abierta de un día para el otro (o en otra pestaña del navegador), se actualiza sola.
  useRefreshOnResume(refresh);

  const logoPath = church?.logo_path ?? null;
  React.useEffect(() => {
    if (!logoPath) setLogo(null);
    else if (/^https?:/.test(logoPath)) setLogo(logoPath);
    else signedUrl('materials', logoPath).then(setLogo).catch(() => setLogo(null));
  }, [logoPath]);

  const firstName = (profile?.display_name ?? '').trim().split(/\s+/)[0] ?? '';

  const tiles: { icon: IconName; label: string; to: Href; show: boolean; tone?: 'green' }[] = [
    { icon: 'check-square', label: 'Tomar asistencia', to: '/asistencia', show: isLeader || takesAttendance || !!profile?.takes_attendance, tone: 'green' },
    { icon: 'book-open', label: 'Clases', to: '/clases', show: true },
    { icon: 'heart', label: 'Ministerios', to: '/ministerios', show: true },
    { icon: 'book', label: 'Material', to: '/materiales', show: true },
    { icon: 'gift', label: 'Ofrendar', to: '/dar', show: true },
    { icon: 'compass', label: 'Capacitación', to: '/capacitacion', show: true },
    { icon: 'user-x', label: 'Faltaron', to: '/ausencias', show: isLeader },
    { icon: 'trending-up', label: 'Fidelidad y camino', to: '/fidelidad', show: isLeader },
    { icon: 'bar-chart-2', label: 'Panel del pastor', to: '/panel', show: isLeader },
    { icon: 'edit-3', label: 'Devocionales', to: '/admin/devocionales', show: isStaff },
    { icon: 'calendar', label: 'Calendario', to: '/eventos', show: true },
    { icon: 'heart', label: 'Oración', to: '/oracion', show: true },
    { icon: 'volume-2', label: 'Anuncios', to: '/anuncios', show: true },
    { icon: 'user-check', label: 'Para seguir', to: '/seguimiento', show: true },
    { icon: 'users', label: 'Directorio', to: '/directorio', show: true },
    { icon: 'message-square', label: 'Sugerencias', to: '/sugerencias', show: true },
    { icon: 'file-text', label: 'Informe semanal', to: '/reporte', show: isLeader },
    { icon: 'activity', label: 'Progreso de la iglesia', to: '/progreso-iglesia' as Href, show: isLeader },
    { icon: 'navigation', label: 'Salidas de todos', to: '/salidas?todos=1' as Href, show: isStaff },
    { icon: 'clock', label: 'Reuniones', to: '/admin/reuniones', show: isStaff },
    { icon: 'users', label: 'Hermanos', to: '/admin/miembros', show: isStaff },
    { icon: 'key', label: 'Roles y avisos', to: '/admin/roles', show: isStaff },
    { icon: 'shield', label: 'Cuentas y seguridad', to: '/admin/cuentas', show: isStaff },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topInner}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="contain" accessibilityLabel="Logo de la iglesia" /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.churchName} numberOfLines={1}>{church?.name ?? 'Iglesia'}</Text>
            <Text style={styles.motto}>Más como Cristo cada día</Text>
          </View>
        </View>
      </View>
      <Screen>
        <Text style={styles.hello}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
        {tomorrow ? (
          <Pressable onPress={() => router.push(`/predica/${tomorrow.id}` as Href)} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
              <Feather name="mic" size={22} color={colors.greenText} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText }}>MAÑANA EN LA IGLESIA</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{tomorrow.title}</Text>
                {tomorrow.passage || tomorrow.preacher ? <Text style={{ fontSize: 13, color: colors.muted }}>{[tomorrow.passage, tomorrow.preacher].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            </Card>
          </Pressable>
        ) : null}
        {daily ? (
          <Pressable onPress={() => router.push('/devocional')} accessibilityRole="button" accessibilityLabel="Abrir el devocional de hoy">
            <VerseCard item={daily} church={church?.name} compact />
            <View style={styles.dailyBar}>
              <Feather name="book-open" size={16} color={colors.greenText} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.greenText }}>Devocional de hoy · tocá para leer y compartir</Text>
              {streak ? <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>⚡ {streak}</Text> : null}
            </View>
          </Pressable>
        ) : null}
        <SectionTitle>Esta semana te toca</SectionTitle>
        <UpcomingList items={upcoming.slice(0, 4)} />

        <View style={styles.grid}>
          {tiles.filter((t) => t.show).map((t) => (
            <Pressable key={t.label} onPress={() => router.push(t.to)} accessibilityRole="button" style={({ pressed }) => [styles.tile, t.tone === 'green' && styles.tileGreen, pressed && { opacity: 0.8 }]}>
              <Feather name={t.icon} size={26} color={t.tone === 'green' ? '#FFF' : colors.green} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: t.tone === 'green' ? '#FFF' : colors.text, textAlign: 'center' }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Feather name="map" size={22} color={colors.green} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 }}>
            Para salir a evangelizar o a repartir volantes, andá a la pestaña Mapa y tocá Iniciar salida.
          </Text>
        </Card>
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  hello: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3, marginTop: 14, marginBottom: -4 },
  top: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  topInner: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  logo: { width: 40, height: 40, borderRadius: 8 },
  churchName: { fontSize: 17, fontWeight: '800', color: colors.text },
  motto: { fontSize: 12, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 },
  tileGreen: { backgroundColor: colors.green, borderColor: colors.green },
  dailyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: colors.greenSoft },
}));
