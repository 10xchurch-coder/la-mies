// Página de un evento: foto, cuándo y dónde (con "Cómo llegar"), costo, transporte, qué llevar,
// programa, contacto, "Voy" e inscripción. Quien maneja el calendario ve los inscriptos y quién pagó.
import { formatPhone, phoneProblem } from '@/lib/phone';
import { PhoneField, phoneInputValue } from '@/components/PhoneField';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, SectionTitle, Tag, Toggle } from '@/components/ui';
import { EventImage } from '@/components/EventImage';
import { canPlan, myShifts, type Shift } from '@/lib/eventPlan';
import { deleteEvent, deleteRegistration, eventRegistrationCount, eventRegistrations, getEvent, listCancellations, rsvpRows, saveRegistration, setRsvp } from '@/lib/api';
import { addDays, dayName, fmtDateShort, fmtDay, fmtMoney, fmtTime, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchEvent, EventRegistration } from '@/types';
import { tx, txLocale } from '@/lib/i18n';
import { IfOn } from '@/components/IfOn';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

function Row({ icon, label, children }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={16} color={colors.green} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

export default function Evento() {
  const router = useRouter();
  const { id, fecha } = useLocalSearchParams<{ id: string; fecha?: string }>();
  const { session, profile, me, can } = useAuth();
  const [ev, setEv] = useState<ChurchEvent | null | undefined>(undefined);
  const [going, setGoing] = useState(false);
  const [goingCount, setGoingCount] = useState(0);
  const [regs, setRegs] = useState<EventRegistration[]>([]);
  const [regCount, setRegCount] = useState(0);
  const [form, setForm] = useState<null | { id?: string; name: string; phone: string; people: string; ride: boolean; lodging: boolean; notes: string }>(null);
  const [busy, setBusy] = useState(false);
  // Fechas suspendidas de esta actividad semanal (de hoy en adelante).
  const [offDates, setOffDates] = useState<string[]>([]);
  const staff = can('cal.editar');
  // Los organizadores del evento (su equipo) también lo planifican, aunque no manejen el calendario.
  const [teamMember, setTeamMember] = useState(false);
  useEffect(() => { if (id) canPlan(id).then(setTeamMember).catch(() => undefined); }, [id]);
  // Mis turnos para servir en este evento (si me dieron alguno).
  const [shifts, setShifts] = useState<Shift[]>([]);
  useEffect(() => { if (id && session?.user.id) myShifts(id, session.user.id).then(setShifts).catch(() => undefined); }, [id, session?.user.id]);
  const mayPlan = staff || teamMember;

  const on = fecha ?? (ev ? isoDate(new Date(ev.starts_at)) : '');

  const load = useCallback(() => {
    getEvent(id).then(async (e) => {
      setEv(e);
      if (!e) return;
      if (e.weekly) {
        listCancellations(isoDate(new Date()), isoDate(addDays(new Date(), 60)))
          .then((cs) => setOffDates(cs.filter((c) => c.event_id === e.id).map((c) => c.on_date)));
      }
      const d = fecha ?? isoDate(new Date(e.starts_at));
      rsvpRows().then((rows) => {
        const mine = rows.filter((r) => r.event_id === e.id && r.occurs_on === d);
        setGoingCount(mine.length);
        setGoing(mine.some((r) => r.user_id === session?.user.id));
      }).catch(() => undefined);
      if (e.registration) {
        eventRegistrations(e.id, d).then(setRegs).catch(() => undefined);
        eventRegistrationCount(e.id, d).then(setRegCount).catch(() => undefined);
      }
    });
  }, [id, fecha, session?.user.id]);
  useFocusEffect(load);

  if (ev === undefined) return <Loading />;
  if (!ev) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Evento')} back />
        <Text style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>{tx('Este evento ya no está en el calendario.')}</Text>
      </View>
    );
  }

  const start = new Date(ev.starts_at);
  const day = new Date(`${on}T12:00:00`);
  const endIso = ev.ends_at ? isoDate(new Date(ev.ends_at)) : null;
  const when = ev.weekly
    ? tx('Cada {dayName}{v1}', { dayName: dayName(start.getDay()), v1: ev.all_day ? '' : tx(' a las {hhmm}', { hhmm: hhmm(start) }) })
    : `${cap(day.toLocaleDateString(txLocale(), { weekday: 'long', day: 'numeric', month: 'long' }))}${ev.all_day ? (endIso && endIso > on ? ` al ${fmtDateShort(endIso)}` : '') : ` · ${hhmm(start)}`}`;
  const program = (ev.program ?? '').split('\n').map((x) => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  const mine = regs.find((r) => r.user_id === session?.user.id);
  const past = on < isoDate(new Date());
  const closed = !!ev.reg_deadline && isoDate(new Date()) > ev.reg_deadline;
  const full = !!ev.reg_capacity && regCount >= ev.reg_capacity;
  const wa = ev.contact_phone ? ev.contact_phone.replace(/\D/g, '') : '';

  const share = () => {
    const lines = [`*${ev.title}*`, when, ev.place ? `📍 ${ev.place}` : '', ev.cost ? `💲 ${ev.cost}` : '', ev.transport ? `🚌 ${ev.transport}` : '', ev.description ?? ''].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => undefined);
  };

  const toggleGoing = async () => {
    try { await setRsvp(ev.id, on, !going); load(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); }
  };

  const openForm = () => setForm(mine
    ? { id: mine.id, name: mine.name, phone: phoneInputValue(mine.phone), people: String(mine.people), ride: mine.needs_ride, lodging: mine.needs_lodging, notes: mine.notes ?? '' }
    : { name: me?.name ?? profile?.display_name ?? '', phone: phoneInputValue(me?.phone), people: '1', ride: false, lodging: false, notes: '' });

  const submit = async () => {
    if (!form) return;
    const people = Math.max(1, Math.min(50, Number(form.people) || 1));
    if (!form.name.trim()) { Alert.alert(tx('Falta el nombre')); return; }
    const bad = phoneProblem(form.phone);
    if (bad) { Alert.alert(tx('Revisá el teléfono'), bad); return; }
    setBusy(true);
    try {
      await saveRegistration({ id: form.id, event_id: ev.id, occurs_on: on, name: form.name.trim(), phone: formatPhone(form.phone) || null, people, needs_ride: form.ride, needs_lodging: form.lodging, notes: form.notes.trim() || null });
      if (!going) await setRsvp(ev.id, on, true).catch(() => undefined);
      setForm(null);
      load();
      Alert.alert(tx('¡Listo!'), form.id ? tx('Se actualizó tu inscripción.') : tx('Quedaste inscripto.'));
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const markPaid = (r: EventRegistration) => {
    const full = (ev.reg_price ?? 0) * r.people;
    const paid = r.paid_amount >= full && full > 0;
    saveRegistration({ id: r.id, event_id: r.event_id, occurs_on: r.occurs_on, name: r.name, paid_amount: paid ? 0 : full || 1 })
      .then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
  };

  const remove = () => Alert.alert(tx('Borrar evento'), ev.title, [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Borrar'), style: 'destructive', onPress: () => deleteEvent(ev.id).then(() => router.back()) },
  ]);

  const totals = {
    people: regs.reduce((a, r) => a + r.people, 0),
    ride: regs.filter((r) => r.needs_ride).reduce((a, r) => a + r.people, 0),
    lodging: regs.filter((r) => r.needs_lodging).reduce((a, r) => a + r.people, 0),
    paid: regs.reduce((a, r) => a + Number(r.paid_amount || 0), 0),
    due: regs.reduce((a, r) => a + (ev.reg_price ?? 0) * r.people, 0),
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={ev.title} subtitle={when} back />
      <Screen>
        <EventImage ev={ev} width="100%" height={200} radius={16}>
          <View style={{ position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' }}>
            {ev.weekly ? (
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText }}>{tx('CADA')} {dayName(start.getDay()).toUpperCase()}</Text>
            ) : (
              <>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.greenText }}>{dayName(day.getDay()).slice(0, 3).toUpperCase()}</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: colors.green, lineHeight: 26 }}>{day.getDate()}</Text>
              </>
            )}
          </View>
        </EventImage>

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.3 }}>{ev.title}</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.green }}>{when}{ev.yearly ? tx(' · todos los años') : ''}</Text>
        </View>
        {ev.weekly && offDates.length ? (
          <Card style={{ gap: 4, backgroundColor: colors.amberSoft, borderColor: colors.amber }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.amberText }}>{tx('Se suspende')}</Text>
            <Text style={{ fontSize: 14, color: colors.text }}>{tx('No hay {title} el {map}.', { title: ev.title.toLowerCase(), map: offDates.map(fmtDateShort).join(', el ') })}</Text>
          </Card>
        ) : null}
        {ev.description ? <Text style={{ fontSize: 16, color: colors.text, lineHeight: 24 }}>{ev.description}</Text> : null}

        {!ev.weekly && !past ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={going ? tx('Voy ✓') : tx('Voy')} icon={going ? 'check-circle' : 'circle'} variant={going ? 'primary' : 'outline'} onPress={toggleGoing} style={{ flex: 1 }} />
            <Button title={tx('Compartir')} icon="share-2" variant="outline" onPress={share} style={{ flex: 1 }} />
          </View>
        ) : <Button title={tx('Compartir')} icon="share-2" variant="outline" onPress={share} />}
        {goingCount ? <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: -6 }}>{tx('{v1}. Te recordamos la víspera.', { v1: goingCount === 1 ? tx('1 persona va') : tx('{goingCount} personas van', { goingCount }) })}</Text> : null}

        <Card style={{ paddingVertical: 2 }}>
          {ev.place ? (
            <Row icon="map-pin" label={tx('Dónde')}>
              <Text style={{ fontSize: 15, color: colors.text }}>{ev.place}</Text>
              <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tx('{place}, Posadas, Misiones', { place: ev.place }))}`)} accessibilityRole="link">
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green, marginTop: 2 }}>{tx('Cómo llegar →')}</Text>
              </Pressable>
            </Row>
          ) : null}
          {ev.cost ? <Row icon="dollar-sign" label={tx('Costo')}><Text style={{ fontSize: 15, color: colors.text }}>{ev.cost}</Text></Row> : null}
          {ev.transport ? <Row icon="truck" label={tx('Transporte')}><Text style={{ fontSize: 15, color: colors.text }}>{ev.transport}</Text></Row> : null}
          {ev.bring ? <Row icon="shopping-bag" label={tx('Qué llevar')}><Text style={{ fontSize: 15, color: colors.text }}>{ev.bring}</Text></Row> : null}
          {program.length ? (
            <Row icon="list" label={tx('Programa')}>
              {program.map((p, i) => <Text key={i} style={{ fontSize: 15, color: colors.text }}>• {p}</Text>)}
            </Row>
          ) : null}
          {ev.contact_name || ev.contact_phone ? (
            <Row icon="user" label={tx('Consultas')}>
              <Text style={{ fontSize: 15, color: colors.text }}>{[ev.contact_name, ev.contact_phone].filter(Boolean).join(' · ')}</Text>
              {wa ? (
                <Pressable onPress={() => Linking.openURL(`https://wa.me/${wa.startsWith('54') ? wa : `549${wa}`}?text=${encodeURIComponent(tx('Hola, te escribo por {title}.', { title: ev.title }))}`)} accessibilityRole="link">
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green, marginTop: 2 }}>{tx('Escribir por WhatsApp →')}</Text>
                </Pressable>
              ) : null}
            </Row>
          ) : null}
          {!ev.place && !ev.cost && !ev.transport && !ev.bring && !program.length && !ev.contact_name && !ev.contact_phone ? (
            <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 12 }}>{staff ? tx('Podés agregar lugar, costo, transporte, qué llevar y el programa con "Editar".') : tx('No hay más detalles por ahora.')}</Text>
          ) : null}
        </Card>

        {shifts.length ? (
          <>
            <SectionTitle>{tx('Tus turnos para servir')}</SectionTitle>
            <Card style={{ gap: 10 }}>
              {shifts.map((x) => (
                <View key={x.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Feather name="user-check" size={18} color={colors.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{x.place}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{fmtDay(x.starts_at)} · {fmtTime(x.starts_at)}{x.ends_at ? ` a ${fmtTime(x.ends_at)}` : ''}{x.note ? ` · ${x.note}` : ''}</Text>
                  </View>
                </View>
              ))}
              <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Te va a llegar un aviso unas 2 horas antes de cada turno.')}</Text>
            </Card>
          </>
        ) : null}

        {ev.registration && !ev.weekly ? (
          <>
            <SectionTitle>{tx('Inscripción')}</SectionTitle>
            <Card style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, color: colors.text }}>
                {regCount} {regCount === 1 ? tx('inscripto') : tx('inscriptos')}{ev.reg_capacity ? tx(' de {reg_capacity} lugares', { reg_capacity: ev.reg_capacity }) : ''}
                {ev.reg_price ? tx(' · {fmtMoney} por persona', { fmtMoney: fmtMoney(ev.reg_price) }) : ''}
                {ev.reg_deadline ? tx(' · hasta el {fmtDateShort}', { fmtDateShort: fmtDateShort(ev.reg_deadline) }) : ''}
              </Text>
              {mine && !form ? (
                <View style={{ gap: 6 }}>
                  <Tag text={tx('Estás inscripto{v1}', { v1: mine.people > 1 ? tx(' ({people} personas)', { people: mine.people }) : '' })} tone="green" />
                  {ev.reg_price ? <Text style={{ fontSize: 13, color: colors.muted }}>{mine.paid_amount >= ev.reg_price * mine.people ? tx('Pagado ✓') : tx('Falta pagar {fmtMoney}', { fmtMoney: fmtMoney(ev.reg_price * mine.people - mine.paid_amount) })}</Text> : null}
                  <IfOn feature="evento_puerta"><Button title={tx('Mi entrada (QR)')} icon="tag" onPress={() => router.push({ pathname: '/evento/boleto', params: { id: ev.id, fecha: on } } as never)} /></IfOn>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={tx('Cambiar')} variant="outline" small onPress={openForm} style={{ flex: 1 }} />
                    <Button title={tx('Darme de baja')} variant="ghost" small onPress={() => deleteRegistration(mine.id).then(load)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : null}
              {!mine && !form ? (
                past || closed ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('La inscripción está cerrada.')}</Text>
                  : full ? <Text style={{ fontSize: 13, color: colors.red }}>{tx('No quedan lugares.')}</Text>
                  : <Button title={tx('Inscribirme')} icon="edit-3" onPress={openForm} />
              ) : null}
              {form ? (
                <View style={{ gap: 10 }}>
                  <Field label={tx('Nombre')} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <PhoneField label={tx('Teléfono')} value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} style={{ flex: 1 }} />
                    <Field label={tx('Cuántos van')} value={form.people} onChangeText={(t) => setForm({ ...form, people: t.replace(/\D/g, '') })} keyboardType="number-pad" style={{ width: 110 }} />
                  </View>
                  {ev.reg_ask_ride ? <Toggle label={tx('Necesito transporte')} value={form.ride} onChange={(v) => setForm({ ...form, ride: v })} /> : null}
                  {ev.reg_ask_lodging ? <Toggle label={tx('Necesito alojamiento')} value={form.lodging} onChange={(v) => setForm({ ...form, lodging: v })} /> : null}
                  <Field label={tx('Algo más')} hint={tx('(opcional)')} value={form.notes} onChangeText={(t) => setForm({ ...form, notes: t })} multiline placeholder={tx('Edades de los chicos, comida especial…')} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={tx('Cancelar')} variant="ghost" onPress={() => setForm(null)} style={{ flex: 1 }} />
                    <Button title={form.id ? tx('Guardar') : tx('Inscribirme')} onPress={submit} loading={busy} style={{ flex: 2 }} />
                  </View>
                </View>
              ) : null}
            </Card>

            {staff ? (
              <>
                <SectionTitle>{tx('Inscriptos')}</SectionTitle>
                <Card style={{ gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>
                    {totals.people} {tx('personas')}{ev.reg_ask_ride ? tx(' · {ride} con transporte', { ride: totals.ride }) : ''}{ev.reg_ask_lodging ? tx(' · {lodging} con alojamiento', { lodging: totals.lodging }) : ''}
                  </Text>
                  {ev.reg_price ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Pagado {fmtMoney} de {fmtMoney2}', { fmtMoney: fmtMoney(totals.paid), fmtMoney2: fmtMoney(totals.due) })}</Text> : null}
                </Card>
                <Card style={{ padding: 0 }}>
                  {regs.map((r, i) => {
                    const due = (ev.reg_price ?? 0) * r.people;
                    const paid = due > 0 ? r.paid_amount >= due : r.paid_amount > 0;
                    return (
                      <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.name}{r.people > 1 ? ` (+${r.people - 1})` : ''}</Text>
                          <Text style={{ fontSize: 12, color: colors.muted }}>{[r.phone, r.needs_ride ? 'transporte' : '', r.needs_lodging ? 'alojamiento' : '', r.notes].filter(Boolean).join(' · ')}</Text>
                        </View>
                        {ev.reg_price ? (
                          <Pressable onPress={() => markPaid(r)} accessibilityRole="button" style={{ height: 32, paddingHorizontal: 10, borderRadius: 16, justifyContent: 'center', backgroundColor: paid ? colors.green : colors.bg, borderWidth: 1, borderColor: paid ? colors.green : colors.border }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: paid ? '#FFF' : colors.text }}>{paid ? tx('Pagó ✓') : tx('Marcar pagó')}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                  {!regs.length ? <Text style={{ padding: 12, color: colors.muted }}>{tx('Todavía no se inscribió nadie.')}</Text> : null}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        <IfOn feature="asistencia">{staff && ev.weekly ? (
          <Button title={tx('Suspender una fecha / no hubo')} icon="slash" variant="outline" onPress={() => router.push({ pathname: '/suspender', params: { evento: ev.id } } as never)} />
        ) : null}</IfOn>
        <IfOn feature="evento_plan">{!ev.weekly && mayPlan ? (
          <Button title={tx('Planificar este evento')} icon="clipboard" onPress={() => router.push({ pathname: '/evento/plan', params: { id: ev.id } } as never)} />
        ) : null}</IfOn>
        <IfOn feature="evento_puerta">{!ev.weekly && (staff || mayPlan || can('personas.asistencia')) ? (
          <Button title={tx('Puerta: anotar y marcar entradas')} variant="outline" icon="log-in" onPress={() => router.push({ pathname: '/evento/puerta', params: { id: ev.id, fecha: on } } as never)} />
        ) : null}</IfOn>
        <IfOn feature="rifas">{!ev.weekly && staff ? (
          <Button title={tx('Hacer un sorteo de este evento')} icon="gift" variant="outline" onPress={() => router.push({ pathname: '/rifas/nueva', params: { evento: ev.id, fecha: on } } as never)} />
        ) : null}</IfOn>
        {staff ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={tx('Editar')} icon="edit-2" variant="outline" onPress={() => router.push({ pathname: '/evento/editar', params: { id: ev.id } })} style={{ flex: 1 }} />
            <Button title={tx('Borrar')} icon="trash-2" variant="ghost" onPress={remove} style={{ flex: 1 }} />
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
