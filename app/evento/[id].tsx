// Página de un evento: foto, cuándo y dónde (con "Cómo llegar"), costo, transporte, qué llevar,
// programa, contacto, "Voy" e inscripción. Quien maneja el calendario ve los inscriptos y quién pagó.
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, SectionTitle, Tag, Toggle } from '@/components/ui';
import { EventImage } from '@/components/EventImage';
import { deleteEvent, deleteRegistration, eventRegistrationCount, eventRegistrations, getEvent, rsvpRows, saveRegistration, setRsvp } from '@/lib/api';
import { dayName, fmtDateShort, fmtMoney, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchEvent, EventRegistration } from '@/types';

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
  const staff = can('cal.editar');

  const on = fecha ?? (ev ? isoDate(new Date(ev.starts_at)) : '');

  const load = useCallback(() => {
    getEvent(id).then(async (e) => {
      setEv(e);
      if (!e) return;
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
        <Header title="Evento" back />
        <Text style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>Este evento ya no está en el calendario.</Text>
      </View>
    );
  }

  const start = new Date(ev.starts_at);
  const day = new Date(`${on}T12:00:00`);
  const endIso = ev.ends_at ? isoDate(new Date(ev.ends_at)) : null;
  const when = ev.weekly
    ? `Cada ${dayName(start.getDay())}${ev.all_day ? '' : ` a las ${hhmm(start)}`}`
    : `${cap(day.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))}${ev.all_day ? (endIso && endIso > on ? ` al ${fmtDateShort(endIso)}` : '') : ` · ${hhmm(start)}`}`;
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
    try { await setRsvp(ev.id, on, !going); load(); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); }
  };

  const openForm = () => setForm(mine
    ? { id: mine.id, name: mine.name, phone: mine.phone ?? '', people: String(mine.people), ride: mine.needs_ride, lodging: mine.needs_lodging, notes: mine.notes ?? '' }
    : { name: me?.name ?? profile?.display_name ?? '', phone: me?.phone ?? '', people: '1', ride: false, lodging: false, notes: '' });

  const submit = async () => {
    if (!form) return;
    const people = Math.max(1, Math.min(50, Number(form.people) || 1));
    if (!form.name.trim()) { Alert.alert('Falta el nombre'); return; }
    setBusy(true);
    try {
      await saveRegistration({ id: form.id, event_id: ev.id, occurs_on: on, name: form.name.trim(), phone: form.phone.trim() || null, people, needs_ride: form.ride, needs_lodging: form.lodging, notes: form.notes.trim() || null });
      if (!going) await setRsvp(ev.id, on, true).catch(() => undefined);
      setForm(null);
      load();
      Alert.alert('¡Listo!', form.id ? 'Se actualizó tu inscripción.' : 'Quedaste inscripto.');
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const markPaid = (r: EventRegistration) => {
    const full = (ev.reg_price ?? 0) * r.people;
    const paid = r.paid_amount >= full && full > 0;
    saveRegistration({ id: r.id, event_id: r.event_id, occurs_on: r.occurs_on, name: r.name, paid_amount: paid ? 0 : full || 1 })
      .then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e)));
  };

  const remove = () => Alert.alert('Borrar evento', ev.title, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar', style: 'destructive', onPress: () => deleteEvent(ev.id).then(() => router.back()) },
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
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText }}>CADA {dayName(start.getDay()).toUpperCase()}</Text>
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
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.green }}>{when}{ev.yearly ? ' · todos los años' : ''}</Text>
        </View>
        {ev.description ? <Text style={{ fontSize: 16, color: colors.text, lineHeight: 24 }}>{ev.description}</Text> : null}

        {!ev.weekly && !past ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={going ? 'Voy ✓' : 'Voy'} icon={going ? 'check-circle' : 'circle'} variant={going ? 'primary' : 'outline'} onPress={toggleGoing} style={{ flex: 1 }} />
            <Button title="Compartir" icon="share-2" variant="outline" onPress={share} style={{ flex: 1 }} />
          </View>
        ) : <Button title="Compartir" icon="share-2" variant="outline" onPress={share} />}
        {goingCount ? <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: -6 }}>{goingCount === 1 ? '1 persona va' : `${goingCount} personas van`}. Te recordamos la víspera.</Text> : null}

        <Card style={{ paddingVertical: 2 }}>
          {ev.place ? (
            <Row icon="map-pin" label="Dónde">
              <Text style={{ fontSize: 15, color: colors.text }}>{ev.place}</Text>
              <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.place}, Posadas, Misiones`)}`)} accessibilityRole="link">
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green, marginTop: 2 }}>Cómo llegar →</Text>
              </Pressable>
            </Row>
          ) : null}
          {ev.cost ? <Row icon="dollar-sign" label="Costo"><Text style={{ fontSize: 15, color: colors.text }}>{ev.cost}</Text></Row> : null}
          {ev.transport ? <Row icon="truck" label="Transporte"><Text style={{ fontSize: 15, color: colors.text }}>{ev.transport}</Text></Row> : null}
          {ev.bring ? <Row icon="shopping-bag" label="Qué llevar"><Text style={{ fontSize: 15, color: colors.text }}>{ev.bring}</Text></Row> : null}
          {program.length ? (
            <Row icon="list" label="Programa">
              {program.map((p, i) => <Text key={i} style={{ fontSize: 15, color: colors.text }}>• {p}</Text>)}
            </Row>
          ) : null}
          {ev.contact_name || ev.contact_phone ? (
            <Row icon="user" label="Consultas">
              <Text style={{ fontSize: 15, color: colors.text }}>{[ev.contact_name, ev.contact_phone].filter(Boolean).join(' · ')}</Text>
              {wa ? (
                <Pressable onPress={() => Linking.openURL(`https://wa.me/${wa.startsWith('54') ? wa : `549${wa}`}?text=${encodeURIComponent(`Hola, te escribo por ${ev.title}.`)}`)} accessibilityRole="link">
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green, marginTop: 2 }}>Escribir por WhatsApp →</Text>
                </Pressable>
              ) : null}
            </Row>
          ) : null}
          {!ev.place && !ev.cost && !ev.transport && !ev.bring && !program.length && !ev.contact_name && !ev.contact_phone ? (
            <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 12 }}>{staff ? 'Podés agregar lugar, costo, transporte, qué llevar y el programa con "Editar".' : 'No hay más detalles por ahora.'}</Text>
          ) : null}
        </Card>

        {ev.registration && !ev.weekly ? (
          <>
            <SectionTitle>Inscripción</SectionTitle>
            <Card style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, color: colors.text }}>
                {regCount} {regCount === 1 ? 'inscripto' : 'inscriptos'}{ev.reg_capacity ? ` de ${ev.reg_capacity} lugares` : ''}
                {ev.reg_price ? ` · ${fmtMoney(ev.reg_price)} por persona` : ''}
                {ev.reg_deadline ? ` · hasta el ${fmtDateShort(ev.reg_deadline)}` : ''}
              </Text>
              {mine && !form ? (
                <View style={{ gap: 6 }}>
                  <Tag text={`Estás inscripto${mine.people > 1 ? ` (${mine.people} personas)` : ''}`} tone="green" />
                  {ev.reg_price ? <Text style={{ fontSize: 13, color: colors.muted }}>{mine.paid_amount >= ev.reg_price * mine.people ? 'Pagado ✓' : `Falta pagar ${fmtMoney(ev.reg_price * mine.people - mine.paid_amount)}`}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Cambiar" variant="outline" small onPress={openForm} style={{ flex: 1 }} />
                    <Button title="Darme de baja" variant="ghost" small onPress={() => deleteRegistration(mine.id).then(load)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : null}
              {!mine && !form ? (
                past || closed ? <Text style={{ fontSize: 13, color: colors.muted }}>La inscripción está cerrada.</Text>
                  : full ? <Text style={{ fontSize: 13, color: colors.red }}>No quedan lugares.</Text>
                  : <Button title="Inscribirme" icon="edit-3" onPress={openForm} />
              ) : null}
              {form ? (
                <View style={{ gap: 10 }}>
                  <Field label="Nombre" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Field label="Teléfono" value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} keyboardType="phone-pad" style={{ flex: 1 }} />
                    <Field label="Cuántos van" value={form.people} onChangeText={(t) => setForm({ ...form, people: t.replace(/\D/g, '') })} keyboardType="number-pad" style={{ width: 110 }} />
                  </View>
                  {ev.reg_ask_ride ? <Toggle label="Necesito transporte" value={form.ride} onChange={(v) => setForm({ ...form, ride: v })} /> : null}
                  {ev.reg_ask_lodging ? <Toggle label="Necesito alojamiento" value={form.lodging} onChange={(v) => setForm({ ...form, lodging: v })} /> : null}
                  <Field label="Algo más" hint="(opcional)" value={form.notes} onChangeText={(t) => setForm({ ...form, notes: t })} multiline placeholder="Edades de los chicos, comida especial…" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Cancelar" variant="ghost" onPress={() => setForm(null)} style={{ flex: 1 }} />
                    <Button title={form.id ? 'Guardar' : 'Inscribirme'} onPress={submit} loading={busy} style={{ flex: 2 }} />
                  </View>
                </View>
              ) : null}
            </Card>

            {staff ? (
              <>
                <SectionTitle>Inscriptos</SectionTitle>
                <Card style={{ gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>
                    {totals.people} personas{ev.reg_ask_ride ? ` · ${totals.ride} con transporte` : ''}{ev.reg_ask_lodging ? ` · ${totals.lodging} con alojamiento` : ''}
                  </Text>
                  {ev.reg_price ? <Text style={{ fontSize: 13, color: colors.muted }}>Pagado {fmtMoney(totals.paid)} de {fmtMoney(totals.due)}</Text> : null}
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
                            <Text style={{ fontSize: 12, fontWeight: '800', color: paid ? '#FFF' : colors.text }}>{paid ? 'Pagó ✓' : 'Marcar pagó'}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                  {!regs.length ? <Text style={{ padding: 12, color: colors.muted }}>Todavía no se inscribió nadie.</Text> : null}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {staff ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Editar" icon="edit-2" variant="outline" onPress={() => router.push({ pathname: '/evento/editar', params: { id: ev.id } })} style={{ flex: 1 }} />
            <Button title="Borrar" icon="trash-2" variant="ghost" onPress={remove} style={{ flex: 1 }} />
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
