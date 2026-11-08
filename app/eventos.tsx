// Calendario de la iglesia, todo en una página:
//  1. Cada semana: los horarios de las reuniones y actividades semanales.
//  2. Esta semana: las fechas especiales de esta semana, bien resaltadas.
//  3. Este mes: lo que queda del mes.
//  4. "Ver el calendario": la vista de calendario mes por mes, con las fechas hasta fin del año que viene.
// "Voy" para anotarse (recordatorio la víspera). La secretaría y el pastor agregan y borran.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { EventImage } from '@/components/EventImage';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Field, Loading, Segmented, SectionTitle, Toggle } from '@/components/ui';
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

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Lunes de la semana de una fecha. */
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

function MonthGrid({ ym, occ, sel, onSel }: { ym: { y: number; m: number }; occ: Occ[]; sel: string | null; onSel: (d: string) => void }) {
  const first = new Date(ym.y, ym.m, 1);
  const start = mondayOf(first);
  const today = isoDate(new Date());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDay = new Map<string, number>();
  for (const o of occ) byDay.set(o.date, (byDay.get(o.date) ?? 0) + 1);
  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: colors.muted, paddingVertical: 4 }}>{d}</Text>)}
      </View>
      {Array.from({ length: 6 }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {days.slice(w * 7, w * 7 + 7).map((d) => {
            const iso = isoDate(d);
            const inMonth = d.getMonth() === ym.m;
            const n = byDay.get(iso) ?? 0;
            const on = sel === iso;
            return (
              <Pressable key={iso} onPress={() => onSel(iso)} accessibilityRole="button" accessibilityLabel={`${d.getDate()} ${n ? `, ${n} actividades` : ''}`}
                style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: on ? colors.green : iso === today ? colors.greenSoft : 'transparent' }}>
                <Text style={{ fontSize: 15, fontWeight: n ? '800' : '500', color: on ? '#FFF' : inMonth ? colors.text : colors.border }}>{d.getDate()}</Text>
                {n ? <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: on ? '#FFF' : colors.amber }} /> : <View style={{ height: 8 }} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function Eventos() {
  const { can, session } = useAuth();
  const isStaff = can('cal.editar');
  const router = useRouter();
  const open = (ev: ChurchEvent, date?: string) => router.push({ pathname: '/evento/[id]', params: date ? { id: ev.id, fecha: date } : { id: ev.id } });
  const [events, setEvents] = useState<ChurchEvent[] | null>(null);
  const [services, setServices] = useState<ChurchService[]>([]);
  const [rsvps, setRsvps] = useState<{ event_id: string; occurs_on: string; user_id: string }[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [ym, setYm] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | 'week' | 'special'>(null);
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
  const now = new Date();
  const weekEnd = isoDate(addDays(mondayOf(now), 6));
  const monthEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const thisWeek = occ.filter((o) => o.date <= weekEnd);
  const thisMonth = occ.filter((o) => o.date > weekEnd && o.date <= monthEnd);
  const nextUp = occ.filter((o) => o.date > monthEnd).slice(0, 3);
  const todayDow = now.getDay();

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
    const weekly = adding === 'week';
    const t = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim().padStart(5, '0') : null;
    let d: string | null;
    if (weekly) {
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
      setAdding(null);
      setTitle(''); setDate(''); setTime(''); setPlace(''); setDesc(''); setYearly(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const EventCard = ({ o, big }: { o: Occ; big?: boolean }) => {
    const going = rsvps.some((r) => r.event_id === o.ev.id && r.occurs_on === o.date && r.user_id === session?.user.id);
    const count = rsvps.filter((r) => r.event_id === o.ev.id && r.occurs_on === o.date).length;
    const d = new Date(`${o.date}T12:00:00`);
    const endIso = o.ev.ends_at ? isoDate(addDays(o.start, Math.round((new Date(o.ev.ends_at).getTime() - new Date(o.ev.starts_at).getTime()) / 86400000))) : null;
    return (
      <Pressable onPress={() => open(o.ev, o.date)} accessibilityRole="button" accessibilityLabel={`${o.ev.title}, ver detalles`}>
      <Card style={[{ flexDirection: 'row', gap: 12, padding: 10, alignItems: 'center' }, big && { backgroundColor: colors.amberSoft, borderColor: colors.amber, borderWidth: 1.5 }]}>
        <EventImage ev={o.ev} width={big ? 84 : 68} height={big ? 84 : 68} radius={12}>
          <View style={{ position: 'absolute', left: 4, top: 4, backgroundColor: big ? colors.amber : 'rgba(255,255,255,0.95)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: big ? '#FFF' : colors.greenText }}>{dayName(d.getDay()).slice(0, 3).toUpperCase()}</Text>
            <Text style={{ fontSize: 15, fontWeight: '900', color: big ? '#FFF' : colors.green, lineHeight: 17 }}>{d.getDate()}</Text>
          </View>
        </EventImage>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: big ? 17 : 15, fontWeight: '800', color: colors.text }}>{o.ev.title}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {o.ev.all_day ? (endIso && endIso > o.date ? `Hasta el ${fmtDateShort(endIso)}` : 'Todo el día') : hhmm(o.start)}
            {o.ev.place ? ` · ${o.ev.place}` : ''}{o.ev.yearly ? ' · todos los años' : ''}{count ? ` · ${count} van` : ''}
          </Text>
          {o.ev.description ? <Text numberOfLines={2} style={{ fontSize: 12, color: colors.text }}>{o.ev.description}</Text> : null}
          {o.ev.registration ? <Text style={{ fontSize: 11, fontWeight: '800', color: colors.green }}>Con inscripción · tocá para anotarte</Text> : null}
        </View>
        <Pressable onPress={() => toggle(o, !going)} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: going ? colors.green : colors.bg, borderWidth: 1, borderColor: going ? colors.green : colors.border }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: going ? '#FFF' : colors.text }}>{going ? 'Voy ✓' : 'Voy'}</Text>
        </Pressable>
      </Card>
      </Pressable>
    );
  };

  const selList = sel ? occ.filter((o) => o.date === sel) : [];
  const selWeekly = sel ? week.filter((w) => w.dow === new Date(`${sel}T12:00:00`).getDay()) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Calendario" subtitle="Horarios y fechas de la iglesia" back />
      <Screen>
        {events === null ? <Loading /> : (
          <>
            <SectionTitle>Cada semana</SectionTitle>
            <Card style={{ padding: 0 }}>
              {WEEK_ORDER.filter((d) => week.some((w) => w.dow === d)).map((d, di, arr) => (
                <View key={d} style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomWidth: di < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border, backgroundColor: d === todayDow ? colors.greenSoft : 'transparent' }}>
                  <Text style={{ width: 74, fontSize: 13, fontWeight: '800', color: d === todayDow ? colors.greenText : colors.muted }}>{cap(dayName(d))}{d === todayDow ? '\nhoy' : ''}</Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    {week.filter((w) => w.dow === d).map((w) => (
                      <Pressable key={w.key} disabled={!w.ev} onPress={() => w.ev && open(w.ev)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ width: 44, fontSize: 14, fontWeight: '800', color: colors.green }}>{w.time || '—'}</Text>
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: w.main ? '800' : '600', color: colors.text }}>{w.title}{w.place ? <Text style={{ fontWeight: '400', color: colors.muted }}> · {w.place}</Text> : null}</Text>
                        {w.ev ? <Feather name="chevron-right" size={14} color={colors.muted} /> : null}
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              {!week.length ? <Text style={{ padding: 14, color: colors.muted }}>No hay horarios cargados.</Text> : null}
            </Card>

            <SectionTitle>Esta semana</SectionTitle>
            {thisWeek.length ? thisWeek.map((o) => <EventCard key={`${o.ev.id}-${o.date}`} o={o} big />) : <Text style={{ fontSize: 13, color: colors.muted }}>Esta semana no hay actividades especiales, solo las de siempre.</Text>}

            <SectionTitle>{`Lo que queda de ${MONTHS[now.getMonth()]}`}</SectionTitle>
            {thisMonth.length ? thisMonth.map((o) => <EventCard key={`${o.ev.id}-${o.date}`} o={o} />) : <Text style={{ fontSize: 13, color: colors.muted }}>No hay más fechas especiales este mes.</Text>}

            {nextUp.length ? (
              <>
                <SectionTitle>Lo que viene</SectionTitle>
                {nextUp.map((o) => <EventCard key={`${o.ev.id}-${o.date}`} o={o} />)}
              </>
            ) : null}

            <Button title={showGrid ? 'Ocultar el calendario' : 'Ver el calendario del año'} icon="calendar" variant={showGrid ? 'ghost' : 'outline'} onPress={() => { setShowGrid((v) => !v); setSel(null); }} />
            {showGrid ? (
              <Card style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable onPress={() => setYm((x) => (x.m === 0 ? { y: x.y - 1, m: 11 } : { y: x.y, m: x.m - 1 }))} hitSlop={10} accessibilityLabel="Mes anterior" style={{ padding: 6 }}>
                    <Feather name="chevron-left" size={22} color={colors.text} />
                  </Pressable>
                  <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text }}>{cap(MONTHS[ym.m])} {ym.y}</Text>
                  <Pressable onPress={() => setYm((x) => (x.m === 11 ? { y: x.y + 1, m: 0 } : { y: x.y, m: x.m + 1 }))} hitSlop={10} accessibilityLabel="Mes siguiente" style={{ padding: 6 }}>
                    <Feather name="chevron-right" size={22} color={colors.text} />
                  </Pressable>
                </View>
                <MonthGrid ym={ym} occ={occ} sel={sel} onSel={(d) => setSel(d === sel ? null : d)} />
                {sel ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{cap(new Date(`${sel}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))}</Text>
                    {selList.map((o) => <EventCard key={`${o.ev.id}-${o.date}`} o={o} />)}
                    {selWeekly.map((w) => <Text key={w.key} style={{ fontSize: 13, color: colors.muted }}>{w.time} · {w.title} (cada semana)</Text>)}
                    {!selList.length && !selWeekly.length ? <Text style={{ fontSize: 13, color: colors.muted }}>No hay nada ese día.</Text> : null}
                  </View>
                ) : <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Los días con punto naranja tienen una fecha especial. Tocá un día para verlo.</Text>}
              </Card>
            ) : null}

            {isStaff ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Fecha especial" icon="plus" variant="outline" onPress={() => router.push({ pathname: '/evento/editar', params: { tipo: 'special' } })} style={{ flex: 1 }} />
                <Button title="Cada semana" icon="plus" variant="outline" onPress={() => router.push({ pathname: '/evento/editar', params: { tipo: 'week' } })} style={{ flex: 1 }} />
              </View>
            ) : null}
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Tocá cualquier fecha para ver los detalles, anotarte o compartirla.</Text>
          </>
        )}
      </Screen>
    </View>
  );
}
