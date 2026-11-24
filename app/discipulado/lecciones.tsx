// Las lecciones del curso de discipulado (con su nombre) o las de la clase de miembros (con ?de=miembros).
// Cada iglesia escribe las suyas. Lo guarda el pastor o la secretaría.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading } from '@/components/ui';
import { followupConfig } from '@/lib/messages';
import { DEFAULT_COURSE, DEFAULT_MEMBER_FINAL, MAX_LESSONS, cleanLessons, lessonNames, memberLessons } from '@/lib/personas';
import { peopleSettings, savePeopleSettings } from '@/lib/personasApi';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Lecciones() {
  const router = useRouter();
  const { de } = useLocalSearchParams<{ de?: string }>();
  const members = de === 'miembros';
  const { isStaff, can, refreshProfile } = useAuth();
  const [title, setTitle] = useState('');
  const [names, setNames] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    peopleSettings().then((s) => {
      if (members) {
        setTitle(s.member_final?.trim() || DEFAULT_MEMBER_FINAL);
        setNames(memberLessons(s.member_lessons));
      } else {
        setTitle(s.disc_course_name?.trim() || DEFAULT_COURSE);
        setNames(lessonNames(s.disc_lessons, Math.max(1, followupConfig().disc_one_classes)));
      }
    }).catch(() => setNames((n) => n ?? []));
  }, [members]);

  // Cambiar cuántas lecciones tiene el curso de discipulado cambia un ajuste de toda la iglesia: solo el pastor.
  const canCount = members || can('admin.iglesia');
  const save = async () => {
    if (!names) return;
    const c = cleanLessons(names);
    if (!c.ok) return Alert.alert('Revisá las lecciones', c.problem);
    if (title.trim().length < 2) return Alert.alert('Falta el nombre', members ? 'Escribí cómo se llama el último paso.' : 'Escribí cómo se llama el curso.');
    setBusy(true);
    try {
      await savePeopleSettings(members ? { member: c.names, final: title.trim() } : { course: title.trim(), disc: c.names });
      await refreshProfile().catch(() => undefined);
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={members ? 'Lecciones de la clase de miembros' : 'Lecciones del discipulado'} back />
      <Screen>
        {names === null ? <Loading /> : !isStaff ? (
          <Text style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>Esto lo cambia el pastor o la secretaría.</Text>
        ) : (
          <>
            {!members ? <Card style={{ gap: 10 }}><Field label="Nombre del curso" value={title} onChangeText={setTitle} maxLength={60} placeholder="Ej: Cristianismo Explicado" /></Card> : null}
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>Escribí el nombre de cada lección, en orden.</Text>
              {names.map((n, i) => (
                <Field key={i} label={`Lección ${i + 1}`} value={n} maxLength={80} onChangeText={(t) => setNames(names.map((x, j) => (j === i ? t : x)))} />
              ))}
              {canCount ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Agregar una lección" icon="plus" variant="outline" small style={{ flex: 1 }} disabled={names.length >= MAX_LESSONS}
                    onPress={() => setNames([...names, `Lección ${names.length + 1}`])} />
                  <Button title="Quitar la última" icon="minus" variant="ghost" small style={{ flex: 1 }} disabled={names.length <= 1}
                    onPress={() => setNames(names.slice(0, -1))} />
                </View>
              ) : <Text style={{ fontSize: 12, color: colors.muted }}>Para agregar o quitar lecciones, pedíselo al pastor.</Text>}
            </Card>
            {members ? (
              <Card style={{ gap: 10 }}>
                <Field label="Último paso (lo marca el pastor)" value={title} onChangeText={setTitle} maxLength={60} placeholder={DEFAULT_MEMBER_FINAL} />
              </Card>
            ) : null}
            <Button title="Guardar" icon="check" onPress={save} loading={busy} />
          </>
        )}
      </Screen>
    </View>
  );
}
