// Las rachas de lectura de la iglesia: quién viene leyendo cada día.
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, Empty, Loading } from '@/components/ui';
import { readingBoard } from '@/lib/api';
import { colors } from '@/theme';
import type { ReadingBoardRow } from '@/types';

export default function Lectores() {
  const [rows, setRows] = useState<ReadingBoardRow[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      readingBoard().then(setRows).catch(() => setRows([]));
    }, []),
  );
  if (!rows) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Lectores de la Palabra" subtitle="Días seguidos leyendo el devocional" back />
      <Screen>
        {!rows.length ? (
          <Empty icon="book-open" title="Todavía nadie empezó" text="Abrí el devocional cada día y vas a aparecer acá." />
        ) : (
          <Card style={{ padding: 0 }}>
            {rows.map((r, i) => (
              <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Text style={{ width: 24, fontSize: 14, fontWeight: '800', color: colors.muted, textAlign: 'center' }}>{i + 1}</Text>
                <Face name={r.display_name} path={r.photo_path} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.display_name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Mejor racha: {r.best_streak} {r.best_streak === 1 ? 'día' : 'días'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Feather name="zap" size={16} color={r.current_streak ? colors.green : colors.muted} />
                  <Text style={{ fontSize: 18, fontWeight: '800', color: r.current_streak ? colors.greenText : colors.muted }}>{r.current_streak}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}
      </Screen>
    </View>
  );
}
