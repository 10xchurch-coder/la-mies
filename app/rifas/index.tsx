// Rifas digitales: la lista. Quien maneja el calendario crea las rifas; todos pueden ver quién ganó.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, Tag } from '@/components/ui';
import { listRaffles } from '@/lib/api';
import { POOL_LABEL } from '@/lib/raffle';
import { fmtDateShort } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Raffle } from '@/types';

export default function Rifas() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Raffle[] | null>(null);
  useFocusEffect(useCallback(() => { listRaffles().then(setRows).catch(() => setRows((o) => o ?? [])); }, []));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Sorteos" subtitle="Premios para los que están presentes" back />
      <Screen>
        {can('cal.editar') ? <Button title="Nuevo sorteo" icon="gift" onPress={() => router.push('/rifas/nueva' as Href)} /> : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="gift" title="Todavía no hay sorteos" text={can('cal.editar') ? 'Creá el primero: la app arma la lista con los que estuvieron presentes y saca al azar.' : 'Cuando haya un sorteo, la vas a ver acá.'} />
        ) : rows.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(`/rifas/${r.id}` as Href)}>
            <Card style={{ gap: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{r.title}</Text>
              {r.prize ? <Text style={{ fontSize: 14, color: colors.text }}>🎁 {r.prize}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <Tag text={fmtDateShort(r.occurs_on)} tone="blue" />
                <Text style={{ flex: 1, fontSize: 12, color: colors.muted }}>{POOL_LABEL[r.pool]}</Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}
