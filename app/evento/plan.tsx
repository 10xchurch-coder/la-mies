// Planificador de un evento: un tablero con todo lo que hay que preparar y, tocando cada parte, su pantalla.
// Entradas y precios · Programa · Oradores · Equipo y tareas · Turnos de voluntarios · Página pública · Transmisión · Avisos · Inscriptos.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, RowLink, SectionTitle, Segmented, Tag, Toggle } from '@/components/ui';
import { PickerModal } from '@/components/Picker';
import { listProfiles } from '@/lib/api';
import {
  atTime, cancelShift, planEvent, planRegs, planStats, postUpdate, publicUrl, removeRow, removeTeam, saveRow, saveShift, sessionCounts, sessions as loadSessions, setPaid, setPublic, setTeam,
  shifts as loadShifts, speakers as loadSpeakers, tasks as loadTasks, team as loadTeam, ticketTypes, updatePlanEvent, updates as loadUpdates, validPayUrl,
  type EventTask, type EventUpdate, type PlanEvent, type PlanReg, type PlanStats, type Session, type SessionCount, type Shift, type Speaker, type TeamRow, type TicketType,
} from '@/lib/eventPlan';
import { fmtDateAR, fmtDay, fmtMoney, fmtRelativeDay, fmtTime, isoDate, maskDateAR, parseDateAR, parseMoney } from '@/lib/format';
import { tryShareText } from '@/lib/share';
import { errorMessage } from '@/lib/supabase';
import { showCode } from '@/lib/ticket';
import { colors, toneOf, type Tone } from '@/theme';
import type { Profile } from '@/types';

type Section = 'entradas' | 'programa' | 'oradores' | 'equipo' | 'turnos' | 'pagina' | 'transmision' | 'avisos' | 'inscriptos';
const fail = (e: unknown) => Alert.alert('No se pudo', errorMessage(e));
const confirmDelete = (what: string, go: () => void) => Alert.alert('Borrar', `¿Borrar ${what}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }]);

export default function Plan() {
  const { id, s } = useLocalSearchParams<{ id: string; s?: Section }>();
  const [ev, setEv] = useState<PlanEvent | null | undefined>(undefined);
  const load = useCallback(() => { planEvent(id).then(setEv).catch(() => setEv((o) => o ?? null)); }, [id]);
  useFocusEffect(load);
  if (ev === undefined) return <Loading />;
  if (!ev) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Planificar" back /><Empty icon="calendar" title="No encontré ese evento" /></View>;
  const body = !s ? <Hub ev={ev} /> : s === 'entradas' ? <Entradas ev={ev} /> : s === 'programa' ? <Programa ev={ev} /> : s === 'oradores' ? <Oradores ev={ev} />
    : s === 'equipo' ? <Equipo ev={ev} /> : s === 'turnos' ? <Turnos ev={ev} /> : s === 'pagina' ? <Pagina ev={ev} reload={load} /> : s === 'transmision' ? <Transmision ev={ev} reload={load} />
    : s === 'avisos' ? <Avisos ev={ev} /> : <Inscriptos ev={ev} />;
  const TITLE: Record<Section, string> = { entradas: 'Entradas y precios', programa: 'Programa', oradores: 'Oradores', equipo: 'Equipo y tareas', turnos: 'Turnos de voluntarios', pagina: 'Página pública', transmision: 'Transmisión y grabaciones', avisos: 'Avisos a los inscriptos', inscriptos: 'Inscriptos' };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={s ? TITLE[s] : 'Planificar el evento'} subtitle={`${ev.title} · ${fmtDay(ev.starts_at)}`} back />
      <Screen>{body}</Screen>
    </View>
  );
}

// ---------- El tablero ----------
function Hub({ ev }: { ev: PlanEvent }) {
  const router = useRouter();
  const [st, setSt] = useState<PlanStats | null>(null);
  const [n, setN] = useState({ types: 0, sessions: 0, speakers: 0, team: 0, open: 0, updates: 0, shifts: 0, atSessions: 0 });
  useFocusEffect(useCallback(() => {
    planStats(ev.id).then(setSt).catch(() => undefined);
    Promise.all([ticketTypes(ev.id), loadSessions(ev.id), loadSpeakers(ev.id), loadTeam(ev.id), loadTasks(ev.id), loadUpdates(ev.id), loadShifts(ev.id).catch(() => []), sessionCounts(ev.id).catch(() => [])])
      .then(([t, se, sp, tm, tk, up, sh, sc]) => setN({ types: t.length, sessions: se.length, speakers: sp.length, team: tm.filter((x) => x.kind !== 'volunteer').length, open: tk.filter((x) => !x.done).length, updates: up.length,
        shifts: sh.length, atSessions: sc.reduce((a, x) => a + x.people, 0) }))
      .catch(() => undefined);
  }, [ev.id]));
  const go = (s?: Section) => router.push({ pathname: '/evento/plan', params: s ? { id: ev.id, s } : { id: ev.id } } as unknown as Href);
  const on = isoDate(new Date(ev.starts_at));
  const tile = (icon: React.ComponentProps<typeof Feather>['name'], tone: Tone, title: string, sub: string, onPress: () => void, done?: boolean) => {
    const c = toneOf(tone);
    return (
      <Pressable key={title} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }, pressed && { opacity: 0.85 }]}>
        <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.soft }}><Feather name={icon} size={21} color={c.solid} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{title}</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>{sub}</Text>
        </View>
        {done ? <Feather name="check-circle" size={18} color={colors.green} /> : <Feather name="chevron-right" size={18} color={colors.gray} />}
      </Pressable>
    );
  };
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['Inscriptos', st?.people ?? 0, 'blue'], ['Ya entraron', st?.checked_in ?? 0, 'green'], ['Cobrado', fmtMoney(st?.paid ?? 0), 'amber']] as const).map(([label, value, tone]) => (
          <View key={label} style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: toneOf(tone).soft, gap: 2 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: toneOf(tone).text }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: toneOf(tone).text }}>{label}</Text>
          </View>
        ))}
      </View>
      {st && st.expected > 0 ? <Text style={{ fontSize: 13, color: colors.muted }}>Falta cobrar {fmtMoney(Math.max(st.expected - st.paid, 0))} de {fmtMoney(st.expected)}.</Text> : null}

      <SectionTitle>Preparar</SectionTitle>
      {tile('edit-2', 'green', 'Datos del evento', 'Nombre, fecha, lugar, descripción, qué llevar, cupo', () => router.push({ pathname: '/evento/editar', params: { id: ev.id } } as unknown as Href), true)}
      {tile('tag', 'amber', 'Entradas y precios', n.types ? plural(n.types, 'tipo de entrada', 'tipos de entrada') : 'General, VIP, niños… cada una con su precio y su cupo', () => go('entradas'), n.types > 0)}
      {tile('clock', 'blue', 'Programa', n.sessions ? plural(n.sessions, 'momento cargado', 'momentos cargados') : 'Qué pasa a cada hora, dónde y quién habla', () => go('programa'), n.sessions > 0)}
      {tile('mic', 'violet', 'Oradores', n.speakers ? plural(n.speakers, 'orador', 'oradores') : 'Quiénes hablan y unas líneas de cada uno', () => go('oradores'), n.speakers > 0)}
      {tile('users', 'teal', 'Equipo y tareas', `${plural(n.team, 'organizador', 'organizadores')} · ${plural(n.open, 'tarea pendiente', 'tareas pendientes')}`, () => go('equipo'), n.team > 0 && n.open === 0)}
      {tile('user-check', 'green', 'Turnos de voluntarios', n.shifts ? plural(n.shifts, 'turno cargado', 'turnos cargados') : 'Quién sirve, dónde y a qué hora. Les llega un recordatorio', () => go('turnos'), n.shifts > 0)}

      <SectionTitle>Publicar</SectionTitle>
      {tile('globe', 'pink', 'Página pública', ev.public_page ? 'Publicada: cualquiera con el enlace ve el evento y se inscribe' : 'Un enlace para ver el evento e inscribirse, sin la app', () => go('pagina'), ev.public_page)}
      {tile('video', 'violet', 'Transmisión y grabaciones', ev.stream_url || ev.recordings.length ? 'Cargadas' : 'El en vivo y los videos, para todos o solo para inscriptos', () => go('transmision'), !!ev.stream_url || ev.recordings.length > 0)}
      {tile('bell', 'amber', 'Avisos a los inscriptos', n.updates ? plural(n.updates, 'aviso enviado', 'avisos enviados') : 'Cambios de horario, recordatorios, novedades', () => go('avisos'))}

      <SectionTitle>El día del evento</SectionTitle>
      {tile('list', 'blue', 'Inscriptos', st ? `${plural(st.registrations, 'inscripción', 'inscripciones')} · ${st.web} por la página · ${st.door} en la puerta` : 'Buscar, ver quién pagó y quién entró', () => go('inscriptos'))}
      {tile('log-in', 'green', 'Puerta', 'Escanear entradas, anotar a los que llegan sin inscribirse', () => router.push({ pathname: '/evento/puerta', params: { id: ev.id, fecha: on } } as unknown as Href))}
      {tile('monitor', 'teal', 'Contador en vivo', 'Cuántos hay adentro ahora y por cada entrada. Para una pantalla grande', () => router.push({ pathname: '/evento/contador', params: { id: ev.id, fecha: on } } as unknown as Href))}
      {n.sessions ? tile('check-square', 'violet', 'Asistencia al programa', n.atSessions ? `${plural(n.atSessions, 'persona anotada', 'personas anotadas')} en talleres y sesiones` : 'Leer la credencial en cada taller para saber quién fue', () => router.push({ pathname: '/evento/sesion', params: { id: ev.id } } as unknown as Href)) : null}
      {tile('award', 'pink', 'Sorteo', 'Sortear premios entre los que están presentes', () => router.push({ pathname: '/rifas/nueva', params: { evento: ev.id, fecha: on } } as unknown as Href))}
    </>
  );
}

/** Lista con formulario para agregar o cambiar: lo usan Entradas, Oradores y Programa. */
function useRows<T>(loader: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const load = useCallback(() => { loader().then(setRows).catch(() => setRows((o) => o ?? [])); }, [loader]);
  useEffect(load, [load]);
  return { rows, load };
}

// ---------- Entradas ----------
function Entradas({ ev }: { ev: PlanEvent }) {
  const loader = useCallback(() => ticketTypes(ev.id), [ev.id]);
  const { rows, load } = useRows<TicketType>(loader);
  const [f, setF] = useState<{ id?: string; name: string; price: string; capacity: string; description: string; pay: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f || !f.name.trim()) return Alert.alert('Ponele un nombre a la entrada');
    const price = f.price.trim() ? parseMoney(f.price) : 0;
    if (price === null) return Alert.alert('Revisá el precio');
    const cap = f.capacity.trim() ? Number(f.capacity.replace(/\D/g, '')) : null;
    if (f.pay.trim() && !validPayUrl(f.pay)) return Alert.alert('Revisá el enlace de pago', 'Pegá el enlace completo. Tiene que empezar con https://');
    setBusy(true);
    try {
      await saveRow('event_ticket_types', { id: f.id, event_id: ev.id, name: f.name.trim(), price, capacity: cap, description: f.description.trim() || null, pay_url: f.pay.trim() || null, sort: f.id ? undefined : (rows?.length ?? 0) });
      setF(null); load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Cada tipo de entrada tiene su precio y su cupo. Si el evento es gratis y con un solo tipo, no hace falta cargar nada acá.</Text>
      {rows === null ? <Loading /> : rows.map((t) => (
        <Card key={t.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{t.name}</Text>
            <Tag text={Number(t.price) > 0 ? fmtMoney(t.price) : 'Gratis'} tone={Number(t.price) > 0 ? 'amber' : 'green'} />
          </View>
          <Text style={{ fontSize: 13, color: colors.muted }}>{t.capacity === null ? 'Sin límite de lugares' : `${t.capacity} lugares`}{t.description ? ` · ${t.description}` : ''}</Text>
          {t.pay_url ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.blueText }} numberOfLines={1}>Con botón “Pagar”: {t.pay_url}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cambiar" variant="outline" small style={{ flex: 1 }} onPress={() => setF({ id: t.id, name: t.name, price: Number(t.price) ? String(t.price) : '', capacity: t.capacity === null ? '' : String(t.capacity), description: t.description ?? '', pay: t.pay_url ?? '' })} />
            <Button title="Borrar" variant="ghost" small style={{ flex: 1 }} onPress={() => confirmDelete(`la entrada “${t.name}”`, () => removeRow('event_ticket_types', t.id).then(load).catch(fail))} />
          </View>
        </Card>
      ))}
      {f ? (
        <Card style={{ gap: 12 }}>
          <Field label="Nombre" value={f.name} onChangeText={(name) => setF({ ...f, name })} placeholder="General, VIP, Niños…" maxLength={60} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Precio" hint="(vacío = gratis)" value={f.price} onChangeText={(price) => setF({ ...f, price })} keyboardType="numeric" style={{ flex: 1 }} />
            <Field label="Lugares" hint="(vacío = sin límite)" value={f.capacity} onChangeText={(capacity) => setF({ ...f, capacity })} keyboardType="number-pad" style={{ flex: 1 }} />
          </View>
          <Field label="Qué incluye" hint="(opcional)" value={f.description} onChangeText={(description) => setF({ ...f, description })} maxLength={300} />
          {/* Enlace de pago: la iglesia pega acá el enlace que le da su cuenta (por ejemplo un "link de pago" de Mercado Pago).
              La app NO cobra ni confirma sola: la página pública muestra el botón "Pagar" y alguien del equipo marca "pagó" en Inscriptos.
              Cuando haya confirmación automática (ver la nota en la migración 0076), este campo no cambia. */}
          <Field label="Link de pago" hint="(opcional: pegá el enlace de Mercado Pago de esta entrada)" value={f.pay} onChangeText={(pay) => setF({ ...f, pay })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://mpago.la/…" maxLength={500} />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>En la página del evento aparece el botón “Pagar” que abre ese enlace. Cuando veas el pago, marcá “pagó” en Inscriptos.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cancelar" variant="ghost" style={{ flex: 1 }} onPress={() => setF(null)} />
            <Button title="Guardar" style={{ flex: 2 }} loading={busy} onPress={save} />
          </View>
        </Card>
      ) : <Button title="Agregar un tipo de entrada" icon="plus" onPress={() => setF({ name: '', price: '', capacity: '', description: '', pay: '' })} />}
    </>
  );
}

// ---------- Oradores ----------
function Oradores({ ev }: { ev: PlanEvent }) {
  const loader = useCallback(() => loadSpeakers(ev.id), [ev.id]);
  const { rows, load } = useRows<Speaker>(loader);
  const [f, setF] = useState<{ id?: string; name: string; role: string; bio: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f || f.name.trim().length < 2) return Alert.alert('Escribí el nombre');
    setBusy(true);
    try {
      await saveRow('event_speakers', { id: f.id, event_id: ev.id, name: f.name.trim(), role: f.role.trim() || null, bio: f.bio.trim() || null, sort: f.id ? undefined : (rows?.length ?? 0) });
      setF(null); load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <>
      {rows === null ? <Loading /> : !rows.length && !f ? <Empty icon="mic" title="Todavía no hay oradores" text="Agregá a quienes hablan. Después los elegís en cada momento del programa." /> : null}
      {(rows ?? []).map((p) => (
        <Card key={p.id} style={{ gap: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{p.name}</Text>
          {p.role ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.violetText }}>{p.role}</Text> : null}
          {p.bio ? <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{p.bio}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cambiar" variant="outline" small style={{ flex: 1 }} onPress={() => setF({ id: p.id, name: p.name, role: p.role ?? '', bio: p.bio ?? '' })} />
            <Button title="Borrar" variant="ghost" small style={{ flex: 1 }} onPress={() => confirmDelete(`a ${p.name}`, () => removeRow('event_speakers', p.id).then(load).catch(fail))} />
          </View>
        </Card>
      ))}
      {f ? (
        <Card style={{ gap: 12 }}>
          <Field label="Nombre" value={f.name} onChangeText={(name) => setF({ ...f, name })} maxLength={120} />
          <Field label="Quién es" hint="(pastor de…, evangelista, misionero…)" value={f.role} onChangeText={(role) => setF({ ...f, role })} maxLength={160} />
          <Field label="Unas líneas sobre él" hint="(opcional)" value={f.bio} onChangeText={(bio) => setF({ ...f, bio })} multiline maxLength={2000} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cancelar" variant="ghost" style={{ flex: 1 }} onPress={() => setF(null)} />
            <Button title="Guardar" style={{ flex: 2 }} loading={busy} onPress={save} />
          </View>
        </Card>
      ) : <Button title="Agregar un orador" icon="plus" onPress={() => setF({ name: '', role: '', bio: '' })} />}
    </>
  );
}

// ---------- Programa ----------
function Programa({ ev }: { ev: PlanEvent }) {
  const loader = useCallback(() => loadSessions(ev.id), [ev.id]);
  const { rows, load } = useRows<Session>(loader);
  const [sp, setSp] = useState<Speaker[]>([]);
  const [went, setWent] = useState<SessionCount[]>([]);
  const router = useRouter();
  useEffect(() => { loadSpeakers(ev.id).then(setSp).catch(() => undefined); }, [ev.id]);
  useFocusEffect(useCallback(() => { sessionCounts(ev.id).then(setWent).catch(() => undefined); }, [ev.id]));
  const day0 = fmtDateAR(isoDate(new Date(ev.starts_at)));
  const [f, setF] = useState<{ id?: string; day: string; from: string; to: string; title: string; place: string; speaker: string | null; description: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const hm = (iso: string | null) => (iso ? fmtTime(iso) : '');
  const save = async () => {
    if (!f || !f.title.trim()) return Alert.alert('Escribí qué pasa en ese momento');
    const day = parseDateAR(f.day, true);
    if (!day) return Alert.alert('Revisá el día', 'Escribilo como 18/01/2027.');
    const start = atTime(day, f.from);
    if (!start) return Alert.alert('Revisá la hora de inicio', 'Escribila como 19:30.');
    const end = f.to.trim() ? atTime(day, f.to) : null;
    if (f.to.trim() && !end) return Alert.alert('Revisá la hora de fin', 'Escribila como 21:00.');
    setBusy(true);
    try {
      await saveRow('event_sessions', { id: f.id, event_id: ev.id, starts_at: start, ends_at: end, title: f.title.trim(), place: f.place.trim() || null, speaker_id: f.speaker, description: f.description.trim() || null });
      setF(null); load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  let last = '';
  return (
    <>
      {rows?.length ? <Button title="Tomar asistencia en un taller o sesión" icon="check-square" variant="outline" small onPress={() => router.push({ pathname: '/evento/sesion', params: { id: ev.id } } as unknown as Href)} /> : null}
      {rows === null ? <Loading /> : !rows.length && !f ? <Empty icon="clock" title="El programa está vacío" text="Cargá cada momento con su hora: recepción, alabanza, predicación, almuerzo…" /> : null}
      {(rows ?? []).map((x) => {
        const d = fmtDay(x.starts_at);
        const head = d !== last ? <SectionTitle key={`d-${x.id}`}>{d}</SectionTitle> : null;
        last = d;
        return (
          <React.Fragment key={x.id}>
            {head}
            <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar ${x.title}`} onPress={() => setF({ id: x.id, day: fmtDateAR(isoDate(new Date(x.starts_at))), from: hm(x.starts_at), to: hm(x.ends_at), title: x.title, place: x.place ?? '', speaker: x.speaker_id, description: x.description ?? '' })}>
              <Card style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 58 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: colors.blueText }}>{hm(x.starts_at)}</Text>
                  {x.ends_at ? <Text style={{ fontSize: 12, color: colors.muted }}>a {hm(x.ends_at)}</Text> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{x.title}</Text>
                  {x.speaker_id ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.violetText }}>{sp.find((p) => p.id === x.speaker_id)?.name ?? ''}</Text> : null}
                  {x.place ? <Text style={{ fontSize: 13, color: colors.muted }}>{x.place}</Text> : null}
                  {x.description ? <Text style={{ fontSize: 13, color: colors.text }}>{x.description}</Text> : null}
                  {went.find((w) => w.session_id === x.id) ? <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>Fueron {went.find((w) => w.session_id === x.id)?.people} personas</Text> : null}
                </View>
                <Feather name="edit-2" size={15} color={colors.gray} />
              </Card>
            </Pressable>
          </React.Fragment>
        );
      })}
      {f ? (
        <Card style={{ gap: 12 }}>
          <Field label="Qué pasa" value={f.title} onChangeText={(title) => setF({ ...f, title })} placeholder="Predicación, almuerzo, taller…" maxLength={160} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Día" value={f.day} onChangeText={(t) => setF({ ...f, day: maskDateAR(t, f.day) })} keyboardType="number-pad" style={{ flex: 1.3 }} />
            <Field label="Empieza" value={f.from} onChangeText={(from) => setF({ ...f, from })} placeholder="19:30" style={{ flex: 1 }} />
            <Field label="Termina" value={f.to} onChangeText={(to) => setF({ ...f, to })} placeholder="21:00" style={{ flex: 1 }} />
          </View>
          <Field label="Lugar" hint="(salón, carpa, cancha…)" value={f.place} onChangeText={(place) => setF({ ...f, place })} maxLength={160} />
          <Button title={f.speaker ? `Orador: ${sp.find((p) => p.id === f.speaker)?.name ?? ''}` : 'Elegir el orador'} icon="mic" variant="outline" small onPress={() => (sp.length ? setPicking(true) : Alert.alert('Primero cargá los oradores', 'Volvé al tablero y entrá a Oradores.'))} />
          <Field label="Detalle" hint="(opcional)" value={f.description} onChangeText={(description) => setF({ ...f, description })} multiline maxLength={2000} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {f.id ? <Button title="Borrar" variant="ghost" style={{ flex: 1 }} onPress={() => confirmDelete('este momento del programa', () => removeRow('event_sessions', f.id as string).then(() => { setF(null); load(); }).catch(fail))} /> : <Button title="Cancelar" variant="ghost" style={{ flex: 1 }} onPress={() => setF(null)} />}
            <Button title="Guardar" style={{ flex: 2 }} loading={busy} onPress={save} />
          </View>
        </Card>
      ) : <Button title="Agregar al programa" icon="plus" onPress={() => setF({ day: rows?.length ? fmtDateAR(isoDate(new Date(rows[rows.length - 1].starts_at))) : day0, from: '', to: '', title: '', place: '', speaker: null, description: '' })} />}
      <PickerModal visible={picking} title="¿Quién habla?" items={sp.map((p) => ({ id: p.id, title: p.name, subtitle: p.role ?? undefined }))} allowNone noneLabel="Sin orador"
        onClose={() => setPicking(false)} onPick={(pid) => { setPicking(false); if (f) setF({ ...f, speaker: pid }); }} />
    </>
  );
}

// ---------- Equipo y tareas ----------
function Equipo({ ev }: { ev: PlanEvent }) {
  const [tm, setTm] = useState<TeamRow[] | null>(null);
  const [tk, setTk] = useState<EventTask[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [picking, setPicking] = useState<null | 'team' | { task: string }>(null);
  const [title, setTitle] = useState('');
  const load = useCallback(() => {
    loadTeam(ev.id).then(setTm).catch(() => setTm((o) => o ?? []));
    loadTasks(ev.id).then(setTk).catch(() => setTk((o) => o ?? []));
  }, [ev.id]);
  useEffect(() => { load(); listProfiles().then(setPeople).catch(() => undefined); }, [load]);
  const nameOf = (pid: string | null) => people.find((p) => p.id === pid)?.display_name ?? 'Alguien';
  const addTask = () => {
    if (!title.trim()) return;
    saveRow('event_tasks', { event_id: ev.id, title: title.trim() }).then(() => { setTitle(''); load(); }).catch(fail);
  };
  const open = (tk ?? []).filter((t) => !t.done), done = (tk ?? []).filter((t) => t.done);
  const org = (tm ?? []).filter((t) => t.kind !== 'volunteer');      // los voluntarios de los turnos no son organizadores
  return (
    <>
      <SectionTitle>Organizadores</SectionTitle>
      <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Los organizadores pueden cambiar el evento, cargar el programa y ver los inscriptos, aunque no manejen el calendario.</Text>
      <Card style={{ padding: 0 }}>
        {tm === null ? <Loading /> : !org.length ? <Text style={{ padding: 14, color: colors.muted }}>Todavía no agregaste a nadie.</Text> : org.map((t) => (
          <RowLink key={t.profile_id} icon="user" title={nameOf(t.profile_id)} subtitle={`${t.role ?? 'Organizador'} · tocá para quitarlo`} onPress={() => confirmDelete(`a ${nameOf(t.profile_id)} del equipo`, () => removeTeam(ev.id, t.profile_id).then(load).catch(fail))} />
        ))}
      </Card>
      <Button title="Agregar un organizador" icon="user-plus" variant="outline" onPress={() => setPicking('team')} />

      <SectionTitle>Tareas</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Nueva tarea" value={title} onChangeText={setTitle} placeholder="Alquilar sillas, sonido, comida…" maxLength={200} onSubmitEditing={addTask} returnKeyType="done" style={{ flex: 1 }} />
        <Button title="Agregar" onPress={addTask} disabled={!title.trim()} />
      </View>
      {tk === null ? <Loading /> : [...open, ...done].map((t) => (
        <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, opacity: t.done ? 0.6 : 1 }}>
          <Pressable onPress={() => saveRow('event_tasks', { id: t.id, event_id: ev.id, done: !t.done }).then(load).catch(fail)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} accessibilityLabel={t.title}>
            <Feather name={t.done ? 'check-square' : 'square'} size={24} color={t.done ? colors.green : colors.muted} />
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => setPicking({ task: t.id })} accessibilityRole="button" accessibilityLabel={`Elegir quién hace ${t.title}`}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.title}</Text>
            <Text style={{ fontSize: 12, color: t.assignee_id ? colors.tealText : colors.muted }}>{t.assignee_id ? `La hace ${nameOf(t.assignee_id)}` : 'Tocá para elegir quién la hace'}</Text>
          </Pressable>
          <Pressable onPress={() => confirmDelete('esta tarea', () => removeRow('event_tasks', t.id).then(load).catch(fail))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Borrar ${t.title}`}>
            <Feather name="trash-2" size={18} color={colors.muted} />
          </Pressable>
        </Card>
      ))}
      <PickerModal visible={!!picking} title={picking === 'team' ? 'Elegí al organizador' : '¿Quién la hace?'} allowNone={picking !== 'team'} noneLabel="Nadie por ahora"
        items={people.filter((p) => picking !== 'team' || !org.some((t) => t.profile_id === p.id)).map((p) => ({ id: p.id, title: p.display_name }))}
        onClose={() => setPicking(null)}
        onPick={(pid) => {
          const what = picking; setPicking(null);
          if (what === 'team') { if (pid) setTeam(ev.id, pid, null).then(load).catch(fail); }
          else if (what) saveRow('event_tasks', { id: what.task, event_id: ev.id, assignee_id: pid }).then(load).catch(fail);
        }} />
    </>
  );
}

// ---------- Turnos de voluntarios ----------
function Turnos({ ev }: { ev: PlanEvent }) {
  const loader = useCallback(() => loadShifts(ev.id), [ev.id]);
  const { rows, load } = useRows<Shift>(loader);
  const [people, setPeople] = useState<Profile[]>([]);
  useEffect(() => { listProfiles().then(setPeople).catch(() => undefined); }, []);
  const day0 = fmtDateAR(isoDate(new Date(ev.starts_at)));
  const [f, setF] = useState<{ id?: string; who: string | null; place: string; day: string; from: string; to: string; note: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameOf = (pid: string | null) => people.find((p) => p.id === pid)?.display_name ?? 'Alguien';
  const save = async () => {
    if (!f) return;
    if (!f.who) return Alert.alert('Elegí quién sirve');
    if (!f.place.trim()) return Alert.alert('Escribí dónde sirve', 'Por ejemplo: Puerta, Estacionamiento, Cocina.');
    const day = parseDateAR(f.day, true);
    if (!day) return Alert.alert('Revisá el día', 'Escribilo como 18/01/2027.');
    const start = atTime(day, f.from);
    if (!start) return Alert.alert('Revisá la hora de inicio', 'Escribila como 18:00.');
    const end = f.to.trim() ? atTime(day, f.to) : null;
    if (f.to.trim() && !end) return Alert.alert('Revisá la hora de fin', 'Escribila como 21:00.');
    setBusy(true);
    try {
      await saveShift({ id: f.id, event_id: ev.id, profile_id: f.who, place: f.place.trim(), starts_at: start, ends_at: end, note: f.note.trim() || null });
      setF(null); load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  let last = '';
  return (
    <>
      <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Cargá quién sirve, dónde y a qué hora. A cada uno le llega un aviso cuando le das el turno y otro unas 2 horas antes de empezar. Los voluntarios no pueden cambiar el evento.</Text>
      {rows === null ? <Loading /> : !rows.length && !f ? <Empty icon="user-check" title="Todavía no hay turnos" text="Puerta, estacionamiento, cocina, niños, sonido…" /> : null}
      {(rows ?? []).map((x) => {
        const d = fmtDay(x.starts_at);
        const head = d !== last ? <SectionTitle key={`d-${x.id}`}>{d}</SectionTitle> : null;
        last = d;
        return (
          <React.Fragment key={x.id}>
            {head}
            <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar el turno de ${nameOf(x.profile_id)}`} onPress={() => setF({ id: x.id, who: x.profile_id, place: x.place, day: fmtDateAR(isoDate(new Date(x.starts_at))), from: fmtTime(x.starts_at), to: x.ends_at ? fmtTime(x.ends_at) : '', note: x.note ?? '' })}>
              <Card style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 58 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: colors.greenText }}>{fmtTime(x.starts_at)}</Text>
                  {x.ends_at ? <Text style={{ fontSize: 12, color: colors.muted }}>a {fmtTime(x.ends_at)}</Text> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{nameOf(x.profile_id)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.tealText }}>{x.place}</Text>
                  {x.note ? <Text style={{ fontSize: 13, color: colors.text }}>{x.note}</Text> : null}
                </View>
                <Feather name="edit-2" size={15} color={colors.gray} />
              </Card>
            </Pressable>
          </React.Fragment>
        );
      })}
      {f ? (
        <Card style={{ gap: 12 }}>
          <Button title={f.who ? `Sirve: ${nameOf(f.who)}` : 'Elegir quién sirve'} icon="user" variant="outline" small onPress={() => setPicking(true)} />
          <Field label="Dónde sirve" value={f.place} onChangeText={(place) => setF({ ...f, place })} placeholder="Puerta, estacionamiento, cocina…" maxLength={80} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Día" value={f.day} onChangeText={(t) => setF({ ...f, day: maskDateAR(t, f.day) })} keyboardType="number-pad" style={{ flex: 1.3 }} />
            <Field label="Empieza" value={f.from} onChangeText={(from) => setF({ ...f, from })} placeholder="18:00" style={{ flex: 1 }} />
            <Field label="Termina" value={f.to} onChangeText={(to) => setF({ ...f, to })} placeholder="21:00" style={{ flex: 1 }} />
          </View>
          <Field label="Nota" hint="(opcional: qué llevar, con quién hablar…)" value={f.note} onChangeText={(note) => setF({ ...f, note })} maxLength={300} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {f.id ? <Button title="Quitar" variant="ghost" style={{ flex: 1 }} onPress={() => confirmDelete('este turno', () => cancelShift(f.id as string).then(() => { setF(null); load(); }).catch(fail))} /> : <Button title="Cancelar" variant="ghost" style={{ flex: 1 }} onPress={() => setF(null)} />}
            <Button title="Guardar" style={{ flex: 2 }} loading={busy} onPress={save} />
          </View>
        </Card>
      ) : <Button title="Agregar un turno" icon="plus" onPress={() => setF({ who: null, place: rows?.length ? rows[rows.length - 1].place : '', day: rows?.length ? fmtDateAR(isoDate(new Date(rows[rows.length - 1].starts_at))) : day0, from: '', to: '', note: '' })} />}
      <PickerModal visible={picking} title="¿Quién sirve?" items={people.map((p) => ({ id: p.id, title: p.display_name }))}
        onClose={() => setPicking(false)} onPick={(pid) => { setPicking(false); if (f && pid) setF({ ...f, who: pid }); }} />
    </>
  );
}

// ---------- Página pública ----------
function Pagina({ ev, reload }: { ev: PlanEvent; reload: () => void }) {
  const [pay, setPay] = useState(ev.pay_info ?? '');
  const [faq, setFaq] = useState(ev.faq ?? '');
  const [payUrl, setPayUrl] = useState(ev.pay_url ?? '');
  const [busy, setBusy] = useState(false);
  const url = ev.slug ? publicUrl(ev.slug) : null;
  const toggle = (on: boolean) => setPublic(ev.id, on).then(reload).catch(fail);
  const save = () => {
    if (payUrl.trim() && !validPayUrl(payUrl)) return Alert.alert('Revisá el enlace de pago', 'Pegá el enlace completo. Tiene que empezar con https://');
    setBusy(true); updatePlanEvent(ev.id, { pay_info: pay.trim() || null, faq: faq.trim() || null, pay_url: payUrl.trim() || null }).then(() => { reload(); Alert.alert('Guardado'); }).catch(fail).finally(() => setBusy(false)); };
  return (
    <>
      <Card style={{ paddingVertical: 4 }}>
        <Toggle label="Publicar la página del evento" hint="Cualquiera con el enlace ve el evento, el programa y los oradores, y se inscribe. No hace falta la app ni tener cuenta." value={ev.public_page} onChange={toggle} />
      </Card>
      {ev.public_page && url ? (
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ padding: 12, backgroundColor: '#FFF', borderRadius: 14 }}><QRCode value={url} size={170} backgroundColor="#FFF" color="#000" /></View>
          <Text selectable style={{ fontSize: 14, fontWeight: '700', color: colors.pinkText, textAlign: 'center' }}>{url}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
            <Button title="Copiar" icon="copy" variant="outline" small style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(url).then(() => Alert.alert('Enlace copiado'))} />
            <Button title="Compartir" icon="share-2" small style={{ flex: 1 }} onPress={() => tryShareText(`${ev.title}\nTodos los datos e inscripción: ${url}`, ev.title).then((r) => { if (r === 'failed') Clipboard.setStringAsync(url).then(() => Alert.alert('Enlace copiado')); })} />
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>El código QR sirve para carteles y volantes: lo escanean y se inscriben.</Text>
        </Card>
      ) : null}
      <Field label="Cómo se paga" hint="(alias o CBU, a nombre de quién, a quién mandar el comprobante)" value={pay} onChangeText={setPay} multiline maxLength={1000} />
      <Field label="Link de pago" hint="(opcional: un enlace de Mercado Pago para todo el evento)" value={payUrl} onChangeText={setPayUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://mpago.la/…" maxLength={500} />
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Muestra el botón “Pagar” en la página. Si un tipo de entrada tiene su propio enlace (en Entradas y precios), se usa ese. El pago lo confirma una persona marcando “pagó” en Inscriptos.</Text>
      <Field label="Preguntas frecuentes" hint="(estacionamiento, comida, niños, qué llevar…)" value={faq} onChangeText={setFaq} multiline maxLength={4000} />
      <Button title="Guardar" onPress={save} loading={busy} />
    </>
  );
}

// ---------- Transmisión y grabaciones ----------
function Transmision({ ev, reload }: { ev: PlanEvent; reload: () => void }) {
  const [url, setUrl] = useState(ev.stream_url ?? '');
  const [access, setAccess] = useState(ev.stream_access);
  const [recs, setRecs] = useState(ev.recordings);
  const [t, setT] = useState('');
  const [u, setU] = useState('');
  const [busy, setBusy] = useState(false);
  const okUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());
  const add = () => {
    if (!t.trim() || !okUrl(u)) return Alert.alert('Revisá el video', 'Ponele un título y pegá el enlace completo (empieza con https://).');
    setRecs([...recs, { title: t.trim(), url: u.trim() }]); setT(''); setU('');
  };
  const save = () => {
    if (url.trim() && !okUrl(url)) return Alert.alert('Revisá el enlace del en vivo', 'Tiene que empezar con https://');
    setBusy(true);
    updatePlanEvent(ev.id, { stream_url: url.trim() || null, stream_access: access, recordings: recs }).then(() => { reload(); Alert.alert('Guardado'); }).catch(fail).finally(() => setBusy(false));
  };
  return (
    <>
      <Field label="Enlace del en vivo" hint="(YouTube, Facebook…)" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://youtube.com/live/…" />
      <SectionTitle>¿Quién lo puede ver en la página?</SectionTitle>
      <Segmented value={access} onChange={setAccess} options={[{ value: 'all', label: 'Todos' }, { value: 'registered', label: 'Inscriptos' }, { value: 'paid', label: 'Los que pagaron' }]} />
      <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
        {access === 'all' ? 'Cualquiera que abra la página ve el en vivo y las grabaciones.' : access === 'registered' ? 'Solo quienes se inscribieron lo ven, entrando con el enlace de su entrada.' : 'Solo quienes tienen su entrada paga lo ven, entrando con el enlace de su entrada.'}
        {access !== 'all' ? ' El video sigue estando en YouTube o Facebook: ponelo como “no listado” para que no se encuentre desde afuera.' : ''}
      </Text>
      <SectionTitle>Grabaciones</SectionTitle>
      {recs.map((r, i) => (
        <Card key={`${r.url}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
          <Feather name="play-circle" size={22} color={colors.violet} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.title}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{r.url}</Text>
          </View>
          <Pressable onPress={() => setRecs(recs.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar ${r.title}`}><Feather name="x" size={20} color={colors.muted} /></Pressable>
        </Card>
      ))}
      <Card style={{ gap: 10 }}>
        <Field label="Título del video" value={t} onChangeText={setT} placeholder="Sesión 1 · viernes a la noche" maxLength={120} />
        <Field label="Enlace" value={u} onChangeText={setU} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
        <Button title="Agregar a la lista" icon="plus" variant="outline" small onPress={add} />
      </Card>
      <Button title="Guardar" onPress={save} loading={busy} />
    </>
  );
}

// ---------- Avisos ----------
function Avisos({ ev }: { ev: PlanEvent }) {
  const loader = useCallback(() => loadUpdates(ev.id), [ev.id]);
  const { rows, load } = useRows<EventUpdate>(loader);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = () => {
    setBusy(true);
    postUpdate(ev.id, body).then(() => { setBody(''); load(); }).catch(fail).finally(() => setBusy(false));
  };
  return (
    <>
      <Card style={{ gap: 10 }}>
        <Field label="Aviso" value={body} onChangeText={setBody} multiline maxLength={1000} placeholder="Cambió el horario de la primera sesión…" />
        <Button title="Enviar el aviso" icon="send" onPress={send} loading={busy} disabled={!body.trim()} />
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Queda arriba de todo en la página del evento, y a los inscriptos que tienen la app les llega una notificación.</Text>
      </Card>
      {rows === null ? <Loading /> : rows.map((r) => (
        <Card key={r.id} style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{r.body}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 12, color: colors.muted }}>{fmtRelativeDay(r.created_at)} {fmtTime(r.created_at)}</Text>
            <Text onPress={() => confirmDelete('este aviso', () => removeRow('event_updates', r.id).then(load).catch(fail))} style={{ fontSize: 13, fontWeight: '700', color: colors.redText }}>Borrar</Text>
          </View>
        </Card>
      ))}
    </>
  );
}

// ---------- Inscriptos (de a 50, con búsqueda: sirve igual con 50 o con 50.000) ----------
function Inscriptos({ ev }: { ev: PlanEvent }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PlanReg[] | null>(null);
  const [more, setMore] = useState(false);
  const [st, setSt] = useState<PlanStats | null>(null);
  const fetchPage = useCallback((offset: number, text: string) => planRegs(ev.id, text.trim(), offset).then((r) => {
    setRows((old) => (offset ? [...(old ?? []), ...r] : r));
    setMore(r.length === 50);
  }).catch(() => setRows((o) => o ?? [])), [ev.id]);
  useEffect(() => {
    const t = setTimeout(() => fetchPage(0, q), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, fetchPage]);
  useEffect(() => { planStats(ev.id).then(setSt).catch(() => undefined); }, [ev.id, rows]);
  const pay = (r: PlanReg, amount: number) => setPaid(r.id, amount).then(() => setRows((old) => (old ?? []).map((x) => (x.id === r.id ? { ...x, paid_amount: amount } : x)))).catch(fail);
  return (
    <>
      {st ? <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{st.people} personas en {st.registrations} inscripciones · {st.checked_in} ya entraron · cobrado {fmtMoney(st.paid)}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, backgroundColor: colors.bgSoft, paddingHorizontal: 12 }}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar por nombre, celular o código" placeholderTextColor={colors.muted} accessibilityLabel="Buscar inscriptos" autoCorrect={false} style={{ flex: 1, fontSize: 16, color: colors.text }} />
      </View>
      <Button title="Credenciales: imprimir con QR y grabar el chip" icon="credit-card" variant="outline" small onPress={() => router.push({ pathname: '/evento/credenciales', params: { id: ev.id } } as unknown as Href)} />
      {rows === null ? <Loading /> : !rows.length ? <Empty icon="users" title={q ? 'No encontré a nadie' : 'Todavía no hay inscriptos'} text={q ? undefined : 'Publicá la página del evento y compartí el enlace.'} /> : null}
      {(rows ?? []).map((r) => {
        const due = Number(r.price), paid = Number(r.paid_amount);
        return (
          <Card key={r.id} style={{ gap: 6, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{r.name}{r.people > 1 ? ` (+${r.people - 1})` : ''}</Text>
              {r.checked_in_at ? <Tag text={r.checked_out_at ? 'Salió' : 'Entró'} tone={r.checked_out_at ? 'gray' : 'green'} /> : null}
              {due > 0 ? <Tag text={paid >= due ? 'Pagó' : paid > 0 ? `Pagó ${fmtMoney(paid)}` : 'Debe'} tone={paid >= due ? 'green' : 'amber'} /> : null}
            </View>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {[r.type_name, r.phone, showCode(r.ticket_code), r.walk_in ? 'en la puerta' : r.source === 'web' ? 'por la página' : 'por la app', r.entrance ? `entró por ${r.entrance}` : null, r.chip_at ? 'con chip' : null].filter(Boolean).join(' · ')}
            </Text>
            {due > 0 ? (
              <Text onPress={() => pay(r, paid >= due ? 0 : due)} style={{ fontSize: 13, fontWeight: '800', color: paid >= due ? colors.muted : colors.green }}>
                {paid >= due ? 'Marcar que no pagó' : `Marcar que pagó ${fmtMoney(due)}`}
              </Text>
            ) : null}
          </Card>
        );
      })}
      {more ? <Button title="Ver más" variant="outline" onPress={() => fetchPage(rows?.length ?? 0, q)} /> : null}
    </>
  );
}
