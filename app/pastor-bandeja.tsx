// La bandeja del pastor: los mensajes privados de los hermanos, el más reciente arriba.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, Empty, Loading, Tag } from '@/components/ui';
import { pastorInbox } from '@/lib/api';
import { fmtRelativeDay } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { PastorThreadRow } from '@/types';

export default function PastorBandeja() {
  const { profile } = useAuth();
  const isPastor = profile?.role === 'admin';
  const [rows, setRows] = useState<PastorThreadRow[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!isPastor) { setRows([]); return; }
    pastorInbox().then(setRows).catch(() => setRows((old) => old ?? []));
  }, [isPastor]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mensajes privados" subtitle="Lo que te escriben los hermanos" back />
      <Screen>
        {!isPastor ? <Empty icon="lock" title="Solo para el pastor" text="Estos mensajes los lee únicamente el pastor." /> : rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="message-circle" title="Todavía no hay mensajes" text="Cuando un hermano te escriba desde “Escribile al pastor”, va a aparecer acá." />
        ) : rows.map((r) => (
          <Pressable key={r.member_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/pastor-hilo', params: { member: r.member_id, name: r.name } } as unknown as Href)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <Face name={r.name} path={r.photo_path} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: r.unread ? '800' : '600', color: colors.text }}>{r.name}</Text>
                <Text numberOfLines={1} style={{ fontSize: 13, color: r.unread ? colors.text : colors.muted }}>{r.last_mine ? 'Vos: ' : ''}{r.last_body}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: 11, color: colors.muted }}>{fmtRelativeDay(r.last_at)}</Text>
                {r.unread ? <Tag text={`${r.unread} sin leer`} tone="blue" /> : null}
              </View>
            </Card>
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}
