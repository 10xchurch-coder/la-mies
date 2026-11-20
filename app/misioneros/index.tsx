// Los misioneros de la iglesia: quiénes son y el último informe de cada uno. Lo ven los miembros que iniciaron sesión.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { SignedImage } from '@/components/SignedImage';
import { Button, Card, Empty, Loading, Tag } from '@/components/ui';
import { latestReportMonths, missionariesList } from '@/lib/api';
import { monthLabel } from '@/lib/missionaries';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Missionary } from '@/types';

export default function Misioneros() {
  const { isStaff } = useAuth();
  const [rows, setRows] = useState<Missionary[] | null>(null);
  const [last, setLast] = useState<Record<string, string>>({});
  useFocusEffect(useCallback(() => {
    missionariesList().then(setRows).catch(() => setRows((old) => old ?? []));
    latestReportMonths().then(setLast).catch(() => undefined);
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Misioneros" subtitle="Los que sostenemos y oramos por ellos" back />
      <Screen>
        {isStaff ? <Button title="Agregar misionero" icon="plus" variant="outline" onPress={() => router.push('/misioneros/editar' as Href)} /> : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="globe" title="Todavía no hay misioneros" text={isStaff ? 'Agregá al primero con el botón de arriba.' : 'Pronto vas a ver acá a nuestros misioneros y sus informes.'} />
        ) : rows.map((m) => (
          <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push(`/misioneros/${m.id}` as Href)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 }}>
              <SignedImage bucket="missionaries" path={m.photo_path} style={{ width: 72, height: 72, borderRadius: 36 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{m.name}</Text>
                {m.field ? <Text style={{ fontSize: 13, color: colors.muted }}>{m.field}</Text> : null}
                {last[m.id] ? <Tag text={`Último informe: ${monthLabel(last[m.id])}`} tone="green" /> : <Tag text="Sin informes todavía" tone="gray" />}
              </View>
            </Card>
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}
