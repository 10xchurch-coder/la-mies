// Pantalla principal: el mapa de veredas cubiertas, los hermanos en vivo y el botón de salir.
import { liveMemberActions } from '@/lib/directions';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import type { Region } from '@/components/map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoverageMap, bboxOfRegion, regionAround, type LiveMember } from '@/components/CoverageMap';
import { Button } from '@/components/ui';
import { MapTypeButton, mapStyleProps, useMapStyle } from '@/components/MapTypeButton';
import { clearMeetingPoint, coverageInBbox, currentMeetingPoint, editHouse, houseSidesInBbox, housesInBbox, listContacts, listProfiles, listZones, markSidesFor, roadsInBbox, setMeetingPoint, setSideCoverage, teamLive } from '@/lib/api';
import { Marker, Polyline } from '@/components/map';
import { showActions } from '@/components/ActionSheet';
import { errorMessage } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import type { LatLng } from '@/lib/geo';
import { haversine, offsetSegment, projectOnSegment, segmentOf, sideName, sideOfSegment, type Side } from '@/lib/geo';
import { KIND_LABEL, addDays, fmtDateAR, fmtDayYear, fmtRelativeDay, fmtTime, isoDate, parseDateAR } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { ensureAlwaysLocationIOS, ensureNoBatteryOptimization } from '@/lib/battery';
import { useKeyboardHeight } from '@/lib/keyboard';
import { COVERAGE_LEGEND, FLYERS_LEGEND, colors, themed } from '@/theme';
import type { Contact, CoverageRow, HouseRow, MeetingPoint, OutingKind, Profile, RoadRow, Zone } from '@/types';

/** Un color por compañero para su recorrido. */
export const TRAIL_COLORS = ['#2563EB', '#D97706', '#7C3AED', '#DB2777', '#0D9488', '#DC2626', '#4D7C0F', '#0369A1'];
const STALE_STEPS = [0, 3, 6, 12] as const;

type Layer = 'all' | OutingKind;
const LAYER_KEY = 'lamies.mapLayer';

// Posadas, por si todavía no tenemos la ubicación.
const DEFAULT_CENTER = { lat: -27.3671, lng: -55.896 };

export default function Mapa() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { session, isLeader, can, church, profile } = useAuth();
  const outing = useOuting();
  const [region, setRegion] = useState<Region>(regionAround(DEFAULT_CENTER, 900));
  const [roads, setRoads] = useState<RoadRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [live, setLive] = useState<LiveMember[]>([]);
  const [selected, setSelected] = useState<CoverageRow | null>(null);
  // Lo que se tocó en el mapa: una vereda (marcada o no) o el recorrido de un compañero.
  const [picked, setPicked] = useState<{ road: RoadRow; seg: number; side: Side } | null>(null);
  const [pickedTrail, setPickedTrail] = useState<{ name: string; id: string } | null>(null);
  const [houseEdit, setHouseEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mapStyle, setMapStyle] = useMapStyle();
  const [layer, setLayerState] = useState<Layer>('all');
  const [choosing, setChoosing] = useState(false);
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [houseSides, setHouseSides] = useState<Set<string> | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [trails, setTrails] = useState<{ id: string; points: LatLng[]; color: string; name: string }[]>([]);
  const [staleMonths, setStaleMonths] = useState<(typeof STALE_STEPS)[number]>(0);
  const [menu, setMenu] = useState(false);
  const [legend, setLegend] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Marcar calles a mano (se olvidó el teléfono, se cortó el GPS): para quién, qué día y qué veredas.
  const [manual, setManual] = useState<null | { user: { id: string; name: string }; date: string; kind: OutingKind; picks: Map<string, { road_id: number; seg: number; side: Side }> }>(null);
  const [manualSetup, setManualSetup] = useState<null | { user: { id: string; name: string }; date: string; kind: OutingKind }>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [meet, setMeet] = useState<MeetingPoint | null>(null);
  const [meetOpen, setMeetOpen] = useState(false);
  const [meetDraft, setMeetDraft] = useState<null | { lat: number; lng: number; mins: number; note: string }>(null);
  const staleSince = useMemo(() => (staleMonths ? new Date(Date.now() - staleMonths * 30.4 * 86400000) : null), [staleMonths]);

  useEffect(() => {
    AsyncStorage.getItem(LAYER_KEY).then((v) => {
      if (v === 'all' || v === 'soulwinning' || v === 'flyers') setLayerState(v);
    }).catch(() => undefined);
  }, []);
  const setLayer = (l: Layer) => {
    setLayerState(l);
    setSelected(null);
    setPicked(null);
    AsyncStorage.setItem(LAYER_KEY, l).catch(() => undefined);
  };
  const shownCoverage = useMemo(() => (layer === 'all' ? coverage : coverage.filter((c) => c.kind === layer)), [coverage, layer]);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadArea = useCallback(async (r: Region) => {
    if (r.latitudeDelta > 0.08) return; // muy lejos: no cargamos miles de líneas
    const b = bboxOfRegion(r);
    try {
      const near = r.latitudeDelta < 0.014;
      const [rs, cov, hs] = await Promise.all([roadsInBbox(b), coverageInBbox(b), near ? housesInBbox(b) : Promise.resolve([] as HouseRow[])]);
      setRoads(rs);
      setCoverage(cov);
      setHouses(hs);
      houseSidesInBbox(b).then(setHouseSides).catch(() => undefined);
    } catch {
      // sin señal
    }
  }, []);

  const loadLive = useCallback(async () => {
    currentMeetingPoint().then(setMeet).catch(() => undefined);
    try {
      const rows = await teamLive();
      // El recorrido de hoy de cada compañero en salida, cada uno con su color.
      const others = rows.filter((x) => x.user_id !== session?.user.id);
      if (others.length) {
        const { data } = await supabase.from('track_points').select('session_id, lat, lng, recorded_at').in('session_id', others.map((o) => o.session_id)).order('recorded_at').limit(6000);
        const by = new Map<string, LatLng[]>();
        for (const p of (data ?? []) as { session_id: string; lat: number; lng: number }[]) {
          if (!by.has(p.session_id)) by.set(p.session_id, []);
          by.get(p.session_id)!.push({ lat: p.lat, lng: p.lng });
        }
        setTrails(others.map((o, i) => ({ id: o.session_id, name: o.display_name, points: by.get(o.session_id) ?? [], color: TRAIL_COLORS[i % TRAIL_COLORS.length] })).filter((t) => t.points.length > 1));
      } else {
        setTrails([]);
      }
      setLive(
        rows
          .filter((r) => r.lat != null && r.lng != null)
          .map((r) => ({ user_id: r.user_id, display_name: r.display_name, lat: r.lat as number, lng: r.lng as number, me: r.user_id === session?.user.id })),
      );
    } catch {
      // sin señal
    }
  }, [session?.user.id]);

  // Al entrar: centrar en mi ubicación y cargar la zona.
  useEffect(() => {
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const r = regionAround({ lat: here.coords.latitude, lng: here.coords.longitude }, 500);
          setRegion(r);
          loadArea(r);
          return;
        }
      } catch {
        // seguimos con el centro por defecto
      }
      loadArea(regionAround(DEFAULT_CENTER, 900));
    })();
  }, [loadArea]);

  useFocusEffect(
    useCallback(() => {
      listContacts().then(setContacts).catch(() => undefined);
      listZones().then(setZones).catch(() => undefined);
      loadLive();
      const id = setInterval(loadLive, 15000);
      return () => clearInterval(id);
    }, [loadLive]),
  );

  const onRegionChangeComplete = (r: Region) => {
    setRegion(r);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => loadArea(r), 500);
  };

  const selectedInfo = useMemo(() => {
    if (!picked) return null;
    const seg = segmentOf(picked.road, picked.seg);
    const name = seg ? sideName(seg[0], seg[1], picked.side) : null;
    return { road: picked.road, name };
  }, [picked]);

  const clearPick = () => { setPicked(null); setSelected(null); setPickedTrail(null); };

  // Un toque en el mapa: buscamos la vereda más cercana al dedo (o el recorrido de un compañero).
  // Se hace acá y no en cada línea porque en el iPhone tocar una línea también "toca el mapa" y se borraba la selección.
  const onMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const p = { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude };
    const tol = Math.max(10, Math.min(45, region.latitudeDelta * 111320 * 0.03));
    if (meet && haversine(p, meet) <= Math.max(8, tol)) { setMeetOpen(true); return; }
    if (manual) {
      let mb: { road: RoadRow; seg: number; side: Side; d: number } | null = null;
      for (const r of roads) {
        for (let i = 0; i < r.coords.length - 1; i++) {
          const a = { lat: r.coords[i][0], lng: r.coords[i][1] };
          const b = { lat: r.coords[i + 1][0], lng: r.coords[i + 1][1] };
          const pr = projectOnSegment(p, a, b);
          if (pr.dist <= tol && (!mb || pr.dist < mb.d)) mb = { road: r, seg: i, side: sideOfSegment(p, a, b), d: pr.dist };
        }
      }
      if (!mb) return;
      const key = `${mb.road.id}:${mb.seg}:${mb.side}`;
      const next = new Map(manual.picks);
      if (next.has(key)) next.delete(key); else next.set(key, { road_id: mb.road.id, seg: mb.seg, side: mb.side });
      setManual({ ...manual, picks: next });
      return;
    }
    if (houseEdit) {
      let hb: { h: HouseRow; d: number } | null = null;
      for (const h of houses) { const d = haversine(p, h); if (d <= Math.max(6, tol / 2) && (!hb || d < hb.d)) hb = { h, d }; }
      if (hb) {
        const h = hb.h;
        Alert.alert('¿No es una casa?', 'Se saca este punto del mapa y del conteo de casas.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sacar el punto', style: 'destructive', onPress: () => editHouse('hide', h.id).then(() => loadArea(region)).catch((err) => Alert.alert('No se pudo', errorMessage(err))) },
        ]);
      } else {
        Alert.alert('Agregar una casa acá', 'Se suma al conteo de casas de la cuadra más cercana.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Agregar', onPress: () => editHouse('add', null, p.lat, p.lng).then(() => loadArea(region)).catch((err) => Alert.alert('No se pudo', errorMessage(err))) },
        ]);
      }
      return;
    }
    let best: { road: RoadRow; seg: number; side: Side; d: number } | null = null;
    for (const r of roads) {
      for (let i = 0; i < r.coords.length - 1; i++) {
        const a = { lat: r.coords[i][0], lng: r.coords[i][1] };
        const b = { lat: r.coords[i + 1][0], lng: r.coords[i + 1][1] };
        const pr = projectOnSegment(p, a, b);
        if (pr.dist <= tol && (!best || pr.dist < best.d)) best = { road: r, seg: i, side: sideOfSegment(p, a, b), d: pr.dist };
      }
    }
    let trail: { name: string; id: string; d: number } | null = null;
    for (const t of trails) {
      for (let i = 0; i < t.points.length - 1; i++) {
        const d = projectOnSegment(p, t.points[i], t.points[i + 1]).dist;
        if (d <= tol && (!trail || d < trail.d)) trail = { name: t.name, id: t.id, d };
      }
    }
    if (trail && (!best || trail.d + 4 < best.d)) {
      setPicked(null); setSelected(null);
      setPickedTrail({ name: trail.name, id: trail.id });
      return;
    }
    if (!best) { clearPick(); return; }
    const k = best;
    const rows = shownCoverage.filter((c) => c.road_id === k.road.id && c.seg === k.seg && c.side === k.side);
    const row = rows.find((c) => c.kind === 'soulwinning') ?? rows[0] ?? null;
    setPickedTrail(null);
    setPicked({ road: k.road, seg: k.seg, side: k.side });
    setSelected(row);
  };

  const pickKind: OutingKind = selected?.kind ?? (layer === 'flyers' ? 'flyers' : 'soulwinning');
  const canRemove = !!selected && (isLeader || selected.last_user_id === session?.user.id);

  const markDone = () => {
    if (!picked) return;
    setSideCoverage(picked.road.id, picked.seg, picked.side, pickKind, true)
      .then(() => loadArea(region)).then(clearPick)
      .catch((e) => Alert.alert('No se pudo', errorMessage(e)));
  };

  // Marcar a mano: elegir persona, fecha y tipo; después tocar las veredas.
  const canOthers = can('evang.marcar_otros');
  const openManual = () => {
    setMenu(false);
    clearPick();
    setHouseEdit(false);
    if (canOthers) listProfiles().then(setPeople).catch(() => undefined);
    setManualSetup({ user: { id: session?.user.id ?? '', name: profile?.display_name ?? 'Yo' }, date: isoDate(new Date()), kind: layer === 'flyers' ? 'flyers' : 'soulwinning' });
  };
  const saveManual = async () => {
    if (!manual || !manual.picks.size) { setManual(null); return; }
    setBusy(true);
    try {
      await markSidesFor(manual.user.id, manual.date, manual.kind, [...manual.picks.values()]);
      const n = manual.picks.size;
      setManual(null);
      await loadArea(region);
      Alert.alert('Listo', `Se cargaron ${n} ${n === 1 ? 'vereda' : 'veredas'} a nombre de ${manual.user.name}, el ${fmtDateAR(manual.date)}. Ya cuentan en sus cuadras, metros y casas.`);
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Punto de encuentro: mantener apretado el mapa durante una salida.
  const onLongPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    if (!outing.active || manual || houseEdit) return;
    setMeetDraft({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude, mins: 30, note: '' });
  };
  const saveMeet = async () => {
    if (!meetDraft) return;
    try {
      await setMeetingPoint(meetDraft.lat, meetDraft.lng, new Date(Date.now() + meetDraft.mins * 60000), meetDraft.note.trim() || null);
      setMeetDraft(null);
      currentMeetingPoint().then(setMeet).catch(() => undefined);
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
  };
  const directions = (p: { lat: number; lng: number }) => {
    const dest = `${p.lat},${p.lng}`;
    showActions('Cómo llegar', 'Te lleva caminando hasta el punto de encuentro.', [
      { text: 'Google Maps', icon: 'navigation' as const, onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`) },
      ...(Platform.OS === 'ios' ? [{ text: 'Mapas de Apple', icon: 'map' as const, onPress: () => Linking.openURL(`http://maps.apple.com/?daddr=${dest}&dirflg=w`) }] : []),
      { text: 'Cancelar', icon: 'corner-up-left' as const },
    ]);
  };

  const churchUrl = church?.website || 'https://iglesiavictoria.com';
  const shareChurch = () => {
    Share.share({ message: `Te invito a conocer la ${church?.name ?? 'iglesia'}: ${churchUrl}` }).catch(() => undefined);
  };

  const removeMark = () => {
    if (!picked || !selected) return;
    const go = (session: string | null) =>
      setSideCoverage(picked.road.id, picked.seg, picked.side, selected.kind, false, session)
        .then(() => loadArea(region)).then(clearPick)
        .catch((e) => Alert.alert('No se pudo', errorMessage(e)));
    const who = selected.last_user_name ?? 'alguien';
    showActions('No se hizo esta vereda', 'Se saca del mapa. Si se recalcula la salida, no vuelve a aparecer.', [
      ...(selected.last_session_id ? [{ text: `Quitar la de ${who} (${fmtRelativeDay(selected.last_covered_at)})`, icon: 'x' as const, onPress: () => go(selected.last_session_id ?? null) }] : []),
      ...(isLeader && selected.times > 1 ? [{ text: `Quitar las ${selected.times} veces (nadie la hizo)`, icon: 'trash-2' as const, destructive: true, onPress: () => go(null) }] : []),
      ...(isLeader && !selected.last_session_id ? [{ text: 'Quitar la marca', icon: 'x' as const, onPress: () => go(null) }] : []),
      { text: 'Cancelar', icon: 'corner-up-left' as const },
    ]);
  };

  const start = () => {
    if (outing.active) {
      router.push('/salida');
      return;
    }
    setChoosing(true);
  };

  const begin = async (kind: OutingKind) => {
    setChoosing(false);
    setBusy(true);
    try {
      await ensureNoBatteryOptimization();
      await ensureAlwaysLocationIOS();
      await outing.start(kind);
      router.push('/salida');
    } catch (e) {
      Alert.alert('No se pudo empezar', e instanceof Error ? e.message : 'Probá de nuevo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mapa</Text>
          <Text style={styles.subtitle}>
            {live.filter((m) => !m.me).length > 0 ? `${live.filter((m) => !m.me).length} en salida ahora` : 'Nadie está saliendo ahora'}
          </Text>
        </View>
        <Pressable onPress={() => setSharing(true)} accessibilityRole="button" accessibilityLabel="Compartir la iglesia" style={styles.teamBtn}>
          <Feather name="share-2" size={18} color={colors.greenText} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>Iglesia</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/equipo')} accessibilityRole="button" accessibilityLabel="Equipo en vivo y tablero" style={styles.teamBtn}>
          <Feather name="users" size={18} color={colors.greenText} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>Equipo</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <CoverageMap
          roads={roads}
          coverage={shownCoverage}
          contacts={contacts}
          live={live}
          trails={trails}
          houses={houses}
          zones={zones}
          staleSince={staleSince}
          houseSides={houseSides}
          onPressZone={(z) => router.push({ pathname: '/zona', params: { id: z.id } })}
          onPressLive={(m) => liveMemberActions(m, outing.active ? { onChat: () => router.push('/salida-chat' as never) } : {})}
          selected={selected}
          region={region}
          {...mapStyleProps(mapStyle)}
          onRegionChangeComplete={onRegionChangeComplete}
          onPressContact={(c) => router.push({ pathname: '/contacto/[id]', params: { id: c.id } })}
          onPress={onMapPress}
          onLongPress={onLongPress}
        >
          {manual ? [...manual.picks.values()].map((k) => {
            const r = roads.find((x) => x.id === k.road_id);
            const seg = r ? segmentOf(r, k.seg) : null;
            if (!seg) return null;
            const [a, b] = offsetSegment(seg[0], seg[1], k.side, 3.2);
            return <Polyline key={`m-${k.road_id}:${k.seg}:${k.side}`} coordinates={[{ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng }]} strokeColor="#7C3AED" strokeWidth={7} lineCap="round" />;
          }) : null}
          {meet ? (
            <Marker coordinate={{ latitude: meet.lat, longitude: meet.lng }} pinColor="#7C3AED" title={`Encuentro ${fmtTime(meet.meet_at)}`} onPress={() => setMeetOpen(true)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              {Platform.OS === 'web' ? undefined : (
                <View style={{ alignItems: 'center' }}>
                  <View style={styles.meetBadge}><Feather name="flag" size={14} color="#FFF" /><Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>{fmtTime(meet.meet_at)}</Text></View>
                  <View style={styles.meetTip} />
                </View>
              )}
            </Marker>
          ) : null}
        </CoverageMap>

        {picked && selectedInfo ? (
          <View style={styles.popup}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>
                {selectedInfo.road?.name ?? 'Calle sin nombre'} · vereda {selectedInfo.name ?? '?'}{selected ? ` · ${KIND_LABEL[selected.kind]}` : ''}
              </Text>
              <Pressable onPress={clearPick} accessibilityLabel="Cerrar" hitSlop={10}><Feather name="x" size={18} color={colors.muted} /></Pressable>
            </View>
            {selected ? (
              <>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.grayText }}>
                  {selected.team_names && selected.team_names.includes('+') ? selected.team_names : selected.last_user_name ?? 'Alguien'} · {fmtRelativeDay(selected.last_covered_at)} {fmtTime(selected.last_covered_at)} · {selected.times} {selected.times === 1 ? 'vez' : 'veces'}{!selected.last_session_id ? ' · marcada a mano' : ''}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{fmtDayYear(selected.last_covered_at)}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
                  <Text onPress={() => router.push({ pathname: '/vereda', params: { road: String(selected.road_id), seg: String(selected.seg), side: String(selected.side), kind: selected.kind, name: selectedInfo.road?.name ?? '', sideName: selectedInfo.name ?? '' } })}
                    style={styles.popLink}>Historial</Text>
                  {selected.last_session_id && (isLeader || selected.last_user_id === session?.user.id) ? (
                    <Text onPress={() => router.push(`/recortar?session=${selected.last_session_id}` as never)} style={styles.popLink}>Ver la salida</Text>
                  ) : null}
                  {canRemove ? <Text onPress={removeMark} style={[styles.popLink, { color: colors.red }]}>No se hizo</Text> : null}
                </View>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: colors.muted }}>Sin marcar{layer === 'all' ? '' : ` en ${KIND_LABEL[pickKind].toLowerCase()}`}.</Text>
                <Text onPress={markDone} style={[styles.popLink, { marginTop: 4 }]}>Marcar como hecha ({KIND_LABEL[pickKind].toLowerCase()})</Text>
              </>
            )}
          </View>
        ) : pickedTrail ? (
          <View style={styles.popup}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>Recorrido de {pickedTrail.name} (ahora)</Text>
              <Pressable onPress={clearPick} accessibilityLabel="Cerrar" hitSlop={10}><Feather name="x" size={18} color={colors.muted} /></Pressable>
            </View>
            {isLeader ? <Text onPress={() => router.push(`/recortar?session=${pickedTrail.id}` as never)} style={styles.popLink}>Ver o arreglar la salida</Text> : null}
          </View>
        ) : manual ? (
          <View style={[styles.popup, { borderWidth: 2, borderColor: '#7C3AED' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#5B21B6' }}>Marcando a mano · {manual.user.name} · {fmtDateAR(manual.date)} · {KIND_LABEL[manual.kind]}</Text>
            <Text style={{ fontSize: 12, color: colors.text }}>Tocá cada vereda que hizo (se pinta violeta). Tocala de nuevo para sacarla. {manual.picks.size ? `${manual.picks.size} elegidas.` : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Text onPress={saveManual} style={styles.popLink}>{manual.picks.size ? `Guardar ${manual.picks.size}` : 'Listo'}</Text>
              <Text onPress={() => setManual(null)} style={[styles.popLink, { color: colors.muted }]}>Cancelar</Text>
            </View>
          </View>
        ) : houseEdit ? (
          <View style={[styles.popup, { backgroundColor: colors.amberSoft }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amberText }}>Corrigiendo casas</Text>
            <Text style={{ fontSize: 12, color: colors.text }}>{houses.length ? 'Tocá un punto que no es casa para sacarlo, o un lugar sin punto para agregar una casa.' : 'Acercate más al mapa para ver los puntos de las casas.'}</Text>
            <Text onPress={() => setHouseEdit(false)} style={styles.popLink}>Listo</Text>
          </View>
        ) : null}

        <MapTypeButton style={mapStyle} onChange={setMapStyle} top={picked || pickedTrail || houseEdit || manual ? 130 : 12} />

        {/* Barra chica abajo: capas y opciones en un menú, para que el mapa quede libre. */}
        <View style={styles.toolbar}>
          <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Capas y opciones del mapa" style={styles.toolBtn}>
            <Feather name="layers" size={16} color={colors.text} />
            <Text style={styles.toolText}>{layer === 'all' ? 'Todo' : KIND_LABEL[layer]}</Text>
          </Pressable>
          {staleMonths ? (
            <Pressable onPress={() => setStaleMonths(0)} accessibilityRole="button" style={[styles.toolBtn, { backgroundColor: '#D64545' }]}>
              <Text style={[styles.toolText, { color: '#FFF' }]}>Sin visitar {staleMonths} m</Text>
              <Feather name="x" size={14} color="#FFF" />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setLegend((v) => !v)} accessibilityRole="button" accessibilityLabel="Qué significan los colores" style={[styles.toolBtn, { paddingHorizontal: 10 }]}>
            <Feather name={legend ? 'x' : 'help-circle'} size={16} color={colors.text} />
          </Pressable>
          {outing.active && !meet ? (
            <View style={[styles.toolBtn, { backgroundColor: '#EDE9FE' }]}>
              <Feather name="flag" size={14} color="#5B21B6" />
              <Text style={[styles.toolText, { color: '#5B21B6' }]}>Mantené apretado para marcar encuentro</Text>
            </View>
          ) : null}
          {meet ? (
            <Pressable onPress={() => setMeetOpen(true)} accessibilityRole="button" style={[styles.toolBtn, { backgroundColor: '#7C3AED' }]}>
              <Feather name="flag" size={14} color="#FFF" />
              <Text style={[styles.toolText, { color: '#FFF' }]}>Encuentro {fmtTime(meet.meet_at)}</Text>
            </Pressable>
          ) : null}
        </View>
        {legend ? (
          <View style={styles.legend}>
            {houses.length ? (
              <View style={styles.legendRow}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green }} />
                <Text style={styles.legendText}>Casa visitada</Text>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#8A9490', marginLeft: 6 }} />
                <Text style={styles.legendText}>Sin visitar</Text>
              </View>
            ) : null}
            {layer !== 'flyers' ? (
              <>
                {layer === 'all' ? <Text style={styles.legendHead}>Evangelismo</Text> : null}
                {COVERAGE_LEGEND.map((l) => (
                  <View key={`s${l.label}`} style={styles.legendRow}>
                    <View style={{ width: 22, height: 4, borderRadius: 2, backgroundColor: l.color }} />
                    <Text style={styles.legendText}>{l.label}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {layer !== 'soulwinning' ? (
              <>
                {layer === 'all' ? <Text style={styles.legendHead}>Volantes</Text> : null}
                {FLYERS_LEGEND.map((l) => (
                  <View key={`f${l.label}`} style={styles.legendRow}>
                    <View style={{ width: 22, height: 4, borderRadius: 2, backgroundColor: l.color }} />
                    <Text style={styles.legendText}>{l.label}</Text>
                  </View>
                ))}
              </>
            ) : null}
            <Text style={[styles.legendText, { color: colors.muted, fontWeight: '500', maxWidth: 220 }]}>Tocá una vereda para ver quién pasó y cuándo.</Text>
          </View>
        ) : null}
      </View>

      {outing.autoStop ? (
        <View style={styles.notice}>
          <Feather name="alert-triangle" size={20} color={colors.amberText} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.amberText, lineHeight: 18 }}>
            Tu última salida se cortó sola a las {fmtTime(outing.autoStop.cutoff)} porque parecía que ibas en un vehículo. Si no fue así, podés arreglarla en Yo → Mis salidas.
          </Text>
          <Pressable onPress={outing.dismissAutoStop} accessibilityRole="button" accessibilityLabel="Cerrar aviso" style={{ padding: 6 }}>
            <Feather name="x" size={18} color={colors.amberText} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.cta}>
        {Platform.OS === 'web' ? (
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 }}>
            Las salidas se inician desde el teléfono (acá se ve el mapa y el equipo en vivo).
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={outing.active ? 'Continuar la salida' : 'Iniciar salida'} icon={outing.active ? 'arrow-right' : 'play'} onPress={start} loading={busy} style={{ flex: 1 }} />
              <Button title="Capacitación" icon="compass" variant="outline" onPress={() => router.push('/capacitacion')} />
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Tu ubicación se comparte con el equipo solo mientras la salida está activa</Text>
          </>
        )}
        {Platform.OS === 'web' ? <Button title="Capacitación para evangelizar" icon="compass" variant="outline" small onPress={() => router.push('/capacitacion')} /> : null}
      </View>

      <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setChoosing(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>¿Qué salida es?</Text>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>Cada una queda en su propio mapa, con sus propios colores.</Text>
            <Pressable onPress={() => begin('soulwinning')} accessibilityRole="button" style={[styles.kindBtn, { borderColor: colors.green, backgroundColor: colors.greenSoft }]}>
              <Feather name="book-open" size={26} color={colors.greenText} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.greenText }}>Evangelismo</Text>
                <Text style={{ fontSize: 13, color: colors.greenText }}>Tocar puertas y presentar el evangelio</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => begin('flyers')} accessibilityRole="button" style={[styles.kindBtn, { borderColor: colors.orange, backgroundColor: colors.amberSoft }]}>
              <Feather name="file-text" size={26} color={colors.amberText} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.amberText }}>Volantes</Text>
                <Text style={{ fontSize: 13, color: colors.amberText }}>Repartir invitaciones casa por casa</Text>
              </View>
            </Pressable>
            <Button title="Cancelar" variant="ghost" onPress={() => setChoosing(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Capas y opciones */}
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Mapa</Text>
            <Text style={styles.sheetHead}>Qué mostrar</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['all', 'soulwinning', 'flyers'] as Layer[]).map((l) => (
                <Pressable key={l} onPress={() => setLayer(l)} accessibilityRole="button" accessibilityState={{ selected: layer === l }} style={[styles.chip, layer === l && styles.chipOn]}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: layer === l ? '#FFF' : colors.text }}>{l === 'all' ? 'Todo' : KIND_LABEL[l]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetHead}>Ver sin visitar (en rojo)</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {STALE_STEPS.map((m) => (
                <Pressable key={m} onPress={() => setStaleMonths(m)} accessibilityRole="button" style={[styles.chip, staleMonths === m && (m ? { backgroundColor: '#D64545' } : styles.chipOn)]}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: staleMonths === m ? '#FFF' : colors.text }}>{m ? `${m} meses` : 'No'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetHead}>Herramientas</Text>
            <Pressable onPress={openManual} accessibilityRole="button" style={styles.menuRow}>
              <Feather name="edit-3" size={20} color="#7C3AED" />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Marcar calles a mano</Text>
                <Text style={styles.menuSub}>{canOthers ? 'Para quien se olvidó el teléfono o le falló el GPS. Elegís la persona, el día y las veredas.' : 'Si no grabaste una salida (últimos 7 días), marcá las veredas que hiciste.'}</Text>
              </View>
            </Pressable>
            {can('evang.corregir') ? (
              <Pressable onPress={() => { setMenu(false); clearPick(); setManual(null); setHouseEdit(true); }} accessibilityRole="button" style={styles.menuRow}>
                <Feather name="home" size={20} color={colors.amberText} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuTitle}>Corregir casas</Text>
                  <Text style={styles.menuSub}>Sacar puntos que no son casas o agregar las que faltan.</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable onPress={() => { setMenu(false); setSharing(true); }} accessibilityRole="button" style={styles.menuRow}>
              <Feather name="share-2" size={20} color={colors.green} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Compartir la iglesia</Text>
                <Text style={styles.menuSub}>Mandá la página de la iglesia o mostrá el código QR.</Text>
              </View>
            </Pressable>
            <View style={[styles.menuRow, { opacity: 0.85 }]}>
              <Feather name="flag" size={20} color="#7C3AED" />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Punto de encuentro</Text>
                <Text style={styles.menuSub}>Durante una salida, mantené apretado un lugar del mapa y elegí la hora. Les llega a todos los que están afuera.</Text>
              </View>
            </View>
            <Button title="Cerrar" variant="ghost" onPress={() => setMenu(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Marcar a mano: para quién y qué día */}
      <Modal visible={!!manualSetup} transparent animationType="slide" onRequestClose={() => setManualSetup(null)}>
        <Pressable style={styles.backdrop} onPress={() => setManualSetup(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: kb ? 16 : insets.bottom + 16, marginBottom: kb, maxHeight: kb ? '60%' : '85%' }]} onPress={() => undefined}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Marcar calles a mano</Text>
            {manualSetup ? (
              <>
                {canOthers ? (
                  <>
                    <Text style={styles.sheetHead}>¿Quién las hizo?</Text>
                    <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {[{ id: session?.user.id ?? '', display_name: profile?.display_name ?? 'Yo' } as Profile, ...people.filter((x) => x.id !== session?.user.id)].map((x) => (
                        <Pressable key={x.id} onPress={() => setManualSetup({ ...manualSetup, user: { id: x.id, name: x.display_name } })} style={[styles.chip, manualSetup.user.id === x.id && styles.chipOn]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: manualSetup.user.id === x.id ? '#FFF' : colors.text }}>{x.id === session?.user.id ? 'Yo' : x.display_name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                <Text style={styles.sheetHead}>¿Qué día?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => {
                    const d = isoDate(addDays(new Date(), -n));
                    return (
                      <Pressable key={d} onPress={() => setManualSetup({ ...manualSetup, date: d })} style={[styles.chip, manualSetup.date === d && styles.chipOn]}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: manualSetup.date === d ? '#FFF' : colors.text }}>{n === 0 ? 'Hoy' : n === 1 ? 'Ayer' : fmtDateAR(d).slice(0, 5)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {canOthers ? (
                  <TextInput placeholder="Otra fecha (DD/MM/AAAA)" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation"
                    onChangeText={(t) => { const d = parseDateAR(t); if (d) setManualSetup({ ...manualSetup, date: d }); }}
                    style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.input, paddingHorizontal: 12, fontSize: 15, color: colors.text }} />
                ) : null}
                <Text style={styles.sheetHead}>¿Qué salida fue?</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['soulwinning', 'flyers'] as OutingKind[]).map((k) => (
                    <Pressable key={k} onPress={() => setManualSetup({ ...manualSetup, kind: k })} style={[styles.chip, manualSetup.kind === k && styles.chipOn]}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: manualSetup.kind === k ? '#FFF' : colors.text }}>{KIND_LABEL[k]}</Text>
                    </Pressable>
                  ))}
                </View>
                <Button title="Empezar a tocar veredas" icon="edit-3" onPress={() => { setManual({ ...manualSetup, picks: new Map() }); setManualSetup(null); }} />
                <Button title="Cancelar" variant="ghost" onPress={() => setManualSetup(null)} />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Compartir la iglesia */}
      <Modal visible={sharing} transparent animationType="fade" onRequestClose={() => setSharing(false)}>
        <Pressable style={[styles.backdrop, { justifyContent: 'center', padding: 24 }]} onPress={() => setSharing(false)}>
          <Pressable style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 20, gap: 12, alignItems: 'center' }} onPress={() => undefined}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{church?.name ?? 'La iglesia'}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Que lo escanee con la cámara del teléfono, o mandáselo.</Text>
            <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
              <QRCode value={churchUrl} size={200} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.green }}>{churchUrl.replace(/^https?:\/\//, '')}</Text>
            <Button title="Mandar el link" icon="send" onPress={shareChurch} style={{ alignSelf: 'stretch' }} />
            <Button title="Cerrar" variant="ghost" onPress={() => setSharing(false)} style={{ alignSelf: 'stretch' }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Nuevo punto de encuentro */}
      <Modal visible={!!meetDraft} transparent animationType="slide" onRequestClose={() => setMeetDraft(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMeetDraft(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: kb ? 16 : insets.bottom + 16, marginBottom: kb }]} onPress={() => undefined}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Punto de encuentro</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>Les avisamos a todos los que están en salida. ¿En cuánto se juntan?</Text>
            {meetDraft ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[15, 30, 45, 60, 90].map((m) => (
                    <Pressable key={m} onPress={() => setMeetDraft({ ...meetDraft, mins: m })} style={[styles.chip, meetDraft.mins === m && styles.chipOn]}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: meetDraft.mins === m ? '#FFF' : colors.text }}>{fmtTime(new Date(Date.now() + m * 60000).toISOString())}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput value={meetDraft.note} onChangeText={(t) => setMeetDraft({ ...meetDraft, note: t })} placeholder="Ej.: en la esquina del kiosco" placeholderTextColor={colors.muted}
                  style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.input, paddingHorizontal: 12, fontSize: 15, color: colors.text }} />
                <Button title="Marcar y avisar" icon="flag" onPress={saveMeet} />
                <Button title="Cancelar" variant="ghost" onPress={() => setMeetDraft(null)} />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Ver el punto de encuentro */}
      <Modal visible={meetOpen && !!meet} transparent animationType="slide" onRequestClose={() => setMeetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMeetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
            {meet ? (
              <>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Encuentro a las {fmtTime(meet.meet_at)}</Text>
                {meet.note ? <Text style={{ fontSize: 15, color: colors.text }}>{meet.note}</Text> : null}
                <Button title="Cómo llegar" icon="navigation" onPress={() => directions(meet)} />
                <Button title="Ver en el mapa" icon="map-pin" variant="outline" onPress={() => { setMeetOpen(false); setRegion(regionAround({ lat: meet.lat, lng: meet.lng }, 250)); }} />
                {meet.created_by === session?.user.id || can('evang.ver_salidas') ? (
                  <Button title="Sacar el punto" variant="ghost" onPress={() => { clearMeetingPoint(meet.id).then(() => { setMeet(null); setMeetOpen(false); }).catch((e) => Alert.alert('No se pudo', errorMessage(e))); }} />
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 13, fontWeight: '500', color: colors.muted },
  teamBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.greenSoft },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  popup: { position: 'absolute', left: 12, top: 12, right: 12, backgroundColor: colors.bg, borderRadius: 12, padding: 12, gap: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  popLink: { fontSize: 13, fontWeight: '800', color: colors.green, paddingVertical: 4 },
  hint: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  toolbar: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.bg, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  toolText: { fontSize: 12, fontWeight: '800', color: colors.text },
  sheetHead: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.bgSoft, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.text },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  menuTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  menuSub: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  meetBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7C3AED', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, borderWidth: 2, borderColor: '#FFF' },
  meetTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#7C3AED' },
  legend: { position: 'absolute', left: 12, bottom: 54, backgroundColor: colors.bg, borderRadius: 12, padding: 10, gap: 6, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  legendHead: { fontSize: 11, fontWeight: '800', color: colors.muted, marginTop: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { fontSize: 12, fontWeight: '600', color: colors.text },
  layerBtn: { height: 28, paddingHorizontal: 9, borderRadius: 8, backgroundColor: colors.bgSoft, justifyContent: 'center' },
  layerOn: { backgroundColor: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  kindBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.amberSoft, padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { padding: 12, paddingHorizontal: 16, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
}));
