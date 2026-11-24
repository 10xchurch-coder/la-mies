// El informe de un período en pantalla: cada número con el del período anterior al lado, por grupos.
import React from 'react';
import { Text, View } from 'react-native';
import { ChangeText, tableStyles as T } from '@/components/central/CentralUI';
import { METRIC_GROUPS, type Period, type ReportRow, type ServiceCount } from '@/lib/central';
import { colors } from '@/theme';

export function ReportTable({ rows, period, services }: { rows: ReportRow[]; period: Period; services?: ServiceCount[] }) {
  return (
    <View style={{ gap: 14 }}>
      {METRIC_GROUPS.map((g) => {
        const list = rows.filter((r) => r.group === g);
        if (!list.length) return null;
        return (
          <View key={g} style={T.table}>
            <View style={T.thead}>
              <Text style={[T.th, { flex: 2.2 }]}>{g}</Text>
              <Text style={[T.th, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>{period.kind === 'week' ? 'Esta semana' : period.kind === 'month' ? 'Este mes' : 'Este año'}</Text>
              <Text style={[T.th, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>Antes</Text>
              <Text style={[T.th, { flex: 1.3, textAlign: 'right' }]} numberOfLines={1}>Cambio</Text>
            </View>
            {list.map((r) => (
              <View key={r.key} style={T.row}>
                <Text style={[T.td, { flex: 2.2 }]}>{r.label}</Text>
                <Text style={[T.num, { flex: 1, fontWeight: '800', fontSize: 15 }]}>{r.value}</Text>
                <Text style={[T.num, { flex: 1, color: colors.muted }]}>{r.prev === null ? '—' : r.prev}</Text>
                <View style={{ flex: 1.3, alignItems: 'flex-end' }}>{r.change ? <ChangeText change={r.change} good={r.good} small /> : <Text style={[T.td, { color: colors.muted }]}>—</Text>}</View>
              </View>
            ))}
          </View>
        );
      })}
      {services?.length ? (
        <View style={T.table}>
          <View style={T.thead}>
            <Text style={[T.th, { flex: 3 }]}>Asistencia por reunión</Text>
            <Text style={[T.th, { flex: 1, textAlign: 'right' }]}>Total del período</Text>
          </View>
          {services.map((s) => (
            <View key={s.name} style={T.row}>
              <Text style={[T.td, { flex: 3 }]}>{s.name}</Text>
              <Text style={[T.num, { flex: 1, fontWeight: '800' }]}>{s.count}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

