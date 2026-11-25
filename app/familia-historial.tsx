// Historial de ubicación (como Life360): por dónde anduvo una persona cada día de los últimos 30 días.
// El día se arma en paradas ("En Av. Uruguay desde las 9:03") y viajes (km, tiempo, velocidad máxima).
// Solo lo ve la persona y quienes ella eligió (lo controla la base).
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { MapView, Marker, Polyline } from '@/components/map';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading } from '@/components/ui';
import { daySegments, durText, kmText, regionFor, trackMeters, type Segment } from '@/lib/famLoc';
import { locHistory, type HistPoint } from '@/lib/famLocApi';
import { fmtTime } from '@/lib/format';
import { colors, themed } from '@/theme';
import { tx } from '@/lib/i18n';

const START = { latitude: -27.3671, longitude: -55.8961, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function dayStart(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
}
function dayLabel(offset: number): string {
  if (offset === 0) return tx('Hoy');
  if (offset === 1) return tx('Ayer');
  const d = dayStart(offset);
  return `${tx(DAYS[d.getDay()])} ${d.getDate()}`;
}
const hhmm = (t: number) => fmtTime(new Date(t).toISOString());

// Nombre de la calle de un punto (solo en el teléfono). Se guarda para no preguntar dos veces.
const streets = new Map<string, string | null>();
async function streetOf(lat: number, lng: number): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (streets.has(key)) return streets.get(key) ?? null;
  try {
    const r = (await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }))[0];
    const name = r ? [r.street ?? r.name, r.streetNumber].filter(Boolean).join(' ') || r.district || r.city || null : null;
    streets.set(key, name);
    return name;
  } catch {
    streets.set(key, null);
    return null;
  }
}

export default function FamiliaHistorial() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [offset, setOffset] = useState(0);
  const [pts, setPts] = useState<HistPoint[] | null>(null);
  const [pick, setPick] = useState<number | null>(null); // el viaje o la parada elegida
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setPts(null);
    setPick(null);
    const from = dayStart(offset);
    const to = offset === 0 ? new Date() : dayStart(offset - 1);
    locHistory(id, from, to).then((p) => { if (alive) setPts(p); }).catch(() => { if (alive) setPts([]); });
    return () => { alive = false; };
  }, [id, offset]);

  const track = useMemo(() => (pts ?? []).map((p) => ({ t: p.t, lat: p.latitude, lng: p.longitude, speed: p.speed })), [pts]);
  const segs = useMemo<Segment[]>(() => daySegments(track), [track]);
  const total = useMemo(() => trackMeters(track), [track]);

  // Las calles de las paradas y de donde empieza/termina cada viaje.
  useEffect(() => {
    let alive = true;
    const wanted: { k: string; lat: number; lng: number }[] = [];
    segs.forEach((s, i) => {
      if (s.kind === 'parada') wanted.push({ k: `p${i}`, lat: s.lat, lng: s.lng });
      else {
        const a = s.points[0], b = s.points[s.points.length - 1];
        wanted.push({ k: `a${i}`, lat: a.lat, lng: a.lng }, { k: `b${i}`, lat: b.lat, lng: b.lng });
      }
    });
    (async () => {
      for (const w of wanted.slice(0, 24)) {
        const n = await streetOf(w.lat, w.lng);
        if (!alive) return;
        if (n) setNames((x) => ({ ...x, [w.k]: n }));
      }
    })();
    return () => { alive = false; };
  }, [segs]);

  const chosen = pick != null ? segs[pick] : null;
  const shown = chosen?.kind === 'viaje' ? chosen.points : track;
  const line = shown.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const region = useMemo(() => {
    if (chosen?.kind === 'parada') return { latitude: chosen.lat, longitude: chosen.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 };
    return regionFor(shown.map((p) => ({ lat: p.lat, lng: p.lng }))) ?? START;
  }, [chosen, shown]);

  const who = name ?? tx('Historial');
  const lastSeen = track.length ? track[track.length - 1] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={who} subtitle={tx('Por dónde anduvo · últimos 30 días')} back />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.days}>
        {Array.from({ length: 30 }, (_, i) => (
          <Pressable key={i} onPress={() => setOffset(i)} accessibilityRole="button" accessibilityState={{ selected: i === offset }}
            style={[styles.day, i === offset && styles.dayOn]}>
            <Text style={[styles.dayText, i === offset && { color: '#FFF' }]}>{dayLabel(i)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Screen>
        <View style={styles.mapBox}>
          <MapView style={{ flex: 1 }} region={region}>
            {line.length > 1 ? <Polyline coordinates={line} strokeColor={colors.violet} strokeWidth={5} lineCap="round" lineJoin="round" /> : null}
            {segs.map((s, i) => (s.kind === 'parada' ? (
              <Marker key={`m${i}`} coordinate={{ latitude: s.lat, longitude: s.lng }} anchor={{ x: 0.5, y: 0.5 }} onPress={() => setPick(i)} zIndex={pick === i ? 30 : 10}>
                <View style={[styles.stopDot, pick === i && { backgroundColor: colors.violet }]} />
              </Marker>
            ) : null))}
            {chosen?.kind === 'viaje' ? (
              <Marker coordinate={{ latitude: chosen.points[chosen.points.length - 1].lat, longitude: chosen.points[chosen.points.length - 1].lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={40}>
                <View style={styles.flag}><Feather name="flag" size={14} color="#FFF" /></View>
              </Marker>
            ) : null}
          </MapView>
        </View>

        {pts === null ? <Loading /> : !track.length ? (
          <Empty icon="map" title={tx('No hay recorrido este día')} text={tx('Puede ser que no haya compartido su ubicación, que haya estado en pausa o que el teléfono estuviera apagado.')} />
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <Text style={styles.title}>{offset === 0 ? tx('Hoy') : dayLabel(offset)}</Text>
              <Text style={styles.small}>
                {tx('{km} en total · {n} paradas', { km: kmText(total), n: segs.filter((s) => s.kind === 'parada').length })}
                {lastSeen ? tx(' · último punto a las {h}', { h: hhmm(lastSeen.t) }) : ''}
              </Text>
              {pick != null ? (
                <Pressable onPress={() => setPick(null)} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.violet, marginTop: 4 }}>{tx('Ver todo el día')}</Text>
                </Pressable>
              ) : null}
            </Card>

            <Card style={{ gap: 0 }}>
              {segs.length ? segs.map((s, i) => (
                <Pressable key={i} onPress={() => setPick(i === pick ? null : i)} accessibilityRole="button"
                  style={[styles.row, i === pick && { backgroundColor: colors.violetSoft }]}>
                  <View style={[styles.icon, { backgroundColor: s.kind === 'parada' ? colors.violetSoft : colors.violet }]}>
                    <Feather name={s.kind === 'parada' ? 'map-pin' : 'navigation'} size={16} color={s.kind === 'parada' ? colors.violet : '#FFF'} />
                  </View>
                  {s.kind === 'parada' ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{names[`p${i}`] ? tx('En {calle}', { calle: names[`p${i}`] }) : tx('Se quedó en un lugar')}</Text>
                      <Text style={styles.small}>{tx('{a} a {b} · {d}', { a: hhmm(s.from), b: i === segs.length - 1 && offset === 0 ? tx('ahora') : hhmm(s.to), d: durText(s.to - s.from) })}</Text>
                    </View>
                  ) : (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{tx('Viaje · {km} · {d}', { km: kmText(s.meters), d: durText(s.to - s.from) })}</Text>
                      <Text style={styles.small} numberOfLines={2}>
                        {[names[`a${i}`] ? `${hhmm(s.from)} ${names[`a${i}`]}` : hhmm(s.from), names[`b${i}`] ? `${hhmm(s.to)} ${names[`b${i}`]}` : hhmm(s.to)].join('  →  ')}
                      </Text>
                      {s.topKmh > 0 ? <Text style={styles.small}>{tx('Velocidad máxima: {v} km/h', { v: s.topKmh })}</Text> : null}
                    </View>
                  )}
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </Pressable>
              )) : <Text style={styles.small}>{tx('Se quedó cerca del mismo lugar todo el día.')}</Text>}
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  days: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  day: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, justifyContent: 'center' },
  dayOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  dayText: { fontSize: 13, fontWeight: '800', color: colors.text },
  mapBox: { height: 360, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  small: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.text },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stopDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#7DD3FC', borderWidth: 3, borderColor: '#FFFFFF' },
  flag: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
}));
