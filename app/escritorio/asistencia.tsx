// Escritorio · Asistencia del día: se ve en vivo quién quedó marcado en cada reunión y en cada clase,
// para revisar que no falte nadie. Se actualiza sola cada pocos segundos mientras otro toma la asistencia.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DeskButton, DeskPage, Panel } from '@/components/desk/DeskShell';
import { Loading } from '@/components/ui';
import { attendanceSheet, classAttendance, classStudents, listClasses, listServices, setAttendance } from '@/lib/api';
import { summarizeSheet } from '@/lib/desk';
import { addDays, fmtTime, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { ChurchService, ClassRow, SheetRow } from '@/types';

type ServiceDay = { service: ChurchService; rows: SheetRow[] };
type ClassDay = { cls: ClassRow; present: string[]; absent: string[] };

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const longDate = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;

export default function DeskAttendance() {
  const router = useRouter();
  const { can } = useAuth();
  const canMark = can('personas.asistencia');
  const [day, setDay] = useState(() => new Date());
  const [services, setServices] = useState<ServiceDay[] | null>(null);
  const [classes, setClasses] = useState<ClassDay[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [showMissing, setShowMissing] = useState<Record<string, boolean>>({});
  const busy = useRef(0);
  const date = isoDate(day);
  const isToday = date === isoDate(new Date());

  const load = useCallback(async () => {
    const d = new Date(`${date}T12:00:00`);
    const [all, cls] = await Promise.all([listServices(), listClasses().catch(() => [] as ClassRow[])]);
    const todays = all.filter((s) => s.dow === d.getDay());
    const sv = await Promise.all(todays.map(async (service) => ({ service, rows: await attendanceSheet(date, service.id) })));
    const cl = await Promise.all(cls.filter((c) => c.active).map(async (c) => {
      const [att, students] = await Promise.all([classAttendance(c.id, date), classStudents(c.id).catch(() => [])]);
      const name = new Map(students.map((s) => [s.id, s.name]));
      return {
        cls: c,
        present: att.filter((a) => a.present).map((a) => name.get(a.contact_id) ?? 'Sin nombre').sort((a, b) => a.localeCompare(b, 'es')),
        absent: att.filter((a) => !a.present).map((a) => name.get(a.contact_id) ?? 'Sin nombre').sort((a, b) => a.localeCompare(b, 'es')),
      };
    }));
    if (busy.current) return; // hay un cambio a medio guardar: no pisarlo con datos viejos
    setServices(sv);
    setClasses(cl.filter((c) => c.present.length + c.absent.length > 0));
    setUpdated(new Date());
  }, [date]);

  useEffect(() => {
    setServices(null);
    load().catch((e) => { setServices([]); Alert.alert('No se pudo cargar', errorMessage(e)); });
    const id = setInterval(() => { load().catch(() => undefined); }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async (sd: ServiceDay, row: SheetRow) => {
    if (!canMark) return;
    const next = !row.present;
    setServices((cur) => (cur ?? []).map((x) => (x.service.id === sd.service.id ? { ...x, rows: x.rows.map((r) => (r.contact_id === row.contact_id ? { ...r, present: next } : r)) } : x)));
    busy.current++;
    try {
      await setAttendance(row.contact_id, date, sd.service.id, next);
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      busy.current--;
      load().catch(() => undefined);
    }
  };

  const chip = (sd: ServiceDay, r: SheetRow) => (
    <Pressable key={r.contact_id} disabled={!canMark} onPress={() => toggle(sd, r)} accessibilityRole="button"
      accessibilityLabel={`${r.name}: ${r.present ? 'presente. Tocar para quitar' : 'no marcado. Tocar para marcar presente'}`}
      style={(s) => [styles.chip, r.present ? styles.chipOn : styles.chipOff, (s as { hovered?: boolean }).hovered && canMark && { opacity: 0.8 }]}>
      <Feather name={r.present ? 'check' : 'plus'} size={13} color={r.present ? colors.greenText : colors.muted} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: r.present ? colors.greenText : colors.text }}>{r.name}</Text>
      {r.status !== 'member' ? <Text style={{ fontSize: 11, color: colors.muted }}>visita</Text> : null}
    </Pressable>
  );

  return (
    <DeskPage
      title="Asistencia del día"
      subtitle={`${isToday ? 'Hoy, ' : ''}${longDate(day)}${updated ? ` · actualizado ${fmtTime(updated)}` : ''} · se actualiza sola`}
      actions={(
        <>
          {Platform.OS === 'web' ? React.createElement('input', {
            type: 'date', value: date, max: isoDate(new Date()), 'aria-label': 'Elegir una fecha',
            onChange: (e: { target: { value: string } }) => { if (e.target.value) setDay(new Date(`${e.target.value}T12:00:00`)); },
            style: { height: 36, padding: '0 10px', borderRadius: 9, border: `1px solid ${colors.input}`, background: colors.bg, color: colors.text, fontSize: 13, fontFamily: 'inherit' },
          }) : null}
          <DeskButton label="Domingo pasado" onPress={() => { const t = new Date(); setDay(addDays(t, -(t.getDay() === 0 ? 7 : t.getDay()))); }} />
          <DeskButton label="Día anterior" icon="chevron-left" onPress={() => setDay((d) => addDays(d, -1))} />
          <DeskButton label="Hoy" onPress={() => setDay(new Date())} disabled={isToday} />
          <DeskButton label="Día siguiente" icon="chevron-right" onPress={() => setDay((d) => addDays(d, 1))} disabled={isToday} />
          {canMark ? <DeskButton label="Tomar asistencia" icon="check-square" primary onPress={() => router.push('/asistencia')} /> : null}
        </>
      )}
    >
      {services === null ? <Loading /> : (
        <>
          {services.length === 0 ? (
            <Panel title="No hay reuniones este día" hint="Las reuniones se configuran en Ajustes. Probá con otro día.">
              <View />
            </Panel>
          ) : services.map((sd) => {
            const sum = summarizeSheet(sd.rows);
            const here = sd.rows.filter((r) => r.present);
            const missing = sd.rows.filter((r) => !r.present && r.status === 'member');
            const open = !!showMissing[sd.service.id];
            return (
              <Panel key={sd.service.id} title={`${sd.service.name} · ${sd.service.time.slice(0, 5)}`} hint={sum.present === 0 ? 'Todavía no se marcó a nadie' : undefined}>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <Num value={sum.present} label="Presentes" tone="green" />
                  <Num value={sum.members} label="Miembros" />
                  <Num value={sum.visitors} label="Visitas" tone="blue" />
                  <Num value={sum.missing} label="Miembros sin marcar" tone={sum.missing ? 'amber' : undefined} />
                </View>
                {here.length ? (
                  <>
                    <Text style={styles.sub}>Presentes{canMark ? ' (tocá un nombre para quitarlo)' : ''}</Text>
                    <View style={styles.chips}>{here.map((r) => chip(sd, r))}</View>
                  </>
                ) : null}
                {missing.length ? (
                  <>
                    <Pressable onPress={() => setShowMissing((m) => ({ ...m, [sd.service.id]: !open }))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                      <Feather name={open ? 'chevron-down' : 'chevron-right'} size={16} color={colors.muted} />
                      <Text style={styles.sub}>Miembros sin marcar ({missing.length}){canMark && open ? ' — tocá un nombre para marcarlo presente' : ''}</Text>
                    </Pressable>
                    {open ? <View style={styles.chips}>{missing.map((r) => chip(sd, r))}</View> : null}
                  </>
                ) : null}
              </Panel>
            );
          })}

          <Panel title="Clases" hint={classes.length ? undefined : 'Ninguna clase tomó asistencia este día todavía.'}>
            {classes.map((c) => (
              <View key={c.cls.id} style={styles.classRow}>
                <View style={{ width: 190 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{c.cls.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{c.present.length} {c.present.length === 1 ? 'presente' : 'presentes'}{c.absent.length ? ` · ${c.absent.length} ${c.absent.length === 1 ? 'ausente' : 'ausentes'}` : ''}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 }}>{c.present.join(' · ') || '—'}</Text>
              </View>
            ))}
          </Panel>
        </>
      )}
    </DeskPage>
  );
}

function Num({ value, label, tone }: { value: number; label: string; tone?: 'green' | 'blue' | 'amber' }) {
  const bg = tone === 'green' ? colors.greenSoft : tone === 'blue' ? colors.blueSoft : tone === 'amber' ? colors.amberSoft : colors.bgSoft;
  const fg = tone === 'green' ? colors.greenText : tone === 'blue' ? colors.blueText : tone === 'amber' ? colors.amberText : colors.text;
  return (
    <View style={{ minWidth: 130, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: bg }}>
      <Text style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: fg }}>{value}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: tone ? fg : colors.muted }}>{label}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  sub: { fontSize: 12, fontWeight: '700', color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  chipOn: { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft },
  chipOff: { backgroundColor: colors.bg, borderColor: colors.input },
  classRow: { flexDirection: 'row', gap: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
}));
