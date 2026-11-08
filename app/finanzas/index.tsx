// Finanzas de la iglesia (solo pastor, secretaría y roles de finanzas).
// Saldo de cada fondo, lo del mes, y accesos para cargar ingresos, gastos y pases entre fondos.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, SectionTitle } from '@/components/ui';
import { finAccountBalances, finBalances, saveFinFund } from '@/lib/api';
import { fmtMoney, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinAccountBalance, FinBalance } from '@/types';

type IconName = React.ComponentProps<typeof Feather>['name'];
export const FUND_ICON: Record<string, IconName> = { general: 'home', missions: 'globe', designated: 'tag', vehicle: 'truck', other: 'folder' };

function monthRange(d = new Date()): [string, string] {
  const a = new Date(d.getFullYear(), d.getMonth(), 1);
  const b = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [isoDate(a), isoDate(b)];
}

export default function Finanzas() {
  const router = useRouter();
  const { financeLevel } = useAuth();
  const [all, setAll] = useState<FinBalance[] | null>(null);
  const [month, setMonth] = useState<FinBalance[]>([]);
  const [newFund, setNewFund] = useState<string | null>(null);
  const [accts, setAccts] = useState<FinAccountBalance[]>([]);

  const load = useCallback(() => {
    const [a, b] = monthRange();
    finBalances().then(setAll).catch((e) => { Alert.alert('No se pudo', errorMessage(e)); setAll([]); });
    finBalances(a, b).then(setMonth).catch(() => undefined);
    finAccountBalances().then(setAccts).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  if (financeLevel < 1) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Finanzas" back />
        <Text style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>Solo el pastor, la secretaría y quienes tienen un rol de finanzas ven esta parte.</Text>
      </View>
    );
  }

  const ars = (x: { currency: string }) => x.currency !== 'USD';
  const mIn = month.filter(ars).reduce((a, f) => a + f.income, 0);
  const mOut = month.filter(ars).reduce((a, f) => a + f.expense, 0);
  // Fondo General: efectivo y banco por separado, y el total.
  const general = (all ?? []).find((f) => f.kind === 'general' && f.currency !== 'USD');
  const genAccounts = [...accts.filter((x) => general && x.fund_id === general.fund_id).reduce((m, x) => m.set(x.account, (m.get(x.account) ?? 0) + x.balance), new Map<string, number>()).entries()];
  const genTotal = general?.closing ?? genAccounts.reduce((a, [, v]) => a + v, 0);
  const monthName = new Date().toLocaleDateString('es-AR', { month: 'long' });

  const go = (to: string) => router.push(to as Href);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Finanzas" subtitle="Ofrendas, gastos y fondos" back />
      <Screen>
        {all === null ? <Loading /> : (
          <>
            {/* Arriba solo el fondo General (lo que de verdad se puede usar); cada fondo tiene su saldo abajo. */}
            <Card style={{ gap: 8, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>Fondo General</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[...genAccounts, ['Total', genTotal] as [string, number]].map(([n, v], i, arr) => (
                  <View key={n} style={{ flex: 1, gap: 2, paddingLeft: i ? 8 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.greenText }}>{n}</Text>
                    <Text style={{ fontSize: i === arr.length - 1 ? 20 : 17, fontWeight: '800', color: v < 0 ? colors.red : colors.text }} numberOfLines={1} adjustsFontSizeToFit>{fmtMoney(v)}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 13, color: colors.text }}>
                En {monthName} (todos los fondos): <Text style={{ color: colors.greenText, fontWeight: '800' }}>+{fmtMoney(mIn)}</Text> entró · <Text style={{ color: colors.red, fontWeight: '800' }}>−{fmtMoney(mOut)}</Text> salió
              </Text>
            </Card>

            {financeLevel >= 2 ? (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Ingreso" icon="plus-circle" onPress={() => go('/finanzas/movimiento?kind=income')} style={{ flex: 1 }} />
                  <Button title="Gasto" icon="minus-circle" variant="outline" onPress={() => go('/finanzas/movimiento?kind=expense')} style={{ flex: 1 }} />
                </View>
                <Button title="Pasar plata de un fondo a otro" icon="repeat" variant="outline" onPress={() => go('/finanzas/movimiento?kind=transfer')} />
              </>
            ) : null}

            <SectionTitle>Fondos</SectionTitle>
            {all.map((f) => {
              const m = month.find((x) => x.fund_id === f.fund_id);
              return (
                <Pressable key={f.fund_id} onPress={() => go(`/finanzas/movimientos?fund=${f.fund_id}`)} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={FUND_ICON[f.kind] ?? 'folder'} size={20} color={colors.green} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{f.fund}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        Este mes +{fmtMoney((m?.income ?? 0) + (m?.transfers_in ?? 0))} · −{fmtMoney((m?.expense ?? 0) + (m?.transfers_out ?? 0))}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: f.closing < 0 ? colors.red : colors.text }}>{fmtMoney(f.closing, f.currency)}</Text>
                  </Card>
                </Pressable>
              );
            })}
            {financeLevel >= 3 ? (
              newFund === null ? (
                <Button title="Agregar un fondo" icon="plus" variant="ghost" small onPress={() => setNewFund('')} />
              ) : (
                <Card style={{ gap: 8 }}>
                  <Field label="Nombre del fondo" value={newFund} onChangeText={setNewFund} placeholder="Construcción" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Cancelar" variant="ghost" small onPress={() => setNewFund(null)} style={{ flex: 1 }} />
                    <Button title="Crear" small disabled={!newFund.trim()} onPress={() => saveFinFund({ name: newFund.trim() }).then(() => { setNewFund(null); load(); }).catch((e) => Alert.alert('No se pudo', errorMessage(e)))} style={{ flex: 2 }} />
                  </View>
                </Card>
              )
            ) : null}

            <SectionTitle>Más</SectionTitle>
            <Card style={{ padding: 0 }}>
              {([
                ['list', 'Movimientos', 'Todo lo que entró y salió, mes por mes', '/finanzas/movimientos'],
                ['folder', 'Comprobantes', 'Fotos de recibos y del banco, en carpetas por mes', '/finanzas/comprobantes'],
                ['bar-chart-2', 'Informe', 'Por mes, por fondo y por categoría', '/finanzas/informe'],
                ['repeat', 'Pases automáticos', 'Cada mes, de un fondo a otro (ej. General → Vehículo)', '/finanzas/automaticos'],
                ...(financeLevel >= 3 ? [['sliders', 'Saldos iniciales', 'Con cuánto empezó cada fondo', '/finanzas/fondos']] : []),
              ] as [IconName, string, string, string][]).map(([icon, t, sub, to], i, arr) => (
                <Pressable key={t} onPress={() => go(to)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Feather name={icon} size={20} color={colors.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{t}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{sub}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </Card>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              Nada se borra: si algo se cargó mal, se anula con el motivo y queda en el historial. {financeLevel >= 4 ? 'Los roles de finanzas se dan en Administración → Hermanos.' : ''}
            </Text>
          </>
        )}
      </Screen>
    </View>
  );
}
