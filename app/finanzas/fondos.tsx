// Saldo inicial de cada fondo: con cuánto empezó el día que se empezó a llevar en la app.
// (Lo de la planilla anterior se carga como movimientos; esto es solo el punto de partida.)
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, Toggle } from '@/components/ui';
import { finFunds, saveFinFund } from '@/lib/api';
import { fmtMoney, parseDateAR, parseMoney } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinFund } from '@/types';

function FundRow({ f, onSaved }: { f: FinFund; onSaved: () => void }) {
  const [amount, setAmount] = useState(f.opening_balance ? String(f.opening_balance).replace('.', ',') : '');
  const [date, setDate] = useState(f.opening_date ? f.opening_date.split('-').reverse().join('/') : '');
  const [desc, setDesc] = useState(f.description ?? '');
  const [active, setActive] = useState(f.active);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = amount.trim() ? parseMoney(amount.replace('-', '')) : 0;
    const d = date.trim() ? parseDateAR(date) : null;
    if (amount.trim() && v === null) { Alert.alert('Monto inválido'); return; }
    if (date.trim() && !d) { Alert.alert('Fecha inválida', 'Escribila así: 01/01/2026.'); return; }
    setBusy(true);
    try {
      await saveFinFund({ ...f, opening_balance: (amount.trim().startsWith('-') ? -1 : 1) * (v ?? 0), opening_date: d, description: desc.trim() || null, active });
      onSaved();
      Alert.alert('Guardado', f.name);
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{f.name}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Saldo inicial" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
        <Field label="Al día" value={date} onChangeText={setDate} placeholder="01/01/2026" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
      </View>
      {parseMoney(amount.replace('-', '')) ? <Text style={{ fontSize: 12, color: colors.muted }}>{amount.trim().startsWith('-') ? '−' : ''}{fmtMoney(parseMoney(amount.replace('-', '')))}</Text> : null}
      <Field label="Para qué es" value={desc} onChangeText={setDesc} multiline />
      <Toggle label="Fondo en uso" value={active} onChange={setActive} />
      <Button title="Guardar" small onPress={save} loading={busy} />
    </Card>
  );
}

export default function Fondos() {
  const { financeLevel } = useAuth();
  const [funds, setFunds] = useState<FinFund[] | null>(null);
  const load = useCallback(() => { finFunds().then(setFunds).catch(() => setFunds([])); }, []);
  useFocusEffect(load);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Fondos" subtitle="Saldo inicial y descripción" back />
      <Screen>
        {financeLevel < 3 ? <Text style={{ color: colors.muted }}>Solo el tesorero o el pastor.</Text> : funds === null ? <Loading /> : funds.map((f) => <FundRow key={f.id} f={f} onSaved={load} />)}
      </Screen>
    </View>
  );
}
