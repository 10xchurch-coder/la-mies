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
import { tx } from '@/lib/i18n';

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
    Alert.alert(tx('Quitar esta vez'), tx('{user_name} · {fmtDayYear}. Se saca del mapa y del conteo de esa salida.', { user_name: r.user_name ?? tx('Alguien'), fmtDayYear: fmtDayYear(r.covered_at) }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Quitar'), style: 'destructive', onPress: () => setSideCoverage(Number(road), Number(seg), Number(side) === 1 ? 1 : -1, r.kind, false, r.session_id).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={name || tx('Calle sin nombre')} subtitle={tx('Vereda {sideName}{v1} · cada vereda se cuenta por separado', { sideName: sideName || '?', v1: k ? ` · ${KIND_LABEL[k]}` : '' })} back />
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
                    {fmtRelativeDay(r.covered_at) === 'hoy' ? tx('Hoy') : fmtDayYear(r.covered_at)} · {fmtTime(r.covered_at)}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {r.user_name ?? tx('Un hermano')} · {r.manual ? tx('marcada a mano') : r.kind === 'flyers' ? tx('volantes') : <>{tx('{presentations} {pl} · {promises} {pl2} en esa salida', { presentations: r.presentations, pl: r.presentations === 1 ? tx('presentación') : tx('presentaciones'), promises: r.promises, pl2: r.promises === 1 ? tx('promesa') : tx('promesas') })}</>}
                  </Text>
                  {isLeader || r.user_id === session?.user.id ? <Text onPress={() => remove(r)} style={{ fontSize: 12, fontWeight: '700', color: colors.red, marginTop: 2 }}>{tx('Quitar (no se hizo)')}</Text> : null}
                </View>
              </Card>
            ))
          ) : (
            <Empty icon="map" title={tx('Nadie pasó todavía por esta vereda')} />
          )}
        </Screen>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 12 },
}));
