// Orden del culto: la lista de los cultos armados. Los líderes arman y cambian; el que tiene una parte ve el suyo.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { DateChips } from '@/components/Picker';
import { Button, Card, Empty, Field, Loading, SectionTitle, Tag } from '@/components/ui';
import { listServices } from '@/lib/api';
import { createPlan, listPlans, pastPlans } from '@/lib/culto';
import { mainRoles, myParts, starterItems, titleFor, type ServicePlan } from '@/lib/servicePlan';
import { fmtDateShort, isoDate, upcomingDates } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Culto() {
  const router = useRouter();
  const { profile, isLeader } = useAuth();
  const [rows, setRows] = useState<ServicePlan[] | null>(null);
  const [old, setOld] = useState<ServicePlan[] | null>(null);
  const [dows, setDows] = useState<number[]>([6, 0]);
  const [making, setMaking] = useState(false);
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const today = isoDate(new Date());

  useFocusEffect(useCallback(() => {
    listPlans(isoDate(new Date())).then(setRows).catch(() => setRows([]));
    listServices().then((s) => { const d = [...new Set(s.map((x) => x.dow))]; if (d.length) setDows(d); }).catch(() => undefined);
  }, []));

  const dates = useMemo(() => upcomingDates(dows, 10), [dows]);
  const pick = (d: string) => { setDate(d); setTitle(titleFor(d)); };
  const start = () => { pick(dates[0] ?? today); setMaking(true); };

  const create = async () => {
    if (!date || title.trim().length < 2) return;
    setBusy(true);
    try {
      const id = await createPlan(date, title.trim(), starterItems());
      setMaking(false);
      router.push(`/culto/${id}` as Href);
    } catch (e) {
      Alert.alert(tx('No se pudo crear'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const row = (p: ServicePlan) => {
    const mine = myParts(p.items, profile?.id);
    const roles = mainRoles(p.items);
    return (
      <Pressable key={p.id} onPress={() => router.push(`/culto/${p.id}` as Href)} accessibilityRole="button">
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText }}>{fmtDateShort(p.service_date).toUpperCase()}{p.service_date === today ? tx(' · HOY') : ''}</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{p.title}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </View>
          {roles.map((r) => <Text key={r.label} style={{ fontSize: 13, color: colors.muted }}>{r.label}: <Text style={{ color: colors.text, fontWeight: '600' }}>{r.names.join(', ')}</Text></Text>)}
          {!roles.length ? <Text style={{ fontSize: 13, color: colors.muted }}>{p.items.length} {p.items.length === 1 ? tx('parte') : tx('partes')}</Text> : null}
          {mine.length ? <View style={{ flexDirection: 'row' }}><Tag text={tx('Te toca: {map}', { map: mine.map((x) => x.title).join(', ') })} tone="green" /></View> : null}
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Orden del culto')} subtitle={tx('Qué se hace y quién lo hace')} back />
      <Screen>
        {isLeader ? (
          making ? (
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('¿Qué día es el culto?')}</Text>
              <DateChips dates={dates} value={date} onChange={pick} format={fmtDateShort} />
              <Field label={tx('Nombre')} value={title} onChangeText={setTitle} placeholder={tx('Culto del domingo')} />
              <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Empieza con las partes de siempre. Después cambiás, sacás o agregás lo que quieras.')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={tx('Cancelar')} variant="ghost" onPress={() => setMaking(false)} style={{ flex: 1 }} />
                <Button title={tx('Crear')} onPress={create} loading={busy} disabled={title.trim().length < 2} style={{ flex: 2 }} />
              </View>
            </Card>
          ) : <Button title={tx('Armar un culto')} icon="plus" onPress={start} />
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="list" title={tx('No hay cultos armados')} text={isLeader ? tx('Tocá “Armar un culto” para empezar.') : tx('Cuando te den una parte en un culto, la vas a ver acá.')} />
        ) : rows.map(row)}
        {old === null ? (
          <Text onPress={() => pastPlans(today).then(setOld).catch(() => setOld([]))} style={{ fontSize: 13, fontWeight: '700', color: colors.green, textAlign: 'center', paddingVertical: 8 }}>{tx('Ver los cultos anteriores')}</Text>
        ) : (
          <>
            <SectionTitle>{tx('Anteriores')}</SectionTitle>
            {old.length ? old.map(row) : <Text style={{ fontSize: 13, color: colors.muted }}>{tx('No hay cultos anteriores.')}</Text>}
          </>
        )}
      </Screen>
    </View>
  );
}
