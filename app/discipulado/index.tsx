// Discipulado: todos los que están haciendo el curso, por qué lección van, quién les enseña y hace cuánto no se juntan.
// Los líderes ven a todos; cada hermano ve a los que él enseña.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Empty, Loading, Stat, Tag } from '@/components/ui';
import { DEFAULT_COURSE, STALE_DAYS, agoText, daysSinceDay, isStale, lessonNames, lessonProgress, sortDisciples, type DiscRow } from '@/lib/personas';
import { discLesson, discList, discStart, peopleSettings, personChoices, teacherChoices, type DiscList, type PeopleSettings } from '@/lib/personasApi';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

type Show = 'now' | 'stale' | 'done';

export default function Discipulado() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const [data, setData] = useState<DiscList | null>(null);
  const [cfg, setCfg] = useState<PeopleSettings | null>(null);
  const [show, setShow] = useState<Show>('now');
  const [people, setPeople] = useState<{ id: string; name: string; photo_path: string | null; status: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string; photo_path: string | null }[]>([]);
  const [picker, setPicker] = useState<null | 'person' | 'teacher'>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const load = useCallback(() => {
    discList().then(setData).catch(() => setData((d) => d ?? { total: 0, lead: false, rows: [] }));
    peopleSettings().then(setCfg).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const total = data?.total ?? 0;
  const names = lessonNames(cfg?.disc_lessons, total);
  const course = cfg?.disc_course_name?.trim() || tx(DEFAULT_COURSE);
  const groups = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => r.active);
    const done = rows.filter((r) => lessonProgress(r.lessons, total).complete);
    const now = sortDisciples(rows.filter((r) => !lessonProgress(r.lessons, total).complete));
    return { now, stale: now.filter((r) => isStale(r.last_met, r.started_on)), done };
  }, [data, total]);
  const list = groups[show];

  const addLesson = (r: DiscRow) => {
    const next = lessonProgress(r.lessons, total).next;
    if (!next) return;
    Alert.alert(r.name, tx('¿Hoy hicieron «{names}» (lección {next} de {total})?', { names: names[next - 1], next, total }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Sí, anotar'), onPress: () => { discLesson(r.id, next, null).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))); } },
    ]);
  };
  const startWith = () => {
    personChoices().then(setPeople).catch(() => undefined);
    teacherChoices().then(setTeachers).catch(() => undefined);
    setPicker('person');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Discipulado')} subtitle={course} back />
      <Screen>
        {data === null ? <Loading /> : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={groups.now.length} label={tx('Haciendo el curso')} tone="blue" active={show === 'now'} onPress={() => setShow('now')} />
              <Stat value={groups.stale.length} label={tx('Más de {STALE_DAYS} días sin juntarse', { STALE_DAYS })} tone="amber" active={show === 'stale'} onPress={() => setShow('stale')} />
              <Stat value={groups.done.length} label={tx('Terminaron')} tone="green" active={show === 'done'} onPress={() => setShow('done')} />
            </View>
            {data.lead ? <Button title={tx('Empezar con alguien')} icon="plus" onPress={startWith} /> : null}
            {!list.length ? (
              <Empty icon="book-open"
                title={show === 'stale' ? tx('Todos se juntaron hace poco') : show === 'done' ? tx('Todavía nadie terminó el curso') : data.lead ? tx('Nadie está en discipulado') : tx('No le estás enseñando a nadie')}
                text={show === 'now' ? (data.lead ? tx('Tocá “Empezar con alguien”, o entrá a la ficha de la persona y tocá “Empezar discipulado”.') : tx('Cuando un líder te pida discipular a alguien, lo vas a ver acá.')) : undefined} />
            ) : null}
            {list.map((r) => {
              const p = lessonProgress(r.lessons, total);
              const days = daysSinceDay(r.last_met ?? r.started_on);
              const stale = !p.complete && isStale(r.last_met, r.started_on);
              return (
                <Card key={r.id} style={[{ padding: 12, gap: 10 }, stale && { borderColor: colors.amber, borderWidth: 2, backgroundColor: colors.amberSoft }]}>
                  <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id } })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Face name={r.name} path={r.photo_path} size={44} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <Tag text={p.complete ? tx('Terminó') : tx('Lección {done} de {total}', { done: p.done, total })} tone={p.complete ? 'green' : 'blue'} />
                        {r.mine ? <Tag text={tx('Le enseñás vos')} tone="green" /> : null}
                      </View>
                    </View>
                  </Pressable>
                  <View style={{ gap: 2 }}>
                    {p.next ? <Text style={{ fontSize: 13, color: colors.text }}><Text style={{ fontWeight: '700' }}>{tx('Sigue:')} </Text>{names[p.next - 1]}</Text> : null}
                    <Text style={{ fontSize: 13, color: colors.text }}><Text style={{ fontWeight: '700' }}>{tx('Le enseña:')} </Text>{r.teacher_name ?? tx('todavía nadie')}</Text>
                    <Text style={{ fontSize: 13, color: stale ? colors.amberText : colors.text, fontWeight: stale ? '800' : '400' }}>
                      {r.last_met ? tx('Se juntaron {agoText}', { agoText: agoText(days) }) : tx('Todavía no se juntaron (empezó {agoText})', { agoText: agoText(days) })}{stale ? tx(' · hay que llamarlo') : ''}
                    </Text>
                  </View>
                  {p.next ? <Button title={tx('Anotar una lección')} icon="check-circle" variant="outline" small onPress={() => addLesson(r)} /> : null}
                </Card>
              );
            })}
            {isStaff ? <Button title={tx('Cambiar el nombre del curso y las lecciones')} icon="edit-2" variant="ghost" small onPress={() => router.push('/discipulado/lecciones' as Href)} /> : null}
          </>
        )}
      </Screen>

      <PickerModal
        visible={picker === 'person'}
        title={tx('¿Quién empieza el discipulado?')}
        items={people.filter((p) => !(data?.rows ?? []).some((r) => r.id === p.id && r.active)).map((p) => ({ id: p.id, title: p.name, photo: p.photo_path }))}
        onClose={() => setPicker(null)}
        onPick={(id) => { setChosen(id); setPicker('teacher'); }}
      />
      <PickerModal
        visible={picker === 'teacher'}
        title={tx('¿Quién le enseña?')}
        items={teachers.filter((t) => t.id !== chosen).map((t) => ({ id: t.id, title: t.name, photo: t.photo_path }))}
        allowNone
        noneLabel={tx('Todavía no sé quién')}
        onClose={() => setPicker(null)}
        onPick={(tid) => {
          setPicker(null);
          if (chosen) discStart(chosen, tid).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
        }}
      />
    </View>
  );
}
