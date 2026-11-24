// Informe de finanzas: gráfico mes a mes (entró / salió) de todos los fondos o de uno, último año o toda
// la historia; el mes elegido por categoría; saldos; y observaciones automáticas para mirar.
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading, Segmented, SectionTitle } from '@/components/ui';
import { finBalances, finByCategory, finMonthly } from '@/lib/api';
import { fmtMoney, isoDate } from '@/lib/format';
import { shareText } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { downloadView, downloadText } from '@/lib/download';
import { toCsv } from '@/lib/desk';
import type { FinBalance, FinByCategory, FinMonthly } from '@/types';
import { monthTitle } from './movimientos';
import { tx, txLocale } from '@/lib/i18n';

type Month = { month: string; income: number; expense: number; net: number };

const short = (m: string) => new Date(`${m.slice(0, 7)}-15T12:00:00`).toLocaleDateString(txLocale(), { month: 'short', year: '2-digit' }).replace('.', '');
const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));

function Chart({ data, sel, onSel }: { data: Month[]; sel: string; onSel: (m: string) => void }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'flex-end', gap: 8, paddingVertical: 4 }}>
      {data.map((d) => {
        const on = d.month.slice(0, 7) === sel;
        return (
          <Pressable key={d.month} onPress={() => onSel(d.month.slice(0, 7))} accessibilityRole="button" accessibilityLabel={tx('{short}: entró {fmtMoney}, salió {fmtMoney2}', { short: short(d.month), fmtMoney: fmtMoney(d.income), fmtMoney2: fmtMoney(d.expense) })}
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
  if (cur.expense > cur.income && cur.income > 0) out.push(tx('Este mes salió más de lo que entró ({fmtMoney} de diferencia). Revisá qué gasto fue extraordinario y si se puede repartir en varios meses.', { fmtMoney: fmtMoney(cur.expense - cur.income) }));
  if (ai && cur.income < ai * 0.8) out.push(tx('Los ingresos bajaron {round}% contra el promedio de los 3 meses anteriores ({fmtMoney}).', { round: Math.round((1 - cur.income / ai) * 100), fmtMoney: fmtMoney(ai) }));
  if (ai && cur.income > ai * 1.2) out.push(tx('Los ingresos subieron {round}% contra el promedio. Buen momento para separar algo para reserva o para Misiones.', { round: Math.round((cur.income / ai - 1) * 100) }));
  if (ae && cur.expense > ae * 1.25) out.push(tx('Los gastos subieron {round}% contra el promedio ({fmtMoney}).', { round: Math.round((cur.expense / ae - 1) * 100), fmtMoney: fmtMoney(ae) }));
  const outs = cats.filter((c) => c.direction === 'out');
  const totalOut = outs.reduce((a, c) => a + c.total, 0);
  const top = outs[0];
  if (top && totalOut && top.total / totalOut > 0.5 && outs.length > 1) out.push(tx('"{category}" fue {round}% de los gastos del mes.', { category: top.category, round: Math.round((top.total / totalOut) * 100) }));
  for (const b of balances) if (b.closing < 0) out.push(tx('El fondo {fund} quedó en negativo ({fmtMoney}). Hay que cubrirlo con un pase desde otro fondo o revisar si falta cargar un ingreso.', { fund: b.fund, fmtMoney: fmtMoney(b.closing) }));
  const gen = balances.find((b) => b.kind === 'general');
  if (gen && ae > 0 && gen.closing >= 0 && gen.closing < ae) out.push(tx(`El fondo General tiene menos de un mes de gastos de reserva. Una meta sana es tener al menos 2 o 3 meses.`));
  const mis = months.slice(Math.max(0, i - 2), i + 1);
  if (!out.length && mis.length) out.push(tx('Todo dentro de lo normal este mes.'));
  return out;
}

export default function FinInforme() {
  const shot = useRef<React.ComponentRef<typeof View>>(null);   // lo que se descarga como imagen (o se imprime en la web)
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
      tx('Finanzas · {name} · {monthTitle}', { name: church?.name ?? '', monthTitle: monthTitle(sel) }),
      '',
      tx('Entró: {fmtMoney}', { fmtMoney: fmtMoney(cur?.income ?? 0) }),
      tx('Salió: {fmtMoney}', { fmtMoney: fmtMoney(cur?.expense ?? 0) }),
      tx('Resultado: {fmtMoney}', { fmtMoney: fmtMoney(cur?.net ?? 0) }),
      '',
      'SALDOS AL CIERRE',
      ...bal.map((b) => `${b.fund}: ${fmtMoney(b.closing, b.currency)}`),
      '',
      tx('INGRESOS POR CATEGORÍA'),
      ...inCats.map((c) => `${c.category} (${c.fund}): ${fmtMoney(c.total)}`),
      '',
      tx('GASTOS POR CATEGORÍA'),
      ...outCats.map((c) => `${c.category} (${c.fund}): ${fmtMoney(c.total)}`),
      '',
      'PARA MIRAR',
      ...tips.map((t) => `• ${t}`),
    ];
    shareText(lines.join('\n'), tx('Informe de finanzas'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Informe de finanzas')} subtitle={monthTitle(sel)} back />
      <Screen>
        <View ref={shot} collapsable={false} style={{ gap: 16, backgroundColor: colors.bg, paddingVertical: 4 }}>
        <Segmented options={[{ value: '12', label: tx('Último año') }, { value: 'all', label: tx('Toda la historia') }]} value={range} onChange={setRange} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[[null, tx('Todos los fondos')] as [string | null, string], ...funds].map(([id, name]) => (
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
                <Text style={{ fontSize: 12, color: colors.greenText }}>{tx('■ Entró')}</Text>
                <Text style={{ fontSize: 12, color: colors.red }}>{tx('■ Salió')}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Tocá un mes para ver el detalle')}</Text>
              </View>
            </Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>{range === 'all' ? tx('Entró en total') : tx('Entró en el año')}</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.greenText }}>{fmtMoney(totIn)}</Text></Card>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>{range === 'all' ? tx('Salió en total') : tx('Salió en el año')}</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.red }}>{fmtMoney(totOut)}</Text></Card>
            </View>

            <SectionTitle>{monthTitle(sel)}</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>{tx('Entró##plata')}</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.greenText }}>{fmtMoney(cur?.income ?? 0)}</Text></Card>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>{tx('Salió##plata')}</Text><Text style={{ fontSize: 16, fontWeight: '800', color: colors.red }}>{fmtMoney(cur?.expense ?? 0)}</Text></Card>
              <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 11, color: colors.muted }}>{tx('Resultado')}</Text><Text style={{ fontSize: 16, fontWeight: '800', color: (cur?.net ?? 0) >= 0 ? colors.text : colors.red }}>{fmtMoney(cur?.net ?? 0)}</Text></Card>
            </View>

            <Card style={{ gap: 8, backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="info" size={16} color={colors.blueText} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.blueText }}>{tx('Para mirar')}</Text>
              </View>
              {tips.map((t, i) => <Text key={i} style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>• {t}</Text>)}
            </Card>

            {([[tx('Ingresos por categoría'), inCats, colors.greenText], [tx('Gastos por categoría'), outCats, colors.red]] as const).map(([t, list, color]) => list.length ? (
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

            <SectionTitle>{tx('Saldos al cierre de {monthTitle}', { monthTitle: monthTitle(sel).toLowerCase() })}</SectionTitle>
            <Card style={{ padding: 0 }}>
              {(fund ? bal.filter((b) => b.fund_id === fund) : bal).map((b, i, arr) => (
                <View key={b.fund_id} style={{ flexDirection: 'row', padding: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{b.fund}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: b.closing < 0 ? colors.red : colors.text }}>{fmtMoney(b.closing, b.currency)}</Text>
                </View>
              ))}
            </Card>
            <Button title={tx('Compartir el informe del mes')} icon="share-2" variant="outline" onPress={share} />
          </>
        )}
        </View>
        <Button title={tx('Descargar')} icon="download" variant="outline" onPress={() => downloadView(shot.current, `Informe de finanzas ${monthTitle(sel)}`).catch((e) => Alert.alert(tx('No se pudo descargar'), String((e as Error)?.message ?? e)))} />
        <Button title={tx('Descargar para Excel')} icon="file-text" variant="ghost" onPress={() => downloadText(`finanzas-${sel}.csv`, toCsv([tx('Tipo'), tx('Categoría'), tx('Fondo'), tx('Monto')], [
          ...inCats.map((c) => [tx('Ingreso'), c.category, c.fund, c.total]),
          ...outCats.map((c) => [tx('Gasto'), c.category, c.fund, c.total]),
          ...(fund ? bal.filter((b) => b.fund_id === fund) : bal).map((b) => [tx('Saldo al cierre'), '', b.fund, b.closing]),
        ])).catch((e) => Alert.alert(tx('No se pudo descargar'), String((e as Error)?.message ?? e)))} />
      </Screen>
    </View>
  );
}
