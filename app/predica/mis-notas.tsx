// Mis notas de prédicas: todo lo que completé y anoté en cada mensaje, en un solo lugar.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading } from '@/components/ui';
import { mySermonNotesList, type MySermonNote } from '@/lib/culto';
import { blankCount, filledCount, filledOutline, hasNotes } from '@/lib/sermonNotes';
import { fmtDateOnly } from '@/lib/format';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function MisNotasDePredicas() {
  const router = useRouter();
  const [rows, setRows] = useState<MySermonNote[] | null>(null);
  useFocusEffect(useCallback(() => {
    mySermonNotesList().then((r) => setRows(r.filter((n) => hasNotes(n.answers, n.notes)))).catch(() => setRows([]));
  }, []));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Mis notas de prédicas')} subtitle={tx('Solo las ves vos')} back />
      <Screen>
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="edit-3" title={tx('Todavía no tenés notas')} text={tx('Abrí una prédica y completá el bosquejo mientras escuchás. Se guarda solo y queda acá.')} />
        ) : rows.map((n) => {
          const total = blankCount(n.notes_outline);
          const done = filledCount(n.notes_outline, n.answers);
          return (
            <Pressable key={n.sermon_id} onPress={() => router.push({ pathname: '/predica/[id]', params: { id: n.sermon_id } })} accessibilityRole="button">
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{n.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{[n.preacher, fmtDateOnly(n.preached_on)].filter(Boolean).join(' · ')}{total ? tx(' · {done} de {total} completados', { done, total }) : ''}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </View>
                {total && done ? <Text style={{ fontSize: 14, color: colors.text, lineHeight: 21 }} numberOfLines={6}>{filledOutline(n.notes_outline, n.answers)}</Text> : null}
                {n.notes?.trim() ? <Text style={{ fontSize: 14, color: colors.greenText, lineHeight: 21 }} numberOfLines={6}>{n.notes.trim()}</Text> : null}
              </Card>
            </Pressable>
          );
        })}
      </Screen>
    </View>
  );
}
