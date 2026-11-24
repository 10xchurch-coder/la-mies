// Oraciones respondidas: lo que Dios hizo, para que toda la iglesia lo vea y dé gracias.
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading, Tag } from '@/components/ui';
import { answeredPrayers, type AnsweredPrayer } from '@/lib/culto';
import { fmtRelativeDay } from '@/lib/format';
import { colors } from '@/theme';

export default function OracionesRespondidas() {
  const [rows, setRows] = useState<AnsweredPrayer[] | null>(null);
  useFocusEffect(useCallback(() => {
    answeredPrayers().then(setRows).catch(() => setRows([]));
  }, []));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Oraciones respondidas" subtitle="Lo que Dios hizo" back />
      <Screen>
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="sun" title="Todavía no hay oraciones respondidas" text="Cuando Dios responda un pedido, tocá “Dios respondió” en ese pedido y aparece acá." />
        ) : rows.map((r) => (
          <Card key={r.id} style={{ gap: 8, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>{r.mine ? 'Vos' : r.author ?? 'Un hermano'} · <Text style={{ fontWeight: '500', color: colors.muted }}>{fmtRelativeDay(r.answered_at)}</Text></Text>
              <Tag text="¡Dios respondió!" tone="green" />
            </View>
            <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Pedido: {r.body}</Text>
            {r.answer_note ? <Text style={{ fontSize: 16, color: colors.text, lineHeight: 23, fontWeight: '600' }}>{r.answer_note}</Text> : null}
            {r.prayed ? <Text style={{ fontSize: 12, color: colors.muted }}>{r.prayed === 1 ? 'Oró 1 hermano' : `Oraron ${r.prayed} hermanos`}</Text> : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
