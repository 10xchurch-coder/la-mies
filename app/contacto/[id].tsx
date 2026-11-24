// Ficha de una persona: foto, datos, su camino en la iglesia, fidelidad, visitas y asistencias.
import { PART_TITLE, hasStarted, partProgress, toggleClass, type DiscPart } from '@/lib/discipleship';
import { followupConfig } from '@/lib/messages';
import { formatPhone, telDigits } from '@/lib/phone';
import { hasRole } from '@/lib/perms';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MapView, Marker } from '@/components/map';
import { Feather } from '@expo/vector-icons';
import { chooseWhatsApp, messageText, openWhatsApp, type MessageKind } from '@/lib/messages';
import { showActions } from '@/components/ActionSheet';
import { Header, Screen } from '@/components/Screen';
import { FamilyCard } from '@/components/FamilyCard';
import { VerseBadges } from '@/components/VerseBadges';
import { PersonasPanel } from '@/components/PersonasPanel';
import { useFeatures } from '@/lib/useFeatures';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Avatar, Button, Card, Choice, Field, Loading, SectionTitle, Segmented, Tag, Toggle } from '@/components/ui';
import { regionAround } from '@/components/CoverageMap';
import {
  deleteContact, syncFamilyRoute, familyChildren, familyParents, getContact, listPeople, mergeContacts, listAllServices, listCancellations, listGroups, listMinistries, listProfiles, ministryPeopleRows, personJourney, setAttendance, updateContact, setContactInactive, setInactiveExempt,
} from '@/lib/api';
import { pickAndUploadPhoto } from '@/lib/files';
import { supabase, errorMessage } from '@/lib/supabase';
import {
  FAITH_LABEL, INTEREST_LABEL, MARITAL_LABEL, PROMISE_LABEL, STATUS_LABEL, addDays, dayName, displayAge, fmtDateOnly, fmtDateShort, fmtDay, fmtTime,
  groupArticle, groupWord, isoDate, whatsappNumber,
} from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors, themed } from '@/theme';
import type {
  Attendance, Cancellation, ChurchService, Contact, ContactChild, ContactVisit, FaithCategory, Group, JourneyStep, Ministry, PersonStatus, Profile,
} from '@/types';
import { tx, txLocale } from '@/lib/i18n';

/** Fidelidad de las últimas 12 semanas, contando solo las reuniones principales (sin las fechas en que no hubo). */
function faithOf(c: Contact, atts: Attendance[], services: ChurchService[], offs: Cancellation[] = []): { cat: FaithCategory; attended: number; possible: number } {
  const main = services.filter((s) => s.main && s.active);
  const today = new Date();
  const start = new Date(Math.max(addDays(today, -84).getTime(), new Date(c.created_at).getTime()));
  let possible = 0;
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12); d <= today; d = addDays(d, 1)) {
    const day = isoDate(d);
    possible += main.filter((s) => s.dow === d.getDay() && !offs.some((o) => o.service_id === s.id && o.on_date === day)).length;
  }
  const mainIds = new Set(main.map((s) => s.id));
  const attended = atts.filter((a) => mainIds.has(a.service_id) && a.attended_on >= isoDate(start)).length;
  if (!possible) return { cat: 'nuevo', attended, possible };
  const p = attended / possible;
  const cat: FaithCategory = p >= 0.95 ? 'fiel' : p >= 0.8 ? 'constante' : p >= 0.45 ? 'frecuente' : p >= 0.2 ? 'ocasional' : attended > 0 ? 'esporadico' : atts.length ? 'inactivo' : 'sin_asistencia';
  return { cat, attended, possible };
}

/** dd/mm/aaaa ⇄ aaaa-mm-dd */
function toDmy(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function fromDmy(t: string): string | null | undefined {
  const s = t.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return undefined;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime()) || d > new Date(Date.now() + 86400000)) return undefined;
  return iso;
}

/** La secretaría o el pastor corrigen las fechas reales (al cargar a alguien queda la fecha del día). */
/** Programa de discipulado: se tilda cada clase que la persona completó. Completar cada parte es un logro. */
function DiscipleshipCard({ c, onSave }: { c: Contact; onSave: (patch: Partial<Contact>) => Promise<void> }) {
  const cfg = followupConfig();
  const parts = ([['one', cfg.disc_one_classes], ['course', cfg.disc_course_classes]] as [DiscPart, number][]).filter(([, n]) => n > 0);
  if (!parts.length) return null;
  const tap = (part: DiscPart, n: number) => {
    const next = toggleClass(c.discipleship, part, n, isoDate(new Date()));
    const patch: Partial<Contact> = { discipleship: next };
    if (!c.discipleship_since && hasStarted(next)) patch.discipleship_since = isoDate(new Date());
    onSave(patch).catch(() => undefined);
  };
  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle>{tx('Discipulado')}</SectionTitle>
      {parts.map(([part, total]) => {
        const p = partProgress(c.discipleship, part, total);
        return (
          <View key={part} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.text }}>{PART_TITLE[part]}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: p.complete ? colors.greenText : colors.muted }}>
                {p.complete ? `Completo${p.completedOn ? ` · ${fmtDateOnly(p.completedOn)}` : ''}` : tx('{done} de {total}', { done: p.done, total: p.total })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
                const on = !!c.discipleship?.[part]?.[String(n)];
                return (
                  <Pressable key={n} onPress={() => tap(part, n)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${PART_TITLE[part]}, clase ${n}: ${on ? tx('completada') : tx('sin hacer')}`} hitSlop={4}
                    style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.green : 'transparent' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: on ? '#FFFFFF' : colors.muted }}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Tocá el número de cada clase cuando la complete.')}</Text>
    </Card>
  );
}

function DatesEditor({ c, onSave }: { c: Contact; onSave: (patch: Partial<Contact>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [bap, setBap] = useState(toDmy(c.baptized_on));
  const [mem, setMem] = useState(toDmy(c.member_since));
  const [busy, setBusy] = useState(false);
  if (!open) return <Button title={tx('Corregir fechas (bautismo, miembro)')} icon="calendar" variant="ghost" small onPress={() => setOpen(true)} />;
  const save = async () => {
    const b = fromDmy(bap), m = fromDmy(mem);
    if (b === undefined || m === undefined) {
      Alert.alert(tx('Revisá las fechas'), tx('Escribilas así: 15/03/2024. Dejá vacío si no corresponde.'));
      return;
    }
    setBusy(true);
    try {
      const patch: Partial<Contact> = { baptized_on: b, member_since: c.status === 'member' ? m : c.member_since };
      if (b) { patch.baptized = true; if (c.baptized_here == null) patch.baptized_here = true; }
      await onSave(patch);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <SectionTitle>{tx('Fechas')}</SectionTitle>
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Así el progreso de la iglesia muestra cada cosa en el mes que pasó. Formato: 15/03/2024.')}</Text>
      <Field label={tx('Se bautizó')} value={bap} onChangeText={setBap} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
      {c.status === 'member' ? <Field label={tx('Miembro desde')} value={mem} onChangeText={setMem} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={tx('Cancelar')} variant="ghost" small onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <Button title={tx('Guardar fechas')} small onPress={save} loading={busy} style={{ flex: 2 }} />
      </View>
    </Card>
  );
}

export default function PersonaDetalle() {
  const router = useRouter();
  const { id, vinculo, wa: waKind, visita } = useLocalSearchParams<{ id: string; vinculo?: string; wa?: string; visita?: string }>();
  const { profile, church, isStaff, isLeader, can } = useAuth();
  // Los cuadros de funciones que la iglesia apagó no se ven en la ficha.
  const { on: fOn } = useFeatures();
  const outing = useOuting();
  const [c, setC] = useState<Contact | null>(null);
  const [children, setChildren] = useState<ContactChild[]>([]);
  const [parents, setParents] = useState<{ id: string; name: string }[]>([]);
  const [spouse, setSpouse] = useState<{ id: string; name: string } | null>(null);
  const [visits, setVisits] = useState<ContactVisit[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [journey, setJourney] = useState<JourneyStep[]>([]);
  const [services, setServices] = useState<ChurchService[]>([]);
  const [offs, setOffs] = useState<Cancellation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Viene del aviso "Cuenta vinculada por teléfono": se muestra un cartel para confirmar o deshacer.
  const [review, setReview] = useState(vinculo === '1');
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [adding, setAdding] = useState(visita === '1');
  const waShown = useRef(false);
  const [note, setNote] = useState('');
  const [gospel, setGospel] = useState<'yes' | 'no'>('no');
  const [promise, setPromise] = useState<'none' | 'sat' | 'sun'>('none');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<null | 'followup' | 'group' | 'merge'>(null);
  const [mergeList, setMergeList] = useState<Contact[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await getContact(id);
      setC(r.contact);
      setChildren(r.children);
      // La familia: los hijos de los dos (con su ficha) y, si es hijo de alguien, sus padres.
      familyChildren(id).then(setChildren).catch(() => undefined);
      familyParents(id).then(setParents).catch(() => undefined);
      if (r.contact?.spouse_id) {
        supabase.from('contacts').select('id,name').eq('id', r.contact.spouse_id).maybeSingle().then(({ data }) => setSpouse((data as { id: string; name: string } | null) ?? null));
      } else {
        setSpouse(null);
      }
      setVisits(r.visits);
      setAttendances(r.attendances);
      personJourney(id).then(setJourney).catch(() => undefined);
      listAllServices().then(setServices).catch(() => undefined);
      listCancellations(isoDate(addDays(new Date(), -90))).then(setOffs);
      listGroups().then(setGroups).catch(() => undefined);
      listProfiles().then(setPeople).catch(() => undefined);
      // Ministerios donde sirve (por su ficha: también si no usa la app).
      Promise.all([ministryPeopleRows({ contactId: id }), listMinistries()]).then(([mp, ms]) => {
        const mine = new Set(mp.map((x) => x.ministry_id));
        setMinistries(ms.filter((m) => mine.has(m.id)));
      }).catch(() => setMinistries([]));
    } catch {
      // sin señal
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canEdit = !!c && (isStaff || c.created_by === profile?.id || c.follow_up_user_id === profile?.id || c.profile_id === profile?.id
    || (hasRole(profile, 'captain') && !!c.group_id && c.group_id === profile?.group_id));
  const faith = useMemo(() => (c ? faithOf(c, attendances, services, offs) : null), [c, attendances, services, offs]);

  const update = async (patch: Partial<Contact>, done?: string) => {
    try {
      await updateContact(id, patch);
      if (done) Alert.alert(done);
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    }
  };

  const changePhoto = async () => {
    if (!church) return;
    try {
      const path = await pickAndUploadPhoto(church.id, { current: c?.photo_path });
      if (path) await update({ photo_path: path });
    } catch (e) {
      Alert.alert(tx('No se pudo subir la foto'), errorMessage(e));
    }
  };

  const addVisit = async () => {
    setBusy(true);
    const { error } = await supabase.from('contact_visits').insert({
      contact_id: id,
      session_id: outing.active?.id ?? null,
      note: note.trim() || null,
      gospel_presented: gospel === 'yes',
      promise_day: promise === 'none' ? null : promise,
    });
    setBusy(false);
    if (error) {
      Alert.alert(tx('No se pudo guardar'), errorMessage(error));
      return;
    }
    const patch: Partial<Contact> = {};
    if (promise !== 'none' && c && c.promise_day !== promise) patch.promise_day = promise;
    if (gospel === 'yes' && c && !c.gospel_presented) patch.gospel_presented = true;
    if (Object.keys(patch).length) await update(patch);
    setAdding(false);
    setNote('');
    setGospel('no');
    setPromise('none');
    load();
  };

  /** Para cada reunión principal, la fecha más reciente (hoy o antes) de ese día. */
  const markAttendance = () => {
    const today = new Date();
    const opts = services.filter((s) => s.active).map((s) => {
      const back = (today.getDay() - s.dow + 7) % 7;
      const date = isoDate(addDays(today, -back));
      return { s, date };
    }).sort((a, b) => b.date.localeCompare(a.date));
    Alert.alert(tx('¿A qué reunión vino?'), c?.name, [
      ...opts.slice(0, 4).map(({ s, date }) => ({
        text: `${s.name} · ${fmtDateShort(date)}`,
        onPress: () => setAttendance(id, date, s.id, true).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))),
      })),
      { text: tx('Cancelar'), style: 'cancel' as const },
    ]);
  };

  const setStatus = (status: PersonStatus) => {
    if (!c || status === c.status) return;
    const patch: Partial<Contact> = { status };
    if (status === 'member' && !c.member_since) patch.member_since = isoDate(new Date());
    if (status !== 'member') patch.member_since = null;
    update(patch);
  };

  // Desde el aviso "Hoy prometió venir…" / "prometió y no vino": ofrecer el WhatsApp ya escrito o ver la ficha.
  useEffect(() => {
    if (!c || !waKind || waShown.current) return;
    waShown.current = true;
    const kind = (['promise', 'visit', 'followup', 'missed1', 'missed2', 'missed3'].includes(waKind) ? waKind : 'followup') as MessageKind;
    const ctx = { to: c.name, from: profile?.display_name, church: church?.name, promiseDay: c.promise_day, services };
    showActions(c.name, kind === 'promise' ? tx('Hoy prometió venir a la iglesia.') : kind === 'visit' ? tx('Prometió venir y no vino.') : undefined, [
      { text: tx('Mandarle un WhatsApp'), icon: 'message-circle', hint: messageText(kind, ctx).slice(0, 90) + '…', onPress: () => openWhatsApp(c.phone, messageText(kind, ctx)) },
      { text: tx('Ver su ficha'), icon: 'user' },
    ]);
  }, [c, waKind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <Loading />;
  if (!c) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Persona')} back />
        <Text style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>{tx('Esta persona no está disponible para vos.')}</Text>
      </View>
    );
  }

  const wa = c.phone ? `https://wa.me/${whatsappNumber(c.phone)}` : null;
  const hasMap = c.lat != null && c.lng != null;
  const directions = hasMap
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking`
    : c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.address}, ${church?.city ?? tx('Posadas')}`)}` : null;
  const followUp = people.find((p) => p.id === c.follow_up_user_id);
  const group = groups.find((g) => g.id === c.group_id);
  const gw = groupWord(church?.grouping);
  const isMember = c.status === 'member';
  const isVisitor = c.status === 'visitor';
  const isBaptized = !!c.baptized || !!c.baptized_on;
  // Filas de la ficha corta según quién es. Miembro: teléfono, ruta si tiene, bautismo solo si falta.
  // Contacto: además discipulado, bautismo, seguimiento. Visita: además cuántas veces vino y fidelidad.
  const rows: { k: string; v: string; right?: React.ReactNode }[] = [];
  rows.push({ k: tx('Teléfono'), v: c.phone ? formatPhone(c.phone) : tx('Sin teléfono') });
  if (!isMember || group) {
    rows.push({ k: gw, v: group?.name ?? `Sin ${gw.toLowerCase()}`, right: isStaff || hasRole(profile, 'captain') ? <Small label={tx('Cambiar')} onPress={() => setPicker('group')} /> : undefined });
  }
  if (c.status === 'contact') {
    rows.push({ k: tx('Prometió venir'), v: c.promise_day ? `${PROMISE_LABEL[c.promise_day]}${c.pickup ? tx(' · pasar a buscar{v1}', { v1: c.pickup_time ? ` ${c.pickup_time}` : '' }) : ''}` : tx('Todavía no') });
  }
  if (!isMember) rows.push({ k: tx('Discipulado'), v: c.discipleship_since ? tx('Desde {fmtDateOnly}', { fmtDateOnly: fmtDateOnly(c.discipleship_since) }) : tx('Todavía no') });
  if (!isMember || !isBaptized) {
    rows.push({ k: tx('Bautismo'), v: isBaptized ? (c.baptized_on && c.baptized_here !== false ? fmtDateOnly(c.baptized_on) : tx('Sí')) : tx('Todavía no (después de creer en Cristo)') });
  }
  if (isMember && c.member_since) rows.push({ k: tx('Miembro desde'), v: fmtDateOnly(c.member_since) });
  if (c.dni && !isMember) rows.push({ k: 'DNI', v: c.dni });
  if (isVisitor) {
    rows.push({ k: tx('Vino a la iglesia'), v: attendances.length ? tx('{n} {pl} · última {fmtDateOnly}', { n: attendances.length, pl: attendances.length === 1 ? tx('vez') : 'veces', fmtDateOnly: fmtDateOnly(attendances[0].attended_on) }) : tx('Todavía no') });
    if (faith && isLeader) rows.push({ k: tx('Fidelidad (12 semanas)'), v: faith.possible ? tx('{attended} de {possible} cultos · {label}', { attended: faith.attended, possible: faith.possible, label: FAITH_LABEL[faith.cat].label }) : tx('Recién agregada') });
  }
  if (!isMember) {
    rows.push({ k: tx('Seguimiento'), v: followUp?.display_name ?? (c.follow_up_user_id ? tx('Asignado') : tx('Sin asignar')), right: canEdit ? <Small label={tx('Cambiar')} onPress={() => setPicker('followup')} /> : undefined });
  }
  const nameOf = (uid: string) => (uid === profile?.id ? tx('Vos') : people.find((p) => p.id === uid)?.display_name ?? tx('Un hermano'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title={STATUS_LABEL[c.status]}
        back
        right={canEdit ? (
          <Pressable onPress={() => router.push({ pathname: '/persona/nueva', params: { id: c.id } })} accessibilityRole="button" style={styles.editBtn}>
            <Feather name="edit-2" size={16} color={colors.green} />
            <Text style={{ color: colors.green, fontWeight: '800' }}>{tx('Editar')}</Text>
          </Pressable>
        ) : undefined}
      />
      <Screen padded={false} style={{ gap: 0 }}>
        {hasMap ? (
          <View style={{ height: 130 }}>
            <MapView style={StyleSheet.absoluteFill} initialRegion={regionAround({ lat: c.lat as number, lng: c.lng as number }, 150)} scrollEnabled={false} zoomEnabled={false} toolbarEnabled={false}>
              <Marker coordinate={{ latitude: c.lat as number, longitude: c.lng as number }} pinColor={colors.green} />
            </MapView>
          </View>
        ) : null}
        <View style={{ padding: 16, gap: 14 }}>
          {review && isStaff && c.profile_id ? (
            <LinkReview
              contactName={c.name}
              profileId={c.profile_id}
              linkedName={linkedName}
              onName={setLinkedName}
              busy={unlinking}
              onConfirm={() => setReview(false)}
              onUnlink={() => Alert.alert(
                tx('No es esta persona'),
                tx('La cuenta de la app se separa de la ficha de {name} y queda con una ficha propia.', { name: c.name }),
                [
                  { text: tx('Cancelar'), style: 'cancel' },
                  { text: tx('Separar'), style: 'destructive', onPress: async () => {
                    setUnlinking(true);
                    try {
                      const { error } = await supabase.rpc('unlink_account', { p_contact: c.id });
                      if (error) throw error;
                      setReview(false);
                      setC({ ...c, profile_id: null });
                      Alert.alert(tx('Listo'), tx('Se separaron. Si después encontrás su ficha correcta, unila desde Editar → Cuenta en la app.'));
                    } catch (e) {
                      Alert.alert(tx('No se pudo'), errorMessage(e));
                    } finally {
                      setUnlinking(false);
                    }
                  } },
                ],
              )}
            />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Face name={c.name} path={c.photo_path} size={84} editable={canEdit} onPress={canEdit ? changePhoto : undefined} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: colors.text }}>{c.name}</Text>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {[displayAge(c) != null ? tx('{displayAge} años', { displayAge: displayAge(c) }) : null, c.marital ? MARITAL_LABEL[c.marital] : null, c.address ?? c.address_hint].filter(Boolean).join(' · ')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Tag text={STATUS_LABEL[c.status]} tone={c.status === 'member' ? 'green' : c.status === 'visitor' ? 'blue' : 'gray'} />
                {c.status === 'contact' ? <Tag text={INTEREST_LABEL[c.interest]} tone={c.interest === 'very' ? 'green' : c.interest === 'none' ? 'red' : 'blue'} /> : null}
                {faith && isLeader && faith.cat !== 'nuevo' ? <Tag text={FAITH_LABEL[faith.cat].label} tone={FAITH_LABEL[faith.cat].tone} /> : null}
              </View>
            </View>
          </View>
          {spouse || c.spouse_name ? (
            <Pressable disabled={!spouse} onPress={() => spouse && router.push({ pathname: '/contacto/[id]', params: { id: spouse.id } })}>
              <Text style={{ fontSize: 13, color: colors.text }}>
                <Text style={{ fontWeight: '700' }}>{c.marital === 'partner' ? tx('Pareja: ') : tx('Cónyuge: ')}</Text>
                <Text style={spouse ? { color: colors.green, fontWeight: '700' } : undefined}>{spouse?.name ?? c.spouse_name}</Text>
              </Text>
            </Pressable>
          ) : null}
          {children.length ? (
            <Text style={{ fontSize: 13, color: colors.text }}>
              <Text style={{ fontWeight: '700' }}>{children.length === 1 ? tx('Hijo: ') : tx('Hijos: ')}</Text>
              {children.map((k, i) => {
                const a = displayAge(k);
                const label = `${k.name}${a != null ? ` (${a})` : ''}`;
                return (
                  <Text key={k.id}>
                    {i ? ', ' : ''}
                    {k.child_contact_id
                      ? <Text onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: k.child_contact_id as string } })} style={{ color: colors.green, fontWeight: '700' }}>{label}</Text>
                      : label}
                  </Text>
                );
              })}
            </Text>
          ) : null}
          {parents.length ? (
            <Text style={{ fontSize: 13, color: colors.text }}>
              <Text style={{ fontWeight: '700' }}>{parents.length === 1 ? tx('Papá/mamá: ') : tx('Padres: ')}</Text>
              {parents.map((x, i) => (
                <Text key={x.id}>{i ? ', ' : ''}<Text onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: x.id } })} style={{ color: colors.green, fontWeight: '700' }}>{x.name}</Text></Text>
              ))}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action icon="phone" label={tx('Llamar')} disabled={!c.phone} onPress={() => Linking.openURL(`tel:${telDigits(c.phone)}`)} />
            <Action icon="message-circle" label={tx('WhatsApp')} disabled={!wa} onPress={() => chooseWhatsApp(c.phone, { to: c.name, from: profile?.display_name, church: church?.name, promiseDay: c.promise_day, services })} />
            <Action icon="check-square" label={tx('Visité')} onPress={() => setAdding(true)} />
            <Action icon="navigation" label={tx('Cómo llegar')} disabled={!directions} onPress={() => directions && Linking.openURL(directions)} />
          </View>
          {adding ? (
            <Card style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('Visita de hoy')}</Text>
              <Field label={tx('¿Cómo te fue? (nota)')} value={note} onChangeText={setNote} multiline autoFocus />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{tx('¿Le presentaste el evangelio?')}</Text>
                <Segmented style={{ width: 130 }} options={[{ value: 'yes', label: tx('Sí') }, { value: 'no', label: tx('No') }]} value={gospel} onChange={setGospel} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{tx('¿Se comprometió a venir?')}</Text>
              <Choice columns={3} options={[{ value: 'none', label: tx('No') }, { value: 'sat', label: tx('Sábado') }, { value: 'sun', label: tx('Domingo') }]} value={promise} onChange={setPromise} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={tx('Cancelar')} variant="ghost" small onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <Button title={tx('Guardar visita')} small onPress={addVisit} loading={busy} style={{ flex: 2 }} />
              </View>
            </Card>
          ) : null}

          {fOn('hogares') ? <FamilyCard key={c.id} contactId={c.id} person={{ name: c.name, sex: c.sex, age: displayAge(c) }} canEdit={canEdit} canSetPickup={can('personas.editar')} /> : null}
          {fOn('clase_versiculos') ? <VerseBadges key={`v-${c.id}`} contactId={c.id} /> : null}

          {ministries.length && fOn('ministerios') ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ministries.map((m) => (
                <Pressable key={m.id} onPress={() => router.push({ pathname: '/ministerio/[id]', params: { id: m.id } })} style={styles.ministry}>
                  <Feather name="star" size={13} color={colors.greenText} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText }}>{m.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* La ficha corta muestra solo lo importante según quién es. Lo demás se ve y se cambia en Editar. */}
          <Card style={{ padding: 0 }}>
            {rows.map((r, i) => <Row key={r.k} k={r.k} v={r.v} right={r.right} last={i === rows.length - 1} />)}
          </Card>
          {canEdit && isMember ? (
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: -6 }}>
              {tx('Miembro desde, discipulado, bautismo, seguimiento y cuenta en la app se ven y se cambian en')} <Text style={{ fontWeight: '700' }}>{tx('Editar')}</Text>.
            </Text>
          ) : null}

          {isStaff ? (
            <Card style={{ gap: 10 }}>
              <SectionTitle>{tx('Estado en la iglesia')}</SectionTitle>
              <Choice
                columns={3}
                options={[{ value: 'contact', label: tx('Contacto') }, { value: 'visitor', label: tx('Visita') }, { value: 'member', label: tx('Miembro') }]}
                value={c.status}
                onChange={(v) => setStatus(v as PersonStatus)}
              />
              <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Solo la secretaría y el pastor marcan miembros. Los miembros aparecen para todos en Personas y en el reporte de ausencias.')}</Text>
              {c.status === 'inactive' ? (
                <>
                  <Text style={{ fontSize: 13, color: colors.text }}>{tx('Está en')} <Text style={{ fontWeight: '800' }}>{tx('Inactivos')}</Text>{c.inactive_since ? tx(' desde el {toLocaleDateString}', { toLocaleDateString: new Date(c.inactive_since).toLocaleDateString(txLocale()) }) : ''}{tx('. Si viene y se le toma asistencia, vuelve solo.')}</Text>
                  <Button title={tx('Volver a {STATUS_LABEL}s', { STATUS_LABEL: STATUS_LABEL[c.inactive_prev ?? 'member'].toLowerCase() })} icon="user-check" variant="outline" small
                    onPress={() => setContactInactive(c.id, false).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)))} />
                </>
              ) : (
                <Button title={tx('Pasar a inactivos')} icon="user-x" variant="ghost" small
                  onPress={() => Alert.alert(tx('¿Pasar a inactivos?'), tx('{name} sale de {STATUS_LABEL}s y queda en la lista de inactivos con todos sus datos.', { name: c.name, STATUS_LABEL: STATUS_LABEL[c.status].toLowerCase() }), [
                    { text: tx('Cancelar'), style: 'cancel' },
                    { text: tx('Pasar'), onPress: () => setContactInactive(c.id, true).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
                  ])} />
              )}
              {c.status === 'member' ? (
                <Toggle label={tx('Nunca moverlo solo a inactivos')} hint={tx('Para quien no puede venir por un tiempo (enfermedad, viaje, misión).')} value={!!c.inactive_exempt}
                  onChange={(v) => setInactiveExempt(c.id, v).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)))} />
              ) : null}
            </Card>
          ) : null}

          {isStaff ? (
            <Button
              title={tx('Unir con otra ficha de la misma persona')}
              icon="git-merge"
              variant="ghost"
              small
              onPress={() => { listPeople().then((l) => setMergeList(l.filter((x) => x.id !== c.id))).catch(() => undefined); setPicker('merge'); }}
            />
          ) : null}

          {isStaff && can('personas.editar') ? (
            <Button
              title={tx('Borrar esta persona')}
              icon="trash-2"
              variant="ghost"
              small
              onPress={() => {
                if (c.profile_id) {
                  Alert.alert(tx('Tiene cuenta en la app'), tx('Esta persona tiene cuenta. Primero quitale la cuenta en Administración > Cuentas.'));
                  return;
                }
                Alert.alert(
                  tx('¿Borrar a {name}?', { name: c.name }),
                  tx('Se borra la ficha y también sus asistencias, visitas, clases y ministerios. No se puede deshacer.'),
                  [
                    { text: tx('Cancelar'), style: 'cancel' },
                    { text: tx('Borrar'), style: 'destructive', onPress: () => { deleteContact(c.id).then(() => router.back()).catch((e) => Alert.alert(tx('No se pudo borrar'), errorMessage(e))); } },
                  ],
                );
              }}
            />
          ) : null}

          <PersonasPanel c={c} onChanged={load} />
          {isLeader && fOn('discipulado') ? <DiscipleshipCard c={c} onSave={(patch) => update(patch)} /> : null}

          {/* Punto de partida: quien ya venía antes de usar la app no cuenta como "primera vez" ni como "miembro nuevo". */}
          {isStaff ? (
            <Button
              small variant="ghost" icon={c.baseline ? 'user-plus' : 'flag'}
              title={c.baseline ? tx('Ya estaba en la iglesia al empezar · contar como nuevo') : tx('Marcar: ya estaba en la iglesia antes de la app')}
              onPress={() => update({ baseline: c.baseline ? null : c.status === 'member' ? 'member' : 'person' }, c.baseline ? tx('Ahora cuenta como nuevo') : tx('Listo: no cuenta como primera vez ni como miembro nuevo'))}
            />
          ) : null}

          {isStaff ? <DatesEditor key={`${c.baptized_on}-${c.member_since}`} c={c} onSave={(p) => update(p, tx('Fechas guardadas'))} /> : null}

          {can('personas.asistencia') && fOn('asistencia_chips') ? (
            <Button title={tx('Darle un chip para la asistencia')} icon="credit-card" variant="outline" small onPress={() => router.push({ pathname: '/chips', params: { persona: c.id, nombre: c.name } } as never)} />
          ) : null}

          {fOn('bautismos') && isStaff && c.baptized_on && c.baptized_here !== false ? (
            <Button title={tx('Certificado de bautismo')} icon="award" variant="outline" small onPress={() => router.push(`/certificado/${c.id}` as never)} />
          ) : null}

          {isLeader && (!isMember || !c.discipleship_since || !isBaptized) ? (
            <Card style={{ gap: 10 }}>
              <SectionTitle>{tx('Seguimiento pastoral')}</SectionTitle>
              {!isMember && fOn('asistencia') ? <Button title={tx('Marcar que vino a una reunión')} icon="check-circle" variant="outline" small onPress={markAttendance} /> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {!c.discipleship_since && fOn('discipulado') ? <Button title={tx('Empezó discipulado')} variant="outline" small onPress={() => update({ discipleship_since: isoDate(new Date()) }, tx('Anotado: empezó discipulado'))} style={{ flex: 1 }} /> : null}
                {!isBaptized ? <Button title={tx('Se bautizó hoy')} variant="outline" small onPress={() => update({ baptized: true, baptized_here: true, baptized_on: isoDate(new Date()) }, tx('Anotado: se bautizó en la iglesia'))} style={{ flex: 1 }} /> : null}
              </View>
            </Card>
          ) : null}

          {journey.length ? (
            <>
              <SectionTitle>{tx('Su camino')}</SectionTitle>
              <View style={{ gap: 0 }}>
                {journey.map((j, i) => (
                  <View key={`${j.step}-${i}`} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ alignItems: 'center', width: 18 }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.green, marginTop: 3 }} />
                      {i < journey.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: colors.greenSoft }} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{j.label}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>{fmtDateOnly(j.at.slice(0, 10))}{j.by ? ` · ${j.by}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <SectionTitle>{tx('Historial')}</SectionTitle>
          {visits.map((v) => (
            <View key={v.id} style={{ flexDirection: 'row', gap: 12 }}>
              <Avatar name={nameOf(v.user_id)} size={32} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>
                  {nameOf(v.user_id)} · {fmtDay(v.visited_at)} · {fmtTime(v.visited_at)}
                  {v.gospel_presented ? tx(' · evangelio') : ''}{v.promise_day ? tx(' · prometió {PROMISE_LABEL}', { PROMISE_LABEL: PROMISE_LABEL[v.promise_day] }) : ''}
                </Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{v.note ?? tx('Sin notas')}</Text>
              </View>
            </View>
          ))}
          {attendances.slice(0, 30).map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="home" size={16} color={colors.blueText} />
              </View>
              <Text style={{ fontSize: 13, color: colors.text }}>
                {services.find((s) => s.id === a.service_id)?.name ?? tx('Vino a la iglesia')} · {dayName(new Date(`${a.attended_on}T12:00:00`).getDay())} {fmtDateOnly(a.attended_on)}
              </Text>
            </View>
          ))}
          {!visits.length && !attendances.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>{tx('Todavía no hay nada anotado.')}</Text> : null}

          {!adding ? (
            <Button title={tx('Registrar visita')} icon="plus" onPress={() => setAdding(true)} />
          ) : null}
        </View>
      </Screen>

      <PickerModal
        visible={picker === 'followup'}
        title={tx('¿Quién hace el seguimiento?')}
        items={people.map((p) => ({ id: p.id, title: p.display_name }))}
        allowNone
        onClose={() => setPicker(null)}
        onPick={(pid) => {
          setPicker(null);
          update({ follow_up_user_id: pid });
        }}
      />
      <PickerModal
        visible={picker === 'merge'}
        title={tx('¿Con qué ficha la unimos?')}
        items={mergeList.map((p) => ({ id: p.id, title: p.name, subtitle: [p.profile_id ? tx('Tiene cuenta en la app') : null, p.phone].filter(Boolean).join(' · ') || undefined, photo: p.photo_path }))}
        onClose={() => setPicker(null)}
        onPick={(otherId) => {
          setPicker(null);
          const other = mergeList.find((x) => x.id === otherId);
          if (!other) return;
          if (c.profile_id && other.profile_id) {
            Alert.alert(tx('No se pueden unir'), tx('Las dos fichas tienen su propia cuenta en la app, así que son dos personas distintas.'));
            return;
          }
          // Queda la ficha que tiene cuenta en la app (si alguna la tiene); si no, la que estás mirando.
          const keep = other.profile_id && !c.profile_id ? other : c;
          const drop = keep.id === c.id ? other : c;
          const run = (name: string | null) => mergeContacts(keep.id, drop.id, name)
            .then((id) => { Alert.alert(tx('Listo'), tx('Quedó una sola ficha con todo junto.')); router.replace({ pathname: '/contacto/[id]', params: { id } }); })
            .catch((e) => Alert.alert(tx('No se pudo unir'), e instanceof Error ? e.message : tx('Probá de nuevo')));
          const names = keep.name.trim() === drop.name.trim() ? [keep.name] : [keep.name, drop.name];
          Alert.alert(
            tx('Unir fichas'),
            tx('«{name}» y «{name2}» van a quedar como una sola persona: asistencias, clases, visitas, ministerios e hijos se juntan. ¿Qué nombre dejamos?', { name: c.name, name2: other.name }),
            [...names.map((n) => ({ text: n, onPress: () => { run(n); } })), { text: tx('Cancelar'), style: 'cancel' as const }],
          );
        }}
      />
      <PickerModal
        visible={picker === 'group'}
        title={tx('Elegí {groupArticle} {gw}', { groupArticle: groupArticle(church?.grouping), gw: gw.toLowerCase() })}
        items={groups.map((g) => ({ id: g.id, title: g.name, face: false }))}
        allowNone
        noneLabel={tx('Sin {gw}', { gw: gw.toLowerCase() })}
        onClose={() => setPicker(null)}
        onPick={(gid) => {
          setPicker(null);
          const before = c.group_id;
          updateContact(id, { group_id: gid })
            .then(() => (gid && church?.grouping === 'bus_routes' ? syncFamilyRoute(id, before) : undefined))
            .then(() => load())
            .catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
        }}
      />
    </View>
  );
}

function Small({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.smallBtn}>
      <Text style={{ color: colors.green, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function Action({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.action, disabled && { opacity: 0.4 }]}>
      <Feather name={icon} size={20} color={colors.green} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.green }}>{label}</Text>
    </Pressable>
  );
}

function Row({ k, v, right, last }: { k: string; v: string; right?: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>{k}</Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'right', flexShrink: 1 }}>{v}</Text>
        {right}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  action: { flex: 1, height: 58, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input, alignItems: 'center', justifyContent: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  smallBtn: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.green },
  ministry: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 999, backgroundColor: colors.greenSoft },
}));

/** Cartel para revisar una cuenta que se unió sola a esta ficha porque el celular coincide. */
function LinkReview({ contactName, profileId, linkedName, onName, busy, onConfirm, onUnlink }: {
  contactName: string; profileId: string; linkedName: string | null; onName: (n: string) => void;
  busy: boolean; onConfirm: () => void; onUnlink: () => void;
}) {
  React.useEffect(() => {
    supabase.from('profiles').select('display_name').eq('id', profileId).maybeSingle()
      .then(({ data }) => { if (data?.display_name) onName(data.display_name); });
  }, [profileId]);
  return (
    <View style={{ backgroundColor: colors.greenSoft, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Feather name="link" size={18} color={colors.green} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('¿Es la misma persona?')}</Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>
        {tx('La cuenta de la app de')} <Text style={{ fontWeight: '800' }}>{linkedName ?? '…'}</Text> {tx('se unió sola a la ficha de')}{' '}
        <Text style={{ fontWeight: '800' }}>{contactName}</Text> {tx('porque tienen el mismo celular. Si es la misma persona, no hay que hacer nada más.')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title={tx('Sí, es la misma')} icon="check" onPress={onConfirm} /></View>
        <View style={{ flex: 1 }}><Button title={tx('No es')} variant="outline" onPress={onUnlink} loading={busy} /></View>
      </View>
    </View>
  );
}
