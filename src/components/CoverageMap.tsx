// El mapa con las veredas cubiertas (una línea por vereda, coloreada por fecha),
// las casas marcadas y los hermanos en vivo.
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapView, Marker, Polyline, type MapViewProps, type Region } from './map';
import { offsetSegment, segmentOf, type LatLng } from '../lib/geo';
import { colors, coverageColor, themed } from '../theme';
import type { Contact, CoverageRow, RoadRow } from '../types';

export type LiveMember = { user_id: string; display_name: string; lat: number; lng: number; me?: boolean };

export type CoverageMapProps = MapViewProps & {
  roads: RoadRow[];
  coverage: CoverageRow[];
  contacts?: Contact[];
  live?: LiveMember[];
  trails?: { id: string; points: LatLng[] }[];
  selected?: { road_id: number; seg: number; side: 1 | -1; kind?: string } | null;
  onPressSegment?: (row: CoverageRow) => void;
  onPressContact?: (c: Contact) => void;
};

const SIDE_OFFSET_M = 3.2;
const FLYERS_OFFSET_M = 6;  // los volantes se dibujan un poco más afuera, así se ven las dos líneas

export function CoverageMap({
  roads, coverage, contacts = [], live = [], trails = [], selected, onPressSegment, onPressContact, children, ...mapProps
}: CoverageMapProps) {
  const roadById = useMemo(() => new Map(roads.map((r) => [r.id, r])), [roads]);

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
          tappable={!!onPressSegment}
          onPress={() => onPressSegment?.(l.row)}
        />
      ))}
      {trails.map((t) => (
        <Polyline
          key={`trail-${t.id}`}
          coordinates={t.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={colors.green}
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
        <Marker key={`live-${m.user_id}`} coordinate={{ latitude: m.lat, longitude: m.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
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
