// Tablero: totales del día/semana/mes, equipos y ranking individual.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Card, Empty, SectionTitle, Segmented, Stat } from '@/components/ui';
import { scoreboard, teamTotals } from '@/lib/api';
import { groupWord } from '@/lib/format';
import { POINTS } from '@/lib/levels';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ScoreRow, TeamTotals } from '@/types';

type Period = 'day' | 'week' | 'month';

export default function Tablero() {
  const { session, church } = useAuth();
  const [period, setPeriod] = useState<Period>('day');
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [totals, setTotals] = useState<TeamTotals | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([scoreboard(period), teamTotals(period)]);
      setRows(r);
      setTotals(t);
    } catch {
      // sin señal
    }
  }, [period]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.group_name ?? 'Sin grupo';
      m.set(k, (m.get(k) ?? 0) + r.points);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const maxGroup = groups[0]?.[1] ?? 1;
  const palette = [colors.green, colors.blue, colors.amber, '#6E3FB5', colors.gray];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Tablero" subtitle="Se actualiza en vivo" back />
      <Screen>
        <Segmented options={[{ value: 'day', label: 'Hoy' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }]} value={period} onChange={setPeriod} />

        {totals ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={totals.presentations} label="Presentaciones" tone="green" />
              <Stat value={totals.promises} label="Promesas" tone="amber" />
              <Stat value={totals.came} label="Vinieron" tone="blue" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={totals.discipleship} label="Discipulado" />
              <Stat value={totals.baptisms} label="Bautismos" />
              <Stat value={totals.members} label="Hermanos" />
            </View>
          </View>
        ) : null}

        {church?.grouping !== 'none' && groups.length > 1 ? (
          <>
            <SectionTitle>{groupWord(church?.grouping, true)}</SectionTitle>
            <View style={{ gap: 8 }}>
              {groups.map(([name, pts], i) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 96, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{name}</Text>
                  <View style={{ flex: 1, height: 26, borderRadius: 6, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.max(4, (pts / maxGroup) * 100)}%`, height: '100%', borderRadius: 6, backgroundColor: palette[i % palette.length] }} />
                  </View>
                  <Text style={{ width: 56, textAlign: 'right', fontSize: 14, fontWeight: '800' }}>{pts} pts</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle>Ranking</SectionTitle>
        <Card style={{ padding: 0 }}>
          {rows.length ? (
            rows.map((r, i) => (
              <View key={r.user_id} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }, r.user_id === session?.user.id && { backgroundColor: '#F3F8F4' }]}>
                <Text style={{ width: 24, fontSize: 15, fontWeight: '800', color: i === 0 ? colors.amber : colors.muted }}>{i + 1}</Text>
                <Avatar name={r.display_name} size={36} color={i === 0 ? colors.amber : colors.green} textColor="#FFFFFF" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700' }}>
                    {r.display_name} {r.user_id === session?.user.id ? <Text style={{ color: colors.muted, fontWeight: '500' }}>(vos)</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {r.presentations} presentaciones · {r.promises} promesas{r.came ? ` · ${r.came} vinieron` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '800' }}>{r.points}</Text>
              </View>
            ))
          ) : (
            <Empty icon="award" title="Todavía no hay puntos" text="Los puntos aparecen cuando se cargan presentaciones y promesas." />
          )}
        </Card>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>
          Puntos: presentación {POINTS.presentation} · promesa {POINTS.promise} · vino a la iglesia {POINTS.came}. Las cuadras caminadas no suman. Bautismos y discipulado se cuentan pero no dan puntos.
        </Text>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
});
