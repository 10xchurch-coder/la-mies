// "Me olvidé de apagar la salida": elegir hasta dónde se caminó de verdad y borrar el resto.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MapView, Marker, Polyline } from '@/components/map';
import { Header } from '@/components/Screen';
import { Button, Loading } from '@/components/ui';
import { regionAround } from '@/components/CoverageMap';
import { sessionPoints, trimSession } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { walkedDistance, type TrackPoint } from '@/lib/track';
import { useOuting } from '@/store/outing';
import { colors } from '@/theme';

export default function Recortar() {
  const router = useRouter();
  const { session } = useLocalSearchParams<{ session: string }>();
  const outing = useOuting();
  const isActive = !!outing.active && outing.active.id === session;
  const [points, setPoints] = useState<TrackPoint[] | null>(isActive ? outing.points : null);
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isActive) {
      setPoints(outing.points);
      return;
    }
    if (!session) return;
    sessionPoints(session)
      .then((rows) => setPoints(rows.map((r) => ({ t: new Date(r.recorded_at).getTime(), lat: r.lat, lng: r.lng, acc: r.accuracy_m, spd: r.speed_mps }))))
      .catch(() => setPoints([]));
  }, [session, isActive, outing.points]);

  const options = useMemo(() => {
    if (!points?.length) return [];
    const first = points[0].t;
    const last = points[points.length - 1].t;
    const out: number[] = [];
    const step = last - first > 2 * 3600 * 1000 ? 10 * 60 * 1000 : 5 * 60 * 1000;
    for (let t = first + step; t < last; t += step) out.push(t);
    return out.reverse();
  }, [points]);

  const kept = useMemo(() => (points ?? []).filter((p) => cutoff === null || p.t <= cutoff), [points, cutoff]);
  const removed = useMemo(() => (points ?? []).filter((p) => cutoff !== null && p.t > cutoff), [points, cutoff]);

  const confirm = () => {
    if (cutoff === null || !session) return;
    Alert.alert(
      '¿Borrar el final de la salida?',
      `Todo lo que pasó después de las ${fmtTime(cutoff)} se borra del mapa y la salida queda terminada a esa hora. Las casas marcadas no se tocan.`,
      [
        { text: 'No, dejar como está', style: 'cancel' },
        {
          text: 'Sí, borrar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              if (isActive) await outing.trim(cutoff);
              else await trimSession(session, new Date(cutoff));
              Alert.alert('Listo', `La salida quedó terminada a las ${fmtTime(cutoff)}.`);
              router.replace(isActive ? '/(tabs)/mapa' : '/salidas');
            } catch (e) {
              Alert.alert('No se pudo', e instanceof Error ? e.message : 'Probá de nuevo');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (points === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Recortar la salida" back />
        <Loading />
      </View>
    );
  }

  const center = kept[kept.length - 1] ?? points[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Recortar la salida" back subtitle="¿Hasta qué hora caminaste de verdad?" />
      <View style={{ height: 260 }}>
        {points.length ? (
          <MapView style={StyleSheet.absoluteFill} initialRegion={regionAround(center, 500)} toolbarEnabled={false}>
            <Polyline coordinates={kept.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.green} strokeWidth={6} />
            {removed.length ? (
              <Polyline coordinates={[kept[kept.length - 1], ...removed].filter(Boolean).map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.red} strokeWidth={5} lineDashPattern={[8, 8]} />
            ) : null}
            {kept.length ? <Marker coordinate={{ latitude: kept[kept.length - 1].lat, longitude: kept[kept.length - 1].lng }} pinColor={colors.green} title={`Hasta las ${fmtTime(kept[kept.length - 1].t)}`} /> : null}
          </MapView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mapBg }}>
            <Text style={{ color: colors.muted }}>Esta salida no tiene recorrido guardado</Text>
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
          Elegí la hora en la que dejaste de caminar. Lo verde queda; lo rojo punteado se borra.
          {cutoff !== null ? ` Se guardan ${Math.round(walkedDistance(kept))} m y se descartan ${removed.length} puntos.` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((t) => {
            const on = cutoff === t;
            return (
              <Pressable key={t} onPress={() => setCutoff(t)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: colors.greenText, fontWeight: '700' }]}>{fmtTime(t)}</Text>
              </Pressable>
            );
          })}
        </View>
        {!options.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>La salida es muy corta para recortarla.</Text> : null}
        <Button title="Borrar todo lo de después" variant="danger" icon="scissors" onPress={confirm} disabled={cutoff === null} loading={busy} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
