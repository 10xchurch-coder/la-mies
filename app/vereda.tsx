// Historial de una vereda: quién pasó y cuándo.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading } from '@/components/ui';
import { setSideCoverage, sideHistory } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { KIND_LABEL, fmtDayYear, fmtRelativeDay, fmtTime } from '@/lib/format';
import { colors, coverageColor, themed } from '@/theme';

export default function Vereda() {
  const { road, seg, side, name, sideName, kind } = useLocalSearchParams<{ road: string; seg: string; side: string; name: string; sideName: string; kind?: string }>();
  const k = kind === 'flyers' ? 'flyers' : kind === 'soulwinning' ? 'soulwinning' : null;
  const { isLeader, session } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof sideHistory>> | null>(null);

  const load = useCallback(() => {
    sideHistory(Number(road), Number(seg), Number(side) === 1 ? 1 : -1, k).then(setRows).catch(() => setRows([]));
  }, [road, seg, side, k]);
  useEffect(load, [load]);

  const remove = (r: NonNullable<typeof rows>[number]) =>
    Alert.alert('Quitar esta vez', `${r.user_name ?? 'Alguien'} · ${fmtDayYear(r.covered_at)}. Se saca del mapa y del conteo de esa salida.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => setSideCoverage(Number(road), Number(seg), Number(side) === 1 ? 1 : -1, r.kind, false, r.session_id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={name || 'Calle sin nombre'} subtitle={`Vereda ${sideName || '?'}${k ? ` · ${KIND_LABEL[k]}` : ''} · cada vereda se cuenta por separado`} back />
      {rows === null ? (
        <Loading />
      ) : (
        <Screen>
          {rows.length ? (
            rows.map((r, i) => (
              <Card key={`${r.session_id}-${i}`} style={styles.row}>
                <View style={{ width: 6, borderRadius: 3, backgroundColor: coverageColor(r.covered_at, r.kind), alignSelf: 'stretch' }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                    {fmtRelativeDay(r.covered_at) === 'hoy' ? 'Hoy' : fmtDayYear(r.covered_at)} · {fmtTime(r.covered_at)}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {r.user_name ?? 'Un hermano'} · {r.manual ? 'marcada a mano' : r.kind === 'flyers' ? 'volantes' : <>{r.presentations} {r.presentations === 1 ? 'presentación' : 'presentaciones'} · {r.promises} {r.promises === 1 ? 'promesa' : 'promesas'} en esa salida</>}
                  </Text>
                  {isLeader || r.user_id === session?.user.id ? <Text onPress={() => remove(r)} style={{ fontSize: 12, fontWeight: '700', color: colors.red, marginTop: 2 }}>Quitar (no se hizo)</Text> : null}
                </View>
              </Card>
            ))
          ) : (
            <Empty icon="map" title="Nadie pasó todavía por esta vereda" />
          )}
        </Screen>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 12 },
}));
