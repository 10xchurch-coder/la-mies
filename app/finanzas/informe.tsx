// Informe de finanzas: gráfico mes a mes (entró / salió) de todos los fondos o de uno, último año o toda
// la historia; el mes elegido por categoría; saldos; y observaciones automáticas para mirar.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading, Segmented, SectionTitle } from '@/components/ui';
import { finBalances, finByCategory, finMonthly } from '@/lib/api';
import { fmtMoney, isoDate } from '@/lib/format';
import { shareText } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinBalance, FinByCategory, FinMonthly } from '@/types';
import { monthTitle } from './movimientos';

type Month = { month: string; income: number; expense: number; net: number };

const short = (m: string) => new Date(`${m.slice(0, 7)}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', '');
const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));

function Chart({ data, sel, onSel }: { data: Month[]; sel: string; onSel: (m: string) => void }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'flex-end', gap: 8, paddingVertical: 4 }}>
      {data.map((d) => {
        const on = d.month.slice(0, 7) === sel;
        return (
          <Pressable key={d.month} onPress={() => onSel(d.month.slice(0, 7))} accessibilityRole="button" accessibilityLabel={`${short(d.month)}: entró ${fmtMoney(d.income)}, salió ${fmtMoney(d.expense)}`}
            style={{ alignItems: 'center', gap: 4, padding: 3, borderRadius: 8, backgroundColor: on ? colors.bgSoft : 'transparent' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: d.net >= 0 ? colors.greenText : colors.red }}>{d.income || d.expense ? compact(d.net) : ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 150 }}>
              <View style={{ width: 14, height: Math.max(2, (d.income / max) * 150), borderRadius: 4, backgroundColor: colors.green }} />
              <View style={{ width: 14, height: Math.max(2, (d.expense / max) * 150), borderRadius: 4, backgroundColor: colors.red, opacity: 0.85 }} />
            </View>
            <Text style={{ fontSize: 10, color: on ? colors.text : colors.muted, fontWeight: on ? '800' : '500' }}>{short(d.month)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Observaciones simples a partir de los números (no reemplazan el criterio del tesorero). */
function pointers(months: Month[], sel: string, balances: FinBalance[], cats: FinByCategory[]): string[] {
  const out: string[] = [];
  const i = months.findIndex((m) => m.month.slice(0, 7) === sel);
  const cur = months[i];
  if (!cur) return out;
  const prev = months.slice(Math.max(0, i - 3), i).filter((m) => m.income || m.expense);
  const avg = (k: 'income' | 'expense') => (prev.length ? prev.reduce((a, m) => a + m[k], 0) / prev.length : 0);
  const ai = avg('income'), ae = avg('expense');
  if (cur.expense > cur.income && cur.income > 0) out.push(`Este mes salió más de lo que entró (${fmtMoney(cur.expense - cur.income)} de diferencia). Revisá qué gasto fue extraordinario y si se puede repartir en varios meses.`);
  if (ai && cur.income < ai * 0.8) out.push(`Los ingresos bajaron ${Math.round((1 - cur.income / ai) * 100)}% contra el promedio de los 3 meses anteriores (${fmtMoney(ai)}).`);
  if (ai && cur.income > ai * 1.2) out.push(`Los ingresos subieron ${Math.round((cur.income / ai - 1) * 100)}% contra el promedio. Buen momento para separar algo para reserva o para Misiones.`);
  if (ae && cur.expense > ae * 1.25) out.push(`Los gastos subieron ${Math.round((cur.expense / ae - 1) * 100)}% contra el promedio (${fmtMoney(ae)}).`);
  const outs = cats.filter((c) => c.direction === 'out');
  const totalOut = outs.reduce((a, c) => a + c.total, 0);
  const top = outs[0];
  if (top && totalOut && top.total / totalOut > 0.5 && outs.length > 1) out.push(`"${top.category}" fue ${Math.round((top.total / totalOut) * 100)}% de los gastos del mes.`);
  for (const b of balances) if (b.closing < 0) out.push(`El fondo ${b.fund} quedó en negativo (${fmtMoney(b.closing)}). Hay que cubrirlo con un pase desde otro fondo o revisar si falta cargar un ingreso.`);
  const gen = balances.find((b) => b.kind === 'general');
  if (gen && ae > 0 && gen.closing >= 0 && gen.closing < ae) out.push(`El fondo General tiene menos de un mes de gastos de reserva. Una meta sana es tener al menos 2 o 3 meses.`);
  const mis = months.slice(Math.max(0, i - 2), i + 1);
  if (!out.length && mis.length) out.push('Todo dentro de lo normal este mes.');
  return out;
}

export default function FinInforme() {
  const { church } = useAuth();
  const [range, setRange] = useState<'12' | 'all'>('12');
  const [rows, setRows] = useState<FinMonthly[] | null>(null);
  const [fund, setFund] = useState<string | null>(null);
  const [sel, setSel] = useState(isoDate(new Date()).slice(0, 7));
  const [cats, setCats] = useState<FinByCategory[]>([]);
  const [bal, setBal] = useState<FinBalance[]>([]);

  useEffect(() => {
    setRows(null);
    finMonthly(range === '12' ? 12 : 240).then(setRows).catch(() => setRows([]));
  }, [range]);
  useEffect(() => {
    const [y, m] = sel.split('-').map(Number);
    const last = isoDate(new Date(y, m, 0));
    finByCategory(`${sel}-01`, last).then(setCats).catch(() => setCats([]));
    finBalances(null, last).then(setBal).catch(() => setBal([]));
  }, [sel]);

  const funds = useMemo(() => [...new Map((rows ?? []).map((r) => [r.fund_id, r.fund])).entries()], [rows]);
  const months: Month[] = useMemo(() => {
    const m = new Map<string, Month>();
    for (const r of rows ?? []) {
      if (fund && r.fund_id !== fund) continue;
      const k = r.month;
      const x = m.get(k) ?? { month: k, income: 0, expense: 0, net: 0 };
      x.income += r.income; x.expense += r.expense; x.net += r.net;
      m.set(k, x);
    }
    let list = [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
    if (range === 'all') {
      const first = list.findIndex((x) => x.income || x.expense);
      list = first >= 0 ? list.slice(first) : list.slice(-1);
    }
    return list;
  }, [rows, fund, range]);

  const cur = months.find((m) => m.month.slice(0, 7) === sel);
  const tips = pointers(months, sel, fund ? bal.filter((b) => b.fund_id === fund) : bal, fund ? cats.filter((c) => c.fund === funds.find(([id]) => id === fund)?.[1]) : cats);
  const totIn = months.reduce((a, m) => a + m.income, 0);
  const totOut = months.reduce((a, m) => a + m.expense, 0);
  const inCats = cats.filter((c) => c.direction === 'in' && (!fund || c.fund === funds.find(([id]) => id === fund)?.[1]));
  const outCats = cats.filter((c) => c.direction === 'out' && (!fund || c.fund === funds.find(([id]) => id === fund)?.[1]));

  const share = () => {
    const lines = [
      `Finanzas · ${church?.name ?? ''} · ${monthTitle(sel)}`,
      '',
      `Entró: ${fmtMoney(cur?.income ?? 0)}`,
      `Salió: ${fmtMoney(cur?.expense ?? 0)}`,
      `Resultado: ${fmtMoney(cur?.net ?? 0)}`,
      '',
      'SALDOS AL CIERRE',
      ...bal.map((b) => `${b.fund}: ${fmtMoney(b.closing, b.currency)}`),
      '',
      'INGRESOS POR CATEGORÍA',
      ...inCats.map((c) => `${c.category} (${c.fund}): ${fmtMoney(c.total)}`),
      '',
      'GASTOS POR CATEGORÍA',
      ...outCats.map((c) => `${c.category} (${c.fund}): ${fmtMoney(c.total)}`),
      '',
      'PARA MIRAR',
      ...tips.map((t) => `• ${t}`),
    ];
    shareText(lines.join('\n'), 'Informe de finanzas');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Informe de finanzas" subtitle={monthTitle(sel)} back />
      <Screen>
        <Segmented options={[{ value: '12', label: 'Último año' }, { value: 'all', label: 'Toda la historia' }]} value={range} onChange={setRange} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[[null, 'Todos los fondos'] as [string | null, string], ...funds].map(([id, name]) => (
            <Pressable key={id ?? 'all'} onPress={() => setFund(id)} accessibilityRole="button"
              style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: fund === id ? colors.green : colors.bgSoft }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: fund === id ? '#FFF' : colors.text }}>{name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {rows === null ? <Loading /> : (
          <>
            <Card style={{ paddingHorizontal: 8, gap: 6 }}>
              <Chart data={months} sel={sel} onSel={setSel} />
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <Text style={{ fontSize: 12, color: colors.greenText }}>■ Entró</Text>
                <Text style={{ fontSize: 12, color: colors.red }}>■ Salió</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Tocá un mes para ver el detalle</Text>
              </View>
            </Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>{range === 'all' ? 'Entró en total' : 'Entró en el año'}</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.greenText }}>{fmtMoney(totIn)}</Text></Card>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>{range === 'all' ? 'Salió en total' : 'Salió en el año'}</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.red }}>{fmtMoney(totOut)}</Text></Card>
            </View>

            <SectionTitle>{monthTitle(sel)}</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>Entró</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.greenText }}>{fmtMoney(cur?.income ?? 0)}</Text></Card>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>Salió</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.red }}>{fmtMoney(cur?.expense ?? 0)}</Text></Card>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>Resultado</Text><Text style={{ fontSize: 16, fontWeight: '800', color: (cur?.net ?? 0) >= 0 ? colors.text : colors.red }}>{fmtMoney(cur?.net ?? 0)}</Text></Card>
            </View>

            <Card style={{ gap: 8, backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="info" size={16} color={colors.blueText} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.blueText }}>Para mirar</Text>
              </View>
              {tips.map((t, i) => <Text key={i} style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>• {t}</Text>)}
            </Card>

            {([['Ingresos por categoría', inCats, colors.greenText], ['Gastos por categoría', outCats, colors.red]] as const).map(([t, list, color]) => list.length ? (
              <View key={t} style={{ gap: 8 }}>
                <SectionTitle>{t}</SectionTitle>
                <Card style={{ padding: 0 }}>
                  {list.map((c, i) => {
                    const total = list.reduce((a, x) => a + x.total, 0);
                    return (
                      <View key={`${c.category}-${c.fund}`} style={{ padding: 12, gap: 6, borderBottomWidth: i < list.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                        <View style={{ flexDirection: 'row' }}>
                          <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{c.category} <Text style={{ color: colors.muted, fontSize: 12 }}>· {c.fund}</Text></Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{fmtMoney(c.total)}</Text>
                        </View>
                        <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.bgSoft }}>
                          <View style={{ width: `${(c.total / (total || 1)) * 100}%`, height: 5, borderRadius: 3, backgroundColor: color }} />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            ) : null)}

            <SectionTitle>{`Saldos al cierre de ${monthTitle(sel).toLowerCase()}`}</SectionTitle>
            <Card style={{ padding: 0 }}>
              {(fund ? bal.filter((b) => b.fund_id === fund) : bal).map((b, i, arr) => (
                <View key={b.fund_id} style={{ flexDirection: 'row', padding: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{b.fund}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: b.closing < 0 ? colors.red : colors.text }}>{fmtMoney(b.closing, b.currency)}</Text>
                </View>
              ))}
            </Card>
            <Button title="Compartir el informe del mes" icon="share-2" variant="outline" onPress={share} />
          </>
        )}
      </Screen>
    </View>
  );
}
