// El mapa con las veredas cubiertas (una línea por vereda, coloreada por fecha),
// las casas marcadas y los hermanos en vivo.
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, MapView, Marker, Polygon, Polyline, type MapViewProps, type Region } from './map';
import { offsetSegment, segmentOf, type LatLng } from '../lib/geo';
import { colors, coverageColor, themed } from '../theme';
import type { Contact, CoverageRow, HouseRow, RoadRow, Zone } from '../types';

export type LiveMember = { user_id: string; display_name: string; lat: number; lng: number; me?: boolean };

export type CoverageMapProps = MapViewProps & {
  roads: RoadRow[];
  coverage: CoverageRow[];
  contacts?: Contact[];
  live?: LiveMember[];
  trails?: { id: string; points: LatLng[]; color?: string; name?: string }[];
  /** Casas (edificios del mapa satelital). Las que ya tienen la vereda cubierta se ven verdes. */
  houses?: HouseRow[];
  /** Zonas asignadas. */
  zones?: Zone[];
  onPressZone?: (z: Zone) => void;
  /** "Sin visitar en X meses": pinta en rojo las veredas de las calles cargadas que no se cubrieron desde esa fecha. */
  staleSince?: Date | null;
  /** Veredas con casas: "sin visitar" solo pinta estas. */
  houseSides?: Set<string> | null;
  selected?: { road_id: number; seg: number; side: 1 | -1; kind?: string } | null;
  onPressSegment?: (row: CoverageRow) => void;
  onPressContact?: (c: Contact) => void;
  onPressLive?: (m: LiveMember) => void;
};

const SIDE_OFFSET_M = 3.2;
const FLYERS_OFFSET_M = 6;  // los volantes se dibujan un poco más afuera, así se ven las dos líneas

export function CoverageMap({
  roads, coverage, contacts = [], live = [], trails = [], houses = [], zones = [], staleSince = null, houseSides = null, onPressZone,
  selected, onPressSegment, onPressContact, onPressLive, children, ...mapProps
}: CoverageMapProps) {
  const roadById = useMemo(() => new Map(roads.map((r) => [r.id, r])), [roads]);
  const coveredKeys = useMemo(() => new Set(coverage.filter((c) => c.kind !== 'flyers').map((c) => `${c.road_id}:${c.seg}:${c.side}`)), [coverage]);

  // Veredas sin visitar desde staleSince (solo calles residenciales y similares, para no llenar el mapa).
  const stale = useMemo(() => {
    if (!staleSince) return [];
    const recent = new Set(coverage.filter((c) => c.kind !== 'flyers' && new Date(c.last_covered_at) >= staleSince).map((c) => `${c.road_id}:${c.seg}:${c.side}`));
    const out: { key: string; coords: { latitude: number; longitude: number }[] }[] = [];
    for (const r of roads) {
      if (r.highway && ['primary', 'trunk', 'primary_link', 'trunk_link'].includes(r.highway)) continue;
      for (let i = 0; i < r.coords.length - 1 && out.length < 4000; i++) {
        for (const side of [1, -1] as const) {
          if (recent.has(`${r.id}:${i}:${side}`)) continue;
          if (houseSides && !houseSides.has(`${r.id}:${i}:${side}`)) continue; // sin casas: plaza, parque, medio de avenida
          const seg = segmentOf(r, i);
          if (!seg) continue;
          const [a, b] = offsetSegment(seg[0], seg[1], side, SIDE_OFFSET_M);
          out.push({ key: `st-${r.id}:${i}:${side}`, coords: [{ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng }] });
        }
      }
    }
    return out;
  }, [staleSince, roads, coverage, houseSides]);

  const lines = useMemo(() => {
    const out: { key: string; coords: { latitude: number; longitude: number }[]; color: string; row: CoverageRow; isSelected: boolean }[] = [];
    for (const row of coverage) {
      const road = roadById.get(row.road_id);
      if (!road) continue;
      const seg = segmentOf(road, row.seg);
      if (!seg) continue;
      const [a, b] = offsetSegment(seg[0], seg[1], row.side, row.kind === 'flyers' ? FLYERS_OFFSET_M : SIDE_OFFSET_M);
      const isSelected = !!selected && selected.road_id === row.road_id && selected.seg === row.seg && selected.side === row.side && (selected.kind ?? row.kind) === row.kind;
      out.push({
        key: `${row.road_id}:${row.seg}:${row.side}:${row.kind}`,
        coords: [
          { latitude: a.lat, longitude: a.lng },
          { latitude: b.lat, longitude: b.lng },
        ],
        color: coverageColor(row.last_covered_at, row.kind),
        row,
        isSelected,
      });
    }
    return out;
  }, [coverage, roadById, selected]);

  return (
    <MapView style={StyleSheet.absoluteFill} showsUserLocation={false} toolbarEnabled={false} {...mapProps}>
      {lines.map((l) => (
        <Polyline
          key={l.key}
          coordinates={l.coords}
          strokeColor={l.color}
          strokeWidth={l.isSelected ? 9 : 5}
          lineCap="round"
          tappable={false}
        />
      ))}
      {zones.map((z) => (
        <Polygon
          key={`zone-${z.id}`}
          coordinates={z.polygon.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
          strokeColor={z.color}
          fillColor={`${z.color}22`}
          strokeWidth={3}
          tappable={!!onPressZone}
          onPress={() => onPressZone?.(z)}
        />
      ))}
      {stale.map((l) => (
        <Polyline key={l.key} coordinates={l.coords} strokeColor="#D64545" strokeWidth={3} lineCap="round" />
      ))}
      {houses.map((h) => (
        <Circle
          key={`h-${h.id}`}
          center={{ latitude: h.lat, longitude: h.lng }}
          radius={3}
          strokeColor="#FFFFFF"
          strokeWidth={1}
          fillColor={coveredKeys.has(`${h.road_id}:${h.seg}:${h.side}`) ? colors.green : '#8A9490'}
        />
      ))}
      {trails.map((t) => (
        <Polyline
          key={`trail-${t.id}`}
          coordinates={t.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={t.color ?? colors.green}
          strokeWidth={6}
          lineCap="round"
          lineJoin="round"
        />
      ))}
      {contacts.filter((c) => c.lat != null && c.lng != null).map((c) => (
        <Marker
          key={c.id}
          coordinate={{ latitude: c.lat as number, longitude: c.lng as number }}
          pinColor={c.interest === 'none' ? colors.red : c.interest === 'very' ? colors.green : colors.blue}
          title={c.name}
          description={c.promise_day ? `Prometió venir el ${c.promise_day === 'sat' ? 'sábado' : 'domingo'}` : undefined}
          onCalloutPress={() => onPressContact?.(c)}
        />
      ))}
      {live.map((m) => (
        <Marker key={`live-${m.user_id}`} coordinate={{ latitude: m.lat, longitude: m.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}
          onPress={onPressLive && !m.me ? () => onPressLive(m) : undefined}>
          <View style={{ alignItems: 'center' }}>
            <View style={[styles.liveDot, m.me && styles.liveMe]}>
              <Text style={styles.liveInitial}>{m.display_name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.liveLabel}>
              <Text style={styles.liveLabelText}>{m.me ? 'Vos' : m.display_name}</Text>
            </View>
          </View>
        </Marker>
      ))}
      {children}
    </MapView>
  );
}

export function regionAround(center: LatLng, meters = 600): Region {
  const latDelta = (meters * 2) / 111320;
  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: latDelta,
    longitudeDelta: latDelta / Math.cos((center.lat * Math.PI) / 180),
  };
}

export function bboxOfRegion(r: Region) {
  return {
    minLat: r.latitude - r.latitudeDelta / 2,
    maxLat: r.latitude + r.latitudeDelta / 2,
    minLng: r.longitude - r.longitudeDelta / 2,
    maxLng: r.longitude + r.longitudeDelta / 2,
  };
}

const styles = themed(() => StyleSheet.create({
  liveDot: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.green, borderWidth: 3, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  liveMe: { backgroundColor: colors.greenDark, width: 34, height: 34, borderRadius: 17 },
  liveInitial: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  liveLabel: { marginTop: 2, backgroundColor: '#FFFFFF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, elevation: 2 },
  liveLabelText: { fontSize: 11, fontWeight: '700', color: colors.text },
}));
