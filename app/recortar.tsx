// Arreglar una salida (la propia o, si sos secretaría/pastor, la de cualquiera):
//  - Cortar el final: tocás el punto donde terminaste de verdad y se borra todo lo de después.
//  - Quitar un tramo: tocás dónde empieza y dónde termina (un viaje en auto, una parada) y se borra.
//  - Terminar ahora una salida que alguien se olvidó abierta, o borrarla entera.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { MapView, Marker, Polyline } from '@/components/map';
import { Header } from '@/components/Screen';
import { Button, Loading, Segmented } from '@/components/ui';
import { regionAround } from '@/components/CoverageMap';
import { cutOutingRange, deleteOuting, finishOuting, listOutings, outingPoints, recomputeCoverage, roadsInBbox } from '@/lib/api';
import { fmtDayYear, fmtTime } from '@/lib/format';
import { matchPoint, type Road } from '@/lib/geo';
import { walkedDistance, type TrackPoint } from '@/lib/track';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors, themed } from '@/theme';
import type { OutingRow } from '@/types';

type Mode = 'end' | 'range';

export default function Recortar() {
  const router = useRouter();
  const { session } = useLocalSearchParams<{ session: string }>();
  const { session: auth } = useAuth();
  const outing = useOuting();
  const isActiveHere = !!outing.active && outing.active.id === session;
  const [info, setInfo] = useState<OutingRow | null>(null);
  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [roads, setRoads] = useState<Road[]>([]);
  const [mode, setMode] = useState<Mode>('end');
  const [a, setA] = useState<number | null>(null); // índice elegido (final o inicio del tramo)
  const [b, setB] = useState<number | null>(null); // fin del tramo
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!session) return;
    try {
      const [rows, list] = await Promise.all([outingPoints(session), listOutings(120)]);
      const pts = rows.map((r) => ({ t: new Date(r.recorded_at).getTime(), lat: r.lat, lng: r.lng, acc: r.accuracy_m, spd: r.speed_mps }));
      setPoints(isActiveHere ? outing.points : pts);
      setInfo(list.find((o) => o.id === session) ?? null);
      const src = isActiveHere ? outing.points : pts;
      if (src.length) {
        const lats = src.map((p) => p.lat);
        const lngs = src.map((p) => p.lng);
        roadsInBbox({ minLat: Math.min(...lats) - 0.001, maxLat: Math.max(...lats) + 0.001, minLng: Math.min(...lngs) - 0.001, maxLng: Math.max(...lngs) + 0.001 })
          .then((rs) => setRoads(rs as unknown as Road[]))
          .catch(() => undefined);
      }
    } catch {
      setPoints([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const pts = points ?? [];
  const mine = info ? info.user_id === auth?.user.id : true;
  const isOpen = info ? !info.ended_at : isActiveHere;

  // Puntos elegibles (uno por minuto aprox.) con la hora y la calle.
  const options = useMemo(() => {
    const out: { i: number; t: number; street: string | null }[] = [];
    let lastT = 0;
    pts.forEach((p, i) => {
      if (i === 0 || p.t - lastT >= 60000 || i === pts.length - 1) {
        out.push({ i, t: p.t, street: roads.length ? matchPoint(p, roads, 30)?.roadName ?? null : null });
        lastT = p.t;
      }
    });
    return out;
  }, [pts, roads]);

  const removedIdx = useMemo(() => {
    if (mode === 'end') return a == null ? null : [a + 1, pts.length - 1] as const;
    if (a == null || b == null) return null;
    return [Math.min(a, b), Math.max(a, b)] as const;
  }, [mode, a, b, pts.length]);

  const kept = useMemo(() => (removedIdx ? pts.filter((_, i) => i < removedIdx[0] || i > removedIdx[1]) : pts), [pts, removedIdx]);

  const pick = (i: number) => {
    if (mode === 'end') {
      setA(i);
      return;
    }
    if (a == null || b != null) {
      setA(i);
      setB(null);
    } else {
      setB(i);
    }
  };

  const nearestIndex = (lat: number, lng: number) => {
    let best = -1;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = (p.lat - lat) ** 2 + ((p.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      Alert.alert('Listo', done);
      router.back();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnd = () => {
    if (a == null || !session) return;
    const t = pts[a].t;
    Alert.alert('¿Cortar acá?', `Todo lo que pasó después de las ${fmtTime(t)} se borra del mapa y la salida queda terminada a esa hora. Las casas marcadas no se tocan.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, cortar',
        style: 'destructive',
        onPress: () => run(async () => {
          if (isActiveHere) await outing.trim(t);
          else await finishOuting(session, new Date(t));
        }, `La salida quedó terminada a las ${fmtTime(t)}.`),
      },
    ]);
  };

  const confirmRange = () => {
    if (!removedIdx || !session) return;
    const from = pts[removedIdx[0]].t;
    const to = pts[removedIdx[1]].t;
    Alert.alert('¿Quitar este tramo?', `Se borra lo recorrido entre las ${fmtTime(from)} y las ${fmtTime(to)}. Lo de antes y lo de después queda.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, quitar', style: 'destructive', onPress: () => run(() => cutOutingRange(session, new Date(from), new Date(to)), 'Se quitó el tramo.') },
    ]);
  };

  const confirmFinishNow = () => {
    if (!session) return;
    Alert.alert('Terminar la salida', `Se termina en el último punto que mandó el teléfono${info?.last_point ? ` (${fmtTime(info.last_point)})` : ''}.${mine ? '' : ` Le llega un aviso a ${info?.display_name ?? 'la persona'}.`}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: () => run(() => (isActiveHere ? outing.stop().then(() => undefined) : finishOuting(session, null)), 'La salida quedó terminada.') },
    ]);
  };

  const confirmDelete = () => {
    if (!session) return;
    Alert.alert('Borrar la salida entera', 'Se borra el recorrido y las veredas que marcó. Las casas y contactos que se cargaron quedan. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => run(() => deleteOuting(session), 'La salida se borró.') },
    ]);
  };

  if (points === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Arreglar la salida" back />
        <Loading />
      </View>
    );
  }

  const center = pts[a ?? pts.length - 1] ?? pts[0];
  const chosenLabel = (i: number | null) => (i == null ? '—' : `${fmtTime(pts[i].t)}${options.find((o) => o.i === i)?.street ? ` · ${options.find((o) => o.i === i)?.street}` : ''}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Arreglar la salida"
        back
        subtitle={info ? `${mine ? 'Tu salida' : info.display_name} · ${fmtDayYear(info.started_at)} ${fmtTime(info.started_at)}${info.ended_at ? ` a ${fmtTime(info.ended_at)}` : ' · en curso'}` : undefined}
      />
      <View style={{ height: 280 }}>
        {pts.length && center ? (
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={regionAround(center, 450)}
            toolbarEnabled={false}
            onPress={(e) => {
              const c = e.nativeEvent.coordinate;
              const i = nearestIndex(c.latitude, c.longitude);
              if (i >= 0) pick(i);
            }}
          >
            <Polyline coordinates={pts.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor="#D64545" strokeWidth={4} />
            {removedIdx ? null : null}
            <Polyline coordinates={kept.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.green} strokeWidth={6} />
            {a != null ? <Marker coordinate={{ latitude: pts[a].lat, longitude: pts[a].lng }} pinColor={colors.green} title={fmtTime(pts[a].t)} /> : null}
            {b != null ? <Marker coordinate={{ latitude: pts[b].lat, longitude: pts[b].lng }} pinColor={colors.amber} title={fmtTime(pts[b].t)} /> : null}
          </MapView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mapBg }}>
            <Text style={{ color: colors.muted }}>Esta salida no tiene recorrido guardado</Text>
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {pts.length ? (
          <>
            <Segmented
              options={[{ value: 'end', label: 'Cortar el final' }, { value: 'range', label: 'Quitar un tramo' }]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setA(null);
                setB(null);
              }}
            />
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
              {mode === 'end'
                ? 'Tocá en el mapa (o en la lista) el punto donde terminaste de verdad. Lo verde queda; lo rojo se borra.'
                : a == null
                  ? 'Tocá dónde EMPIEZA lo que hay que quitar.'
                  : b == null
                    ? 'Ahora tocá dónde TERMINA lo que hay que quitar.'
                    : 'Listo. Lo rojo se va a borrar.'}
              {removedIdx ? ` Quedan ${Math.round(walkedDistance(kept))} m.` : ''}
            </Text>
            {mode === 'end' ? (
              <Text style={styles.chosen}>Termina: {chosenLabel(a)}</Text>
            ) : (
              <Text style={styles.chosen}>Desde: {chosenLabel(a)}   Hasta: {chosenLabel(b)}</Text>
            )}
            {mode === 'range' && isActiveHere ? (
              <Text style={{ fontSize: 12, color: colors.amberText }}>Para quitar un tramo, primero terminá la salida.</Text>
            ) : null}
            <Button
              title={mode === 'end' ? 'Cortar acá' : 'Quitar este tramo'}
              variant="danger"
              icon="scissors"
              onPress={mode === 'end' ? confirmEnd : confirmRange}
              disabled={mode === 'end' ? a == null || a >= pts.length - 1 : !removedIdx || isActiveHere}
              loading={busy}
            />
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {options.slice().reverse().map((o) => {
                const on = o.i === a || o.i === b;
                return (
                  <Pressable key={o.i} onPress={() => pick(o.i)} accessibilityRole="button" style={[styles.row, on && { backgroundColor: colors.greenSoft }]}>
                    <Text style={{ width: 52, fontSize: 15, fontWeight: '800', color: on ? colors.greenText : colors.text }}>{fmtTime(o.t)}</Text>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.muted }} numberOfLines={1}>{o.street ?? 'Calle sin identificar'}</Text>
                    {on ? <Feather name="check" size={18} color={colors.green} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {isOpen ? <Button title="Terminar la salida ahora" icon="square" variant="outline" onPress={confirmFinishNow} loading={busy} /> : null}
        {!isOpen ? (
          <Button title="Volver a pintar las cuadras" icon="refresh-cw" variant="outline" loading={busy}
            onPress={async () => {
              if (!session) return;
              setBusy(true);
              try {
                const n = await recomputeCoverage(session);
                Alert.alert('Listo', n ? `Se pintaron ${n} tramos de vereda con el recorrido.` : 'El recorrido no pasa por calles cargadas.');
                load();
              } catch (e) {
                Alert.alert('No se pudo', e instanceof Error ? e.message : '');
              } finally {
                setBusy(false);
              }
            }} />
        ) : null}
        {!isActiveHere ? <Button title="Borrar la salida entera" icon="trash-2" variant="ghost" onPress={confirmDelete} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  chosen: { fontSize: 14, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
}));
