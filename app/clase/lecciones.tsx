// Las lecciones de una clase, día por día: para que el maestro (o quien lo reemplace) abra la de su día y enseñe.
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Card, Loading, RowLink, SectionTitle } from '@/components/ui';
import { listClasses } from '@/lib/api';
import { lessonDays, type LessonDay } from '@/lib/culto';
import { addDays, fmtDateShort, isoDate, upcomingDates } from '@/lib/format';
import { colors } from '@/theme';
import type { ClassRow } from '@/types';
import { tx } from '@/lib/i18n';

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export default function Lecciones() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [k, setK] = useState<ClassRow | null | undefined>(undefined);
  const [days, setDays] = useState<LessonDay[]>([]);

  useFocusEffect(useCallback(() => {
    listClasses().then((cs) => setK(cs.find((c) => c.id === id) ?? null)).catch(() => setK(null));
    lessonDays(id, isoDate(addDays(new Date(), -35)), isoDate(addDays(new Date(), 90))).then(setDays).catch(() => setDays([]));
  }, [id]));

  const today = isoDate(new Date());
  const next = useMemo(() => upcomingDates((k?.days ?? ['sun']).map((d) => DOW[d] ?? 0), 8), [k]);
  const past = days.filter((d) => d.on_date < today && d.lesson).reverse();
  const open = (date: string) => router.push({ pathname: '/clase/leccion', params: { id, date } } as unknown as Href);

  if (k === undefined) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Lecciones')} subtitle={k?.name ?? tx('Clase')} back />
      <Screen>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>{tx('Tocá un día para ver la lección. Los maestros de la clase y los líderes la pueden cargar o cambiar.')}</Text>
        <SectionTitle>{tx('Próximas clases')}</SectionTitle>
        <Card style={{ padding: 0 }}>
          {next.map((d) => {
            const l = days.find((x) => x.on_date === d)?.lesson;
            return <RowLink key={d} icon={l ? 'book-open' : 'calendar'} title={`${fmtDateShort(d)}${d === today ? tx(' · hoy') : ''}`} subtitle={l ? l.title : tx('Sin lección cargada')} onPress={() => open(d)} />;
          })}
        </Card>
        {past.length ? (
          <>
            <SectionTitle>{tx('Las últimas')}</SectionTitle>
            <Card style={{ padding: 0 }}>
              {past.map((d) => <RowLink key={d.on_date} icon="book-open" title={fmtDateShort(d.on_date)} subtitle={d.lesson?.title} onPress={() => open(d.on_date)} />)}
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
