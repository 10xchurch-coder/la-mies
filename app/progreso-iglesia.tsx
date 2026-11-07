// Progreso de la iglesia: cómo viene la iglesia mes a mes y en toda su historia.
// Arriba la salud del último mes comparada con el promedio de los 3 anteriores; después un gráfico
// por indicador (tocá uno para cambiar) y los totales de toda la historia.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading, Segmented, SectionTitle } from '@/components/ui';
import { churchProgress } from '@/lib/api';
import { shareText } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ProgressRow } from '@/types';

type Key = keyof Omit<ProgressRow, 'month'>;
const METRICS: { key: Key; label: string; group: 'iglesia' | 'evangelismo'; sum: boolean; good: 'up' | 'down' }[] = [
  { key: 'avg_attendance', label: 'Asistencia promedio', group: 'iglesia', sum: false, good: 'up' },
  { key: 'people', label: 'Personas distintas', group: 'iglesia', sum: false, good: 'up' },
  { key: 'members', label: 'Miembros', group: 'iglesia', sum: false, good: 'up' },
  { key: 'first_time', label: 'Primera vez', group: 'iglesia', sum: true, good: 'up' },
  { key: 'saved', label: 'Recibieron a Cristo', group: 'iglesia', sum: true, good: 'up' },
  { key: 'baptisms', label: 'Bautismos', group: 'iglesia', sum: true, good: 'up' },
  { key: 'new_members', label: 'Miembros nuevos', group: 'iglesia', sum: true, good: 'up' },
  { key: 'class_present', label: 'Asistencia a clases', group: 'iglesia', sum: true, good: 'up' },
  { key: 'outings', label: 'Salidas', group: 'evangelismo', sum: true, good: 'up' },
  { key: 'people_out', label: 'Hermanos que salieron', group: 'evangelismo', sum: false, good: 'up' },
  { key: 'hours', label: 'Horas', group: 'evangelismo', sum: true, good: 'up' },
  { key: 'houses', label: 'Casas', group: 'evangelismo', sum: true, good: 'up' },
  { key: 'contacts', label: 'Contactos', group: 'evangelismo', sum: true, good: 'up' },
  { key: 'gospel', label: 'Evangelio presentado', group: 'evangelismo', sum: true, good: 'up' },
  { key: 'promises', label: 'Promesas', group: 'evangelismo', sum: true, good: 'up' },
];

const monthLabel = (m: string, long = false) =>
  new Date(`${m}T12:00:00`).toLocaleDateString('es-AR', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' }).replace('.', '');

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

function Bars({ rows, k }: { rows: ProgressRow[]; k: Key }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[k]) || 0));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'flex-end', gap: 6, paddingVertical: 4 }}>
      {rows.map((r, i) => {
        const v = Number(r[k]) || 0;
        const last = i === rows.length - 1;
        return (
          <View key={r.month} style={{ width: 38, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: v ? colors.text : colors.muted }}>{fmt(v)}</Text>
            <View style={{ width: 26, height: Math.max(3, (v / max) * 150), borderRadius: 6, backgroundColor: last ? colors.amber : colors.green, opacity: v ? 1 : 0.25 }} />
            <Text style={{ fontSize: 10, color: colors.muted }}>{monthLabel(r.month)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function ProgresoIglesia() {
  const { church } = useAuth();
  const [range, setRange] = useState<'12' | 'all'>('12');
  const [rows, setRows] = useState<ProgressRow[] | null>(null);
  const [k, setK] = useState<Key>('avg_attendance');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    churchProgress(range === '12' ? 13 : null).then(setRows).catch((e) => { setErr(e instanceof Error ? e.message : 'Error'); setRows([]); });
  }, [range]);

  // Último mes completo = el anterior al actual; se compara con el promedio de los 3 anteriores a ese.
  const health = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const done = rows.slice(0, -1);
    const cur = done[done.length - 1];
    const prev = done.slice(-4, -1);
    if (!cur) return null;
    return {
      month: cur.month,
      items: METRICS.map((m) => {
        const v = Number(cur[m.key]) || 0;
        const base = prev.length ? prev.reduce((a, r) => a + (Number(r[m.key]) || 0), 0) / prev.length : 0;
        const pct = base ? Math.round(((v - base) / base) * 100) : v ? 100 : 0;
        return { ...m, v, base, pct };
      }),
    };
  }, [rows]);

  const totals = useMemo(() => {
    if (!rows?.length) return null;
    const sum = (key: Key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
    return { first: rows[0].month, ...Object.fromEntries(METRICS.filter((m) => m.sum).map((m) => [m.key, sum(m.key)])) } as Record<string, number | string>;
  }, [rows]);

  const metric = METRICS.find((m) => m.key === k) ?? METRICS[0];

  const share = () => {
    if (!rows?.length || !health) return;
    const lines = health.items.filter((i) => i.v || i.base).map((i) => `${i.label}: ${fmt(i.v)}${i.base ? ` (${i.pct >= 0 ? '+' : ''}${i.pct}% vs. promedio)` : ''}`);
    shareText(`Progreso de ${church?.name ?? 'la iglesia'} · ${monthLabel(health.month, true)}\n\n${lines.join('\n')}`, 'Progreso de la iglesia');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Progreso de la iglesia" subtitle="Mes a mes y en toda la historia" back />
      <Screen>
        <Segmented options={[{ value: '12', label: 'Último año' }, { value: 'all', label: 'Toda la historia' }]} value={range} onChange={setRange} />
        {rows === null ? <Loading /> : err ? <Text style={{ color: colors.red }}>{err}</Text> : !rows.length ? <Text style={{ color: colors.muted }}>Todavía no hay datos.</Text> : (
          <>
            {health ? (
              <>
                <SectionTitle>{`Salud de ${monthLabel(health.month, true)}`}</SectionTitle>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: -8 }}>Comparado con el promedio de los 3 meses anteriores.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {health.items.filter((i) => i.v || i.base).map((i) => {
                    const up = i.pct > 5, down = i.pct < -5;
                    const tone = up ? colors.greenText : down ? colors.red : colors.muted;
                    return (
                      <Pressable key={i.key} onPress={() => setK(i.key)} accessibilityRole="button"
                        style={{ width: '48%', flexGrow: 1, padding: 12, borderRadius: 12, backgroundColor: k === i.key ? colors.greenSoft : colors.bgSoft, gap: 2 }}>
                        <Text style={{ fontSize: 12, color: colors.muted }}>{i.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{fmt(i.v)}</Text>
                          {i.base ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Feather name={up ? 'trending-up' : down ? 'trending-down' : 'minus'} size={14} color={tone} />
                              <Text style={{ fontSize: 12, fontWeight: '800', color: tone }}>{i.pct >= 0 ? '+' : ''}{i.pct}%</Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <SectionTitle>{metric.label}</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {METRICS.map((m) => (
                <Pressable key={m.key} onPress={() => setK(m.key)} accessibilityRole="button"
                  style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: k === m.key ? colors.green : colors.bgSoft }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: k === m.key ? '#FFF' : colors.text }}>{m.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Card style={{ paddingHorizontal: 8 }}>
              <Bars rows={rows} k={k} />
              <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 4 }}>El mes en curso va en naranja (todavía no terminó).</Text>
            </Card>

            {totals ? (
              <>
                <SectionTitle>{range === 'all' ? `Desde ${monthLabel(String(totals.first), true)}` : 'En el último año'}</SectionTitle>
                <Card style={{ padding: 0 }}>
                  {METRICS.filter((m) => m.sum).map((m, i, arr) => (
                    <View key={m.key} style={{ flexDirection: 'row', padding: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                      <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{m.label}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{fmt(Number(totals[m.key]) || 0)}</Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
            <Button title="Compartir el resumen del mes" icon="share-2" variant="outline" onPress={share} />
          </>
        )}
      </Screen>
    </View>
  );
}
