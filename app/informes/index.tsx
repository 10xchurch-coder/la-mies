// Informes escritos: el resumen de cada mes y de cada año, con observaciones y consejos.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Row = { id: string; kind: 'weekly' | 'monthly' | 'yearly'; period: string; title: string; created_at: string };

export default function Informes() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(() => {
    supabase.from('pastor_reports').select('id, kind, period, title, created_at').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, []);
  useFocusEffect(load);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Informes y consejos" subtitle="Cada mes y cada año" back />
      <Screen>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="file-text" title="Todavía no hay informes" text="El primero llega el 1.º del mes que viene, con los números del mes y sugerencias." /> : null}
        {(rows ?? []).map((r) => (
          <Pressable key={r.id} onPress={() => router.push(`/informes/${r.id}` as Href)} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <Feather name={r.kind === 'yearly' ? 'award' : 'file-text'} size={20} color={colors.green} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.title}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{r.kind === 'yearly' ? 'Informe anual' : r.kind === 'monthly' ? 'Informe mensual' : 'Semanal'}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Card>
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}
