import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Segmented } from '@/components/ui';
import { periodOf, shiftPeriod, type PeriodKind } from '@/lib/central';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

/** Para elegir semana, mes o año y moverse hacia atrás o adelante (nunca más allá de hoy). */
export function PeriodPicker({ kind, anchor, onChange }: { kind: PeriodKind; anchor: string; onChange: (kind: PeriodKind, anchor: string) => void }) {
  const p = periodOf(kind, anchor);
  const today = new Date().toISOString().slice(0, 10);
  const canNext = periodOf(kind, shiftPeriod(kind, anchor, 1)).from <= today;
  const arrow = { width: 36, height: 36, borderRadius: 9, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <View style={{ width: 270 }}>
        <Segmented<PeriodKind> value={kind} onChange={(k) => onChange(k, anchor)} options={[{ value: 'week', label: tx('Semana') }, { value: 'month', label: tx('Mes') }, { value: 'year', label: tx('Año') }]} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={tx('Período anterior')} onPress={() => onChange(kind, shiftPeriod(kind, anchor, -1))} style={arrow}><Feather name="chevron-left" size={18} color={colors.text} /></Pressable>
      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, minWidth: 190, textAlign: 'center' }}>{p.label.charAt(0).toUpperCase() + p.label.slice(1)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={tx('Período siguiente')} disabled={!canNext} onPress={() => onChange(kind, shiftPeriod(kind, anchor, 1))} style={[arrow, !canNext && { opacity: 0.35 }]}><Feather name="chevron-right" size={18} color={colors.text} /></Pressable>
      <Text style={{ fontSize: 12, color: colors.muted }}>{tx('comparado con {prevLabel}', { prevLabel: p.prevLabel })}</Text>
    </View>
  );
}
