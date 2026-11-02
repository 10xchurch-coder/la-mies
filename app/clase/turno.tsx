// Quién da la clase una fecha puntual, quién ayuda y qué capítulo toca.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Field, Loading, RowLink } from '@/components/ui';
import { classSchedule, classTeachers, listMaterials, listProfiles, saveSchedule } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { fmtDateShort } from '@/lib/format';
import { colors } from '@/theme';
import type { ClassTeacher, Material, Profile } from '@/types';

export default function Turno() {
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const [loaded, setLoaded] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [teacher, setTeacher] = useState<string | null>(null);
  const [helper, setHelper] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState<null | 'teacher' | 'helper' | 'material'>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listProfiles(), classTeachers(id), listMaterials(), classSchedule(id, date, date)]).then(([p, t, m, s]) => {
      setPeople(p);
      setTeachers(t);
      setMaterials(m);
      if (s[0]) {
        setTeacher(s[0].teacher_id);
        setHelper(s[0].helper_id);
        setMaterial(s[0].material_id);
        setNote(s[0].note ?? '');
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [id, date]);

  const save = async () => {
    setBusy(true);
    try {
      await saveSchedule({ class_id: id, on_date: date, teacher_id: teacher, helper_id: helper, material_id: material, note: note.trim() || null });
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Loading />;
  const nameOf = (pid: string | null) => people.find((p) => p.id === pid)?.display_name;
  const m = materials.find((x) => x.id === material);
  // Primero los maestros de la clase, después el resto.
  const ordered = [...people].sort((a, b) => Number(teachers.some((t) => t.profile_id === b.id)) - Number(teachers.some((t) => t.profile_id === a.id)));
  const items = ordered.map((p) => ({ id: p.id, title: p.display_name, subtitle: teachers.find((t) => t.profile_id === p.id) ? (teachers.find((t) => t.profile_id === p.id)?.is_helper ? 'Ayudante de la clase' : 'Maestro de la clase') : undefined }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Turno de la clase" subtitle={fmtDateShort(date)} back />
      <Screen>
        <Card style={{ padding: 0 }}>
          <RowLink icon="user" title={nameOf(teacher) ?? 'Elegir maestro'} subtitle="Maestro" onPress={() => setPicker('teacher')} />
          <RowLink icon="user-plus" title={nameOf(helper) ?? 'Sin ayudante'} subtitle="Ayudante" onPress={() => setPicker('helper')} />
          <RowLink icon="book" title={m ? m.title : 'Elegir material'} subtitle={m ? m.series : 'Capítulo o lección'} onPress={() => setPicker('material')} />
        </Card>
        <Field label="Nota para el maestro" hint="(opcional)" value={note} onChangeText={setNote} multiline />
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>El lunes de esa semana, el maestro y el ayudante reciben un aviso con la clase y el capítulo.</Text>
        <Button title="Guardar" onPress={save} loading={busy} />
      </Screen>
      <PickerModal visible={picker === 'teacher'} title="Maestro" items={items} allowNone onClose={() => setPicker(null)} onPick={(v) => { setTeacher(v); setPicker(null); }} />
      <PickerModal visible={picker === 'helper'} title="Ayudante" items={items} allowNone onClose={() => setPicker(null)} onPick={(v) => { setHelper(v); setPicker(null); }} />
      <PickerModal visible={picker === 'material'} title="Material" allowNone noneLabel="Sin material"
        items={materials.map((x) => ({ id: x.id, title: x.title, subtitle: x.series, face: false }))} onClose={() => setPicker(null)} onPick={(v) => { setMaterial(v); setPicker(null); }} />
    </View>
  );
}
