// Quién da la clase una fecha puntual, quién ayuda y qué capítulo toca.
// Los maestros se eligen entre los miembros de la iglesia (no hace falta que tengan cuenta en la app).
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Field, Loading, RowLink } from '@/components/ui';
import { classSchedule, classTeachers, listMaterials, listMembers, listProfiles, saveSchedule } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { fmtDateShort } from '@/lib/format';
import { colors } from '@/theme';
import type { ClassTeacher, Contact, Material, Profile } from '@/types';

export default function Turno() {
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState<Contact[]>([]);
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
    Promise.all([listMembers(), listProfiles(), classTeachers(id), listMaterials(), classSchedule(id, date, date)]).then(([mem, p, t, m, s]) => {
      setMembers(mem);
      setPeople(p);
      setTeachers(t);
      setMaterials(m);
      const row = s[0];
      if (row) {
        // Si el turno viejo tenía solo la cuenta, buscar la ficha de esa cuenta.
        const byProfile = (pid: string | null) => (pid ? mem.find((c) => c.profile_id === pid)?.id ?? null : null);
        setTeacher(row.teacher_contact_id ?? byProfile(row.teacher_id));
        setHelper(row.helper_contact_id ?? byProfile(row.helper_id));
        setMaterial(row.material_id);
        setNote(row.note ?? '');
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [id, date]);

  const save = async () => {
    setBusy(true);
    try {
      const t = members.find((c) => c.id === teacher);
      const h = members.find((c) => c.id === helper);
      await saveSchedule({
        class_id: id, on_date: date,
        teacher_contact_id: teacher, helper_contact_id: helper,
        // La cuenta (si la tiene) es la que recibe el aviso del lunes.
        teacher_id: t?.profile_id ?? null, helper_id: h?.profile_id ?? null,
        material_id: material, note: note.trim() || null,
      });
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Loading />;
  const nameOf = (cid: string | null) => members.find((c) => c.id === cid)?.name;
  const m = materials.find((x) => x.id === material);
  const isClassTeacher = (c: Contact) => (c.profile_id ? teachers.find((t) => t.profile_id === c.profile_id) : undefined);
  // Primero los maestros de la clase, después el resto de los miembros.
  const ordered = [...members].sort((a, b) => Number(!!isClassTeacher(b)) - Number(!!isClassTeacher(a)) || a.name.localeCompare(b.name));
  const items = ordered.map((c) => {
    const t = isClassTeacher(c);
    return { id: c.id, title: c.name, subtitle: t ? (t.is_helper ? 'Ayudante de la clase' : 'Maestro de la clase') : (c.profile_id ? people.find((p) => p.id === c.profile_id) ? 'Tiene la app' : undefined : undefined) };
  });

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
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Se eligen entre los miembros de la iglesia. Si el maestro o el ayudante tienen la app, el lunes de esa semana reciben un aviso con la clase y el capítulo.</Text>
        <Button title="Guardar" onPress={save} loading={busy} />
      </Screen>
      <PickerModal visible={picker === 'teacher'} title="Maestro" items={items} allowNone onClose={() => setPicker(null)} onPick={(v) => { setTeacher(v); setPicker(null); }} />
      <PickerModal visible={picker === 'helper'} title="Ayudante" items={items} allowNone onClose={() => setPicker(null)} onPick={(v) => { setHelper(v); setPicker(null); }} />
      <PickerModal visible={picker === 'material'} title="Material" allowNone noneLabel="Sin material"
        items={materials.map((x) => ({ id: x.id, title: x.title, subtitle: x.series, face: false }))} onClose={() => setPicker(null)} onPick={(v) => { setMaterial(v); setPicker(null); }} />
    </View>
  );
}
