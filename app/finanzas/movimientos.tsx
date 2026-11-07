// Movimientos de un mes (de todos los fondos o de uno). Tocá uno para ver sus comprobantes, corregirlo o anularlo.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { finCategories, finEntries, finFunds } from '@/lib/api';
import { fmtDateShort, fmtMoney, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinCategory, FinEntry, FinFund } from '@/types';

export const monthTitle = (ym: string) => {
  const s = new Date(`${ym}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const shift = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function Movimientos() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fund?: string; month?: string }>();
  const { financeLevel } = useAuth();
  const [ym, setYm] = useState(params.month ?? isoDate(new Date()).slice(0, 7));
  const [fund, setFund] = useState<string | null>(params.fund ?? null);
  const [rows, setRows] = useState<FinEntry[] | null>(null);
  const [funds, setFunds] = useState<FinFund[]>([]);
  const [cats, setCats] = useState<FinCategory[]>([]);
  const [showVoid, setShowVoid] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    const [y, m] = ym.split('-').map(Number);
    const last = isoDate(new Date(y, m, 0));
    finEntries(`${ym}-01`, last, fund).then(setRows).catch(() => setRows([]));
    finFunds().then(setFunds).catch(() => undefined);
    finCategories().then(setCats).catch(() => undefined);
  }, [ym, fund]);
  useFocusEffect(load);

  const shown = useMemo(() => (rows ?? []).filter((r) => showVoid || !r.voided_at), [rows, showVoid]);
  const sign = (e: FinEntry) => (e.kind === 'income' ? 1 : e.kind === 'expense' ? -1 : e.to_fund_id === e.fund_id ? 0 : fund ? (e.to_fund_id === fund ? 1 : -1) : 0);
  const inSum = shown.filter((e) => !e.voided_at && sign(e) > 0).reduce((a, e) => a + e.amount, 0);
  const outSum = shown.filter((e) => !e.voided_at && sign(e) < 0).reduce((a, e) => a + e.amount, 0);
  const fname = (id: string | null) => funds.find((f) => f.id === id)?.name ?? '';
  const voided = (rows ?? []).filter((r) => r.voided_at).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={fund ? `Fondo ${fname(fund)}` : 'Movimientos'} subtitle={monthTitle(ym)} back />
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button title="" icon="chevron-left" variant="outline" small onPress={() => setYm(shift(ym, -1))} />
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.text }}>{monthTitle(ym)}</Text>
          <Button title="" icon="chevron-right" variant="outline" small onPress={() => setYm(shift(ym, 1))} disabled={ym >= isoDate(new Date()).slice(0, 7)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[{ id: null as string | null, name: 'Todos' }, ...funds].map((f) => (
            <Pressable key={f.id ?? 'all'} onPress={() => setFund(f.id)} accessibilityRole="button"
              style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: fund === f.id ? colors.green : colors.bgSoft }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: fund === f.id ? '#FFF' : colors.text }}>{f.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Card style={{ flex: 1, padding: 12, gap: 2 }}><Text style={{ fontSize: 12, color: colors.muted }}>Entró</Text><Text style={{ fontSize: 18, fontWeight: '800', color: colors.greenText }}>{fmtMoney(inSum)}</Text></Card>
          <Card style={{ flex: 1, padding: 12, gap: 2 }}><Text style={{ fontSize: 12, color: colors.muted }}>Salió</Text><Text style={{ fontSize: 18, fontWeight: '800', color: colors.red }}>{fmtMoney(outSum)}</Text></Card>
        </View>
        {financeLevel >= 2 ? <Button title="Cargar movimiento" icon="plus" onPress={() => router.push(`/finanzas/movimiento?kind=income${fund ? `&fund=${fund}` : ''}` as Href)} /> : null}

        {rows === null ? <Loading /> : !shown.length ? <Empty icon="inbox" title="No hay movimientos este mes" /> : null}
        {shown.map((e) => {
          const s = sign(e);
          const cat = cats.find((c) => c.id === e.category_id)?.name;
          const title = e.kind === 'transfer' ? (e.to_fund_id === e.fund_id ? `Banco ↔ caja · ${fname(e.fund_id)}` : `Pase ${fname(e.fund_id)} → ${fname(e.to_fund_id)}`) : cat ?? (e.kind === 'income' ? 'Ingreso' : 'Gasto');
          return (
            <Pressable key={e.id} onPress={() => router.push(`/finanzas/${e.id}` as Href)} accessibilityRole="button">
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, opacity: e.voided_at ? 0.5 : 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: e.kind === 'income' ? colors.greenSoft : e.kind === 'expense' ? colors.redSoft : colors.blueSoft }}>
                  <Feather name={e.kind === 'income' ? 'arrow-down-left' : e.kind === 'expense' ? 'arrow-up-right' : 'repeat'} size={17} color={e.kind === 'income' ? colors.greenText : e.kind === 'expense' ? colors.red : colors.blueText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, textDecorationLine: e.voided_at ? 'line-through' : 'none' }}>{title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                    {fmtDateShort(e.on_date)}{!fund && e.kind !== 'transfer' ? ` · ${fname(e.fund_id)}` : ''}{e.counterpart ? ` · ${e.counterpart}` : ''}{e.description ? ` · ${e.description}` : ''}{e.voided_at ? ' · ANULADO' : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: s > 0 ? colors.greenText : s < 0 ? colors.red : colors.text }}>
                  {s > 0 ? '+' : s < 0 ? '−' : ''}{fmtMoney(e.amount, e.currency)}
                </Text>
              </Card>
            </Pressable>
          );
        })}
        {voided ? <Button title={showVoid ? 'Ocultar anulados' : `Ver anulados (${voided})`} variant="ghost" small onPress={() => setShowVoid((v) => !v)} /> : null}
      </Screen>
    </View>
  );
}
