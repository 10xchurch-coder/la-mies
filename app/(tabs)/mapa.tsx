// Pantalla principal: el mapa de veredas cubiertas, los hermanos en vivo y el botón de salir.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import type { Region } from '@/components/map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoverageMap, bboxOfRegion, regionAround, type LiveMember } from '@/components/CoverageMap';
import { Button } from '@/components/ui';
import { MapTypeButton, mapStyleProps, useMapStyle } from '@/components/MapTypeButton';
import { coverageInBbox, housesInBbox, listContacts, listZones, roadsInBbox, teamLive } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { LatLng } from '@/lib/geo';
import { segmentOf, sideName } from '@/lib/geo';
import { KIND_LABEL, fmtDayYear, fmtRelativeDay, fmtTime } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { ensureAlwaysLocationIOS, ensureNoBatteryOptimization } from '@/lib/battery';
import { COVERAGE_LEGEND, FLYERS_LEGEND, colors, themed } from '@/theme';
import type { Contact, CoverageRow, HouseRow, OutingKind, RoadRow, Zone } from '@/types';

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
  const { session } = useAuth();
  const outing = useOuting();
  const [region, setRegion] = useState<Region>(regionAround(DEFAULT_CENTER, 900));
  const [roads, setRoads] = useState<RoadRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [live, setLive] = useState<LiveMember[]>([]);
  const [selected, setSelected] = useState<CoverageRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapStyle, setMapStyle] = useMapStyle();
  const [layer, setLayerState] = useState<Layer>('all');
  const [choosing, setChoosing] = useState(false);
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [trails, setTrails] = useState<{ id: string; points: LatLng[]; color: string }[]>([]);
  const [staleMonths, setStaleMonths] = useState<(typeof STALE_STEPS)[number]>(0);
  const staleSince = useMemo(() => (staleMonths ? new Date(Date.now() - staleMonths * 30.4 * 86400000) : null), [staleMonths]);

  useEffect(() => {
    AsyncStorage.getItem(LAYER_KEY).then((v) => {
      if (v === 'all' || v === 'soulwinning' || v === 'flyers') setLayerState(v);
    }).catch(() => undefined);
  }, []);
  const setLayer = (l: Layer) => {
    setLayerState(l);
    setSelected(null);
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
    } catch {
      // sin señal
    }
  }, []);

  const loadLive = useCallback(async () => {
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
        setTrails(others.map((o, i) => ({ id: o.session_id, points: by.get(o.session_id) ?? [], color: TRAIL_COLORS[i % TRAIL_COLORS.length] })).filter((t) => t.points.length > 1));
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
    if (!selected) return null;
    const road = roads.find((x) => x.id === selected.road_id);
    const seg = road ? segmentOf(road, selected.seg) : null;
    const name = seg ? sideName(seg[0], seg[1], selected.side) : null;
    return { road, name };
  }, [selected, roads]);

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
          onPressZone={(z) => router.push({ pathname: '/zona', params: { id: z.id } })}
          selected={selected}
          region={region}
          {...mapStyleProps(mapStyle)}
          onRegionChangeComplete={onRegionChangeComplete}
          onPressSegment={(row) => setSelected(row)}
          onPressContact={(c) => router.push({ pathname: '/contacto/[id]', params: { id: c.id } })}
          onPress={() => setSelected(null)}
        />

        {selected && selectedInfo ? (
          <View style={styles.popup}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
              {selectedInfo.road?.name ?? 'Calle sin nombre'} · vereda {selectedInfo.name ?? '?'} · {KIND_LABEL[selected.kind]}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.grayText }}>
              {selected.last_user_name ?? 'Alguien'} · {fmtRelativeDay(selected.last_covered_at)} {fmtTime(selected.last_covered_at)} · {selected.times} {selected.times === 1 ? 'vez' : 'veces'}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>{fmtDayYear(selected.last_covered_at)}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/vereda', params: { road: String(selected.road_id), seg: String(selected.seg), side: String(selected.side), kind: selected.kind, name: selectedInfo.road?.name ?? '', sideName: selectedInfo.name ?? '' } })}
              style={{ minHeight: 32, justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.green, textDecorationLine: 'underline' }}>Ver todo el historial de esta vereda</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.hint}>
            <Feather name="info" size={16} color={colors.green} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Tocá una vereda para ver quién pasó y cuándo</Text>
          </View>
        )}

        <MapTypeButton style={mapStyle} onChange={setMapStyle} top={selected ? 120 : 60} />

        <View style={styles.legend}>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 2 }}>
            {(['all', 'soulwinning', 'flyers'] as Layer[]).map((l) => (
              <Pressable
                key={l}
                onPress={() => setLayer(l)}
                accessibilityRole="button"
                accessibilityState={{ selected: layer === l }}
                style={[styles.layerBtn, layer === l && styles.layerOn]}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: layer === l ? '#FFF' : colors.text }}>
                  {l === 'all' ? 'Todo' : KIND_LABEL[l]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => setStaleMonths(STALE_STEPS[(STALE_STEPS.indexOf(staleMonths) + 1) % STALE_STEPS.length])}
            accessibilityRole="button"
            style={[styles.layerBtn, staleMonths ? { backgroundColor: '#D64545' } : null, { alignSelf: 'flex-start' }]}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: staleMonths ? '#FFF' : colors.text }}>
              {staleMonths ? `Sin visitar hace ${staleMonths} meses` : 'Ver sin visitar'}
            </Text>
          </Pressable>
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
        </View>
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
            <Button title={outing.active ? 'Continuar la salida' : 'Iniciar salida'} icon={outing.active ? 'arrow-right' : 'play'} onPress={start} loading={busy} />
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Tu ubicación se comparte con el equipo solo mientras la salida está activa</Text>
          </>
        )}
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
  hint: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  legend: { position: 'absolute', left: 12, bottom: 12, backgroundColor: colors.bg, borderRadius: 12, padding: 10, gap: 6, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
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
