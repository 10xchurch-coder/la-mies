// La iglesia: la pantalla con la que abre la app. Saludo según la hora, el versículo del día,
// los anuncios, lo que me toca esta semana y los accesos, en grupos: para vos, liderazgo y administración.
import { hasRole } from '@/lib/perms';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { socialLinks } from '@/lib/social';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { supabase } from '@/lib/supabase';
import { addDays, isoDate } from '@/lib/format';
import { signedUrl } from '@/lib/files';
import { Button, Card, Field, SectionTitle } from '@/components/ui';
import { Face } from '@/components/Face';
import { errorMessage } from '@/lib/supabase';
import { maskDateAR, parseDateAR } from '@/lib/format';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UpcomingList } from '@/components/Upcoming';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { dailyFor, dailySocial, setDailyLike, teamLive, liveState, listAnnouncements, listClasses, listMinistries, ministryMembers, myUpcoming, readingStreak } from '@/lib/api';
import { fmtRelativeDay } from '@/lib/format';
import { VerseCard } from '@/components/VerseCard';
import type { DailyContent, DailySocial } from '@/types';
import { useAuth } from '@/store/auth';
import { setDeskPref } from '@/components/desk/DeskShell';
import { canUseDesk } from '@/lib/desk';
import { useTabs } from '@/lib/tabsPref';
import { FAV, layout, moved, resetMenu, setMenu, useMenu } from '@/lib/menuPref';
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
  const { profile, church, isStaff, isLeader, financeLevel, can, perms } = useAuth();
  const [live, setLive] = useState<{ id: string; title: string | null } | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [takesAttendance, setTakesAttendance] = useState(false);
  const [daily, setDaily] = useState<DailyContent | null>(null);
  const [streak, setStreak] = useState(0);
  const [social, setSocial] = useState<DailySocial>({ comments: 0, likes: 0, liked: false, open: false });
  const [tomorrow, setTomorrow] = useState<Pick<Sermon, 'id' | 'title' | 'passage' | 'preacher'> | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [myMinistries, setMyMinistries] = useState<Ministry[]>([]);
  const [hasClasses, setHasClasses] = useState(false);
  const [news, setNews] = useState<Announcement[]>([]);
  const [bdays, setBdays] = useState<{ contact_id: string; name: string; photo_path: string | null; turns: number | null; is_me: boolean }[]>([]);
  const [askBday, setAskBday] = useState(false);
  const [bdayText, setBdayText] = useState('');
  const [bus, setBus] = useState<{ routes: number; live: string | null }>({ routes: 0, live: null });
  const [outNow, setOutNow] = useState(0);
  const insets = useSafeAreaInsets();
  const tabs = useTabs();
  const menu = useMenu();
  const { editar } = useLocalSearchParams<{ editar?: string }>();
  const [edit, setEdit] = useState(false);
  useEffect(() => { if (editar) setEdit(true); }, [editar]);

  // Los líderes ven en el inicio cuando hay hermanos evangelizando, para seguirlos en vivo sin iniciar una salida.
  const seesLiveOutings = isLeader || can('evang.ver_salidas');

  const toggleDailyLike = async () => {
    if (!daily) return;
    const before = social;
    const next = !before.liked;
    setSocial({ ...before, liked: next, likes: Math.max(0, before.likes + (next ? 1 : -1)) });
    try {
      await setDailyLike(daily.on_date, next);
    } catch (e) {
      setSocial(before);
      Alert.alert('No se pudo', errorMessage(e));
    }
  };

  const refresh = useCallback(() => {
    myUpcoming(21).then(setUpcoming).catch(() => undefined);
    dailyFor(null).then((d) => {
      setDaily(d);
      if (d) dailySocial(d.on_date).then(setSocial).catch(() => undefined);
    }).catch(() => undefined);
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
    liveState().then((st) => setLive(st?.live_video_id ? { id: st.live_video_id, title: st.live_title } : null)).catch(() => undefined);
    // Anuncios de las últimas dos semanas, arriba de todo.
    supabase.rpc('today_birthdays').then(({ data }) => setBdays((data ?? []) as typeof bdays));
    supabase.rpc('my_birthdate').then(async ({ data, error }) => {
      if (error || data) return setAskBday(false);
      let skipped = null;
      try { skipped = await AsyncStorage.getItem('lamies.bday.skip'); } catch { /* sin almacenamiento */ }
      setAskBday(!skipped);
    });
    if (seesLiveOutings) teamLive().then((rows) => setOutNow(rows.length)).catch(() => undefined);
    supabase.rpc('bus_live_routes').then(({ data }) => {
      const rows = (data ?? []) as { name: string; run_id: string | null }[];
      setBus({ routes: rows.length, live: rows.find((r) => r.run_id)?.name ?? null });
    });
    listAnnouncements().then((a) => setNews(a.filter((x) => Date.now() - new Date(x.created_at).getTime() < 14 * 86400000).slice(0, 3))).catch(() => undefined);
  }, [profile?.id, seesLiveOutings]);
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
        { icon: 'calendar', label: 'Calendario', to: '/eventos', show: !tabs.includes('eventos') },
        { icon: 'radio', label: 'En vivo', to: '/vivo' as Href, show: true },
        { icon: 'sunrise', label: 'Crecimiento', to: '/crecimiento' as Href, show: !tabs.includes('crecimiento') },
        { icon: 'heart', label: 'Oración', to: '/oracion', show: !tabs.includes('oracion') },
        ministryTile,
        { icon: 'book-open', label: isLeader ? 'Clases' : 'Mis clases', to: '/clases', show: isLeader || hasClasses },
        { icon: 'user-check', label: 'Para seguir', to: '/seguimiento', show: true },
        { icon: 'smile', label: 'Entrada de los chicos', to: '/ninos' as Href, show: isLeader || takesAttendance || !!profile?.takes_attendance || can('personas.asistencia') },
        { icon: 'truck', label: 'Colectivo', to: '/colectivo' as Href, show: hasRole(profile, 'captain') || can('personas.asistencia') },
        { icon: 'message-circle', label: 'Chat de la iglesia', to: '/chat' as Href, show: !tabs.includes('chat') },
        { icon: 'play-circle', label: 'Prédicas', to: '/predicas' as Href, show: !tabs.includes('predicas') },
        { icon: 'navigation-2', label: 'Colectivo en vivo', to: '/colectivo-vivo' as Href, show: bus.routes > 0 },
        { icon: 'users', label: 'Directorio', to: '/directorio', show: !tabs.includes('directorio') },
        { icon: 'gift', label: 'Ofrendar', to: '/dar', show: true },
        { icon: 'message-square', label: 'Sugerencias', to: '/sugerencias', show: true },
      ],
    },
    {
      title: 'Liderazgo',
      tiles: [
        { icon: 'user-x', label: 'Faltaron', to: '/ausencias', show: isLeader || !!(profile && church?.absence_recipients?.includes(profile.id)) },
        { icon: 'file-text', label: 'Informe semanal', to: '/reporte', show: isLeader },
        { icon: 'activity', label: 'Progreso de la iglesia', to: '/progreso-iglesia' as Href, show: isLeader },
        { icon: 'radio', label: 'Evangelismo en vivo', to: '/equipo', show: isLeader || can('evang.ver_salidas') },
        { icon: 'bar-chart-2', label: 'Panel del pastor', to: '/panel', show: isLeader },
        { icon: 'trending-up', label: 'Fidelidad y camino', to: '/fidelidad', show: isLeader },
        { icon: 'volume-2', label: 'Anuncios', to: '/anuncios', show: isLeader },
        { icon: 'gift', label: 'Cumpleaños', to: '/cumples' as Href, show: isLeader },
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
        { icon: 'book', label: 'Informes y consejos', to: '/informes' as Href, show: isStaff },
        { icon: 'shield', label: 'Cuentas y seguridad', to: '/admin/cuentas', show: isStaff },
      ],
    },
  ];

  // El menú: cada uno lo ordena (favoritos arriba, orden de botones y de grupos, arriba o abajo de todo).
  const tileKey = (t: Tile) => (typeof t.to === 'string' ? t.to : JSON.stringify(t.to));
  const laid = layout(groups, tileKey, menu).filter((g) => g.tiles.some((t) => t.show));
  const groupTitles = laid.filter((g) => g.title !== FAV).map((g) => g.title);
  const toggleFav = (k: string) => setMenu({ ...menu, fav: menu.fav.includes(k) ? menu.fav.filter((x) => x !== k) : [...menu.fav, k] });
  const moveTile = (title: string, k: string, dir: -1 | 1) => {
    const keys = (laid.find((g) => g.title === title)?.tiles ?? []).filter((t) => t.show).map(tileKey);
    const next = moved(keys, k, dir);
    setMenu(title === FAV ? { ...menu, fav: next } : { ...menu, order: { ...menu.order, [title]: next } });
  };
  const moveGroup = (title: string, dir: -1 | 1) => setMenu({ ...menu, groups: moved(groupTitles, title, dir) });
  const menuBlock = (
    <View style={{ gap: 14 }}>
      {edit ? (
        <Card style={{ gap: 10, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.greenText }}>Ordenar mi menú</Text>
          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
            ★ deja el botón fijado arriba, en Favoritos. Las flechas ◀ ▶ lo mueven y ▲ ▼ mueven el grupo entero. Esto es solo en tu teléfono.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={menu.top ? 'Menú: arriba de todo' : 'Menú: abajo de todo'} icon={menu.top ? 'arrow-up' : 'arrow-down'} variant="outline" small style={{ flex: 1 }} onPress={() => setMenu({ ...menu, top: !menu.top })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Como estaba" variant="ghost" small style={{ flex: 1 }} onPress={() => resetMenu()} />
            <Button title="Listo" small style={{ flex: 1 }} onPress={() => setEdit(false)} />
          </View>
        </Card>
      ) : null}
      {laid.map((g) => {
        const shown = g.tiles.filter((t) => t.show);
        const gi = groupTitles.indexOf(g.title);
        return (
          <View key={g.title} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}><SectionTitle>{g.title === FAV ? '★ Favoritos' : g.title}</SectionTitle></View>
              {edit && g.title !== FAV ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable disabled={gi <= 0} onPress={() => moveGroup(g.title, -1)} accessibilityLabel={`Subir ${g.title}`} style={[styles.mini, gi <= 0 && { opacity: 0.3 }]}><Feather name="chevron-up" size={18} color={colors.text} /></Pressable>
                  <Pressable disabled={gi >= groupTitles.length - 1} onPress={() => moveGroup(g.title, 1)} accessibilityLabel={`Bajar ${g.title}`} style={[styles.mini, gi >= groupTitles.length - 1 && { opacity: 0.3 }]}><Feather name="chevron-down" size={18} color={colors.text} /></Pressable>
                </View>
              ) : null}
            </View>
            <View style={styles.grid}>
              {shown.map((t, ti) => {
                const k = tileKey(t);
                const isFav = menu.fav.includes(k);
                return (
                  <Pressable key={k} onPress={() => (edit ? toggleFav(k) : router.push(t.to))} accessibilityRole="button"
                    style={({ pressed }) => [styles.tile, t.tone === 'green' && styles.tileGreen, edit && { borderStyle: 'dashed', borderColor: colors.green }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
                    <View style={[styles.tileIcon, t.tone === 'green' && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                      <Feather name={t.icon} size={22} color={t.tone === 'green' ? '#FFF' : colors.green} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: t.tone === 'green' ? '#FFF' : colors.text, textAlign: 'center' }} numberOfLines={2}>{t.label}</Text>
                    {edit ? (
                      <View style={{ flexDirection: 'row', gap: 3, marginTop: 2 }}>
                        <Pressable disabled={ti === 0} onPress={() => moveTile(g.title, k, -1)} accessibilityLabel={`Mover ${t.label} atrás`} style={[styles.mini, styles.tiny, ti === 0 && { opacity: 0.3 }]}><Feather name="chevron-left" size={14} color={colors.text} /></Pressable>
                        <Pressable onPress={() => toggleFav(k)} accessibilityLabel={isFav ? `Sacar ${t.label} de favoritos` : `Fijar ${t.label} arriba`} style={[styles.mini, styles.tiny, isFav && { backgroundColor: colors.amber, borderColor: colors.amber }]}><Feather name="star" size={14} color={isFav ? '#FFF' : colors.text} /></Pressable>
                        <Pressable disabled={ti === shown.length - 1} onPress={() => moveTile(g.title, k, 1)} accessibilityLabel={`Mover ${t.label} adelante`} style={[styles.mini, styles.tiny, ti === shown.length - 1 && { opacity: 0.3 }]}><Feather name="chevron-right" size={14} color={colors.text} /></Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      {!edit ? <Text onPress={() => setEdit(true)} style={{ fontSize: 13, fontWeight: '700', color: colors.green, textAlign: 'center' }}>✎ Ordenar mi menú</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topInner}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="contain" accessibilityLabel="Logo de la iglesia" /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.churchName} numberOfLines={1}>{church?.name ?? 'Iglesia'}</Text>
            <Text style={styles.motto}>Más como Cristo cada día</Text>
          </View>
          {Platform.OS === 'web' && canUseDesk(perms) ? (
            <Pressable accessibilityRole="link" accessibilityLabel="Abrir el escritorio" onPress={() => { setDeskPref(true); router.push('/escritorio' as Href); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.input }}>
              <Feather name="monitor" size={15} color={colors.text} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Escritorio</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Screen>
        <Text style={styles.hello}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
        {menu.top ? menuBlock : null}
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
        {live ? (
          <Pressable onPress={() => router.push('/vivo' as Href)} accessibilityRole="button" accessibilityLabel="Ver el culto en vivo"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#E11D48' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="radio" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1 }}>● EN VIVO AHORA</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }} numberOfLines={1}>{live.title ?? 'El culto está en vivo'}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#FFF" />
          </Pressable>
        ) : null}
        {seesLiveOutings && outNow > 0 ? (
          <Pressable onPress={() => router.push('/equipo')} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.green }}>
            <Feather name="radio" size={22} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1 }}>● EVANGELISMO EN VIVO</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }} numberOfLines={1}>
                {outNow === 1 ? '1 hermano saliendo ahora' : `${outNow} hermanos saliendo ahora`}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#FFF" />
          </Pressable>
        ) : null}
        {bus.live ? (
          <Pressable onPress={() => router.push('/colectivo-vivo' as Href)} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.amber }}>
            <Feather name="truck" size={22} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1 }}>EL COLECTIVO ESTÁ EN CAMINO</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }} numberOfLines={1}>{bus.live} · tocá para verlo en el mapa</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#FFF" />
          </Pressable>
        ) : null}
        {bdays.length ? (
          <Card style={{ gap: 10, backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: colors.blueText, letterSpacing: 0.5 }}>
              🎂 {bdays.some((b) => b.is_me) ? '¡FELIZ CUMPLEAÑOS!' : bdays.length === 1 ? 'HOY CUMPLE AÑOS' : 'HOY CUMPLEN AÑOS'}
            </Text>
            {bdays.some((b) => b.is_me) ? (
              <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>Toda la iglesia te saluda hoy. Que el Señor te bendiga mucho.</Text>
            ) : null}
            {bdays.filter((b) => !b.is_me).map((b) => (
              <View key={b.contact_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Face name={b.name} path={b.photo_path} size={38} />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{b.name}{b.turns ? <Text style={{ fontWeight: '500', color: colors.muted }}>  · {b.turns} años</Text> : null}</Text>
              </View>
            ))}
            {bdays.some((b) => !b.is_me) ? (
              <Text onPress={() => router.push('/chat' as Href)} style={{ fontSize: 14, fontWeight: '800', color: colors.blueText }}>Mandale un saludo en el chat de la iglesia →</Text>
            ) : null}
          </Card>
        ) : null}
        {askBday ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>🎂 ¿Cuándo es tu cumpleaños?</Text>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>Así la iglesia te saluda ese día. Solo se muestra el día, no tu edad.</Text>
            <Field label="Fecha de nacimiento" placeholder="DD/MM/AAAA" value={bdayText} onChangeText={(t) => setBdayText((prev) => maskDateAR(t, prev))} keyboardType="number-pad" maxLength={10} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Ahora no" variant="ghost" small style={{ flex: 1 }} onPress={() => { setAskBday(false); AsyncStorage.setItem('lamies.bday.skip', '1').catch(() => undefined); }} />
              <Button title="Guardar" small style={{ flex: 1 }} onPress={async () => {
                const iso = parseDateAR(bdayText);
                if (!iso) return Alert.alert('Revisá la fecha', 'Escribí el día, el mes y el año. Por ejemplo 23/05/1990.');
                const { error } = await supabase.rpc('set_my_birthdate', { p_date: iso });
                if (error) return Alert.alert('No se pudo guardar', errorMessage(error));
                setAskBday(false);
                Alert.alert('¡Listo!', 'Ya quedó tu cumpleaños.');
              }} />
            </View>
          </Card>
        ) : null}
        {daily ? (
          <View>
            <Pressable onPress={() => router.push('/devocional')} accessibilityRole="button" accessibilityLabel="Abrir el devocional de hoy">
              <VerseCard item={daily} church={church?.name} compact big hideMessage style={styles.dailyCard} />
            </Pressable>
            {/* Como en las apps de la Biblia: corazones, comentarios y compartir, sobre la misma foto. */}
            <View style={styles.dailyBar} pointerEvents="box-none">
              <Pressable onPress={toggleDailyLike} hitSlop={8} style={styles.dailyAct} accessibilityRole="button"
                accessibilityLabel={social.liked ? 'Quitar me gusta' : 'Me gusta'} accessibilityState={{ selected: social.liked }}>
                <Ionicons name={social.liked ? 'heart' : 'heart-outline'} size={19} color={social.liked ? '#FF6B6F' : '#FFFFFF'} />
                <Text style={styles.dailyActText}>{social.likes || 'Me gusta'}</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/devocional', params: { abrir: 'comentarios' } })} hitSlop={8} style={styles.dailyAct}
                accessibilityRole="button" accessibilityLabel={`Comentarios: ${social.comments}`}>
                <Ionicons name="chatbubble-outline" size={18} color="#FFFFFF" />
                <Text style={styles.dailyActText}>{social.comments || 'Comentar'}</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/devocional', params: { abrir: 'compartir' } })} hitSlop={8} style={styles.dailyAct}
                accessibilityRole="button" accessibilityLabel="Compartir">
                <Ionicons name="share-outline" size={19} color="#FFFFFF" />
                <Text style={styles.dailyActText}>Compartir</Text>
              </Pressable>
              {streak ? (
                <Pressable onPress={() => router.push('/devocional')} hitSlop={8} style={styles.dailyAct} accessibilityRole="button" accessibilityLabel={`Racha de lectura: ${streak} días`}>
                  <Ionicons name="flash-outline" size={19} color="#FFFFFF" />
                  <Text style={styles.dailyActText}>{streak}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
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

        {!menu.top ? menuBlock : null}

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Feather name="map" size={22} color={colors.green} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 }}>
            Para salir a evangelizar o a repartir volantes, andá a la pestaña Mapa y tocá Iniciar salida.
          </Text>
        </Card>

        {socialLinks(church?.social, church?.website).length ? (
          <>
            <SectionTitle>Seguinos</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {socialLinks(church?.social, church?.website).map((l) => (
                <Pressable key={l.key} onPress={() => Linking.openURL(l.url).catch(() => undefined)} accessibilityRole="link" accessibilityLabel={`${l.label} de la iglesia`} style={styles.social}>
                  <Ionicons name={l.icon as React.ComponentProps<typeof Ionicons>['name']} size={24} color={colors.greenText} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' }} numberOfLines={2}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
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
  mini: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  tiny: { width: 24, height: 24, borderRadius: 12 },
  tileGreen: { backgroundColor: colors.green, borderColor: colors.green },
  social: { width: 96, alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14, backgroundColor: colors.greenSoft },
  dailyAct: { alignItems: 'center', gap: 3, minWidth: 64 },
  dailyActText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  // La foto baja hasta abajo y los botones van encima, sin la franja verde.
  dailyCard: { aspectRatio: undefined, maxHeight: undefined, minHeight: 300, paddingBottom: 68 },
  dailyBar: { position: 'absolute', left: 0, right: 0, bottom: 12, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
}));
