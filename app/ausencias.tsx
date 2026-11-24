// Quiénes faltaron el fin de semana (miembros y visitas), separados por cuántas semanas seguidas faltaron.
// Al lado de cada uno: WhatsApp con el mensaje que corresponde (desde tu nombre), llamar y registrar la visita.
//   1 semana  → "te extrañamos, ¿cómo estás?, ¿podemos orar por algo?"
//   2 semanas → coordinar una visita
//   3 o más   → "recién oré por vos" + recordatorio de visitarlo
// Cada grupo va en su propia página (pestañas arriba). Al tocar el WhatsApp o "Quitar", la persona sale de la lista
// (queda abajo, en "Ya atendidos", por si hay que volver atrás).
// "Elegir varios" arma una fila de mensajes: WhatsApp se abre para uno, se manda, y al volver se abre el siguiente.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { DateChips } from '@/components/Picker';
import { Button, Empty, Loading, Tag } from '@/components/ui';
import { absenceMessaged, listServices, setAbsenceMessaged, weekendAbsences } from '@/lib/api';
import { addDays, fmtDateOnly, fmtDateShort, fmtRelativeDay, isoDate, lastSaturday, parseDate } from '@/lib/format';
import { messageText, openWhatsApp, type MessageKind } from '@/lib/messages';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { downloadText } from '@/lib/download';
import { toCsv } from '@/lib/desk';
import { formatPhone } from '@/lib/phone';
import type { AbsenceRow, ChurchService } from '@/types';

const SECTIONS: { weeks: number; title: string; hint: string; kind: MessageKind; tone: 'amber' | 'red' | 'blue' }[] = [
  { weeks: 1, title: 'Faltaron este fin de semana', hint: 'Escribiles hoy: los extrañamos y queremos saber cómo están.', kind: 'missed1', tone: 'blue' },
  { weeks: 2, title: 'Faltaron 2 semanas seguidas', hint: 'Coordiná una visita esta semana.', kind: 'missed2', tone: 'amber' },
  { weeks: 3, title: 'Faltaron 3 semanas o más', hint: 'Orá por cada uno, mandales que oraste por ellos y visitalos.', kind: 'missed3', tone: 'red' },
];

export default function Ausencias() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fecha?: string; semanas?: string }>();
  const { isStaff, profile, church } = useAuth();
  const [sat, setSat] = useState(params.fecha ?? lastSaturday());
  // Qué página se ve: 1 semana, 2 semanas o 3 o más. Si no se pidió una, se abre la primera que tenga gente.
  const [tab, setTab] = useState<number | null>(params.semanas ? Math.max(1, Math.min(3, Number(params.semanas) || 1)) : null);
  const [rows, setRows] = useState<AbsenceRow[] | null>(null);
  const [services, setServices] = useState<ChurchService[]>([]);
  const saturdays = Array.from({ length: 8 }, (_, i) => isoDate(addDays(parseDate(lastSaturday()), -7 * i)));

  useEffect(() => {
    listServices().then(setServices).catch(() => undefined);
  }, []);
  // A quiénes ya se les escribió este fin de semana: no aparecen en la lista.
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [showSent, setShowSent] = useState(false);
  // Elegir varios para mandarles uno atrás del otro.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<AbsenceRow[] | null>(null);
  const [qi, setQi] = useState(0);
  const waiting = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      setPicking(false);
      setPicked(new Set());
      weekendAbsences(sat).then(setRows).catch(() => setRows([]));
      absenceMessaged(sat).then((ids) => setSent(new Set(ids)));
    }, [sat]),
  );

  const section = (r: AbsenceRow) => SECTIONS[Math.min(3, r.weeks_missed ?? 1) - 1];
  const mark = (id: string, on: boolean) => {
    setSent((old) => { const next = new Set(old); if (on) next.add(id); else next.delete(id); return next; });
    setAbsenceMessaged(id, sat, on).catch(() => undefined);
  };
  /** Abre el WhatsApp con el mensaje que le toca y lo saca de la lista. */
  const write = (r: AbsenceRow) => {
    openWhatsApp(r.phone, messageText(section(r).kind, { to: r.name, from: profile?.display_name, church: church?.name, services }));
    mark(r.contact_id, true);
  };

  const allPending = (rows ?? []).filter((r) => !sent.has(r.contact_id));
  const countOf = (w: number) => allPending.filter((r) => section(r).weeks === w).length;
  const weeks = tab ?? (SECTIONS.find((x) => countOf(x.weeks))?.weeks ?? 1);
  const pending = allPending.filter((r) => section(r).weeks === weeks);
  const done = (rows ?? []).filter((r) => sent.has(r.contact_id) && section(r).weeks === weeks);
  const canPick = pending.filter((r) => r.phone);
  /** Saca a todos los de esta página sin escribirles (por ejemplo, los niños o los que no tienen WhatsApp). */
  const removeAll = () => {
    const list = [...pending];
    const go = () => list.forEach((r) => mark(r.contact_id, true));
    const text = `Salen de esta lista ${list.length} ${list.length === 1 ? 'persona' : 'personas'}. No se borran de la iglesia y no se les manda nada. Quedan abajo, en "Ya atendidos", por si querés volver atrás.`;
    if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm(text)) go(); return; }
    Alert.alert('¿Quitar a todos de esta lista?', text, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar a todos', style: 'destructive', onPress: go }]);
  };
  const toggle = (id: string) => setPicked((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const start = () => {
    const list = canPick.filter((r) => picked.has(r.contact_id));
    if (!list.length) return;
    setQueue(list);
    setQi(1);
    setPicking(false);
    setPicked(new Set());
    waiting.current = true;
    write(list[0]);
  };
  const next = useCallback(() => {
    if (!queue || qi >= queue.length) return;
    waiting.current = true;
    write(queue[qi]);
    setQi(qi + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, qi, sat, services]);
  // En el teléfono: al volver de WhatsApp se abre solo el siguiente.
  useEffect(() => {
    if (Platform.OS === 'web' || !queue) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' || !waiting.current) return;
      waiting.current = false;
      if (qi < queue.length) setTimeout(next, 900);
    });
    return () => sub.remove();
  }, [queue, qi, next]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Faltaron" subtitle={`Fin de semana del ${fmtDateShort(sat)} y ${fmtDateShort(isoDate(addDays(parseDate(sat), 1)))}`} back />
      <Screen>
        <DateChips dates={saturdays.includes(sat) ? saturdays : [sat, ...saturdays]} value={sat} onChange={setSat} format={(d) => `Finde ${fmtDateShort(d)}`} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SECTIONS.map((x) => {
            const on = x.weeks === weeks;
            return (
              <Pressable key={x.weeks} onPress={() => { setTab(x.weeks); setPicking(false); setPicked(new Set()); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, borderColor: on ? colors.amber : colors.border, backgroundColor: on ? colors.amberSoft : colors.bg }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: on ? colors.amberText : colors.text }}>{rows ? countOf(x.weeks) : '–'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: on ? colors.amberText : colors.muted, textAlign: 'center' }}>{x.weeks === 1 ? '1 semana' : x.weeks === 2 ? '2 semanas' : '3 o más'}</Text>
              </Pressable>
            );
          })}
        </View>
        {rows?.length ? (
          <Button title="Descargar la lista para visitar" icon="download" variant="outline" small onPress={() => {
            const list = [...rows].sort((a, b) => (b.weeks_missed ?? 1) - (a.weeks_missed ?? 1) || a.name.localeCompare(b.name));
            downloadText(`faltaron-${sat}.csv`, toCsv(['Nombre', 'Teléfono', 'Semanas sin venir', 'Qué hacer', 'Ruta / grupo', 'Última vez que vino', 'Ya le escribieron'],
              list.map((r) => [r.name, r.phone ? formatPhone(r.phone) : '', (r.weeks_missed ?? 1) >= 3 ? '3 o más' : r.weeks_missed ?? 1, section(r).hint, r.group_name ?? '', r.last_attended ? fmtDateShort(r.last_attended) : '', sent.has(r.contact_id) ? 'Sí' : 'No'])))
              .catch(() => undefined);
          }} />
        ) : null}
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          {isStaff || church?.absence_recipients?.includes(profile?.id ?? '') ? 'Miembros y visitas que no fueron marcados presentes el sábado ni el domingo.' : 'La gente de tu ruta que no fue marcada presente el sábado ni el domingo.'} El WhatsApp sale desde tu teléfono. Al escribirle a alguien, o al tocar “Quitar”, sale de la lista.
        </Text>

        {queue ? (
          <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.greenSoft }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.greenText }}>
              {qi >= queue.length ? `Listo: ${queue.length} ${queue.length === 1 ? 'mensaje abierto' : 'mensajes abiertos'}` : `Mensaje ${qi} de ${queue.length} abierto`}
            </Text>
            <Text style={{ fontSize: 13, color: colors.greenText, lineHeight: 18 }}>
              {qi >= queue.length ? 'Mandá el último en WhatsApp y ya está.'
                : Platform.OS === 'web' ? `Mandalo en WhatsApp y volvé acá para abrir el de ${queue[qi].name}.`
                : `Mandalo en WhatsApp y volvé a La Mies: se abre solo el de ${queue[qi].name}.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {qi < queue.length ? <Button title={`Siguiente: ${queue[qi].name}`} icon="message-circle" onPress={next} style={{ flex: 1 }} /> : null}
              <Button title={qi >= queue.length ? 'Cerrar' : 'Parar'} variant="outline" onPress={() => { setQueue(null); waiting.current = false; }} style={qi >= queue.length ? { flex: 1 } : undefined} />
            </View>
          </View>
        ) : canPick.length > 1 ? (
          picking ? (
            <View style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.bgSoft }}>
              <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>Tocá a quiénes les querés escribir. WhatsApp se abre para uno; lo mandás, volvés, y se abre el siguiente.</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button title={picked.size === canPick.length ? 'Ninguno' : `Elegir todos (${canPick.length})`} variant="outline" small onPress={() => setPicked(picked.size === canPick.length ? new Set() : new Set(canPick.map((r) => r.contact_id)))} />
                <Button title={picked.size ? `Mandar a ${picked.size}` : 'Mandar'} icon="send" small disabled={!picked.size} onPress={start} />
                <Button title="Cancelar" variant="ghost" small onPress={() => { setPicking(false); setPicked(new Set()); }} />
              </View>
            </View>
          ) : (
            <Button title="Elegir varios para escribirles" icon="check-square" variant="outline" onPress={() => setPicking(true)} />
          )
        ) : null}

        {rows === null ? <Loading /> : !rows.length ? <Empty icon="check-circle" title="No faltó nadie" text="¡Gloria a Dios!" />
          : !pending.length ? <Empty icon="check-circle" title="No queda nadie en esta lista" text={allPending.length ? 'Mirá las otras listas de arriba.' : 'Ya atendiste a todos los de este fin de semana.'} /> : null}
        {SECTIONS.filter((sec) => sec.weeks === weeks).map((sec) => {
          const list = pending;
          if (!list.length) return null;
          return (
            <View key={sec.weeks} style={{ gap: 8 }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{sec.title} · {list.length}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{sec.hint}</Text>
              </View>
              {list.map((r) => {
                const on = picked.has(r.contact_id);
                return (
                  <View key={r.contact_id} style={{ gap: 8, padding: 10, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.green : colors.border, backgroundColor: on ? colors.greenSoft : undefined }}>
                    <Pressable onPress={() => (picking ? (r.phone ? toggle(r.contact_id) : undefined) : router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id } }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole={picking ? 'checkbox' : 'button'} accessibilityState={picking ? { checked: on, disabled: !r.phone } : undefined}>
                      {picking ? <Feather name={on ? 'check-circle' : 'circle'} size={24} color={!r.phone ? colors.border : on ? colors.green : colors.muted} /> : null}
                      <Face name={r.name} path={r.photo_path} size={44} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.name}</Text>
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {picking && !r.phone ? 'Sin teléfono cargado' : r.last_attended ? `Vino por última vez: ${fmtDateOnly(r.last_attended)}` : 'Nunca marcado presente'}
                          {r.last_visit ? ` · visitado ${fmtRelativeDay(r.last_visit)}` : ''}
                        </Text>
                      </View>
                      <Tag text={r.status === 'member' ? 'Miembro' : 'Visita'} tone={r.status === 'member' ? 'green' : sec.tone} />
                    </Pressable>
                    {picking ? null : (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Btn icon="message-circle" label={sec.weeks === 3 ? 'Oré por vos' : sec.weeks === 2 ? 'Coordinar visita' : 'Lo extrañamos'} disabled={!r.phone} onPress={() => write(r)} />
                        <Btn icon="check-square" label="Visité" onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id, visita: '1' } })} />
                        <Btn icon="x" label="Quitar" gray onPress={() => mark(r.contact_id, true)} />
                      </View>
                    )}
                  </View>
                );
              })}
              {list.length > 1 && !picking ? (
                <Pressable onPress={removeAll} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Feather name="x" size={16} color={colors.muted} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Quitar a todos los de esta lista ({list.length})</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {done.length ? (
          <View style={{ gap: 8 }}>
            <Pressable onPress={() => setShowSent(!showSent)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <Feather name="check-circle" size={16} color={colors.greenText} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.greenText }}>Ya atendidos · {done.length}</Text>
              <Feather name={showSent ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {showSent ? done.map((r) => (
              <View key={r.contact_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <Face name={r.name} path={r.photo_path} size={34} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>{r.name}</Text>
                <Pressable onPress={() => mark(r.contact_id, false)} accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.bgSoft }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Volver a la lista</Text>
                </Pressable>
              </View>
            )) : null}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}

function Btn({ icon, label, onPress, disabled, gray }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; disabled?: boolean; gray?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, backgroundColor: gray ? colors.bgSoft : colors.greenSoft, opacity: disabled ? 0.4 : 1 }}>
      <Feather name={icon} size={15} color={gray ? colors.muted : colors.greenText} />
      <Text style={{ fontSize: 12, fontWeight: '800', color: gray ? colors.muted : colors.greenText }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
