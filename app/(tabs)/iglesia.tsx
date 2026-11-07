// La iglesia: la pantalla con la que abre la app. Saludo según la hora, el versículo del día,
// los anuncios, lo que me toca esta semana y los accesos, en grupos: para vos, liderazgo y administración.
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
import { dailyFor, listAnnouncements, listClasses, listMinistries, ministryMembers, myUpcoming, readingStreak } from '@/lib/api';
import { fmtRelativeDay } from '@/lib/format';
import { VerseCard } from '@/components/VerseCard';
import type { DailyContent } from '@/types';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { Announcement, Ministry, Sermon, UpcomingItem } from '@/types';

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
  const { profile, church, isStaff, isLeader, financeLevel } = useAuth();
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [takesAttendance, setTakesAttendance] = useState(false);
  const [daily, setDaily] = useState<DailyContent | null>(null);
  const [streak, setStreak] = useState(0);
  const [tomorrow, setTomorrow] = useState<Pick<Sermon, 'id' | 'title' | 'passage' | 'preacher'> | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [myMinistries, setMyMinistries] = useState<Ministry[]>([]);
  const [hasClasses, setHasClasses] = useState(false);
  const [news, setNews] = useState<Announcement[]>([]);
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
      // Mis ministerios: donde estoy o que lidero (el servidor ya solo manda esos, salvo a los líderes)
      setMyMinistries(ms.filter((m) => m.leader_id === profile?.id || mm.some((x) => x.ministry_id === m.id && x.profile_id === profile?.id)));
    }).catch(() => undefined);
    listClasses().then((k) => setHasClasses(k.length > 0)).catch(() => undefined);
    // Anuncios de las últimas dos semanas, arriba de todo.
    listAnnouncements().then((a) => setNews(a.filter((x) => Date.now() - new Date(x.created_at).getTime() < 14 * 86400000).slice(0, 3))).catch(() => undefined);
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

  type Tile = { icon: IconName; label: string; to: Href; show: boolean; tone?: 'green' };
  const ministryTile: Tile = isLeader
    ? { icon: 'layers', label: 'Ministerios', to: '/ministerios', show: true }
    : myMinistries.length === 1
      ? { icon: 'layers', label: 'Mi ministerio', to: { pathname: '/ministerio/[id]', params: { id: myMinistries[0].id } } as unknown as Href, show: true }
      : { icon: 'layers', label: 'Mis ministerios', to: '/ministerios', show: myMinistries.length > 1 };
  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: 'Para vos',
      tiles: [
        { icon: 'check-square', label: 'Tomar asistencia', to: '/asistencia', show: isLeader || takesAttendance || !!profile?.takes_attendance, tone: 'green' },
        { icon: 'calendar', label: 'Calendario', to: '/eventos', show: true },
        { icon: 'sunrise', label: 'Crecimiento', to: '/crecimiento' as Href, show: true },
        { icon: 'heart', label: 'Oración', to: '/oracion', show: true },
        ministryTile,
        { icon: 'book-open', label: isLeader ? 'Clases' : 'Mis clases', to: '/clases', show: isLeader || hasClasses },
        { icon: 'user-check', label: 'Para seguir', to: '/seguimiento', show: true },
        { icon: 'users', label: 'Directorio', to: '/directorio', show: true },
        { icon: 'gift', label: 'Ofrendar', to: '/dar', show: true },
        { icon: 'message-square', label: 'Sugerencias', to: '/sugerencias', show: true },
      ],
    },
    {
      title: 'Liderazgo',
      tiles: [
        { icon: 'user-x', label: 'Faltaron', to: '/ausencias', show: isLeader },
        { icon: 'file-text', label: 'Informe semanal', to: '/reporte', show: isLeader },
        { icon: 'activity', label: 'Progreso de la iglesia', to: '/progreso-iglesia' as Href, show: isLeader },
        { icon: 'bar-chart-2', label: 'Panel del pastor', to: '/panel', show: isLeader },
        { icon: 'trending-up', label: 'Fidelidad y camino', to: '/fidelidad', show: isLeader },
        { icon: 'volume-2', label: 'Anuncios', to: '/anuncios', show: isLeader },
      ],
    },
    {
      title: 'Administración',
      tiles: [
        { icon: 'dollar-sign', label: 'Finanzas', to: '/finanzas' as Href, show: financeLevel >= 1 },
        { icon: 'users', label: 'Hermanos', to: '/admin/miembros', show: isStaff },
        { icon: 'key', label: 'Roles y permisos', to: '/admin/roles', show: isStaff },
        { icon: 'clock', label: 'Reuniones', to: '/admin/reuniones', show: isStaff },
        { icon: 'edit-3', label: 'Devocionales', to: '/admin/devocionales', show: isStaff },
        { icon: 'navigation', label: 'Salidas de todos', to: '/salidas?todos=1' as Href, show: isStaff },
        { icon: 'flag', label: 'Denuncias', to: '/admin/denuncias' as Href, show: isStaff },
        { icon: 'book', label: 'Informes y consejos', to: '/informes' as Href, show: isStaff },
        { icon: 'shield', label: 'Cuentas y seguridad', to: '/admin/cuentas', show: isStaff },
      ],
    },
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
        {news.length ? (
          <Card style={styles.news}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="volume-2" size={18} color={colors.amberText} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.amberText, letterSpacing: 0.5 }}>ANUNCIOS</Text>
              <Text onPress={() => router.push('/anuncios')} style={{ fontSize: 13, fontWeight: '800', color: colors.amberText }}>Ver todos</Text>
            </View>
            {news.map((a, i) => (
              <View key={a.id} style={[{ gap: 2 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }]}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{a.title}</Text>
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }} numberOfLines={4}>{a.body}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{fmtRelativeDay(a.created_at)}</Text>
              </View>
            ))}
          </Card>
        ) : isLeader ? (
          <Text onPress={() => router.push('/anuncios')} style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>+ Escribir un anuncio para la iglesia</Text>
        ) : null}
        <SectionTitle>Esta semana te toca</SectionTitle>
        <UpcomingList items={upcoming.slice(0, 4)} />

        {groups.map((g) => {
          const shown = g.tiles.filter((t) => t.show);
          if (!shown.length) return null;
          return (
            <View key={g.title} style={{ gap: 10 }}>
              <SectionTitle>{g.title}</SectionTitle>
              <View style={styles.grid}>
                {shown.map((t) => (
                  <Pressable key={t.label} onPress={() => router.push(t.to)} accessibilityRole="button" style={({ pressed }) => [styles.tile, t.tone === 'green' && styles.tileGreen, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
                    <View style={[styles.tileIcon, t.tone === 'green' && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                      <Feather name={t.icon} size={22} color={t.tone === 'green' ? '#FFF' : colors.green} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: t.tone === 'green' ? '#FFF' : colors.text, textAlign: 'center' }} numberOfLines={2}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}

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
  tile: { width: '31%', flexGrow: 1, minHeight: 100, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tileIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  news: { gap: 10, backgroundColor: colors.amberSoft, borderColor: colors.amberSoft },
  tileGreen: { backgroundColor: colors.green, borderColor: colors.green },
  dailyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: colors.greenSoft },
}));
