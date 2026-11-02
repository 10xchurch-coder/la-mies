// Mis salidas: ver cada una y recortar la que me olvidé de apagar.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading, Tag } from '@/components/ui';
import { mySessions } from '@/lib/api';
import { fmtDayYear, fmtDistance, fmtMinutes, fmtTime } from '@/lib/format';
import { colors } from '@/theme';
import type { Session } from '@/types';

export default function Salidas() {
  const router = useRouter();
  const [rows, setRows] = useState<Session[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      mySessions().then(setRows).catch(() => setRows([]));
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mis salidas" subtitle="Tocá una para recortar el final" back />
      {rows === null ? (
        <Loading />
      ) : (
        <Screen>
          {rows.length ? (
            rows.map((s) => {
              const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
              const minutes = (end - new Date(s.started_at).getTime()) / 60000;
              return (
                <Pressable key={s.id} onPress={() => router.push({ pathname: '/recortar', params: { session: s.id } })} accessibilityRole="button">
                  <Card style={styles.row}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700' }}>
                        {fmtDayYear(s.started_at)} · {fmtTime(s.started_at)}{s.ended_at ? ` a ${fmtTime(s.ended_at)}` : ''}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {fmtMinutes(minutes)} · {fmtDistance(s.distance_m)} · {s.blocks} cuadras · {s.presentations} present. · {s.promises} promesas
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {!s.ended_at ? <Tag text="En curso" tone="green" /> : null}
                        {s.auto_stopped ? <Tag text="Cortada sola (vehículo)" tone="amber" /> : null}
                        {s.trimmed_at ? <Tag text="Recortada" tone="gray" /> : null}
                        {minutes > 240 && s.ended_at ? <Tag text="Muy larga: ¿te olvidaste de apagarla?" tone="red" /> : null}
                      </View>
                    </View>
                    <Feather name="scissors" size={20} color={colors.muted} />
                  </Card>
                </Pressable>
              );
            })
          ) : (
            <Empty icon="clock" title="Todavía no hiciste salidas" />
          )}
        </Screen>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
});
