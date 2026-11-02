// Clases de la escuela dominical: cada una con su maestro de la semana y el material que toca.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Tag } from '@/components/ui';
import { classSchedule, classTeachers, listClasses, listMaterials, listProfiles } from '@/lib/api';
import { addDays, fmtDateShort, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow, ClassSchedule, ClassTeacher, Material, Profile } from '@/types';

export default function Clases() {
  const router = useRouter();
  const { profile } = useAuth();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [sched, setSched] = useState<ClassSchedule[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  useFocusEffect(
    useCallback(() => {
      const today = isoDate(new Date());
      Promise.all([listClasses(), classTeachers(), classSchedule(null, today, isoDate(addDays(new Date(), 8))), listProfiles(), listMaterials()])
        .then(([c, t, s, p, m]) => {
          setClasses(c);
          setTeachers(t);
          setSched(s);
          setPeople(p);
          setMaterials(m);
        })
        .catch(() => setClasses([]));
    }, []),
  );

  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.display_name ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Clases" subtitle="Escuela dominical · sábado y domingo" back />
      <Screen>
        {classes && !classes.length ? <Empty icon="book" title="No hay clases cargadas" text="El pastor o la secretaría las crea desde la base de datos (ya vienen Cuna, 2 a 6 y 6 a 12)." /> : null}
        {(classes ?? []).map((k) => {
          const mine = teachers.some((t) => t.class_id === k.id && t.profile_id === profile?.id);
          const next = sched.filter((s) => s.class_id === k.id);
          return (
            <Pressable key={k.id} onPress={() => router.push({ pathname: '/clase/[id]', params: { id: k.id } })} accessibilityRole="button">
              <Card style={[{ gap: 8 }, mine && { borderColor: colors.green, borderWidth: 2 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Feather name="book-open" size={22} color={colors.green} />
                  <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text }}>{k.name}</Text>
                  {mine ? <Tag text="Sos maestro" tone="green" /> : null}
                  <Feather name="chevron-right" size={20} color={colors.muted} />
                </View>
                {next.length ? next.map((s) => {
                  const m = materials.find((x) => x.id === s.material_id);
                  return (
                    <Text key={s.id} style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>
                      <Text style={{ fontWeight: '700' }}>{fmtDateShort(s.on_date)}: </Text>
                      {nameOf(s.teacher_id) ?? 'sin maestro'}{s.helper_id ? ` + ${nameOf(s.helper_id)}` : ''}{m ? ` · ${m.title}` : ''}
                    </Text>
                  );
                }) : <Text style={{ fontSize: 13, color: colors.muted }}>Esta semana todavía no tiene maestro asignado</Text>}
              </Card>
            </Pressable>
          );
        })}
      </Screen>
    </View>
  );
}
