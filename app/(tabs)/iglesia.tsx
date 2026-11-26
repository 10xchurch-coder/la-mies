// La iglesia: la pantalla con la que abre la app. Saludo según la hora, el versículo del día,
// los anuncios, lo que me toca esta semana y los accesos, en grupos: para vos, liderazgo y administración.
import { canPresent, hasRole } from '@/lib/perms';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
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
import { dailyFor, dailySocial, setDailyLike, teamLive, liveState, listAnnouncements, listClasses, listMinistries, ministryMembers, myBiblePlan, myUpcoming, readingStreak, type BiblePlanRow } from '@/lib/api';
import { pastorUnread } from '@/lib/api';
import { dmUnread } from '@/lib/dm';
import { planStatus } from '@/lib/biblePlan';
import { parseReading } from '@/lib/bible';
import { isoDate as isoDay } from '@/lib/format';
import { fmtRelativeDay } from '@/lib/format';
import { VerseCard } from '@/components/VerseCard';
import type { DailyContent, DailySocial } from '@/types';
import { useAuth } from '@/store/auth';
import { useCentralRole } from '@/lib/centralData';
import { useFeatures } from '@/lib/useFeatures';
import { useChurchExtras } from '@/lib/useChurchExtras';
import { SetupBanner } from '@/components/SetupBanner';
import { pathOn } from '@/lib/features';
import { setDeskPref } from '@/components/desk/DeskShell';
import { canUseDesk, norm } from '@/lib/desk';
import { useTabs } from '@/lib/tabsPref';
import { FAV, layout, moved, resetMenu, setMenu, useMenu } from '@/lib/menuPref';
import { colors, themed, toneOf, type Tone } from '@/theme';
import type { Announcement, Ministry, Sermon, UpcomingItem } from '@/types';
import { tx } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Feather>['name'];

/** "Buen día", "Buenas tardes" o "Buenas noches" según la hora del teléfono. */
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 13) return tx('Buen día');
  if (h >= 13 && h < 20) return tx('Buenas tardes');
  return tx('Buenas noches');
}

export default function Iglesia() {
  const router = useRouter();
  const { profile, church, isStaff, isLeader, financeLevel, can, perms } = useAuth();
  const centralRole = useCentralRole();
  const extras = useChurchExtras();
  const [live, setLive] = useState<{ id: string; title: string | null } | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [takesAttendance, setTakesAttendance] = useState(false);
  const [daily, setDaily] = useState<DailyContent | null>(null);
  const [streak, setStreak] = useState(0);
  const [biblePlan, setBiblePlan] = useState<BiblePlanRow | null>(null);
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
  const [pmUnread, setPmUnread] = useState(0);
  const [dmNew, setDmNew] = useState(0);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const tabs = useTabs();
  const { on } = useFeatures();
  const menu = useMenu();
  const { editar } = useLocalSearchParams<{ editar?: string }>();
  const [edit, setEdit] = useState(false);
  const [find, setFind] = useState('');
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
      Alert.alert(tx('No se pudo'), errorMessage(e));
    }
  };

  const refresh = useCallback(() => {
    myUpcoming(21).then(setUpcoming).catch(() => undefined);
    dailyFor(null).then((d) => {
      setDaily(d);
      if (d) dailySocial(d.on_date).then(setSocial).catch(() => undefined);
      myBiblePlan().then(setBiblePlan).catch(() => undefined);
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
    pastorUnread().then(setPmUnread).catch(() => undefined);
    dmUnread().then(setDmNew).catch(() => undefined);
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

  type Tile = { icon: IconName; label: string; to: Href; show: boolean; strong?: boolean; tone?: Tone };
  type Group = { title: string; tone: Tone; closed?: boolean; tiles: Tile[] };
  const ministryTile: Tile = isLeader
    ? { icon: 'layers', label: tx('Ministerios'), to: '/ministerios', show: true }
    : myMinistries.length === 1
      ? { icon: 'layers', label: tx('Mi ministerio'), to: { pathname: '/ministerio/[id]', params: { id: myMinistries[0].id } } as unknown as Href, show: true }
      : { icon: 'layers', label: tx('Mis ministerios'), to: '/ministerios', show: myMinistries.length > 1 };
  const dmOn = pathOn(church?.disabled_features, '/mensajes');
  const takes = isLeader || takesAttendance || !!profile?.takes_attendance;
  // Seis áreas, cada una con su color. Las dos últimas (informes y administración) vienen cerradas: se abren tocando el título.
  const groups: Group[] = [
    {
      title: tx('Reuniones'), tone: 'green',
      tiles: [
        { icon: 'check-square', label: tx('Tomar asistencia'), to: '/asistencia', show: takes, strong: true },
        { icon: 'radio', label: tx('Entrada con chip'), to: '/asistencia-chip' as Href, show: takes },
        { icon: 'smile', label: tx('Entrada de los chicos'), to: '/ninos' as Href, show: takes || can('personas.asistencia') },
        { icon: 'calendar', label: tx('Calendario'), to: '/eventos', show: !tabs.includes('eventos') },
        { icon: 'video', label: tx('En vivo'), to: '/vivo' as Href, show: true },
        { icon: 'truck', label: tx('Colectivo'), to: '/colectivo' as Href, show: hasRole(profile, 'captain') || can('personas.asistencia') },
        { icon: 'navigation-2', label: tx('Colectivo en vivo'), to: '/colectivo-vivo' as Href, show: bus.routes > 0 },
        { icon: 'monitor', label: tx('Modo presentación'), to: '/presentar' as Href, show: canPresent(perms, profile) },
        { icon: 'list', label: tx('Orden del culto'), to: '/culto' as Href, show: true },
      ],
    },
    {
      title: tx('Crecer'), tone: 'blue',
      tiles: [
        { icon: 'sunrise', label: tx('Crecimiento'), to: '/crecimiento' as Href, show: !tabs.includes('crecimiento') },
        { icon: 'book-open', label: tx('Plan de lectura'), to: '/plan-lectura' as Href, show: true },
        { icon: 'heart', label: tx('Oración'), to: '/oracion', show: !tabs.includes('oracion') },
        { icon: 'play-circle', label: tx('Prédicas'), to: '/predicas' as Href, show: !tabs.includes('predicas') },
        { icon: 'help-circle', label: tx('Preguntas'), to: '/preguntas' as Href, show: true },
        { icon: 'book-open', label: isLeader ? tx('Clases') : tx('Mis clases'), to: '/clases', show: isLeader || hasClasses },
        { icon: 'music', label: tx('Cancionero'), to: '/canciones' as Href, show: true },
        { icon: 'headphones', label: tx('Música'), to: '/musica' as Href, show: true },
        { icon: 'radio', label: tx('Radio'), to: '/radio' as Href, show: true },
        { icon: 'edit-3', label: tx('Escribir devocionales'), to: '/admin/devocionales', show: isStaff },
      ],
    },
    {
      title: tx('Comunidad'), tone: 'violet',
      tiles: [
        { icon: 'message-circle', label: tx('Chat de la iglesia'), to: '/chat' as Href, show: !tabs.includes('chat') },
        { icon: 'users', label: tx('Directorio'), to: '/directorio', show: !tabs.includes('directorio') },
        ministryTile,
        { icon: 'volume-2', label: tx('Anuncios'), to: '/anuncios', show: isLeader },
        { icon: 'map-pin', label: tx('Ubicación en familia'), to: '/familia-ubicacion' as Href, show: true },
        { icon: 'globe', label: tx('Misioneros'), to: '/misioneros' as Href, show: true },
        { icon: 'credit-card', label: tx('Ofrendar'), to: '/dar', show: true },
        { icon: 'award', label: tx('Sorteos'), to: '/rifas' as Href, show: true },
        { icon: 'gift', label: tx('Mis ofrendas'), to: '/mis-ofrendas' as Href, show: extras.my_giving_on },
        { icon: 'message-square', label: tx('Sugerencias'), to: '/sugerencias', show: true },
        { icon: 'send', label: dmNew + pmUnread ? tx('Mensajes ({v1})', { v1: dmNew + pmUnread }) : tx('Mensajes'), to: '/mensajes' as Href, show: true, strong: dmNew + pmUnread > 0 },
        // Si la iglesia apagó los mensajes entre hermanos, queda el botón directo al pastor.
        { icon: 'mail', label: pmUnread ? tx('Escribile al pastor ({pmUnread} nuevo{pl})', { pmUnread, pl: pmUnread > 1 ? 's' : '' }) : tx('Escribile al pastor'), to: '/pastor-hilo' as Href, show: profile?.role !== 'admin' && !dmOn },
        { icon: 'mail', label: pmUnread ? tx('Mensajes privados ({pmUnread})', { pmUnread }) : tx('Mensajes privados'), to: '/pastor-bandeja' as Href, show: profile?.role === 'admin' && !dmOn },
      ],
    },
    {
      title: tx('Personas y seguimiento'), tone: 'amber',
      tiles: [
        { icon: 'users', label: tx('Personas'), to: '/personas' as Href, show: !tabs.includes('personas'), strong: true },
        { icon: 'user-check', label: tx('Para seguir'), to: '/seguimiento', show: true },
        { icon: 'book-open', label: tx('Discipulado'), to: '/discipulado' as Href, show: isLeader },
        { icon: 'heart', label: tx('Decisiones'), to: '/decisiones' as Href, show: isLeader },
        { icon: 'gift', label: tx('Visitas nuevas'), to: '/bienvenida' as Href, show: isLeader },
        { icon: 'grid', label: tx('Tarjeta de visita (QR)'), to: '/tarjeta-visita' as Href, show: isLeader },
        { icon: 'award', label: tx('Clase de miembros'), to: '/clase-miembros' as Href, show: isLeader },
        { icon: 'user-x', label: tx('Faltaron'), to: '/ausencias', show: isLeader || !!(profile && church?.absence_recipients?.includes(profile.id)) },
        { icon: 'user', label: tx('Hermanos'), to: '/admin/miembros', show: isStaff },
        { icon: 'user-minus', label: tx('Inactivos'), to: '/inactivos' as Href, show: isStaff },
        { icon: 'gift', label: tx('Cumpleaños'), to: '/cumples' as Href, show: isLeader },
        { icon: 'trending-up', label: tx('Fidelidad y camino'), to: '/fidelidad', show: isLeader },
      ],
    },
    {
      title: tx('Informes'), tone: 'teal', closed: true,
      tiles: [
        { icon: 'file-text', label: tx('Informe semanal'), to: '/reporte', show: isLeader },
        { icon: 'activity', label: tx('Progreso de la iglesia'), to: '/progreso-iglesia' as Href, show: isLeader },
        { icon: 'bar-chart-2', label: tx('Panel del pastor'), to: '/panel', show: isLeader },
        { icon: 'map-pin', label: tx('Evangelismo en vivo'), to: '/equipo', show: isLeader || can('evang.ver_salidas') },
        { icon: 'navigation', label: tx('Salidas de todos'), to: '/salidas?todos=1' as Href, show: isStaff },
        { icon: 'book', label: tx('Informes y consejos'), to: '/informes' as Href, show: isStaff },
      ],
    },
    {
      title: tx('Administración'), tone: 'pink', closed: true,
      tiles: [
        { icon: 'dollar-sign', label: tx('Finanzas'), to: '/finanzas' as Href, show: financeLevel >= 1 },
        { icon: 'gift', label: tx('Ofrendas por persona'), to: '/finanzas/ofrendas' as Href, show: financeLevel >= 1 },
        { icon: 'clock', label: tx('Reuniones'), to: '/admin/reuniones', show: isStaff },
        { icon: 'key', label: tx('Roles y permisos'), to: '/admin/roles', show: isStaff },
        { icon: 'shield', label: tx('Cuentas y seguridad'), to: '/admin/cuentas', show: isStaff },
        { icon: 'toggle-right', label: tx('Funciones de la iglesia'), to: '/admin/funciones' as Href, show: can('admin.permisos') },
        { icon: 'eye', label: tx('Ver como miembro'), to: '/miembro-vista' as Href, show: can('admin.permisos') },
        { icon: 'download', label: tx('Copia de todos los datos'), to: '/admin/copia' as Href, show: can('admin.permisos') },
        { icon: 'flag', label: tx('Primeros pasos'), to: '/admin/alta' as Href, show: extras.is_new && can('admin.iglesia') },
        { icon: 'life-buoy', label: tx('Pedir ayuda a La Mies'), to: '/admin/ayuda' as Href, show: can('admin.iglesia') || can('admin.permisos') },
        { icon: 'globe', label: tx('Iglesias de la red'), to: '/admin/red' as Href, show: !!profile?.is_network_admin },
        { icon: 'grid', label: tx('La Mies Central'), to: '/central' as Href, show: !!centralRole },
      ],
    },
  ];

  // El menú: cada uno lo ordena (favoritos arriba, orden de botones y de grupos, arriba o abajo de todo).
  const tileKey = (t: Tile) => (typeof t.to === 'string' ? t.to : JSON.stringify(t.to));
  // Lo que la iglesia apagó no aparece en el menú.
  const toPath = (to: Href): string => (typeof to === 'string' ? to : ((to as { pathname?: string }).pathname ?? ''));
  const gated = groups.map((g) => ({ ...g, tiles: g.tiles.map((t) => ({ ...t, tone: g.tone, show: t.show && pathOn(church?.disabled_features, toPath(t.to)) })) }));
  const meta = new Map(groups.map((g) => [g.title, g]));
  const laid = layout(gated, tileKey, menu).filter((g) => g.tiles.some((t) => t.show));
  const groupTitles = laid.filter((g) => g.title !== FAV).map((g) => g.title);
  const toggleFav = (k: string) => setMenu({ ...menu, fav: menu.fav.includes(k) ? menu.fav.filter((x) => x !== k) : [...menu.fav, k] });
  const moveTile = (title: string, k: string, dir: -1 | 1) => {
    const keys = (laid.find((g) => g.title === title)?.tiles ?? []).filter((t) => t.show).map(tileKey);
    const next = moved(keys, k, dir);
    setMenu(title === FAV ? { ...menu, fav: next } : { ...menu, order: { ...menu.order, [title]: next } });
  };
  const moveGroup = (title: string, dir: -1 | 1) => setMenu({ ...menu, groups: moved(groupTitles, title, dir) });
  const isClosed = (title: string) => !edit && title !== FAV && (menu.fold[title] ?? !!meta.get(title)?.closed);
  const toggleFold = (title: string) => setMenu({ ...menu, fold: { ...menu.fold, [title]: !isClosed(title) } });
  const q = norm(find.trim());
  const found = q ? gated.flatMap((g) => g.tiles).filter((t) => t.show && norm(t.label).includes(q)) : [];
  const renderTile = (t: Tile, title: string, ti: number, count: number) => {
    const k = tileKey(t);
    const isFav = menu.fav.includes(k);
    const c = toneOf(t.tone);
    return (
      <Pressable key={k} onPress={() => (edit ? toggleFav(k) : router.push(t.to))} accessibilityRole="button" accessibilityLabel={t.label}
        style={({ pressed }) => [styles.tile, t.strong && { backgroundColor: c.solid, borderColor: c.solid }, edit && { borderStyle: 'dashed', borderColor: c.solid }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
        <View style={[styles.tileIcon, { backgroundColor: t.strong ? 'rgba(255,255,255,0.18)' : c.soft }]}>
          <Feather name={t.icon} size={22} color={t.strong ? '#FFF' : c.solid} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: t.strong ? '#FFF' : colors.text, textAlign: 'center' }} numberOfLines={2}>{t.label}</Text>
        {edit ? (
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 2 }}>
            <Pressable disabled={ti === 0} onPress={() => moveTile(title, k, -1)} accessibilityLabel={tx('Mover {label} atrás', { label: t.label })} style={[styles.mini, styles.tiny, ti === 0 && { opacity: 0.3 }]}><Feather name="chevron-left" size={14} color={colors.text} /></Pressable>
            <Pressable onPress={() => toggleFav(k)} accessibilityLabel={isFav ? tx('Sacar {label} de favoritos', { label: t.label }) : tx('Fijar {label} arriba', { label: t.label })} style={[styles.mini, styles.tiny, isFav && { backgroundColor: colors.amber, borderColor: colors.amber }]}><Feather name="star" size={14} color={isFav ? '#FFF' : colors.text} /></Pressable>
            <Pressable disabled={ti === count - 1} onPress={() => moveTile(title, k, 1)} accessibilityLabel={tx('Mover {label} adelante', { label: t.label })} style={[styles.mini, styles.tiny, ti === count - 1 && { opacity: 0.3 }]}><Feather name="chevron-right" size={14} color={colors.text} /></Pressable>
          </View>
        ) : null}
      </Pressable>
    );
  };
  const menuBlock = (
    <View style={{ gap: 14 }}>
      {edit ? (
        <Card style={{ gap: 10, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.greenText }}>{tx('Ordenar mi menú')}</Text>
          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
            {tx('★ deja el botón fijado arriba, en Favoritos. Las flechas ◀ ▶ lo mueven y ▲ ▼ mueven el grupo entero. Esto es solo en tu teléfono.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={menu.top ? tx('Menú: arriba de todo') : tx('Menú: abajo de todo')} icon={menu.top ? 'arrow-up' : 'arrow-down'} variant="outline" small style={{ flex: 1 }} onPress={() => setMenu({ ...menu, top: !menu.top })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={tx('Como estaba')} variant="ghost" small style={{ flex: 1 }} onPress={() => resetMenu()} />
            <Button title={tx('Listo')} small style={{ flex: 1 }} onPress={() => setEdit(false)} />
          </View>
        </Card>
      ) : (
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={find} onChangeText={setFind} placeholder={tx('Buscar en la app: asistencia, finanzas, sorteos…')} placeholderTextColor={colors.muted}
            accessibilityLabel={tx('Buscar en la app')} autoCorrect={false} returnKeyType="search" style={styles.searchInput} />
          {find ? <Pressable onPress={() => setFind('')} hitSlop={10} accessibilityLabel={tx('Borrar la búsqueda')}><Feather name="x" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      )}
      {q ? (
        found.length
          ? <View style={styles.grid}>{found.map((t, i) => renderTile(t, '', i, found.length))}</View>
          : <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 10 }}>{tx('No encontré nada con “{find}”. Probá con otra palabra.', { find: find.trim() })}</Text>
      ) : laid.map((g) => {
        const shown = g.tiles.filter((t) => t.show);
        const gi = groupTitles.indexOf(g.title);
        const c = toneOf(g.title === FAV ? 'amber' : meta.get(g.title)?.tone);
        const closed = isClosed(g.title);
        return (
          <View key={g.title} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable disabled={edit || g.title === FAV} onPress={() => toggleFold(g.title)} accessibilityRole="button"
                accessibilityLabel={`${g.title}, ${shown.length} ${shown.length === 1 ? tx('opción') : tx('opciones')}. ${closed ? tx('Abrir') : tx('Cerrar')}`}
                style={[styles.groupHead, { backgroundColor: c.soft }]}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.solid }} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: c.text }}>{g.title === FAV ? tx('★ Favoritos') : g.title}</Text>
                {g.title !== FAV && !edit ? (
                  <>
                    {closed ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{shown.length}</Text> : null}
                    <Feather name={closed ? 'chevron-down' : 'chevron-up'} size={18} color={c.text} />
                  </>
                ) : null}
              </Pressable>
              {edit && g.title !== FAV ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable disabled={gi <= 0} onPress={() => moveGroup(g.title, -1)} accessibilityLabel={tx('Subir {title}', { title: g.title })} style={[styles.mini, gi <= 0 && { opacity: 0.3 }]}><Feather name="chevron-up" size={18} color={colors.text} /></Pressable>
                  <Pressable disabled={gi >= groupTitles.length - 1} onPress={() => moveGroup(g.title, 1)} accessibilityLabel={tx('Bajar {title}', { title: g.title })} style={[styles.mini, gi >= groupTitles.length - 1 && { opacity: 0.3 }]}><Feather name="chevron-down" size={18} color={colors.text} /></Pressable>
                </View>
              ) : null}
            </View>
            {closed ? null : <View style={styles.grid}>{shown.map((t, ti) => renderTile(t, g.title, ti, shown.length))}</View>}
          </View>
        );
      })}
      {!edit && !q ? <Text onPress={() => setEdit(true)} style={{ fontSize: 13, fontWeight: '700', color: colors.green, textAlign: 'center' }}>{tx('✎ Ordenar mi menú')}</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topInner}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="contain" accessibilityLabel={tx('Logo de la iglesia')} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.churchName} numberOfLines={1}>{church?.name ?? tx('Iglesia')}</Text>
            <Text style={styles.motto}>{extras.motto ?? (extras.is_new ? '' : tx('Más como Cristo cada día'))}</Text>
          </View>
          {(Platform.OS === 'web' || Math.min(winW, winH) >= 700) && canUseDesk(perms) ? (
            <Pressable accessibilityRole="link" accessibilityLabel={tx('Abrir el escritorio')} onPress={() => { setDeskPref(true); router.push('/escritorio' as Href); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.input }}>
              <Feather name="monitor" size={15} color={colors.text} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{tx('Escritorio')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Screen>
        <Text style={styles.hello}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
        <SetupBanner />
        {menu.top ? menuBlock : null}
        {on('predicas') && tomorrow ? (
          <Pressable onPress={() => router.push(`/predica/${tomorrow.id}` as Href)} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.violetSoft, borderColor: colors.violetSoft }}>
              <Feather name="mic" size={22} color={colors.violetText} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.violetText }}>{tx('MAÑANA EN LA IGLESIA')}</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{tomorrow.title}</Text>
                {tomorrow.passage || tomorrow.preacher ? <Text style={{ fontSize: 13, color: colors.muted }}>{[tomorrow.passage, tomorrow.preacher].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            </Card>
          </Pressable>
        ) : null}
        {on('vivo') && live ? (
          <Pressable onPress={() => router.push('/vivo' as Href)} accessibilityRole="button" accessibilityLabel={tx('Ver el culto en vivo')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#E11D48' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="radio" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1 }}>{tx('● EN VIVO AHORA')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }} numberOfLines={1}>{live.title ?? tx('El culto está en vivo')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#FFF" />
          </Pressable>
        ) : null}
        {on('evangelismo') && seesLiveOutings && outNow > 0 ? (
          <Pressable onPress={() => router.push('/equipo')} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.green }}>
            <Feather name="radio" size={22} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1 }}>{tx('● EVANGELISMO EN VIVO')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }} numberOfLines={1}>
                {outNow === 1 ? tx('1 hermano saliendo ahora') : tx('{outNow} hermanos saliendo ahora', { outNow })}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#FFF" />
          </Pressable>
        ) : null}
        {on('colectivo') && bus.live ? (
          <Pressable onPress={() => router.push('/colectivo-vivo' as Href)} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.amber }}>
            <Feather name="truck" size={22} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1 }}>{tx('EL COLECTIVO ESTÁ EN CAMINO')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }} numberOfLines={1}>{tx('{live} · tocá para verlo en el mapa', { live: bus.live })}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#FFF" />
          </Pressable>
        ) : null}
        {on('cumples') && bdays.length ? (
          <Card style={{ gap: 10, backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: colors.blueText, letterSpacing: 0.5 }}>
              🎂 {bdays.some((b) => b.is_me) ? tx('¡FELIZ CUMPLEAÑOS!') : bdays.length === 1 ? tx('HOY CUMPLE AÑOS') : tx('HOY CUMPLEN AÑOS')}
            </Text>
            {bdays.some((b) => b.is_me) ? (
              <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{tx('Toda la iglesia te saluda hoy. Que el Señor te bendiga mucho.')}</Text>
            ) : null}
            {bdays.filter((b) => !b.is_me).map((b) => (
              <View key={b.contact_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Face name={b.name} path={b.photo_path} size={38} />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{b.name}{b.turns ? <Text style={{ fontWeight: '500', color: colors.muted }}>  {tx('· {turns} años', { turns: b.turns })}</Text> : null}</Text>
              </View>
            ))}
            {on('chat') && bdays.some((b) => !b.is_me) ? (
              <Text onPress={() => router.push('/chat' as Href)} style={{ fontSize: 14, fontWeight: '800', color: colors.blueText }}>{tx('Mandale un saludo en el chat de la iglesia →')}</Text>
            ) : null}
          </Card>
        ) : null}
        {on('cumples') && askBday ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('🎂 ¿Cuándo es tu cumpleaños?')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{tx('Así la iglesia te saluda ese día. Solo se muestra el día, no tu edad.')}</Text>
            <Field label={tx('Fecha de nacimiento')} placeholder={tx('DD/MM/AAAA')} value={bdayText} onChangeText={(t) => setBdayText((prev) => maskDateAR(t, prev))} keyboardType="number-pad" maxLength={10} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={tx('Ahora no')} variant="ghost" small style={{ flex: 1 }} onPress={() => { setAskBday(false); AsyncStorage.setItem('lamies.bday.skip', '1').catch(() => undefined); }} />
              <Button title={tx('Guardar')} small style={{ flex: 1 }} onPress={async () => {
                const iso = parseDateAR(bdayText);
                if (!iso) return Alert.alert(tx('Revisá la fecha'), tx('Escribí el día, el mes y el año. Por ejemplo 23/05/1990.'));
                const { error } = await supabase.rpc('set_my_birthdate', { p_date: iso });
                if (error) return Alert.alert(tx('No se pudo guardar'), errorMessage(error));
                setAskBday(false);
                Alert.alert(tx('¡Listo!'), tx('Ya quedó tu cumpleaños.'));
              }} />
            </View>
          </Card>
        ) : null}
        {on('devocional') && daily ? (
          <View>
            <Pressable onPress={() => router.push('/devocional')} accessibilityRole="button" accessibilityLabel={tx('Abrir el devocional de hoy')}>
              <VerseCard item={daily} church={church?.name} compact big hideMessage style={styles.dailyCard} />
            </Pressable>
            {/* Como en las apps de la Biblia: corazones, comentarios y compartir, sobre la misma foto. */}
            <View style={styles.dailyBar} pointerEvents="box-none">
              <Pressable onPress={toggleDailyLike} hitSlop={8} style={styles.dailyAct} accessibilityRole="button"
                accessibilityLabel={social.liked ? tx('Quitar me gusta') : tx('Me gusta')} accessibilityState={{ selected: social.liked }}>
                <Ionicons name={social.liked ? 'heart' : 'heart-outline'} size={19} color={social.liked ? '#FF6B6F' : '#FFFFFF'} />
                <Text style={styles.dailyActText}>{social.likes || tx('Me gusta')}</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/devocional', params: { abrir: 'comentarios' } })} hitSlop={8} style={styles.dailyAct}
                accessibilityRole="button" accessibilityLabel={tx('Comentarios: {comments}', { comments: social.comments })}>
                <Ionicons name="chatbubble-outline" size={18} color="#FFFFFF" />
                <Text style={styles.dailyActText}>{social.comments || tx('Comentar')}</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/devocional', params: { abrir: 'compartir' } })} hitSlop={8} style={styles.dailyAct}
                accessibilityRole="button" accessibilityLabel={tx('Compartir')}>
                <Ionicons name="share-outline" size={19} color="#FFFFFF" />
                <Text style={styles.dailyActText}>{tx('Compartir')}</Text>
              </Pressable>
              {streak ? (
                <Pressable onPress={() => router.push('/devocional')} hitSlop={8} style={styles.dailyAct} accessibilityRole="button" accessibilityLabel={tx('Racha de lectura: {streak} días', { streak })}>
                  <Ionicons name="flash-outline" size={19} color="#FFFFFF" />
                  <Text style={styles.dailyActText}>{streak}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        {/* El plan de lectura vive en Crecimiento. Acá queda solo si la iglesia apagó Crecimiento. */}
        {!on('plan_lectura') || on('crecimiento') ? null : (() => {
          const st = biblePlan ? planStatus(biblePlan.plan, biblePlan.started_on, biblePlan.done, isoDay(new Date())) : null;
          const title = !st ? tx('Plan de lectura de la Biblia') : st.today ? tx('Lectura de hoy: {today}', { today: st.today }) : tx('Hoy no hay lectura nueva');
          const hint = !st ? tx('Elegí un plan y la app te dice qué leer cada día')
            : st.todayDone && !st.behind.length ? tx('¡Listo por hoy! Vas al día.')
              : st.behind.length ? `Te ${st.behind.length === 1 ? tx('queda 1 lectura atrasada') : tx('quedan {n} lecturas atrasadas', { n: st.behind.length })}` : tx('Tocá para tildarla cuando la leas');
          return (
            <Pressable onPress={() => router.push('/plan-lectura' as Href)} accessibilityRole="button" accessibilityLabel={`${title}. ${hint}`}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={st?.todayDone ? 'check' : 'book-open'} size={19} color={colors.blueText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{title}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>{hint}</Text>
                </View>
                {(() => {
                  const at = st?.today ? parseReading(st.today) : null;
                  return at && on('biblia') ? (
                    <Pressable onPress={() => router.push({ pathname: '/biblia/leer', params: { libro: String(at.book), cap: String(at.chapter) } })} hitSlop={6}
                      accessibilityRole="button" accessibilityLabel={tx('Leer {today} en la Biblia', { today: st?.today })}
                      style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.blueSoft, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="book-open" size={15} color={colors.blueText} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.blueText }}>{tx('Leer')}</Text>
                    </Pressable>
                  ) : null;
                })()}
                <Feather name="chevron-right" size={18} color={colors.gray} />
              </Card>
            </Pressable>
          );
        })()}
        {/* La Biblia está en la barra de abajo. Acá queda solo para quien la sacó de su barra. */}
        {!on('biblia') || tabs.includes('biblia') ? null : (
          <Pressable onPress={() => router.push('/biblia' as Href)} accessibilityRole="button" accessibilityLabel={tx('Biblia. Leé la Biblia en la app, sin internet')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="book" size={19} color={colors.blueText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('Biblia')}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Leela en la app, sin internet')}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.gray} />
            </Card>
          </Pressable>
        )}

        {!on('anuncios') ? null : news.length ? (
          <Card style={styles.news}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="volume-2" size={18} color={colors.amberText} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.amberText, letterSpacing: 0.5 }}>{tx('ANUNCIOS')}</Text>
              <Text onPress={() => router.push('/anuncios')} style={{ fontSize: 13, fontWeight: '800', color: colors.amberText }}>{tx('Ver todos')}</Text>
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
          <Text onPress={() => router.push('/anuncios')} style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>{tx('+ Escribir un anuncio para la iglesia')}</Text>
        ) : null}
        <SectionTitle>{tx('Esta semana te toca')}</SectionTitle>
        <UpcomingList items={upcoming.slice(0, 4)} />

        {!menu.top ? menuBlock : null}

        {on('evangelismo') ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="map" size={22} color={colors.green} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 }}>
              {tx('Para salir a evangelizar o a repartir volantes, andá a la pestaña Mapa y tocá Iniciar salida.')}
            </Text>
          </Card>
        ) : null}

        {socialLinks(church?.social, church?.website).length ? (
          <>
            <SectionTitle>{tx('Seguinos')}</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {socialLinks(church?.social, church?.website).map((l) => (
                <Pressable key={l.key} onPress={() => Linking.openURL(l.url).catch(() => undefined)} accessibilityRole="link" accessibilityLabel={tx('{label} de la iglesia', { label: l.label })} style={styles.social}>
                  <Ionicons name={l.icon as React.ComponentProps<typeof Ionicons>['name']} size={26} color={l.color ?? (l.key === 'web' ? colors.greenText : colors.text)} />
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
  groupHead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, borderRadius: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg },
  searchInput: { flex: 1, height: '100%', fontSize: 15, color: colors.text },
  social: { width: 96, alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14, backgroundColor: colors.bgSoft },
  dailyAct: { alignItems: 'center', gap: 3, minWidth: 64 },
  dailyActText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  // La foto baja hasta abajo y los botones van encima, sin la franja verde.
  dailyCard: { aspectRatio: undefined, maxHeight: undefined, minHeight: 300, paddingBottom: 68 },
  dailyBar: { position: 'absolute', left: 0, right: 0, bottom: 12, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
}));
