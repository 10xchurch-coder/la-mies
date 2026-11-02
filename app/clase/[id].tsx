// Una clase: turnos de las próximas semanas (maestro, ayudante, material), maestros y alumnos.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Field, Loading, RowLink, SectionTitle, Tag } from '@/components/ui';
import {
  addPerson, classSchedule, classStudents, classTeachers, listClasses, listMaterials, listPeople, listProfiles, saveSchedule,
} from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { addDays, fmtDateShort, isoDate, upcomingDates } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow, ClassSchedule, ClassTeacher, Contact, Material, Profile } from '@/types';

const DOW: Record<string, number> = { sun: 0, sat: 6, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

export default function Clase() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isStaff } = useAuth();
  const [k, setK] = useState<ClassRow | null | undefined>(undefined);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [students, setStudents] = useState<Contact[]>([]);
  const [sched, setSched] = useState<ClassSchedule[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [allPeople, setAllPeople] = useState<Contact[]>([]);
  const [picker, setPicker] = useState<null | 'teacher' | 'helper' | 'student' | 'series'>(null);
  const [kidName, setKidName] = useState('');
  const [kidAge, setKidAge] = useState('');
  const [busy, setBusy] = useState(false);

  const dows = useMemo(() => (k?.days ?? ['sat', 'sun']).map((d) => DOW[d] ?? 0), [k]);
  const dates = useMemo(() => upcomingDates(dows, 8), [dows]);

  const load = useCallback(async () => {
    try {
      const [cs, t, s, p, m] = await Promise.all([
        listClasses(), classTeachers(id), classSchedule(id, isoDate(addDays(new Date(), -1)), isoDate(addDays(new Date(), 70))), listProfiles(), listMaterials(),
      ]);
      setK(cs.find((c) => c.id === id) ?? null);
      setTeachers(t);
      setSched(s);
      setPeople(p);
      setMaterials(m);
      classStudents(id).then(setStudents).catch(() => setStudents([]));
    } catch {
      setK(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isTeacher = teachers.some((t) => t.profile_id === profile?.id);
  const canManage = isStaff;
  const canStudents = isStaff || isTeacher;
  const nameOf = (pid: string | null) => people.find((p) => p.id === pid)?.display_name ?? null;
  const mainTeachers = teachers.filter((t) => !t.is_helper);

  // Última clase que pasó (o hoy), para tomar asistencia.
  const lastClassDate = useMemo(() => {
    const today = new Date();
    for (let back = 0; back < 7; back++) {
      const d = addDays(today, -back);
      if (dows.includes(d.getDay())) return isoDate(d);
    }
    return isoDate(today);
  }, [dows]);

  const addTeacher = async (pid: string | null, helper: boolean) => {
    setPicker(null);
    if (!pid) return;
    const { error } = await supabase.from('class_teachers').upsert({ class_id: id, profile_id: pid, is_helper: helper });
    if (error) Alert.alert('No se pudo', errorMessage(error));
    load();
  };

  const removeTeacher = (t: ClassTeacher) => {
    Alert.alert('Quitar', `¿Sacar a ${nameOf(t.profile_id)} de esta clase?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => {
        await supabase.from('class_teachers').delete().eq('class_id', id).eq('profile_id', t.profile_id);
        load();
      } },
    ]);
  };

  const addStudent = async (cid: string | null) => {
    setPicker(null);
    if (!cid) return;
    const { error } = await supabase.from('class_students').upsert({ class_id: id, contact_id: cid });
    if (error) Alert.alert('No se pudo', errorMessage(error));
    load();
  };

  const newKid = async () => {
    if (kidName.trim().length < 2) return;
    setBusy(true);
    try {
      const p = await addPerson({ name: kidName.trim(), age: kidAge ? Number(kidAge) : null, status: 'visitor', interest: 'some' });
      await addStudent(p.id);
      setKidName('');
      setKidAge('');
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** Reparte a los maestros por turno en las fechas que todavía no tienen maestro. */
  const rotateTeachers = async () => {
    if (!mainTeachers.length) {
      Alert.alert('Primero agregá maestros a la clase');
      return;
    }
    const last = [...sched].filter((s) => s.teacher_id).sort((a, b) => a.on_date.localeCompare(b.on_date)).pop();
    let i = last ? Math.max(0, mainTeachers.findIndex((t) => t.profile_id === last.teacher_id) + 1) : 0;
    // Mismo maestro el sábado y el domingo del mismo fin de semana; alterna cada semana.
    let lastWeek = '';
    for (const d of dates) {
      if (sched.find((s) => s.on_date === d)?.teacher_id) continue;
      const dt = new Date(`${d}T12:00:00`);
      const weekKey = isoDate(addDays(dt, -((dt.getDay() + 1) % 7)));
      if (lastWeek && weekKey !== lastWeek) i++;
      lastWeek = weekKey;
      await saveSchedule({ class_id: id, on_date: d, teacher_id: mainTeachers[i % mainTeachers.length].profile_id });
    }
    load();
  };

  /** Asigna los capítulos de una serie, en orden, a las próximas fechas sin material. */
  const fillMaterial = async (startId: string | null) => {
    setPicker(null);
    const start = materials.find((m) => m.id === startId);
    if (!start) return;
    const series = materials.filter((m) => m.series === start.series && m.chapter_order >= start.chapter_order).sort((a, b) => a.chapter_order - b.chapter_order);
    let j = 0;
    let lastWeek = '';
    for (const d of dates) {
      if (sched.find((s) => s.on_date === d)?.material_id) continue;
      const dt = new Date(`${d}T12:00:00`);
      const weekKey = isoDate(addDays(dt, -((dt.getDay() + 1) % 7)));
      if (lastWeek && weekKey !== lastWeek) j++;
      lastWeek = weekKey;
      if (!series[j]) break;
      await saveSchedule({ class_id: id, on_date: d, material_id: series[j].id });
    }
    load();
  };

  if (k === undefined) return <Loading />;
  if (!k) return <View style={{ flex: 1 }}><Header title="Clase" back /><Text style={{ padding: 24 }}>No se encontró.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={k.name} subtitle={`${students.length} ${students.length === 1 ? 'alumno' : 'alumnos'} · ${mainTeachers.length} ${mainTeachers.length === 1 ? 'maestro' : 'maestros'}`} back />
      <Screen>
        {canStudents ? (
          <Button title={`Tomar asistencia · ${fmtDateShort(lastClassDate)}`} icon="check-square" onPress={() => router.push({ pathname: '/clase/asistencia', params: { id, date: lastClassDate } })} />
        ) : null}

        <SectionTitle>Próximas clases</SectionTitle>
        <Card style={{ padding: 0 }}>
          {dates.map((d) => {
            const s = sched.find((x) => x.on_date === d);
            const m = materials.find((x) => x.id === s?.material_id);
            const mine = s?.teacher_id === profile?.id || s?.helper_id === profile?.id;
            return (
              <RowLink
                key={d}
                icon={mine ? 'star' : 'calendar'}
                title={`${fmtDateShort(d)} · ${nameOf(s?.teacher_id ?? null) ?? 'Sin maestro'}${s?.helper_id ? ` + ${nameOf(s.helper_id)}` : ''}`}
                subtitle={m ? `${m.series} · ${m.title}` : 'Sin material asignado'}
                onPress={
                  canManage
                    ? () => router.push({ pathname: '/clase/turno', params: { id, date: d } })
                    : m ? () => router.push({ pathname: '/material/[id]', params: { id: m.id } }) : undefined
                }
              />
            );
          })}
        </Card>
        {canManage ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Alternar maestros" icon="repeat" variant="outline" small onPress={rotateTeachers} style={{ flex: 1 }} />
            <Button title="Material en orden" icon="list" variant="outline" small onPress={() => setPicker('series')} style={{ flex: 1 }} />
          </View>
        ) : null}
        {canManage ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>“Alternar maestros” llena las fechas vacías turnándolos por semana. “Material en orden” asigna los capítulos de una serie, uno por semana, desde el que elijas. El lunes a la mañana cada maestro recibe el aviso con su capítulo.</Text> : null}

        <SectionTitle>Maestros</SectionTitle>
        <Card style={{ padding: 0 }}>
          {teachers.map((t) => (
            <RowLink key={t.profile_id} icon="user" title={nameOf(t.profile_id) ?? 'Maestro'} subtitle={t.is_helper ? 'Ayudante' : 'Maestro'} onPress={canManage ? () => removeTeacher(t) : undefined} />
          ))}
          {!teachers.length ? <Text style={{ padding: 14, color: colors.muted }}>Todavía no hay maestros.</Text> : null}
        </Card>
        {canManage ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Agregar maestro" icon="user-plus" variant="outline" small onPress={() => setPicker('teacher')} style={{ flex: 1 }} />
            <Button title="Agregar ayudante" icon="user-plus" variant="outline" small onPress={() => setPicker('helper')} style={{ flex: 1 }} />
          </View>
        ) : null}

        <SectionTitle>Alumnos</SectionTitle>
        {canStudents ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {students.map((s) => (
                <Pressable key={s.id} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: s.id } })} style={{ width: 72, alignItems: 'center', gap: 4 }}>
                  <Face name={s.name} path={s.photo_path} size={56} />
                  <Text numberOfLines={2} style={{ fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{s.name}{s.age != null ? ` (${s.age})` : ''}</Text>
                </Pressable>
              ))}
            </View>
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700' }}>Agregar un alumno nuevo</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="Nombre" value={kidName} onChangeText={setKidName} style={{ flex: 1 }} autoCapitalize="words" />
                <Field label="Edad" keyboardType="number-pad" value={kidAge} onChangeText={(t) => setKidAge(t.replace(/\D/g, ''))} style={{ width: 70 }} />
              </View>
              <Button title="Agregar" small onPress={newKid} loading={busy} disabled={kidName.trim().length < 2} />
              <Button title="Elegir de las personas cargadas" variant="ghost" small onPress={() => { listPeople().then(setAllPeople).catch(() => undefined); setPicker('student'); }} />
            </Card>
          </>
        ) : (
          <Text style={{ fontSize: 13, color: colors.muted }}>La lista de alumnos la ven los maestros de la clase y los líderes.</Text>
        )}
        {isTeacher ? <Tag text="Sos maestro de esta clase" tone="green" /> : null}
      </Screen>

      <PickerModal visible={picker === 'teacher' || picker === 'helper'} title={picker === 'helper' ? 'Elegí el ayudante' : 'Elegí el maestro'}
        items={people.map((p) => ({ id: p.id, title: p.display_name }))} onClose={() => setPicker(null)} onPick={(pid) => addTeacher(pid, picker === 'helper')} />
      <PickerModal visible={picker === 'student'} title="Elegí el alumno"
        items={allPeople.filter((p) => !students.some((s) => s.id === p.id)).map((p) => ({ id: p.id, title: p.name, subtitle: p.age != null ? `${p.age} años` : undefined, photo: p.photo_path }))}
        onClose={() => setPicker(null)} onPick={addStudent} />
      <PickerModal visible={picker === 'series'} title="¿Desde qué capítulo?"
        items={materials.map((m) => ({ id: m.id, title: m.title, subtitle: m.series, face: false }))} onClose={() => setPicker(null)} onPick={fillMaterial} />
    </View>
  );
}
