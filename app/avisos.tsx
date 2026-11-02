// Avisos: recordatorios de turnos y clases, anuncios de los líderes, reportes de ausencias.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Empty, Loading } from '@/components/ui';
import { listNotifications, markRead } from '@/lib/api';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { colors } from '@/theme';
import type { NotificationRow } from '@/types';

type IconName = React.ComponentProps<typeof Feather>['name'];
const ICON: Record<string, IconName> = { duty: 'calendar', class: 'book-open', ministry: 'volume-2', absences: 'user-x', link: 'link' };

export default function Avisos() {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listNotifications().then(setRows).catch(() => setRows([]));
    }, []),
  );

  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      setRows((r) => r?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
      markRead(n.id).catch(() => undefined);
    }
    if (n.link?.startsWith('/')) router.push(n.link as Href);
  };

  const unread = rows?.filter((r) => !r.read_at).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Avisos"
        subtitle={unread ? `${unread} sin leer` : 'Todo leído'}
        back
        right={unread ? <Text onPress={() => markRead().then(() => listNotifications().then(setRows))} style={{ color: colors.green, fontWeight: '800', padding: 8 }}>Marcar todo</Text> : undefined}
      />
      {rows === null ? <Loading /> : (
        <Screen>
          {!rows.length ? <Empty icon="bell" title="No tenés avisos" text="Acá te llegan los recordatorios de tus turnos y clases y los anuncios de tus ministerios." /> : null}
          {rows.map((n) => (
            <Pressable key={n.id} onPress={() => open(n)} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, backgroundColor: n.read_at ? colors.bg : colors.greenSoft, borderWidth: 1, borderColor: n.read_at ? colors.border : '#BFE3CC' }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.read_at ? colors.bgSoft : colors.green, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={ICON[n.kind] ?? 'bell'} size={18} color={n.read_at ? colors.green : '#FFF'} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: n.read_at ? '600' : '800', color: colors.text }}>{n.title}</Text>
                <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>{n.body}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{fmtRelativeDay(n.created_at)} · {fmtTime(n.created_at)}</Text>
              </View>
            </Pressable>
          ))}
        </Screen>
      )}
    </View>
  );
}
