// La Mies Central · Ficha de una iglesia: sus datos, cómo viene (por semana, mes y año), primeros pasos, funciones,
// las notas del equipo y la historia de contactos. Nunca se ven las personas de esa iglesia ni su plata.
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Bars, Fact, Kpi, LoadError, PrivacyBox, StateChip, useCentralLoad } from '@/components/central/CentralUI';
import { PeriodPicker } from '@/components/central/PeriodPicker';
import { ReportTable } from '@/components/central/ReportTable';
import { DeskButton, DeskPage, Panel } from '@/components/desk/DeskShell';
import { Button, Choice, Field, Loading, Tag } from '@/components/ui';
import { activityLabel, COUNTRIES, progress, SIGNUP_STATUS_LABEL, SIZES, STATE_LABEL, STEPS, stepState } from '@/lib/alta';
import { netSetStatus } from '@/lib/altaData';
import { addDaysIso, attentionOf, buildReport, daysAgo, mondayIso, NOTE_KINDS, periodOf, series, type PeriodKind } from '@/lib/central';
import { centralChurch, noteAdd, noteArchive, setChurchFeature, type TechCount } from '@/lib/centralData';
import { timezoneLabel } from '@/lib/churchSetup';
import { FEATURE_GROUPS, FEATURES, featureOn } from '@/lib/features';
import { dayName, fmtDayYear } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Feather>['name'];
const PLATFORM: Record<string, string> = { web: 'Computadora o web', ios: 'iPhone / iPad', android: 'Android' };
const LANG: Record<string, string> = { get es() { return tx('Español'); }, get en() { return tx('Inglés'); } };
const TIMELINE_ICON: Record<string, IconName> = { alta: 'flag', estado: 'shield', importar: 'upload', ayuda: 'life-buoy', idea: 'zap' };

export default function CentralChurchPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useCentralLoad(() => centralChurch(String(id)), [id]);
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(() => addDaysIso(mondayIso(new Date()), -7));
  const [noteKind, setNoteKind] = useState('nota');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');

  const period = useMemo(() => periodOf(kind, anchor), [kind, anchor]);
  const report = useMemo(() => (data ? buildReport(data.weeks, period) : null), [data, period]);

  if (error && !data) return <DeskPage title={tx('Iglesia')}><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data || !report) return <DeskPage title={tx('Iglesia')}><Loading /></DeskPage>;

  const c = data.church;
  const owner = data.role === 'owner';
  const why = attentionOf(c);
  const prog = progress(c.steps, c.facts);
  const helpOn = (daysAgo(c.import_help_at) ?? 999) < 30;
  const wa = (c.pastor_whatsapp ?? '').replace(/\D/g, '');
  const closed = addDaysIso(mondayIso(new Date()), -7);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); reload(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); } finally { setBusy(false); } };

  const saveNote = () => run(async () => { await noteAdd(c.id, noteKind, note.trim()); setNote(''); });
  const removeNote = (noteId: string) => Alert.alert(tx('Sacar esta nota'), tx('Deja de verse en la ficha. No se borra de la base.'), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Sacar'), style: 'destructive', onPress: () => { run(() => noteArchive(noteId)); } },
  ]);
  // El equipo puede prender o apagar una función por la iglesia (más fácil que explicarle dónde está).
  const flip = (key: string, label: string, on: boolean) => Alert.alert(
    on ? tx('Apagar {label}', { label }) : tx('Prender {label}', { label }),
    on ? tx('A la gente de {name} se le va de la app. No se borra nada: se puede volver a prender. Al pastor le llega un aviso.', { name: c.name })
      : tx('A la gente de {name} le aparece en la app. Al pastor le llega un aviso.', { name: c.name }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: on ? tx('Apagar') : tx('Prender'), style: on ? 'destructive' : 'default', onPress: () => { run(() => setChurchFeature(c.id, key, !on)); } },
    ]);
  const tech = (title: string, rows: TechCount[], names: Record<string, string> = {}) => (
    <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{title}</Text>
      {rows.length ? rows.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13, color: colors.text }} numberOfLines={1}>{names[r.key] ?? r.key}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{r.users}</Text>
        </View>
      )) : <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Todavía no hay datos.')}</Text>}
    </View>
  );

  return (
    <DeskPage title={c.name} subtitle={[c.city, c.province, COUNTRIES.find((x) => x.code === c.country)?.label ?? c.country].filter(Boolean).join(', ') || undefined}
      actions={<>
        <DeskButton label={tx('Volver a la lista')} icon="arrow-left" onPress={() => router.push('/central/iglesias' as Href)} />
        <DeskButton label={tx('Informe para imprimir')} icon="printer" onPress={() => router.push(`/central/informes?iglesia=${c.id}` as Href)} />
      </>}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <StateChip church={c} />
        {c.is_host ? <Tag text={tx('Es nuestra iglesia')} tone="blue" /> : null}
        {c.selfserve ? <Tag text={tx('Se anotó sola · {SIGNUP_STATUS_LABEL}', { SIGNUP_STATUS_LABEL: SIGNUP_STATUS_LABEL[c.status === 'invited' ? 'pending' : c.status] })} tone={c.status === 'pending' ? 'amber' : 'gray'} /> : <Tag text={tx('La creó el equipo')} />}
        {why.map((w) => <Tag key={w.key} text={w.text} tone={w.tone} />)}
      </View>
      {c.status === 'suspended' ? <Text style={{ fontSize: 14, color: colors.red }}>{tx('Suspendida{v1}. Sus miembros no pueden usar la app.', { v1: c.suspend_reason ? `: ${c.suspend_reason}` : '' })}</Text> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Kpi icon="key" tone="blue" label={tx('Cuentas')} value={c.facts.accounts} hint={tx('{leaders} con un rol de líder', { leaders: data.now.leaders })} />
        <Kpi icon="users" tone="amber" label={tx('Fichas de personas')} value={c.facts.people} hint={tx('{members} miembros · {visitors} visitas · {contacts} contactos', { members: data.now.members, visitors: data.now.visitors, contacts: data.now.contacts })} />
        <Kpi icon="smartphone" tone="teal" label={tx('Usaron la app en 7 días')} value={c.active_7} hint={tx('{active_30} en 30 días · último movimiento: {activityLabel}', { active_30: c.active_30, activityLabel: activityLabel(c.last_activity) })} />
        <Kpi icon="life-buoy" tone={c.open_help ? 'red' : 'green'} label={tx('Pedidos de ayuda sin resolver')} value={c.open_help} onPress={() => router.push('/central/ayuda' as Href)} />
      </View>

      <Panel title={tx('La iglesia')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          <Fact label={tx('Pastor')} value={c.pastor_name} selectable />
          <Fact label={tx('Correo del pastor')} value={c.pastor_email} selectable />
          <Fact label={tx('WhatsApp del pastor')} value={c.pastor_whatsapp} selectable />
          <Fact label={tx('Entró a la app')} value={fmtDayYear(c.created_at)} />
          <Fact label={tx('Hora del lugar')} value={c.timezone ? timezoneLabel(c.timezone) : null} />
          <Fact label={tx('Tamaño que dijo al anotarse')} value={c.size_hint ? `${SIZES.find((s) => s.value === c.size_hint)?.label ?? c.size_hint} personas` : null} />
          <Fact label={tx('Reuniones')} value={data.now.services.map((s) => `${s.name} (${dayName(s.dow)}${s.time ? ` ${s.time}` : ''})`).join(' · ') || null} />
          <Fact label={tx('Clases')} value={data.now.classes} />
          <Fact label={tx('Eventos que vienen')} value={data.now.events_next} />
          <Fact label={tx('Usa Finanzas')} value={c.uses_finance ? 'Sí' : 'No'} />
          <Fact label={tx('Idioma de la app')} value={data.tech.langs.map((l) => `${LANG[l.key] ?? l.key}: ${l.users}`).join(' · ') || null} />
          {c.join_code ? <Fact label={tx('Código para los hermanos')} value={c.join_code} selectable /> : null}
        </View>
        {!c.pastor_email && !c.pastor_whatsapp ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Esta iglesia no se anotó sola, así que no dejó un contacto en la app. Usá el que ya tenés del pastor.')}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {wa.length >= 8 ? <Button title={tx('WhatsApp al pastor')} icon="message-circle" variant="outline" small onPress={() => { Linking.openURL(`https://wa.me/${wa}`).catch(() => undefined); }} /> : null}
          {c.pastor_email ? <Button title={tx('Correo al pastor')} icon="mail" variant="outline" small onPress={() => { Linking.openURL(`mailto:${c.pastor_email}`).catch(() => undefined); }} /> : null}
          {helpOn ? <Button title={tx('Cargarle la lista de personas')} icon="upload" small onPress={() => router.push(`/admin/importar?iglesia=${c.id}&nombre=${encodeURIComponent(c.name)}&pais=${c.country ?? 'AR'}` as Href)} /> : null}
          {owner && !c.is_host ? <Button title={c.pastors ? tx('Invitar a otro pastor') : tx('Invitar al pastor')} icon="user-plus" variant="outline" small onPress={() => router.push('/admin/red' as Href)} /> : null}
          {owner && c.selfserve && c.status === 'pending' ? <Button title={tx('Marcar revisada')} icon="check" small disabled={busy} onPress={() => run(() => netSetStatus(c.id, 'reviewed'))} /> : null}
          {owner && c.selfserve && c.status === 'suspended' ? <Button title={tx('Sacar la suspensión')} variant="outline" small disabled={busy} onPress={() => run(() => netSetStatus(c.id, 'reviewed'))} /> : null}
          {owner && c.selfserve && c.status !== 'suspended' ? <Button title={tx('Suspender')} variant="danger" small onPress={() => setSuspending((v) => !v)} /> : null}
        </View>
        {!helpOn ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Para cargarle la lista de personas, el pastor lo tiene que pedir desde su app. Sin ese pedido, la base no deja.')}</Text> : null}
        {suspending ? (
          <View style={{ gap: 8, maxWidth: 520 }}>
            <Field label={tx('Motivo de la suspensión')} hint={tx('(queda anotado; el pastor lo ve al entrar)')} value={reason} onChangeText={setReason} maxLength={300} />
            <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Al suspender, nadie de esa iglesia puede usar la app hasta que saques la suspensión. No se borra nada.')}</Text>
            <Button title={tx('Suspender esta iglesia')} variant="danger" small disabled={busy || reason.trim().length < 3} onPress={() => run(async () => { await netSetStatus(c.id, 'suspended', reason.trim()); setSuspending(false); setReason(''); })} />
          </View>
        ) : null}
      </Panel>

      <Panel title={tx('Cómo viene')} hint={tx('Por semana, por mes o por año, comparado con el período anterior.')}>
        <PeriodPicker kind={kind} anchor={anchor} onChange={(k, a) => { setKind(k); setAnchor(a); }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginVertical: 6 }}>
          <Bars title={tx('Asistencia por semana')} tone="green" data={series(data.weeks, 'attendance', 26, closed)} />
          <Bars title={tx('Usaron la app por semana')} tone="teal" data={series(data.weeks, 'active_users', 26)} />
          <Bars title={tx('Fichas de personas')} tone="amber" data={series(data.weeks, 'people', 26)} />
        </View>
        <ReportTable rows={report.rows} period={period} services={report.cur.services} />
      </Panel>

      {c.has_checklist ? (
        <Panel title={tx('Primeros pasos')} hint={prog.finished ? tx('Terminó todos los pasos.') : prog.label}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STEPS.map((s) => {
              const st = stepState(s.key, c.steps, c.facts);
              return (
                <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 34, borderRadius: 9, backgroundColor: st === 'done' ? colors.greenSoft : st === 'skipped' ? colors.graySoft : colors.amberSoft }}>
                  <Feather name={st === 'done' ? 'check' : st === 'skipped' ? 'skip-forward' : 'clock'} size={13} color={st === 'done' ? colors.greenText : st === 'skipped' ? colors.grayText : colors.amberText} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: st === 'done' ? colors.greenText : st === 'skipped' ? colors.grayText : colors.amberText }}>{`${s.title} · ${STATE_LABEL[st]}`}</Text>
                </View>
              );
            })}
          </View>
        </Panel>
      ) : null}

      <Panel title={tx('Funciones prendidas y apagadas')} hint={tx('Tocá una función para prenderla o apagarla por la iglesia. Queda anotado y al pastor le llega un aviso.')}>
        {FEATURE_GROUPS.map((g) => (
          <View key={g} style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{tx(g)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {FEATURES.filter((f) => f.group === g).map((f) => {
                const own = !(c.disabled_features ?? []).includes(f.key);
                const on = featureOn(c.disabled_features, f.key);
                // Una parte con su función principal apagada se ve apagada aunque esté prendida: se avisa con otro color.
                const held = own && !on;
                const chip = (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 999, backgroundColor: on ? colors.greenSoft : held ? colors.amberSoft : colors.graySoft }}>
                    <Feather name={on ? 'check' : held ? 'minus' : 'x'} size={13} color={on ? colors.greenText : held ? colors.amberText : colors.grayText} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: on ? colors.greenText : held ? colors.amberText : colors.grayText }}>{f.label}</Text>
                  </View>
                );
                return <Pressable key={f.key} accessibilityRole="switch" accessibilityState={{ checked: own }} accessibilityLabel={f.label} disabled={busy} onPress={() => flip(f.key, f.label, own)}>{chip}</Pressable>;
              })}
            </View>
          </View>
        ))}
      </Panel>

      <Panel title={tx('Aparatos y versiones')} hint={tx('Cuántas personas usaron cada uno en los últimos 30 días. Se empieza a contar desde que la iglesia tiene la versión nueva de la app.')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
          {tech(tx('Aparato'), data.tech.platforms, PLATFORM)}
          {tech(tx('Versión de la app'), data.tech.versions)}
          {tech(tx('Idioma'), data.tech.langs, LANG)}
        </View>
      </Panel>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <Panel title={tx('Notas del equipo')} hint={tx('Solo las ve el equipo de La Mies. La iglesia no.')} style={{ flex: 1, minWidth: 320 }}>
          <Choice options={NOTE_KINDS.map((k) => ({ value: k.value, label: k.label }))} value={noteKind} onChange={setNoteKind} columns={3} />
          <Field label={tx('Qué pasó o qué hay que saber')} value={note} onChangeText={setNote} multiline maxLength={2000} placeholder={tx('Hablamos por teléfono. Quedamos en ayudarle con las reuniones.')} />
          <Text style={{ fontSize: 12, color: colors.muted }}>{tx('No anotes datos de las personas de esa iglesia.')}</Text>
          <Button title={tx('Guardar la nota')} icon="plus" small disabled={busy || note.trim().length < 1} onPress={saveNote} />
          {data.notes.map((n) => {
            const k = NOTE_KINDS.find((x) => x.value === n.kind);
            return (
              <View key={n.id} style={{ flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Feather name={(k?.icon ?? 'star') as IconName} size={15} color={colors.pink} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{`${k?.label ?? tx('Sugerencia de función')} · ${fmtDayYear(n.at)}${n.author ? ` · ${n.author}` : ''}`}</Text>
                  <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{n.body}</Text>
                </View>
                {n.mine || owner ? <Pressable accessibilityRole="button" accessibilityLabel={tx('Sacar esta nota')} onPress={() => removeNote(n.id)} hitSlop={8}><Feather name="x" size={16} color={colors.muted} /></Pressable> : null}
              </View>
            );
          })}
          {!data.notes.length ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Todavía no hay notas.')}</Text> : null}
        </Panel>

        <Panel title={tx('Historia')} hint={tx('Lo que fue pasando con esta iglesia.')} style={{ flex: 1, minWidth: 320 }}>
          {[...data.timeline, ...data.notes.filter((n) => n.kind !== 'nota').map((n) => ({ at: n.at, kind: 'contacto', text: `${NOTE_KINDS.find((x) => x.value === n.kind)?.label ?? tx('Sugerencia')}: ${n.body}` }))]
            .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40).map((t, i) => (
              <View key={`${t.at}-${i}`} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
                <Feather name={TIMELINE_ICON[t.kind] ?? 'message-square'} size={14} color={colors.muted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }} numberOfLines={3}>{t.text}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{fmtDayYear(t.at)}</Text>
                </View>
              </View>
            ))}
        </Panel>
      </View>

      <PrivacyBox />
    </DeskPage>
  );
}
