// Calendario de la iglesia: cultos especiales, reuniones, campamentos. "Voy" para anotarse (recordatorio la víspera).
// La secretaría y el pastor agregan y borran eventos.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Toggle } from '@/components/ui';
import { deleteEvent, listEvents, rsvpRows, saveEvent, setRsvp } from '@/lib/api';
import { addDays, dayName, fmtDateShort, isoDate, parseDateAR } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchEvent } from '@/types';

type Occ = { ev: ChurchEvent; date: string; start: Date };

const TZ_OFFSET = '-03:00';

function occurrences(events: ChurchEvent[], days = 120): Occ[] {
  const out: Occ[] = [];
  const today = isoDate(new Date());
  const until = isoDate(addDays(new Date(), days));
  for (const ev of events) {
    const start = new Date(ev.starts_at);
    if (ev.weekly) {
      let d = new Date(start);
      while (isoDate(d) < today) d = addDays(d, 7);
      for (let k = 0; k < 4 && isoDate(d) <= until; k++, d = addDays(d, 7)) out.push({ ev, date: isoDate(d), start: d });
    } else {
      const end = ev.ends_at ? isoDate(new Date(ev.ends_at)) : isoDate(start);
      if (end >= today && isoDate(start) <= until) out.push({ ev, date: isoDate(start) < today ? today : isoDate(start), start });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.getHours() - b.start.getHours());
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Eventos() {
  const { isStaff, session } = useAuth();
  const [events, setEvents] = useState<ChurchEvent[] | null>(null);
  const [rsvps, setRsvps] = useState<{ event_id: string; occurs_on: string; user_id: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [desc, setDesc] = useState('');
  const [weekly, setWeekly] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listEvents().then(setEvents).catch(() => setEvents([]));
    rsvpRows().then(setRsvps).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const occ = useMemo(() => occurrences(events ?? []), [events]);
  const months = useMemo(() => {
    const m = new Map<string, Occ[]>();
    for (const o of occ) {
      const k = new Date(`${o.date}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return [...m.entries()];
  }, [occ]);

  const toggle = async (o: Occ, going: boolean) => {
    try {
      await setRsvp(o.ev.id, o.date, going);
      load();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
  };

  const add = async () => {
    const d = parseDateAR(date);
    if (!title.trim() || !d) {
      Alert.alert('Faltan datos', 'Poné el nombre y la fecha (por ejemplo 20/12/2026).');
      return;
    }
    setBusy(true);
    try {
      const t = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim().padStart(5, '0') : null;
      await saveEvent({ title: title.trim(), starts_at: `${d}T${t ?? '00:00'}:00${TZ_OFFSET}`, all_day: !t, place: place.trim() || null, description: desc.trim() || null, weekly });
      setAdding(false);
      setTitle(''); setDate(''); setTime(''); setPlace(''); setDesc(''); setWeekly(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Eventos" subtitle="Lo que viene en la iglesia" back />
      <Screen>
        {isStaff ? (
          adding ? (
            <Card style={{ gap: 10 }}>
              <Field label="Nombre" value={title} onChangeText={setTitle} placeholder="Campamento de jóvenes" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="Fecha" value={date} onChangeText={setDate} placeholder="20/12/2026" style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
                <Field label="Hora" hint="(opcional)" value={time} onChangeText={setTime} placeholder="19:30" style={{ width: 110 }} keyboardType="numbers-and-punctuation" />
              </View>
              <Field label="Lugar" hint="(opcional)" value={place} onChangeText={setPlace} />
              <Field label="Detalle" hint="(opcional)" value={desc} onChangeText={setDesc} multiline />
              <Toggle label="Se repite cada semana" value={weekly} onChange={setWeekly} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Cancelar" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <Button title="Guardar" onPress={add} loading={busy} style={{ flex: 2 }} />
              </View>
            </Card>
          ) : (
            <Button title="Agregar evento" icon="plus" variant="outline" onPress={() => setAdding(true)} />
          )
        ) : null}
        {events === null ? <Loading /> : !occ.length ? <Empty icon="calendar" title="No hay eventos cargados" /> : null}
        {months.map(([month, list]) => (
          <View key={month} style={{ gap: 8 }}>
            <SectionTitle>{month.charAt(0).toUpperCase() + month.slice(1)}</SectionTitle>
            {list.map((o) => {
              const going = rsvps.some((r) => r.event_id === o.ev.id && r.occurs_on === o.date && r.user_id === session?.user.id);
              const count = rsvps.filter((r) => r.event_id === o.ev.id && r.occurs_on === o.date).length;
              const d = new Date(`${o.date}T12:00:00`);
              return (
                <Card key={`${o.ev.id}-${o.date}`} style={{ flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' }}>
                  <View style={{ width: 52, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: colors.greenSoft }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.greenText }}>{dayName(d.getDay()).slice(0, 3).toUpperCase()}</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.greenText }}>{d.getDate()}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{o.ev.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {o.ev.all_day ? (o.ev.ends_at && isoDate(new Date(o.ev.ends_at)) > o.date ? `Hasta el ${fmtDateShort(isoDate(new Date(o.ev.ends_at)))}` : 'Todo el día') : hhmm(o.start)}
                      {o.ev.place ? ` · ${o.ev.place}` : ''}{o.ev.weekly ? ' · todas las semanas' : ''}{count ? ` · ${count} van` : ''}
                    </Text>
                    {o.ev.description ? <Text style={{ fontSize: 12, color: colors.text }}>{o.ev.description}</Text> : null}
                  </View>
                  <Pressable onPress={() => toggle(o, !going)} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: going ? colors.green : colors.bgSoft }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: going ? '#FFF' : colors.text }}>{going ? 'Voy ✓' : 'Voy'}</Text>
                  </Pressable>
                  {isStaff ? (
                    <Pressable onPress={() => Alert.alert('Borrar evento', o.ev.title, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => deleteEvent(o.ev.id).then(load) }])} accessibilityLabel="Borrar" style={{ padding: 6 }}>
                      <Feather name="trash-2" size={16} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </Card>
              );
            })}
          </View>
        ))}
      </Screen>
    </View>
  );
}
