// Inicio del escritorio: de un vistazo, cómo viene la iglesia y qué hay para atender.
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DeskButton, DeskPage, Panel } from '@/components/desk/DeskShell';
import { Face } from '@/components/Face';
import { Segmented } from '@/components/ui';
import {
  churchProgress, finBalances, listEvents, listPeople, myFirstVisitTasks, suggestionsList, upcomingBirthdays, weekendAbsences, weeklyReport,
  type BirthdayRow, type FirstVisitTask,
} from '@/lib/api';
import { delta, mondayOf } from '@/lib/desk';
import { addDays, fmtDateShort, fmtMoney, isoDate, lastSaturday, parseDate } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { openWhatsApp } from '@/lib/messages';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { AbsenceRow, ChurchEvent, Contact, FinBalance, ProgressRow, WeeklyReport } from '@/types';

type IconName = React.ComponentProps<typeof Feather>['name'];
type Week = 'last' | 'this';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default function DeskHome() {
  const router = useRouter();
  const { profile, can } = useAuth();
  const { width } = useLayout();
  const [week, setWeek] = useState<Week>('last');
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [before, setBefore] = useState<WeeklyReport | null>(null);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[] | null>(null);
  const [tasks, setTasks] = useState<FirstVisitTask[]>([]);
  const [bdays, setBdays] = useState<BirthdayRow[]>([]);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [people, setPeople] = useState<Contact[]>([]);
  const [funds, setFunds] = useState<FinBalance[]>([]);
  const [newSuggestions, setNewSuggestions] = useState(0);

  const seesPanel = can('inf.panel');
  const seesPeople = can('personas.ver_todas') || can('personas.editar');
  const seesMoney = can('fin.ver');
  const moderates = can('com.moderar');

  const monday = useMemo(() => {
    const m = parseDate(mondayOf(new Date()));
    return week === 'this' ? mondayOf(m) : mondayOf(addDays(m, -7));
  }, [week]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    const set = <T,>(p: Promise<T>, f: (v: T) => void) => p.then((v) => { if (alive) f(v); }).catch(() => undefined);
    if (seesPanel) {
      setReport(null);
      set(weeklyReport(monday), setReport);
      set(weeklyReport(mondayOf(addDays(parseDate(monday), -7))), setBefore);
      set(churchProgress(12), setProgress);
    }
    if (seesPeople || seesPanel) set(weekendAbsences(lastSaturday()), setAbsences);
    if (seesPeople) set(listPeople(), setPeople);
    set(myFirstVisitTasks(), setTasks);
    set(upcomingBirthdays(14), setBdays);
    set(listEvents(), setEvents);
    if (seesMoney) set(finBalances(), setFunds);
    if (moderates) set(suggestionsList(), (rows) => setNewSuggestions(rows.filter((r) => r.status === 'new').length));
    return () => { alive = false; };
  }, [monday, seesPanel, seesPeople, seesMoney, moderates]));

  const firstName = (profile?.display_name ?? '').trim().split(/\s+/)[0] ?? '';
  const weekLabel = `Semana del ${fmtDateShort(monday)} al ${fmtDateShort(isoDate(addDays(parseDate(monday), 6)))}`;

  const kpis: { label: string; value: number; prev?: number; icon: IconName; goodUp?: boolean }[] = report ? [
    { label: 'Asistencia', value: report.attendance, prev: before?.attendance, icon: 'users', goodUp: true },
    { label: 'Vinieron por primera vez', value: report.first_time, prev: before?.first_time, icon: 'user-plus', goodUp: true },
    { label: 'Bautismos', value: report.baptisms, prev: before?.baptisms, icon: 'droplet', goodUp: true },
    { label: 'Miembros nuevos', value: report.new_members, prev: before?.new_members, icon: 'award', goodUp: true },
    { label: 'Faltaron', value: report.absent, prev: before?.absent, icon: 'user-x', goodUp: false },
    { label: 'Oyeron el evangelio', value: report.gospel, prev: before?.gospel, icon: 'book-open', goodUp: true },
    { label: 'Salieron a evangelizar', value: report.people_out, prev: before?.people_out, icon: 'map-pin', goodUp: true },
  ] : [];

  const counts = useMemo(() => ({
    member: people.filter((c) => c.status === 'member').length,
    visitor: people.filter((c) => c.status === 'visitor').length,
    contact: people.filter((c) => c.status === 'contact').length,
  }), [people]);

  const soon = useMemo(() => {
    const now = Date.now();
    const until = now + 21 * 86400000;
    return events
      .filter((e) => !e.weekly && !e.yearly)
      .filter((e) => { const t = new Date(e.starts_at).getTime(); return t >= now - 12 * 3600000 && t <= until; })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 7);
  }, [events]);

  const absent3 = (absences ?? []).filter((a) => (a.weeks_missed ?? 1) >= 3);
  const absentRest = (absences ?? []).filter((a) => (a.weeks_missed ?? 1) < 3);
  const absentShown = [...absent3, ...absentRest].slice(0, 7);
  const overdue = tasks.filter((t) => t.overdue).length;

  const twoCols = width >= 1250;
  const kpiBasis = width >= 900 ? '23%' : '46%';

  return (
    <DeskPage
      title={firstName ? `Hola, ${firstName}` : 'Inicio'}
      subtitle="Cómo viene la iglesia y qué hay para atender."
      actions={<>
        {seesPeople ? <DeskButton label="Agregar persona" icon="user-plus" onPress={() => router.push('/persona/nueva')} /> : null}
        {can('com.anuncios') ? <DeskButton label="Mandar anuncio" icon="bell" onPress={() => router.push('/anuncios')} /> : null}
        {can('personas.asistencia') ? <DeskButton label="Tomar asistencia" icon="check-square" primary onPress={() => router.push('/asistencia')} /> : null}
      </>}
    >
      {seesPanel ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ width: 280 }}>
              <Segmented options={[{ value: 'last', label: 'Semana pasada' }, { value: 'this', label: 'Esta semana' }]} value={week} onChange={setWeek} />
            </View>
            <Text style={{ fontSize: 13, color: colors.muted }}>{weekLabel} · comparado con la semana anterior</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {report ? kpis.map((k) => {
              const d = delta(k.value, k.prev);
              const good = d && d.dir !== 'same' ? (d.dir === 'up') === !!k.goodUp : null;
              return (
                <View key={k.label} style={[styles.kpi, { flexBasis: kpiBasis }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name={k.icon} size={14} color={colors.muted} />
                    <Text style={styles.kpiLabel} numberOfLines={1}>{k.label}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={styles.kpiValue}>{k.value}</Text>
                    {d ? (
                      <Text style={{ fontSize: 13, fontWeight: '700', color: good === null ? colors.muted : good ? colors.green : colors.red }}>
                        {d.dir === 'up' ? '▲ ' : d.dir === 'down' ? '▼ ' : ''}{d.text}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            }) : <Text style={{ fontSize: 14, color: colors.muted, paddingVertical: 20 }}>Cargando la semana…</Text>}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: twoCols ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <View style={{ flex: twoCols ? 1.5 : undefined, width: twoCols ? undefined : '100%', gap: 18 }}>
          {seesPanel ? (
            <Panel title="Asistencia promedio por mes" hint="Promedio de los cultos de cada mes, últimos 12 meses" action="Ver progreso" onAction={() => router.push('/progreso-iglesia')}>
              <AttendanceBars rows={progress} />
            </Panel>
          ) : null}

          {seesPeople || seesPanel ? (
            <Panel title="Faltaron el último fin de semana" hint={absences ? `${absences.length} en total · ${absent3.length} hace tres semanas o más` : 'Cargando…'} action="Ver todos" onAction={() => router.push('/ausencias')}>
              {absences && !absences.length ? <EmptyLine text="Nadie faltó. ¡Gloria a Dios!" /> : null}
              {absentShown.map((a) => (
                <Row key={a.contact_id} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: a.contact_id } })}>
                  <Face name={a.name} path={a.photo_path} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {a.group_name ? `${a.group_name} · ` : ''}{a.last_attended ? `Vino por última vez el ${fmtDateShort(a.last_attended)}` : 'Sin asistencia anotada'}
                    </Text>
                  </View>
                  <Pill tone={(a.weeks_missed ?? 1) >= 3 ? 'red' : (a.weeks_missed ?? 1) === 2 ? 'amber' : 'gray'} text={(a.weeks_missed ?? 1) >= 3 ? '3 o más' : (a.weeks_missed ?? 1) === 2 ? '2 seguidas' : '1 vez'} />
                  <IconLink icon="message-circle" label={`WhatsApp a ${a.name}`} disabled={!a.phone} onPress={() => openWhatsApp(a.phone, '')} />
                  <IconLink icon="phone" label={`Llamar a ${a.name}`} disabled={!a.phone} onPress={() => Linking.openURL(`tel:${a.phone}`)} />
                </Row>
              ))}
            </Panel>
          ) : null}

          {seesPanel && report?.services?.length ? (
            <Panel title="Cultos de la semana" hint={weekLabel}>
              <View style={styles.tHead}>
                <Text style={[styles.th, { flex: 1 }]}>Culto</Text>
                <Text style={[styles.th, styles.num]}>Asistencia</Text>
                <Text style={[styles.th, styles.num]}>Visitas</Text>
              </View>
              {report.services.map((s) => (
                <View key={`${s.name}${s.dow}`} style={styles.tRow}>
                  <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[styles.td, styles.num, { fontWeight: '800' }]}>{s.count}</Text>
                  <Text style={[styles.td, styles.num]}>{s.visitors}</Text>
                </View>
              ))}
            </Panel>
          ) : null}
        </View>

        <View style={{ flex: twoCols ? 1 : undefined, width: twoCols ? undefined : '100%', gap: 18 }}>
          <Panel title="Para atender">
            <Todo icon="phone-call" n={tasks.length} text="visitas nuevas para llamar o visitar" extra={overdue ? `${overdue} atrasadas` : undefined} onPress={() => router.push('/seguimiento')} />
            {seesPeople || seesPanel ? <Todo icon="user-x" n={absent3.length} text="personas faltaron tres semanas o más" onPress={() => router.push('/ausencias')} /> : null}
            {moderates ? <Todo icon="message-square" n={newSuggestions} text="sugerencias sin leer" onPress={() => router.push('/sugerencias')} /> : null}
            <Todo icon="gift" n={bdays.filter((b) => daysTo(b.next_on) <= 7).length} text="cumpleaños en los próximos 7 días" onPress={() => router.push('/cumples' as Href)} />
          </Panel>

          {seesPeople ? (
            <Panel title="Personas" action="Abrir la tabla" onAction={() => router.push('/escritorio/personas' as Href)}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Count n={counts.member} label="Miembros" />
                <Count n={counts.visitor} label="Visitas" />
                <Count n={counts.contact} label="Contactos" />
              </View>
            </Panel>
          ) : null}

          <Panel title="Próximos eventos" hint="Las próximas tres semanas" action="Calendario" onAction={() => router.push('/eventos')}>
            {!soon.length ? <EmptyLine text="No hay eventos cargados para estas semanas." /> : null}
            {soon.map((e) => {
              const d = new Date(e.starts_at);
              return (
                <Row key={e.id} onPress={() => router.push({ pathname: '/evento/[id]', params: { id: e.id } } as unknown as Href)}>
                  <View style={styles.dateBox}>
                    <Text style={styles.dateDay}>{d.getDate()}</Text>
                    <Text style={styles.dateMonth}>{MONTHS[d.getMonth()]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {d.toLocaleDateString('es-AR', { weekday: 'long' })}{e.all_day ? '' : ` · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}{e.place ? ` · ${e.place}` : ''}
                    </Text>
                  </View>
                </Row>
              );
            })}
          </Panel>

          <Panel title="Cumpleaños" hint="Los próximos 14 días" action="Ver todos" onAction={() => router.push('/cumples' as Href)}>
            {!bdays.length ? <EmptyLine text="Nadie cumple años en estos días." /> : null}
            {bdays.slice(0, 6).map((b) => (
              <Row key={b.contact_id} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: b.contact_id } })}>
                <Face name={b.name} path={b.photo_path} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{b.name}</Text>
                  <Text style={styles.rowSub}>{daysTo(b.next_on) === 0 ? 'Hoy' : daysTo(b.next_on) === 1 ? 'Mañana' : fmtDateShort(b.next_on)} · cumple {b.turns}</Text>
                </View>
                <IconLink icon="message-circle" label={`Saludar a ${b.name}`} disabled={!b.phone} onPress={() => openWhatsApp(b.phone, '')} />
              </Row>
            ))}
          </Panel>

          {seesMoney && funds.length ? (
            <Panel title="Fondos" hint="Saldo de hoy" action="Finanzas" onAction={() => router.push('/finanzas')}>
              {funds.map((f) => (
                <View key={f.fund_id} style={styles.tRow}>
                  <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{f.fund}</Text>
                  <Text style={[styles.td, { fontWeight: '800', color: f.closing < 0 ? colors.red : colors.text }]}>{fmtMoney(f.closing, f.currency)}</Text>
                </View>
              ))}
            </Panel>
          ) : null}
        </View>
      </View>
    </DeskPage>
  );
}

const daysTo = (iso: string) => Math.round((parseDate(iso).getTime() - parseDate(isoDate(new Date())).getTime()) / 86400000);

function AttendanceBars({ rows }: { rows: ProgressRow[] }) {
  const shown = rows.slice(-12);
  const max = Math.max(1, ...shown.map((r) => r.avg_attendance));
  if (!shown.length) return <EmptyLine text="Todavía no hay asistencia cargada." />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 190, paddingTop: 8 }}>
      {shown.map((r, i) => {
        const m = Number(r.month.slice(5, 7)) - 1;
        const last = i === shown.length - 1;
        return (
          <View key={r.month} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}
            accessibilityLabel={`${MONTHS[m]} ${r.month.slice(0, 4)}: ${Math.round(r.avg_attendance)} de promedio`}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: last ? colors.text : colors.muted }}>{Math.round(r.avg_attendance) || ''}</Text>
            <View style={{ width: '100%', maxWidth: 44, height: `${Math.max(1.5, (r.avg_attendance / max) * 74)}%`, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: last ? colors.green : colors.blueLight }} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted }}>{MONTHS[m]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Row({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={(s) => [styles.row, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.bgSoft }]}>
      {children}
    </Pressable>
  );
}
function IconLink({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={(s) => [{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.greenSoft }, disabled && { opacity: 0.25 }]}>
      <Feather name={icon} size={16} color={colors.green} />
    </Pressable>
  );
}
function Pill({ text, tone }: { text: string; tone: 'red' | 'amber' | 'gray' }) {
  const bg = tone === 'red' ? colors.redSoft : tone === 'amber' ? colors.amberSoft : colors.graySoft;
  const fg = tone === 'red' ? colors.redText : tone === 'amber' ? colors.amberText : colors.grayText;
  return <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: bg, justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '800', color: fg }}>{text}</Text></View>;
}
function Todo({ icon, n, text, extra, onPress }: { icon: IconName; n: number; text: string; extra?: string; onPress: () => void }) {
  const quiet = n === 0;
  return (
    <Row onPress={onPress}>
      <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: quiet ? colors.bgSoft : colors.amberSoft }}>
        <Feather name={quiet ? 'check' : icon} size={16} color={quiet ? colors.muted : colors.amberText} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, color: quiet ? colors.muted : colors.text }}>
        <Text style={{ fontWeight: '800' }}>{n}</Text> {text}{extra ? <Text style={{ color: colors.red, fontWeight: '700' }}> · {extra}</Text> : null}
      </Text>
      <Feather name="chevron-right" size={16} color={colors.gray} />
    </Row>
  );
}
function Count({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.bgSoft }}>
      <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.text }}>{n}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{label}</Text>
    </View>
  );
}
function EmptyLine({ text }: { text: string }) {
  return <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 8 }}>{text}</Text>;
}

const styles = themed(() => StyleSheet.create({
  kpi: { flexGrow: 1, minWidth: 190, backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, flexShrink: 1 },
  kpiValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 12, color: colors.muted },
  tHead: { flexDirection: 'row', gap: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  tRow: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 34, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  th: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted },
  td: { fontSize: 14, color: colors.text },
  num: { width: 90, textAlign: 'right' },
  dateBox: { width: 40, height: 40, borderRadius: 9, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '800', color: colors.greenText, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '700', color: colors.greenText, textTransform: 'uppercase' },
}));
