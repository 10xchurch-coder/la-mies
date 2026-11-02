// Asistencia de una clase: el maestro marca quién vino y deja una nota por alumno.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { DateChips } from '@/components/Picker';
import { Card, Empty, Loading } from '@/components/ui';
import { classAttendance, classStudents, listClasses, saveClassAttendance } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { addDays, fmtDateShort, isoDate } from '@/lib/format';
import { colors } from '@/theme';
import { useLayout } from '@/lib/layout';
import type { ClassAttendance, ClassRow, Contact } from '@/types';

const DOW: Record<string, number> = { sun: 0, sat: 6 };

export default function AsistenciaClase() {
  const { id, date: d0 } = useLocalSearchParams<{ id: string; date: string }>();
  const [k, setK] = useState<ClassRow | null>(null);
  const [date, setDate] = useState(d0);
  const [students, setStudents] = useState<Contact[] | null>(null);
  const [att, setAtt] = useState<Record<string, ClassAttendance>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { isWide } = useLayout();

  useEffect(() => {
    listClasses().then((cs) => setK(cs.find((c) => c.id === id) ?? null)).catch(() => undefined);
    classStudents(id).then(setStudents).catch(() => setStudents([]));
  }, [id]);

  const load = useCallback(async () => {
    const rows = await classAttendance(id, date).catch(() => []);
    const map: Record<string, ClassAttendance> = {};
    const n: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.contact_id] = r;
      n[r.contact_id] = r.note ?? '';
    });
    setAtt(map);
    setNotes(n);
  }, [id, date]);

  useEffect(() => {
    load();
  }, [load]);

  const dates = useMemo(() => {
    const dows = (k?.days ?? ['sat', 'sun']).map((x) => DOW[x] ?? 0);
    const out: string[] = [];
    for (let i = 0; i < 28 && out.length < 8; i++) {
      const d = addDays(new Date(), -i);
      if (dows.includes(d.getDay())) out.push(isoDate(d));
    }
    return out.length ? out : [d0];
  }, [k, d0]);

  const save = async (c: Contact, present: boolean, note: string) => {
    setAtt((a) => ({ ...a, [c.id]: { ...(a[c.id] ?? { id: '', class_id: id, on_date: date, contact_id: c.id }), present, note } }));
    try {
      await saveClassAttendance(id, date, c.id, present, note.trim() || null);
    } catch (e) {
      Alert.alert('No se guardó', errorMessage(e));
      load();
    }
  };

  if (!students) return <Loading />;
  const present = Object.values(att).filter((a) => a.present).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={k?.name ?? 'Clase'} subtitle={`${present} presentes · ${fmtDateShort(date)}`} back />
      <Screen>
        <DateChips dates={dates} value={date} onChange={setDate} format={(d) => (d === isoDate(new Date()) ? 'Hoy' : fmtDateShort(d))} />
        {!students.length ? <Empty icon="users" title="Esta clase no tiene alumnos" text="Agregalos desde la pantalla de la clase." /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {students.map((c) => {
          const a = att[c.id];
          const on = !!a?.present;
          return (
            <Card key={c.id} style={[{ gap: 10, width: isWide ? '48%' : '100%', flexGrow: 1 }, on && { borderColor: colors.green, backgroundColor: colors.greenSoft }]}>
              <Pressable onPress={() => save(c, !on, notes[c.id] ?? '')} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Face name={c.name} path={c.photo_path} size={48} ring={on ? colors.green : undefined} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700' }}>{c.name}</Text>
                  {c.age != null ? <Text style={{ fontSize: 12, color: colors.muted }}>{c.age} años</Text> : null}
                </View>
                <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.green : '#FFF', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Feather name="check" size={18} color="#FFF" /> : null}
                </View>
              </Pressable>
              <TextInput
                value={notes[c.id] ?? ''}
                onChangeText={(t) => setNotes((n) => ({ ...n, [c.id]: t }))}
                onEndEditing={() => { if ((notes[c.id] ?? '') !== (a?.note ?? '')) save(c, on, notes[c.id] ?? ''); }}
                placeholder="Nota (ej: recitó el versículo, vino con la abuela)"
                placeholderTextColor="#8B918C"
                style={{ minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF', paddingHorizontal: 10, fontSize: 14 }}
                multiline
              />
            </Card>
          );
        })}
        </View>
      </Screen>
    </View>
  );
}
