// Piezas que comparten las pantallas de La Mies Central: números grandes, gráficos de barras, chips de estado y el cartel de privacidad.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Tag } from '@/components/ui';
import { PRIVACY, STATE_INFO, stateOf, type CentralChurch, type Change } from '@/lib/central';
import { errorMessage } from '@/lib/supabase';
import { colors, themed, toneOf, type Tone } from '@/theme';
import { tx } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Feather>['name'];

/** Carga algo de la base cada vez que se entra a la pantalla. `data` null: cargando. `error`: no se pudo. */
export function useCentralLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void; setData: (v: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    fn().then((v) => { if (alive) { setData(v); setError(null); } }).catch((e) => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]));
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={styles.error}>
      <Feather name="alert-circle" size={18} color={colors.redText} />
      <Text style={{ flex: 1, fontSize: 14, color: colors.redText }}>{tx('No se pudo cargar. {text}', { text })}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={{ padding: 6 }}><Text style={{ fontSize: 13, fontWeight: '800', color: colors.redText }}>{tx('Probar de nuevo')}</Text></Pressable>
    </View>
  );
}

/** Flecha y texto del cambio contra el período anterior. `good`: ¿el cambio es bueno? (null: ni bueno ni malo) */
export function ChangeText({ change, good, small }: { change: Change | null; good?: boolean | null; small?: boolean }) {
  if (!change) return null;
  const color = change.dir === 'same' || good === null || good === undefined ? colors.muted : good ? colors.green : colors.red;
  return <Text style={{ fontSize: small ? 12 : 13, fontWeight: '700', color }}>{change.dir === 'up' ? '▲ ' : change.dir === 'down' ? '▼ ' : ''}{change.text}</Text>;
}

export function Kpi({ label, value, hint, change, good, icon, tone = 'green', onPress, basis }: {
  label: string; value: number | string; hint?: string; change?: Change | null; good?: boolean | null; icon: IconName; tone?: Tone; onPress?: () => void; basis?: string | number;
}) {
  const c = toneOf(tone);
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.soft }}>
          <Feather name={icon} size={14} color={c.solid} />
        </View>
        <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={styles.kpiValue}>{value}</Text>
        <ChangeText change={change ?? null} good={good} />
      </View>
      {hint ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>{hint}</Text> : null}
    </>
  );
  const style = [styles.kpi, { flexBasis: basis ?? '23%' }] as StyleProp<ViewStyle>;
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={onPress}
      style={(s) => [style, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.bgSoft }]}>{body}</Pressable>
  );
}

const shortWeek = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };

/** Gráfico de barras simple, semana por semana. Debajo dice de cuándo a cuándo va y el número de la última semana. */
export function Bars({ title, data, tone = 'green', height = 84 }: { title: string; data: { week: string; value: number }[]; tone?: Tone; height?: number }) {
  const c = toneOf(tone);
  const max = Math.max(1, ...data.map((d) => d.value));
  const last = data[data.length - 1];
  return (
    <View style={{ flex: 1, minWidth: 220, gap: 6 }} accessibilityLabel={`${title}. ${data.map((d) => `${shortWeek(d.week)}: ${d.value}`).join(', ')}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>{title}</Text>
        {last ? <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{last.value}</Text> : null}
      </View>
      {data.length ? (
        <>
          <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {data.map((d, i) => (
              <View key={d.week} style={{ flex: 1, maxWidth: 28, height: Math.max(2, Math.round((d.value / max) * height)), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: i === data.length - 1 ? c.solid : c.soft }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.axis}>{shortWeek(data[0].week)}</Text>
            <Text style={styles.axis}>{tx('más alto: {max}', { max })}</Text>
            <Text style={styles.axis}>{shortWeek(last.week)}</Text>
          </View>
        </>
      ) : <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 20 }}>{tx('Todavía no hay semanas guardadas.')}</Text>}
    </View>
  );
}

export function StateChip({ church }: { church: CentralChurch }) {
  const s = STATE_INFO[stateOf(church)];
  return <Tag text={s.label} tone={s.tone} />;
}

/** Chips para elegir una opción (filtros). */
export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={[styles.chip, on && { backgroundColor: colors.pinkSoft, borderColor: colors.pink }]}>
            <Text style={{ fontSize: 13, fontWeight: on ? '800' : '600', color: on ? colors.pinkText : colors.text }}>{o.label}{o.count !== undefined ? ` · ${o.count}` : ''}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** El cartel "Qué vemos y qué no": la regla de privacidad de Central, siempre a la vista. */
export function PrivacyBox({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={styles.privacy}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="lock" size={16} color={colors.blueText} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.blueText }}>{tx(PRIVACY.title)}</Text>
        <Text style={{ fontSize: 12, color: colors.blueText }}>{open ? tx('Cerrar') : tx('Las personas y la plata de cada iglesia no se ven. Ver más')}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.blueText} />
      </Pressable>
      {open ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 10 }}>
          <View style={{ flex: 1, minWidth: 260, gap: 5 }}>
            <Text style={styles.privacyHead}>{tx('SÍ VEMOS')}</Text>
            {PRIVACY.yes.map((t) => <Text key={t} style={styles.privacyLine}>{`✓ ${tx(t)}`}</Text>)}
          </View>
          <View style={{ flex: 1, minWidth: 260, gap: 5 }}>
            <Text style={styles.privacyHead}>{tx('NUNCA VEMOS')}</Text>
            {PRIVACY.no.map((t) => <Text key={t} style={styles.privacyLine}>{`✕ ${tx(t)}`}</Text>)}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Un dato con su nombre arriba (para las fichas). */
export function Fact({ label, value, selectable }: { label: string; value: string | number | null | undefined; selectable?: boolean }) {
  return (
    <View style={{ minWidth: 150, flexGrow: 1, flexBasis: '30%', gap: 1 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted }}>{label}</Text>
      <Text selectable={selectable} style={{ fontSize: 14, color: colors.text }}>{value === null || value === undefined || value === '' ? '—' : value}</Text>
    </View>
  );
}

export const tableStyles = themed(() => StyleSheet.create({
  table: { backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  thead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.bgSoft, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted },
  td: { fontSize: 13, color: colors.text },
  num: { fontSize: 13, color: colors.text, textAlign: 'right', fontVariant: ['tabular-nums'] },
}));

const styles = themed(() => StyleSheet.create({
  kpi: { flexGrow: 1, minWidth: 160, backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
  kpiLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.muted },
  kpiValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  axis: { fontSize: 11, color: colors.muted },
  chip: { paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.redSoft },
  privacy: { backgroundColor: colors.blueSoft, borderRadius: 14, padding: 14 },
  privacyHead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.blueText },
  privacyLine: { fontSize: 13, lineHeight: 19, color: colors.text },
}));
