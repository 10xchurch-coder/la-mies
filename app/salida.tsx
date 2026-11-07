// Salida en curso: reloj, mapa en vivo, vereda detectada, marcar casa, terminar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Region } from '@/components/map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoverageMap, bboxOfRegion, regionAround, type LiveMember } from '@/components/CoverageMap';
import { Button } from '@/components/ui';
import { MapTypeButton, mapStyleProps, useMapStyle } from '@/components/MapTypeButton';
import { coverageInBbox, teamLive } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { fmtDistance, fmtDuration, fmtTime } from '@/lib/format';
import type { LatLng } from '@/lib/geo';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors, themed } from '@/theme';
import type { CoverageRow } from '@/types';

export default function Salida() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const outing = useOuting();
  const [now, setNow] = useState(Date.now());
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [live, setLive] = useState<LiveMember[]>([]);
  const [trails, setTrails] = useState<{ id: string; points: LatLng[]; color?: string }[]>([]);
  const [region, setRegion] = useState<Region | null>(null);
  const [follow, setFollow] = useState(true);
  const [ending, setEnding] = useState(false);
  const lastRoadsCheck = useRef(0);
  const [mapStyle, setMapStyle] = useMapStyle();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Si la salida terminó (o se cortó sola), volver al mapa.
  useEffect(() => {
    if (outing.ready && !outing.active && !ending) router.replace('/(tabs)/mapa');
  }, [outing.ready, outing.active, ending, router]);

  const last = outing.points[outing.points.length - 1];

  // Seguir al usuario y, cada tanto, asegurarnos de tener las calles de la zona.
  useEffect(() => {
    if (!last) return;
    if (follow) setRegion(regionAround(last, 350));
    if (Date.now() - lastRoadsCheck.current > 60000) {
      lastRoadsCheck.current = Date.now();
      outing.refreshRoads(last);
      coverageInBbox(bboxOfRegion(regionAround(last, 1200))).then(setCoverage).catch(() => undefined);
    }
  }, [last?.t, follow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compañeros en vivo y sus recorridos de hoy.
  const loadTeam = useCallback(async () => {
    try {
      const rows = await teamLive();
      const others = rows.filter((r) => r.user_id !== session?.user.id);
      setLive(others.filter((r) => r.lat != null && r.lng != null).map((r) => ({ user_id: r.user_id, display_name: r.display_name, lat: r.lat as number, lng: r.lng as number })));
      const ids = others.map((r) => r.session_id);
      if (ids.length) {
        const { data } = await supabase.from('track_points').select('session_id, lat, lng, recorded_at').in('session_id', ids).order('recorded_at').limit(4000);
        const bySession = new Map<string, LatLng[]>();
        for (const p of (data ?? []) as { session_id: string; lat: number; lng: number }[]) {
          if (!bySession.has(p.session_id)) bySession.set(p.session_id, []);
          bySession.get(p.session_id)!.push({ lat: p.lat, lng: p.lng });
        }
        setTrails([...bySession.entries()].map(([id, points], i) => ({ id, points, color: ['#2563EB', '#D97706', '#7C3AED', '#DB2777', '#0D9488', '#DC2626'][i % 6] })));
      } else {
        setTrails([]);
      }
    } catch {
      // sin señal
    }
  }, [session?.user.id]);

  useEffect(() => {
    loadTeam();
    const id = setInterval(loadTeam, 20000);
    return () => clearInterval(id);
  }, [loadTeam]);

  const myTrail = useMemo(() => [{ id: 'me', points: outing.points.map((p) => ({ lat: p.lat, lng: p.lng })) }], [outing.points]);
  const me: LiveMember[] = last && session ? [{ user_id: session.user.id, display_name: 'Vos', lat: last.lat, lng: last.lng, me: true }] : [];

  const markHouse = () => {
    if (!last) {
      Alert.alert('Esperando el GPS', 'Todavía no tenemos tu ubicación. Esperá unos segundos.');
      return;
    }
    router.push({
      pathname: '/contacto/nuevo',
      params: {
        lat: String(last.lat),
        lng: String(last.lng),
        road: outing.side.match ? String(outing.side.match.roadId) : '',
        roadName: outing.side.match?.roadName ?? '',
        side: outing.side.match ? String(outing.side.overridden ? -outing.side.match.side : outing.side.match.side) : '',
        sideName: outing.side.name ?? '',
      },
    });
  };

  const finish = () => {
    Alert.alert('Finalizar la salida', '¿Terminamos acá? Lo que caminaste queda marcado en el mapa para toda la iglesia.', [
      { text: 'Seguir', style: 'cancel' },
      {
        text: 'Finalizar',
        style: 'destructive',
        onPress: async () => {
          setEnding(true);
          try {
            const id = outing.active?.id;
            await outing.stop();
            if (id) router.replace({ pathname: '/resumen', params: { session: id } });
            else router.replace('/(tabs)/mapa');
          } catch (e) {
            setEnding(false);
            Alert.alert('No se pudo cerrar', `${e instanceof Error ? e.message : 'Error'}. Probá de nuevo cuando tengas señal; nada se pierde.`);
          }
        },
      },
    ]);
  };

  const elapsed = outing.active ? now - outing.active.startedAt : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }, outing.active?.kind === 'flyers' && { backgroundColor: colors.orange }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{outing.active?.kind === 'flyers' ? 'Volantes en curso' : 'Evangelismo en curso'}</Text>
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', opacity: 0.9 }}>Empezó {outing.active ? fmtTime(outing.active.startedAt) : ''}</Text>
        </View>
        <Text style={styles.timer}>{fmtDuration(elapsed)}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <HeaderStat value={outing.contacts} label="Contactos" />
          <HeaderStat value={outing.presentations} label="Evangelio" />
          <HeaderStat value={outing.promises} label={outing.promises === 1 ? 'Promesa' : 'Promesas'} />
          <HeaderStat value={fmtDistance(outing.distanceM)} label="Caminados" />
        </View>
        {!outing.backgroundGranted ? (
          <Text style={styles.warn}>Sin el permiso "Siempre" de ubicación, el recorrido solo se marca con la app abierta.</Text>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <CoverageMap
          roads={outing.roads}
          coverage={coverage}
          live={[...me, ...live]}
          trails={[...myTrail, ...trails]}
          region={region ?? undefined}
          {...mapStyleProps(mapStyle)}
          onPanDrag={() => setFollow(false)}
        />
        <MapTypeButton style={mapStyle} onChange={setMapStyle} top={12} />
        {!follow ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Centrar en mi ubicación" onPress={() => setFollow(true)} style={styles.locate}>
            <Feather name="crosshair" size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={outing.flipSide} disabled={!outing.side.match} style={styles.sidePill}>
          <View style={styles.sideIcon}>
            <Feather name="repeat" size={16} color={colors.greenText} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>
              {outing.side.name ? `Vereda ${outing.side.name}` : last ? 'Buscando la calle…' : 'Esperando el GPS…'}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted }}>
              {outing.side.overridden ? 'Corregida por vos · tocá para volver' : outing.side.match ? `${outing.side.match.roadName ?? 'Calle'} · tocá si es la otra vereda` : 'Las calles tardan unos segundos'}
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button title="Marcar esta casa" icon="map-pin" onPress={markHouse} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Arreglar el recorrido" variant="ghost" small onPress={() => router.push({ pathname: '/recortar', params: { session: outing.active?.id ?? '' } })} style={{ flex: 1 }} />
          <Button title="Finalizar salida" variant="danger" icon="square" small onPress={finish} loading={ending} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

function HeaderStat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600', opacity: 0.9 }}>{label}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  header: { backgroundColor: colors.green, paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  liveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  timer: { color: '#FFFFFF', fontSize: 40, fontWeight: '800', letterSpacing: -1, lineHeight: 44 },
  stat: { flex: 1, gap: 2, padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.14)' },
  warn: { color: '#FFFFFF', fontSize: 11, opacity: 0.95, backgroundColor: 'rgba(0,0,0,0.18)', padding: 8, borderRadius: 8 },
  locate: { position: 'absolute', right: 12, bottom: 12, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  sidePill: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingLeft: 10, paddingRight: 14, borderRadius: 999, backgroundColor: colors.bg, elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  sideIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  actions: { padding: 12, paddingHorizontal: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
}));
