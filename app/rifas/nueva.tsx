// Armar una rifa: qué se rifa y entre quiénes (los que entraron al evento, los de una clase, los del colectivo…).
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Toggle } from '@/components/ui';
import { createRaffle, listClasses, listEvents } from '@/lib/api';
import { POOL_HINT, POOL_LABEL, needsClass, needsEvent, raffleProblem, type RafflePool } from '@/lib/raffle';
import { fmtDateShort, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchEvent, ClassRow } from '@/types';

const POOLS: RafflePool[] = ['event_checkins', 'event_registered', 'class', 'bus'];

export default function RifaNueva() {
  const { can } = useAuth();
  const { evento, fecha } = useLocalSearchParams<{ evento?: string; fecha?: string }>();
  const [title, setTitle] = useState('');
  const [prize, setPrize] = useState('');
  const [pool, setPool] = useState<RafflePool>(evento ? 'event_checkins' : 'bus');
  const [eventId, setEventId] = useState<string | null>(evento ?? null);
  const [classId, setClassId] = useState<string | null>(null);
  const [day, setDay] = useState(fecha ?? isoDate(new Date()));
  const [unique, setUnique] = useState(true);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listEvents().then((all) => {
      const from = isoDate(new Date(Date.now() - 45 * 864e5));
      setEvents(all.filter((e) => !e.weekly && isoDate(new Date(e.starts_at)) >= from).slice(-30));
    }).catch(() => undefined);
    listClasses().then(setClasses).catch(() => undefined);
  }, []);

  if (!can('cal.editar')) return <Empty icon="lock" title="Solo quien maneja el calendario" text="Pedile al pastor o a la secretaría que arme el sorteo." />;

  const save = async () => {
    const problem = raffleProblem({ title, pool, eventId, classId });
    if (problem) { Alert.alert('Falta algo', problem); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { Alert.alert('La fecha no sirve', 'Escribila así: 2026-07-18'); return; }
    setBusy(true);
    try {
      const id = await createRaffle({ title, prize: prize || null, pool, event_id: needsEvent(pool) ? eventId : null, class_id: needsClass(pool) ? classId : null, occurs_on: day, unique_winner: unique });
      router.replace(`/rifas/${id}` as Href);
    } catch (e) { Alert.alert('No se pudo crear', errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Nuevo sorteo" back />
      <Screen>
        <Card style={{ gap: 10 }}>
          <Field label="Nombre del sorteo" value={title} onChangeText={setTitle} placeholder="Sorteo de la noche del sábado" />
          <Field label="Qué se sortea" hint="(opcional)" value={prize} onChangeText={setPrize} placeholder="Una Biblia, una bicicleta, una pelota…" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>Entran los que…</Text>
          <Choice options={POOLS.map((p) => ({ value: p, label: POOL_LABEL[p] }))} value={pool} onChange={setPool} />
          <Text style={{ fontSize: 13, color: colors.muted }}>{POOL_HINT[pool]}</Text>
          {needsEvent(pool) ? (
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>Evento</Text>
              <Choice options={events.map((e) => ({ value: e.id, label: `${e.title} · ${fmtDateShort(e.starts_at)}` }))} value={eventId}
                onChange={(v) => { setEventId(v); const ev = events.find((e) => e.id === v); if (ev) setDay(isoDate(new Date(ev.starts_at))); }} />
            </>
          ) : null}
          {needsClass(pool) ? (
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>Clase</Text>
              <Choice options={classes.map((c) => ({ value: c.id, label: c.name }))} value={classId} onChange={setClassId} />
            </>
          ) : null}
          <Field label="Día" value={day} onChangeText={setDay} placeholder="2026-07-18" autoCorrect={false} />
          <Toggle label="Que no gane dos veces el mismo día" hint="Quien ya ganó otro sorteo ese día no entra a este." value={unique} onChange={setUnique} />
          <Button title="Crear el sorteo" icon="gift" onPress={save} loading={busy} />
        </Card>
      </Screen>
    </View>
  );
}
