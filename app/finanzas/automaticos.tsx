// Pases automáticos entre fondos: por ejemplo, cada mes el día 1, $640.000 de General al fondo del Vehículo.
// El día elegido, a las 8, se carga solo y le llega un aviso a quien lo programó.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Toggle } from '@/components/ui';
import { finFunds, finRecurring, saveFinRecurring, type FinRecurring } from '@/lib/api';
import { fmtMoney, parseMoney } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinFund } from '@/types';

export default function Automaticos() {
  const { financeLevel } = useAuth();
  const [rows, setRows] = useState<FinRecurring[] | null>(null);
  const [funds, setFunds] = useState<FinFund[]>([]);
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('1');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    finRecurring().then(setRows).catch(() => setRows([]));
    finFunds().then((f) => {
      const act = f.filter((x) => x.active && x.currency !== 'USD');
      setFunds(act);
      setFrom((v) => v || act.find((x) => x.kind === 'general')?.id || '');
      setTo((v) => v || act.find((x) => x.kind === 'vehicle')?.id || '');
    }).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const fname = (id: string) => funds.find((f) => f.id === id)?.name ?? '';
  const pill = (on: boolean) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.greenSoft : colors.bg, justifyContent: 'center' as const });
  const pillText = (on: boolean) => ({ fontSize: 14, fontWeight: (on ? '800' : '600') as '800' | '600', color: on ? colors.greenText : colors.text });

  const save = async () => {
    const v = parseMoney(amount);
    const d = Number(day);
    if (!v) { Alert.alert('Falta el monto'); return; }
    if (!from || !to || from === to) { Alert.alert('Elegí de qué fondo sale y a cuál entra'); return; }
    if (!(d >= 1 && d <= 28)) { Alert.alert('Día del mes', 'Elegí un día del 1 al 28.'); return; }
    setBusy(true);
    try {
      await saveFinRecurring({ from_fund_id: from, to_fund_id: to, amount: v, day: d, description: desc.trim() || null });
      setAdding(false); setAmount(''); setDesc('');
      load();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Pases automáticos" subtitle="Se cargan solos cada mes" back />
      <Screen>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
          El día elegido de cada mes, a las 8 de la mañana, la app pasa el monto de un fondo al otro y te avisa. Para un pase de una sola vez, usá "Pasar entre fondos" en Finanzas.
        </Text>
        {rows === null ? <Loading /> : !rows.length && !adding ? <Empty icon="repeat" title="No hay pases automáticos" /> : null}
        {(rows ?? []).map((r) => (
          <Card key={r.id} style={{ gap: 6, padding: 12, opacity: r.active ? 1 : 0.55 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{fmtMoney(r.amount)} · el día {r.day} de cada mes</Text>
            <Text style={{ fontSize: 14, color: colors.text }}>{fname(r.from_fund_id)} → {fname(r.to_fund_id)}{r.description ? ` · ${r.description}` : ''}</Text>
            {financeLevel >= 3 ? <Toggle label={r.active ? 'Activo' : 'Pausado'} value={r.active} onChange={(v) => saveFinRecurring({ ...r, active: v }).then(load)} /> : null}
          </Card>
        ))}
        {financeLevel >= 3 ? (
          adding ? (
            <Card style={{ gap: 10 }}>
              <SectionTitle>Sale de</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {funds.map((f) => <Pressable key={f.id} onPress={() => setFrom(f.id)} style={pill(from === f.id)}><Text style={pillText(from === f.id)}>{f.name}</Text></Pressable>)}
              </View>
              <SectionTitle>Entra a</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {funds.filter((f) => f.id !== from).map((f) => <Pressable key={f.id} onPress={() => setTo(f.id)} style={pill(to === f.id)}><Text style={pillText(to === f.id)}>{f.name}</Text></Pressable>)}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="Monto" value={amount} onChangeText={setAmount} placeholder="640.000" keyboardType="decimal-pad" style={{ flex: 2 }} />
                <Field label="Día del mes" value={day} onChangeText={setDay} placeholder="1" keyboardType="number-pad" style={{ flex: 1 }} />
              </View>
              <Field label="Detalle (opcional)" value={desc} onChangeText={setDesc} placeholder="Cuota del vehículo" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Cancelar" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <Button title="Guardar" onPress={save} loading={busy} style={{ flex: 2 }} />
              </View>
            </Card>
          ) : (
            <Button title="Programar un pase mensual" icon="plus" onPress={() => setAdding(true)} />
          )
        ) : null}
      </Screen>
    </View>
  );
}
