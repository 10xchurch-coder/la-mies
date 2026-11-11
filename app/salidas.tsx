// Salidas: las mías (para recortar la que me olvidé de apagar) o, para la secretaría y el pastor,
// las de todos (terminar la que alguien dejó abierta, cortar el final, quitar un tramo o borrarla).
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading, Segmented, SectionTitle, Tag } from '@/components/ui';
import { listOutings } from '@/lib/api';
import { KIND_LABEL, fmtDayYear, fmtDistance, fmtMinutes, fmtTime } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { OutingRow } from '@/types';

export default function Salidas() {
  const router = useRouter();
  const params = useLocalSearchParams<{ todos?: string }>();
  const { session, isStaff } = useAuth();
  const [scope, setScope] = useState<'mine' | 'all'>(params.todos === '1' && isStaff ? 'all' : 'mine');
  const [rows, setRows] = useState<OutingRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      listOutings(scope === 'all' ? 30 : 120, scope === 'all' ? null : session?.user.id ?? null).then(setRows).catch(() => setRows([]));
    }, [scope, session?.user.id]),
  );

  const open = (rows ?? []).filter((r) => !r.ended_at);
  const done = (rows ?? []).filter((r) => r.ended_at);

  const Row = ({ r }: { r: OutingRow }) => {
    const mins = ((r.ended_at ? new Date(r.ended_at).getTime() : Date.now()) - new Date(r.started_at).getTime()) / 60000;
    return (
      <Pressable onPress={() => router.push({ pathname: '/recortar', params: { session: r.id } })} accessibilityRole="button">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
          <Feather name={r.ended_at ? 'map' : 'radio'} size={22} color={r.ended_at ? colors.green : colors.red} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
              {scope === 'all' ? `${r.display_name} · ` : ''}{fmtDayYear(r.started_at)} {fmtTime(r.started_at)}{r.ended_at ? `–${fmtTime(r.ended_at)}` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {KIND_LABEL[r.kind]} · {fmtMinutes(mins)} · {fmtDistance(r.distance_m ?? 0)} · {r.contacts} contactos · {r.presentations} evangelio · {r.promises} promesas
            </Text>
            {r.ended_at && r.counts === false ? <Text style={{ fontSize: 12, color: colors.muted }}>Muy corta: no suma a los números. Si fue una prueba, tocala y borrala.</Text> : null}
            {!r.ended_at && r.last_point ? <Text style={{ fontSize: 12, color: colors.red }}>Último punto: {fmtTime(r.last_point)}</Text> : null}
          </View>
          {r.ended_at && r.counts === false ? <Tag text="No cuenta" tone="gray" /> : r.trimmed_at ? <Tag text="Corregida" tone="gray" /> : r.auto_stopped ? <Tag text="Cortada sola" tone="amber" /> : null}
          <Feather name="chevron-right" size={18} color={colors.muted} />
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={scope === 'all' ? 'Salidas de todos' : 'Mis salidas'} subtitle="Tocá una para arreglarla" back />
      <Screen>
        {isStaff ? <Segmented options={[{ value: 'mine', label: 'Mías' }, { value: 'all', label: 'De todos' }]} value={scope} onChange={setScope} /> : null}
        {rows === null ? <Loading /> : null}
        {open.length ? (
          <>
            <SectionTitle>En curso</SectionTitle>
            {open.map((r) => <Row key={r.id} r={r} />)}
          </>
        ) : null}
        {rows && !rows.length ? <Empty icon="map" title="Todavía no hay salidas" /> : null}
        {done.length ? (
          <>
            <SectionTitle>Terminadas</SectionTitle>
            {done.map((r) => <Row key={r.id} r={r} />)}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
