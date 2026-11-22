// Mis contactos para seguir: los que anoté (o me asignaron), primero los que prometieron venir y los más interesados.
// Con un toque: WhatsApp con el mensaje escrito, llamar, cómo llegar o registrar la visita.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Card, Empty, Field, Loading, Tag } from '@/components/ui';
import { absenceMessaged, weekendAbsences, completeFollowUp, followContext, listServices, myFirstVisitTasks, myFollowups, setFollowNote, updateContact, type FirstVisitTask, type FollowUpOutcome } from '@/lib/api';
import { whyHere, type FollowContext } from '@/lib/followWhy';
import { errorMessage } from '@/lib/supabase';
import { formatPhone } from '@/lib/phone';
import { INTEREST_LABEL, PROMISE_LABEL, fmtDateShort, fmtRelativeDay, lastSaturday } from '@/lib/format';
import { chooseWhatsApp, messageText, openWhatsApp, type MessageKind } from '@/lib/messages';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { downloadText } from '@/lib/download';
import { toCsv } from '@/lib/desk';
import type { ChurchService, FollowupRow } from '@/types';

const TASK_LABEL: Record<string, string> = {
  call: 'Vino por primera vez: escribirle',
  write2: 'Vino por segunda vez: escribirle',
  visit: 'Visitarlo en su casa',
  absent_visit: 'Está faltando: visitarlo',
};

// Los grupos de "Para hacer esta semana", en este orden. Cada persona va al grupo de su paso más urgente.
const GROUPS: { key: string; title: string; hint: string; kinds: string[] }[] = [
  { key: 'first', title: 'Vinieron por primera vez', hint: 'Mandales el mensaje de bienvenida. Al tocar WhatsApp, salen de la lista.', kinds: ['call'] },
  { key: 'again', title: 'Volvieron otra semana', hint: 'Escribiles y coordiná una visita a su casa.', kinds: ['write2'] },
  { key: 'visit', title: 'Para visitar en su casa', hint: 'Cuando los visites, tocá “Ya lo visité”.', kinds: ['visit'] },
  { key: 'absent', title: 'Faltaron 2 semanas: visitarlos', hint: 'Pasá a verlos esta semana. Cuando los visites, tocá “Ya lo visité”.', kinds: ['absent_visit'] },
];
const groupOf = (kinds: string[]) => GROUPS.find((g) => g.kinds.some((k) => kinds.includes(k))) ?? GROUPS[2];

export default function Seguimiento() {
  const router = useRouter();
  const { profile, church, can } = useAuth();
  const [rows, setRows] = useState<FollowupRow[] | null>(null);
  const [services, setServices] = useState<ChurchService[]>([]);
  const [tasks, setTasks] = useState<FirstVisitTask[]>([]);
  const [addPhone, setAddPhone] = useState<string | null>(null);
  const [phoneText, setPhoneText] = useState('');
  const reloadTasks = () => { myFirstVisitTasks().then(setTasks).catch(() => undefined); };
  // De dónde salió cada persona y su nota, para no perder el hilo con nombres que todavía no conocemos.
  const [ctx, setCtx] = useState<Record<string, FollowContext>>({});
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const ids = useMemo(() => [...new Set([...(rows ?? []).map((r) => r.id), ...tasks.map((t) => t.contact_id)])].sort().join(','), [rows, tasks]);
  useEffect(() => {
    if (ids) followContext(ids.split(',')).then(setCtx);
  }, [ids]);
  const saveNote = (id: string) => {
    const note = noteText.trim();
    setFollowNote(id, note)
      .then(() => { setCtx((c) => (c[id] ? { ...c, [id]: { ...c[id], note: note || null } } : c)); setNoteFor(null); })
      .catch((e) => Alert.alert('No se guardó la nota', errorMessage(e)));
  };
  /** Debajo del nombre: por qué está en la lista, qué hacer y la nota. */
  const about = (id: string, promised = false, todo = true) => {
    const c = ctx[id];
    if (!c) return null;
    const w = whyHere(c, { promised, day: fmtDateShort });
    return (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row' }}><Tag text={w.tag} tone={w.tone} /></View>
        <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>{w.origin}</Text>
        {todo ? <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}><Text style={{ fontWeight: '800' }}>Qué hacer: </Text>{w.todo}</Text> : null}
        {c.last_note ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Última visita: “{c.last_note}”</Text> : null}
        {noteFor === id ? (
          <View style={{ gap: 8 }}>
            <Field label="Nota" value={noteText} onChangeText={setNoteText} placeholder="Ej: vino con su hermana, vive cerca de la plaza" multiline autoFocus />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Small icon="check" label="Guardar nota" onPress={() => saveNote(id)} />
              <Small icon="x" label="Cancelar" onPress={() => setNoteFor(null)} />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => { setNoteFor(id); setNoteText(c.note ?? ''); }} accessibilityRole="button" style={{ flexDirection: 'row', gap: 8, padding: 8, borderRadius: 10, backgroundColor: c.note ? colors.amberSoft : colors.bgSoft }}>
            <Feather name={c.note ? 'file-text' : 'edit-3'} size={15} color={c.note ? colors.amberText : colors.muted} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: c.note ? colors.amberText : colors.muted, fontWeight: c.note ? '600' : '400' }}>{c.note ?? 'Agregar una nota'}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  useEffect(() => {
    listServices().then(setServices).catch(() => undefined);
  }, []);
  // Los que faltaron el último fin de semana (se les escribe desde "Faltaron"): acá solo se cuentan, para tener todo a la vista.
  const seesAbsences = can('personas.ver_todas') || can('inf.panel');
  const [absent, setAbsent] = useState<number[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (seesAbsences) {
        Promise.all([weekendAbsences(lastSaturday()), absenceMessaged(lastSaturday())]).then(([r, sent]) => {
          const left = r.filter((x) => !sent.includes(x.contact_id));
          setAbsent([1, 2, 3].map((w) => left.filter((x) => Math.min(3, x.weeks_missed ?? 1) === w).length));
        }).catch(() => undefined);
      }
      myFollowups().then(setRows).catch(() => setRows([]));
      myFirstVisitTasks().then(setTasks).catch(() => undefined);
    }, []),
  );

  // Una fila por persona (cada visita nueva trae dos pasos: escribirle y visitarla).
  const visitors = useMemo(() => {
    const by = new Map<string, { contact_id: string; name: string; phone: string | null; photo_path: string | null; tasks: FirstVisitTask[] }>();
    for (const t of tasks) {
      const v = by.get(t.contact_id) ?? { contact_id: t.contact_id, name: t.name, phone: t.phone, photo_path: t.photo_path, tasks: [] };
      v.tasks.push(t);
      by.set(t.contact_id, v);
    }
    const order = ['call', 'write2', 'visit', 'absent_visit'];
    for (const v of by.values()) v.tasks.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    return [...by.values()];
  }, [tasks]);

  // Empezar de cero: cierra todos los recordatorios sin marcarlos como hechos (no cuentan como "le escribí" ni "lo visité").
  // Las personas quedan cargadas; si vuelven a venir o a faltar, la app arma recordatorios nuevos.
  const [clearing, setClearing] = useState(false);
  const clearTasks = async (list: FirstVisitTask[]) => {
    setClearing(true);
    let failed = 0;
    for (let i = 0; i < list.length; i += 8) {
      const res = await Promise.allSettled(list.slice(i, i + 8).map((t) => completeFollowUp(t.id, null)));
      failed += res.filter((r) => r.status === 'rejected').length;
    }
    setClearing(false);
    reloadTasks();
    if (failed) Alert.alert('Quedaron algunos', `${failed} no se pudieron borrar. Probá de nuevo con señal.`);
  };
  const clearAll = () => {
    // "De la semana pasada" = los que vencían antes de este lunes.
    const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const old = tasks.filter((t) => new Date(t.due_at) < monday);
    const people = (list: FirstVisitTask[]) => new Set(list.map((t) => t.contact_id)).size;
    const nAll = people(tasks), nOld = people(old);
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (nOld && nOld < nAll) buttons.push({ text: `Solo los de antes de esta semana (${nOld})`, style: 'destructive', onPress: () => clearTasks(old) });
    buttons.push({ text: `Todos (${nAll})`, style: 'destructive', onPress: () => clearTasks([...tasks]) });
    buttons.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert('¿Borrar recordatorios?', 'Empezás con la lista limpia. Las personas no se borran, y no queda registrado que les escribiste o los visitaste.', buttons);
  };

  const week = Date.now() - 7 * 86400000;
  const pending = (rows ?? []).filter((r) => !r.last_visit || new Date(r.last_visit).getTime() < week);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mis contactos para seguir" subtitle={rows ? `${rows.length} personas · ${pending.length} sin contacto esta semana` : undefined} back />
      <Screen>
        {tasks.length || rows?.length ? (
          <Button title="Descargar la lista para visitar" icon="download" variant="outline" small onPress={() => {
            const due = (t: FirstVisitTask) => (t.overdue ? 'atrasado' : new Date(t.due_at).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
            const taskRows = visitors.map((v) => [v.name, v.phone ? formatPhone(v.phone) : '', v.tasks.map((t) => TASK_LABEL[t.kind] ?? 'Seguir').join(' + '), v.tasks.map(due).join(' / '), '', ctx[v.contact_id]?.note ?? '']);
            const contactRows = (rows ?? []).map((r) => [r.name, r.phone ? formatPhone(r.phone) : '', r.promise_day ? `Prometió venir ${PROMISE_LABEL[r.promise_day] ?? ''}` : 'Seguir / visitar', r.last_visit ? `último contacto ${fmtDateShort(r.last_visit)}` : 'sin visitas todavía', r.address_hint ?? '', ctx[r.id]?.note ?? '']);
            downloadText(`para-visitar-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(['Nombre', 'Teléfono', 'Qué hacer', 'Cuándo', 'Dirección', 'Nota'], [...taskRows, ...contactRows])).catch(() => undefined);
          }} />
        ) : null}
        {absent && absent.some(Boolean) ? (
          <Pressable onPress={() => router.push('/ausencias')} accessibilityRole="button">
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>Faltaron el último fin de semana</Text>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </View>
              {[['Faltaron este fin de semana', 'escribirles que los extrañamos'], ['Faltaron 2 semanas seguidas', 'coordinar una visita'], ['Faltaron 3 semanas o más', 'orar, escribirles y visitarlos']].map(([t, what], i) => absent[i] ? (
                <Text key={t} style={{ fontSize: 13, color: colors.text }}><Text style={{ fontWeight: '800' }}>{absent[i]}</Text> {t.toLowerCase()}: {what}</Text>
              ) : null)}
              <Text style={{ fontSize: 12, color: colors.green, fontWeight: '700' }}>Tocá acá para mandarles el mensaje</Text>
            </Card>
          </Pressable>
        ) : null}
        {tasks.length ? (
          <Card style={{ gap: 8, borderColor: colors.amber, borderWidth: 1.5, backgroundColor: colors.amberSoft }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.amberText }}>Para hacer esta semana</Text>
            <Text style={{ fontSize: 12, color: colors.amberText }}>El botón de WhatsApp abre el mensaje ya escrito y saca a la persona de la lista. Las visitas a la casa salen cuando tocás “Ya lo visité”.</Text>
            {GROUPS.map((g) => ({ g, people: visitors.filter((v) => groupOf(v.tasks.map((t) => t.kind)).key === g.key) })).filter((x) => x.people.length).map(({ g, people }) => (
            <View key={g.key} style={{ gap: 8, marginTop: 6 }}>
              <View style={{ paddingTop: 8, borderTopWidth: 2, borderTopColor: colors.amber }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: colors.text }}>{g.title} ({people.length})</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{g.hint}</Text>
              </View>
            {people.map((v) => {
              const kinds = v.tasks.map((t) => t.kind);
              // El mensaje que corresponde: segunda visita, primera visita, o coordinar la visita (por faltar o por la 2ª vez).
              const msg: MessageKind = kinds.includes('write2') ? 'secondvisit' : kinds.includes('call') ? 'firstvisit' : kinds.includes('absent_visit') ? 'missed2' : 'visit';
              return (
                <View key={v.contact_id} style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: v.contact_id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Face name={v.name} path={v.photo_path} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{v.name}</Text>
                      {v.tasks.map((t) => (
                        <Text key={t.id} style={{ fontSize: 12, color: t.overdue ? colors.red : colors.muted }}>
                          {!v.phone && (t.kind === 'call' || t.kind === 'write2') ? `${t.kind === 'call' ? 'Vino por primera vez' : 'Vino por segunda vez'}: conseguir su teléfono o hablarle` : TASK_LABEL[t.kind] ?? 'Seguir'} {t.overdue ? '· atrasado' : `antes del ${new Date(t.due_at).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}`}
                        </Text>
                      ))}
                    </View>
                  </Pressable>
                  {about(v.contact_id, false, false)}
                  {(() => {
                    const done = (t: FirstVisitTask, outcome: FollowUpOutcome) =>
                      completeFollowUp(t.id, outcome).then(() => { setTasks((cur) => cur.filter((x) => x.id !== t.id)); if (outcome === 'unreachable') reloadTasks(); }).catch(() => undefined);
                    const writes = v.tasks.filter((t) => t.kind === 'call' || t.kind === 'write2');
                    const visits = v.tasks.filter((t) => t.kind === 'visit' || t.kind === 'absent_visit');
                    // Sin teléfono no se le puede escribir: se ofrece cargarlo, o decir con la verdad qué pasó.
                    if (!v.phone && writes.length) {
                      return (
                        <View style={{ gap: 8 }}>
                          <Text style={{ fontSize: 12, color: colors.amberText }}>No tiene teléfono cargado. Conseguilo, o hablale en persona.</Text>
                          {addPhone === v.contact_id ? (
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                              <Field label="Teléfono" value={phoneText} onChangeText={setPhoneText} keyboardType="phone-pad" placeholder="Ej: 27-2200" style={{ flex: 1 }} autoFocus />
                              <Small icon="check" label="Guardar" disabled={phoneText.replace(/\D/g, '').length < 6} onPress={() => {
                                const phone = formatPhone(phoneText);
                                updateContact(v.contact_id, { phone }).then(() => { setTasks((cur) => cur.map((x) => (x.contact_id === v.contact_id ? { ...x, phone } : x))); setAddPhone(null); setPhoneText(''); }).catch(() => undefined);
                              }} />
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Small icon="phone" label="Agregar teléfono" onPress={() => { setAddPhone(v.contact_id); setPhoneText(''); }} />
                            </View>
                          )}
                          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            <Small icon="user-check" label="Le hablé en persona" onPress={() => writes.forEach((t) => done(t, 'in_person'))} />
                            <Small icon="user-x" label="No lo pude contactar" onPress={() => writes.forEach((t) => done(t, 'unreachable'))} />
                          </View>
                          {visits.length ? (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Small icon="check" label="Ya lo visité" onPress={() => visits.forEach((t) => done(t, 'visited'))} />
                            </View>
                          ) : null}
                        </View>
                      );
                    }
                    return (
                      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {writes.length ? (
                          <Small icon="message-circle" label="WhatsApp" disabled={!v.phone}
                            onPress={() => { openWhatsApp(v.phone, messageText(msg, { to: v.name, from: profile?.display_name, church: church?.name, services })); writes.forEach((t) => done(t, 'wrote')); }} />
                        ) : (
                          <Small icon="message-circle" label="WhatsApp" disabled={!v.phone}
                            onPress={() => openWhatsApp(v.phone, messageText(msg, { to: v.name, from: profile?.display_name, church: church?.name, services }))} />
                        )}
                        {visits.length ? <Small icon="check" label="Ya lo visité" onPress={() => visits.forEach((t) => done(t, 'visited'))} /> : null}
                      </View>
                    );
                  })()}
                </View>
              );
            })}
            </View>
            ))}
            <Pressable onPress={clearAll} disabled={clearing} accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.amberText, opacity: clearing ? 0.5 : 1 }}>
              <Feather name="trash-2" size={16} color={colors.amberText} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amberText }}>{clearing ? 'Borrando…' : `Borrar recordatorios (${visitors.length})`}</Text>
            </Pressable>
          </Card>
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="users" title="No tenés contactos para seguir" text="Los contactos que anotás en las salidas (o que te asignan) aparecen acá." /> : null}
        {(rows ?? []).map((r) => {
          const stale = !r.last_visit || new Date(r.last_visit).getTime() < week;
          return (
            <Card key={r.id} style={{ padding: 12, gap: 10 }}>
              <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button">
                <Face name={r.name} path={r.photo_path} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                    {r.last_visit ? `Último contacto: ${fmtRelativeDay(r.last_visit)}` : 'Sin visitas todavía'}{r.address_hint ? ` · ${r.address_hint}` : ''}
                  </Text>
                </View>
                {r.promise_day ? <Tag text={`Prometió ${PROMISE_LABEL[r.promise_day] ?? ''}`} tone="amber" /> : r.interest ? <Tag text={INTEREST_LABEL[r.interest] ?? r.interest} tone={r.interest === 'very' ? 'green' : 'gray'} /> : null}
              </Pressable>
              {about(r.id, !!r.promise_day)}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Small icon="message-circle" label="WhatsApp" disabled={!r.phone} onPress={() => chooseWhatsApp(r.phone, { to: r.name, from: profile?.display_name, church: church?.name, promiseDay: r.promise_day, services }, r.promise_day ? ['promise', 'followup', 'visit'] : ['followup', 'visit', 'promise'])} />
                <Small icon="check-square" label={stale ? 'Visité' : 'Visitado'} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id, visita: '1' } })} />
              </View>
            </Card>
          );
        })}
      </Screen>
    </View>
  );
}

function Small({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, backgroundColor: colors.greenSoft, opacity: disabled ? 0.4 : 1 }}>
      <Feather name={icon} size={16} color={colors.greenText} />
      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>{label}</Text>
    </Pressable>
  );
}
