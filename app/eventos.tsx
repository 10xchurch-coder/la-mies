// Calendario de la iglesia en dos partes:
// - "Cada semana": horarios de las reuniones y las actividades semanales, por día.
// - "Fechas especiales": lo que pasa una vez (Cena del Señor, juntas, campamentos), siempre con un año
//   por delante como mínimo (y hasta fin del año que viene). Los que se repiten cada año aparecen solos.
// "Voy" para anotarse (recordatorio la víspera). La secretaría y el pastor agregan y borran.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, Segmented, SectionTitle, Toggle } from '@/components/ui';
import { deleteEvent, listEvents, listServices, rsvpRows, saveEvent, setRsvp } from '@/lib/api';
import { addDays, dayName, fmtDateShort, isoDate, parseDateAR } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchEvent, ChurchService } from '@/types';

type Occ = { ev: ChurchEvent; date: string; start: Date };
type WeeklyItem = { key: string; dow: number; time: string; title: string; place: string | null; note: string | null; ev?: ChurchEvent; main?: boolean };

const TZ_OFFSET = '-03:00';
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Hasta dónde se muestran las fechas especiales: un año desde hoy, y como mínimo hasta fin del año que viene. */
function horizon(): string {
  const now = new Date();
  const yearOut = isoDate(addDays(now, 366));
  const endNext = `${now.getFullYear() + 1}-12-31`;
  return yearOut > endNext ? yearOut : endNext;
}

function special(events: ChurchEvent[]): Occ[] {
  const out: Occ[] = [];
  const today = isoDate(new Date());
  const until = horizon();
  for (const ev of events) {
    if (ev.weekly) continue;
    const start = new Date(ev.starts_at);
    const len = ev.ends_at ? Math.max(0, Math.round((new Date(ev.ends_at).getTime() - start.getTime()) / 86400000)) : 0;
    const years = ev.yearly ? Array.from({ length: 4 }, (_, i) => i) : [0];
    for (const y of years) {
      const d = new Date(start);
      d.setFullYear(start.getFullYear() + y);
      const s = isoDate(d);
      const e = isoDate(addDays(d, len));
      if (e >= today && s <= until) out.push({ ev, date: s < today ? today : s, start: d });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || hhmm(a.start).localeCompare(hhmm(b.start)));
}

function weeklyItems(services: ChurchService[], events: ChurchEvent[]): WeeklyItem[] {
  const items: WeeklyItem[] = services.map((s) => ({ key: `s-${s.id}`, dow: s.dow, time: s.time, title: s.name, place: null, note: null, main: s.main }));
  for (const ev of events.filter((e) => e.weekly)) {
    const d = new Date(ev.starts_at);
    items.push({ key: `e-${ev.id}`, dow: d.getDay(), time: ev.all_day ? '' : hhmm(d), title: ev.title, place: ev.place, note: ev.description, ev });
  }
  return items.sort((a, b) => WEEK_ORDER.indexOf(a.dow) - WEEK_ORDER.indexOf(b.dow) || a.time.localeCompare(b.time));
}

export default function Eventos() {
  const { isStaff, session } = useAuth();
  const [tab, setTab] = useState<'week' | 'special'>('week');
  const [events, setEvents] = useState<ChurchEvent[] | null>(null);
  const [services, setServices] = useState<ChurchService[]>([]);
  const [rsvps, setRsvps] = useState<{ event_id: string; occurs_on: string; user_id: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [dow, setDow] = useState<number>(5);
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [desc, setDesc] = useState('');
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listEvents().then(setEvents).catch(() => setEvents([]));
    listServices().then(setServices).catch(() => undefined);
    rsvpRows().then(setRsvps).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const week = useMemo(() => weeklyItems(services, events ?? []), [services, events]);
  const occ = useMemo(() => special(events ?? []), [events]);
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

  const remove = (ev: ChurchEvent) =>
    Alert.alert('Borrar', ev.title, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => deleteEvent(ev.id).then(load) }]);

  const add = async () => {
    const weekly = tab === 'week';
    const t = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim().padStart(5, '0') : null;
    let d: string | null;
    if (weekly) {
      // Próximo día de la semana elegido desde hoy.
      const today = new Date();
      d = isoDate(addDays(today, (dow - today.getDay() + 7) % 7));
      if (!t) { Alert.alert('Falta la hora', 'Poné la hora, por ejemplo 17:00.'); return; }
    } else {
      d = parseDateAR(date);
    }
    if (!title.trim() || !d) {
      Alert.alert('Faltan datos', weekly ? 'Poné el nombre.' : 'Poné el nombre y la fecha (por ejemplo 20/12/2026).');
      return;
    }
    setBusy(true);
    try {
      await saveEvent({ title: title.trim(), starts_at: `${d}T${t ?? '00:00'}:00${TZ_OFFSET}`, all_day: !t, place: place.trim() || null, description: desc.trim() || null, weekly, yearly: !weekly && yearly });
      setAdding(false);
      setTitle(''); setDate(''); setTime(''); setPlace(''); setDesc(''); setYearly(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Calendario" subtitle="Horarios y fechas de la iglesia" back />
      <Screen>
        <Segmented options={[{ value: 'week', label: 'Cada semana' }, { value: 'special', label: 'Fechas especiales' }]} value={tab} onChange={(v) => { setTab(v); setAdding(false); }} />

        {isStaff ? (
          adding ? (
            <Card style={{ gap: 10 }}>
              <Field label="Nombre" value={title} onChangeText={setTitle} placeholder={tab === 'week' ? 'Ganar almas' : 'Cena del Señor'} />
              {tab === 'week' ? (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Día</Text>
                  <Choice columns={4} options={WEEK_ORDER.map((d) => ({ value: String(d), label: dayName(d).slice(0, 3) }))} value={String(dow)} onChange={(v) => setDow(Number(v))} />
                  <Field label="Hora" value={time} onChangeText={setTime} placeholder="17:00" keyboardType="numbers-and-punctuation" />
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label="Fecha" value={date} onChangeText={setDate} placeholder="20/12/2026" style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
                  <Field label="Hora" hint="(opcional)" value={time} onChangeText={setTime} placeholder="19:30" style={{ width: 110 }} keyboardType="numbers-and-punctuation" />
                </View>
              )}
              <Field label="Lugar" hint="(opcional)" value={place} onChangeText={setPlace} />
              <Field label="Detalle" hint="(opcional)" value={desc} onChangeText={setDesc} multiline />
              {tab === 'special' ? <Toggle label="Se repite todos los años" hint="Aniversario, Día del Niño…" value={yearly} onChange={setYearly} /> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Cancelar" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <Button title="Guardar" onPress={add} loading={busy} style={{ flex: 2 }} />
              </View>
            </Card>
          ) : (
            <Button title={tab === 'week' ? 'Agregar actividad semanal' : 'Agregar fecha especial'} icon="plus" variant="outline" onPress={() => setAdding(true)} />
          )
        ) : null}

        {events === null ? <Loading /> : tab === 'week' ? (
          !week.length ? <Empty icon="clock" title="No hay horarios cargados" /> : (
            WEEK_ORDER.filter((d) => week.some((w) => w.dow === d)).map((d) => (
              <View key={d} style={{ gap: 8 }}>
                <SectionTitle>{dayName(d).charAt(0).toUpperCase() + dayName(d).slice(1)}</SectionTitle>
                <Card style={{ padding: 0 }}>
                  {week.filter((w) => w.dow === d).map((w, i, arr) => (
                    <View key={w.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                      <Text style={{ width: 52, fontSize: 16, fontWeight: '800', color: colors.green }}>{w.time || '—'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: w.main ? '800' : '700', color: colors.text }}>{w.title}</Text>
                        {w.place || w.note ? <Text style={{ fontSize: 12, color: colors.muted }}>{[w.place, w.note].filter(Boolean).join(' · ')}</Text> : null}
                      </View>
                      {isStaff && w.ev ? (
                        <Pressable onPress={() => remove(w.ev as ChurchEvent)} accessibilityLabel="Borrar" style={{ padding: 6 }}>
                          <Feather name="trash-2" size={16} color={colors.muted} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </Card>
              </View>
            ))
          )
        ) : (
          <>
            {!occ.length ? <Empty icon="calendar" title="No hay fechas especiales cargadas" /> : null}
            {months.map(([month, list]) => (
              <View key={month} style={{ gap: 8 }}>
                <SectionTitle>{month.charAt(0).toUpperCase() + month.slice(1)}</SectionTitle>
                {list.map((o) => {
                  const going = rsvps.some((r) => r.event_id === o.ev.id && r.occurs_on === o.date && r.user_id === session?.user.id);
                  const count = rsvps.filter((r) => r.event_id === o.ev.id && r.occurs_on === o.date).length;
                  const d = new Date(`${o.date}T12:00:00`);
                  const endIso = o.ev.ends_at ? isoDate(addDays(o.start, Math.round((new Date(o.ev.ends_at).getTime() - new Date(o.ev.starts_at).getTime()) / 86400000))) : null;
                  return (
                    <Card key={`${o.ev.id}-${o.date}`} style={{ flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' }}>
                      <View style={{ width: 52, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: colors.greenSoft }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.greenText }}>{dayName(d.getDay()).slice(0, 3).toUpperCase()}</Text>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.greenText }}>{d.getDate()}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{o.ev.title}</Text>
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {o.ev.all_day ? (endIso && endIso > o.date ? `Hasta el ${fmtDateShort(endIso)}` : 'Todo el día') : hhmm(o.start)}
                          {o.ev.place ? ` · ${o.ev.place}` : ''}{o.ev.yearly ? ' · todos los años' : ''}{count ? ` · ${count} van` : ''}
                        </Text>
                        {o.ev.description ? <Text style={{ fontSize: 12, color: colors.text }}>{o.ev.description}</Text> : null}
                      </View>
                      <Pressable onPress={() => toggle(o, !going)} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: going ? colors.green : colors.bgSoft }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: going ? '#FFF' : colors.text }}>{going ? 'Voy ✓' : 'Voy'}</Text>
                      </Pressable>
                      {isStaff ? (
                        <Pressable onPress={() => remove(o.ev)} accessibilityLabel="Borrar" style={{ padding: 6 }}>
                          <Feather name="trash-2" size={16} color={colors.muted} />
                        </Pressable>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            ))}
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Se muestra hasta {fmtDateShort(horizon())}.</Text>
          </>
        )}
      </Screen>
    </View>
  );
}
