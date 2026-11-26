// Clases de la escuela dominical: cada una con su maestro de la semana y el material que toca.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Tag } from '@/components/ui';
import { classSchedule, classTeachers, listMaterials, listProfiles, listSchoolClasses, scheduleName } from '@/lib/api';
import { addDays, fmtDateShort, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow, ClassSchedule, ClassTeacher, Material, Profile } from '@/types';
import { tx } from '@/lib/i18n';

export default function Clases() {
  const router = useRouter();
  const { profile, isLeader, can } = useAuth();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [sched, setSched] = useState<ClassSchedule[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  useFocusEffect(
    useCallback(() => {
      const today = isoDate(new Date());
      Promise.all([listSchoolClasses(), classTeachers(), classSchedule(null, today, isoDate(addDays(new Date(), 8))), listProfiles(), listMaterials()])
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
      <Header title={isLeader ? tx('Clases') : tx('Mis clases')} subtitle={tx('Escuela dominical · sábado y domingo')} back />
      <Screen>
        {can('ens.editar') ? <Button title={tx('Nueva clase')} icon="plus" onPress={() => router.push('/clase/editar' as never)} /> : null}
        {can('ens.editar') ? <Button title={tx('Planificar el mes (sugerencia automática)')} icon="shuffle" variant="outline" onPress={() => router.push('/clase/planificar')} /> : null}
        {classes && !classes.length ? <Empty icon="book" title={tx('No hay clases cargadas')} text={can('ens.editar') ? tx('Tocá “Nueva clase” para crear la primera: por ejemplo Niños, Jóvenes o Adultos.') : tx('El pastor o la secretaría las crea desde acá.')} /> : null}
        {(classes ?? []).map((k) => {
          const mine = teachers.some((t) => t.class_id === k.id && t.profile_id === profile?.id);
          const next = sched.filter((s) => s.class_id === k.id);
          return (
            <Pressable key={k.id} onPress={() => router.push({ pathname: '/clase/[id]', params: { id: k.id } })} accessibilityRole="button">
              <Card style={[{ gap: 8 }, mine && { borderColor: colors.green, borderWidth: 2 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Feather name="book-open" size={22} color={colors.green} />
                  <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text }}>{k.name}</Text>
                  {mine ? <Tag text={tx('Sos maestro')} tone="green" /> : null}
                  <Feather name="chevron-right" size={20} color={colors.muted} />
                </View>
                {next.length ? next.map((s) => {
                  const m = materials.find((x) => x.id === s.material_id);
                  return (
                    <Text key={s.id} style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>
                      <Text style={{ fontWeight: '700' }}>{fmtDateShort(s.on_date)}: </Text>
                      {scheduleName(s, 'teacher', (p) => nameOf(p) ?? undefined) ?? tx('sin maestro')}{scheduleName(s, 'helper', (p) => nameOf(p) ?? undefined) ? ` + ${scheduleName(s, 'helper', (p) => nameOf(p) ?? undefined)}` : ''}{m ? ` · ${m.title}` : ''}
                    </Text>
                  );
                }) : <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Esta semana todavía no tiene maestro asignado')}</Text>}
              </Card>
            </Pressable>
          );
        })}
      </Screen>
    </View>
  );
}
