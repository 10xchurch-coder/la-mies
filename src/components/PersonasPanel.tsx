// En la ficha de una persona: su discipulado (lección, quién le enseña, última vez), sus decisiones,
// la clase de miembros, el regalo de bienvenida y los certificados para imprimir.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { PickerModal } from '@/components/Picker';
import { Button, Card, SectionTitle, Tag } from '@/components/ui';
import { CareButtons } from '@/components/CareMarks';
import {
  DECISION_LABEL, DEFAULT_COURSE, agoText, daysSinceDay, isStale, lessonNames, lessonProgress, memberLessons, showDay,
} from '@/lib/personas';
import {
  discActive, discLesson, discStart, discTeacher, memberClassSet, peopleSettings, personInfo, teacherChoices, type PeopleSettings, type PersonInfo,
} from '@/lib/personasApi';
import { errorMessage } from '@/lib/supabase';
import { useFeatures } from '@/lib/useFeatures';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

type Person = { id: string; name: string; status: string; baptized_on?: string | null; baptized_here?: boolean | null; member_since?: string | null };

export function PersonasPanel({ c, onChanged }: { c: Person; onChanged?: () => void }) {
  const router = useRouter();
  const { on: fOn } = useFeatures();
  const [info, setInfo] = useState<PersonInfo | null>(null);
  const [cfg, setCfg] = useState<PeopleSettings | null>(null);
  const [teachers, setTeachers] = useState<{ id: string; name: string; photo_path: string | null }[]>([]);
  const [picker, setPicker] = useState<null | 'start' | 'change'>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { personInfo(c.id).then(setInfo).catch(() => undefined); }, [c.id]);
  useEffect(() => { load(); peopleSettings().then(setCfg).catch(() => undefined); }, [load]);

  if (!info || (!info.can && !info.can_lesson)) return null;

  const run = async (what: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await what();
      load();
      onChanged?.();
      if (done) Alert.alert(done);
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const openPicker = (which: 'start' | 'change') => {
    teacherChoices().then((l) => setTeachers(l.filter((t) => t.id !== c.id))).catch(() => undefined);
    setPicker(which);
  };

  const course = cfg?.disc_course_name?.trim() || tx(DEFAULT_COURSE);
  const names = lessonNames(cfg?.disc_lessons, info.total);
  const prog = lessonProgress(info.lessons, info.total);
  const track = info.track?.active ? info.track : null;
  const days = track ? daysSinceDay(track.last_met ?? track.started_on) : null;
  const stale = track ? !prog.complete && isStale(track.last_met, track.started_on) : false;
  const mNames = memberLessons(cfg?.member_lessons);
  const mDone = info.mclass ? lessonProgress(info.mclass.done, mNames.length).done : 0;
  const line = { fontSize: 14, color: colors.text, lineHeight: 20 } as const;

  const addLesson = () => {
    if (!prog.next) return;
    const n = prog.next;
    Alert.alert(tx('Anotar una lección'), tx('¿Hoy hicieron «{names}» (lección {n} de {total})?', { names: names[n - 1], n, total: info.total }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Sí, anotar'), onPress: () => { run(() => discLesson(c.id, n, null), prog.done + 1 >= info.total ? tx('¡Terminó el curso!') : tx('Lección anotada')); } },
    ]);
  };

  // Cada cuadro se ve solo si la iglesia usa esa función. Si no usa ninguna, no se dibuja nada.
  if (!(['discipulado', 'decisiones', 'clase_miembros', 'bienvenida', 'bautismos'] as const).some((k) => fOn(k))) return null;
  return (
    <Card style={{ gap: 12 }}>
      {fOn('discipulado') ? (
      <>
      <SectionTitle>{course}</SectionTitle>
      {track ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Tag text={prog.complete ? tx('Terminó el curso') : tx('Lección {done} de {total}', { done: prog.done, total: info.total })} tone={prog.complete ? 'green' : 'blue'} />
            {stale ? <Tag text={tx('Más de 14 días sin juntarse')} tone="red" /> : null}
          </View>
          {prog.next ? <Text style={line}><Text style={{ fontWeight: '700' }}>{tx('Sigue:')} </Text>{names[prog.next - 1]}</Text> : null}
          <Text style={line}><Text style={{ fontWeight: '700' }}>{tx('Le enseña:')} </Text>{track.teacher_name ?? tx('todavía nadie')}</Text>
          <Text style={[line, stale && { color: colors.redText, fontWeight: '700' }]}>
            <Text style={{ fontWeight: '700' }}>{tx('Última vez que se juntaron:')} </Text>{track.last_met ? `${agoText(days)} (${showDay(track.last_met)})` : tx('todavía no')}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
          {info.track ? tx('Dejó el discipulado. Lo que hizo quedó guardado.') : tx('Todavía no empezó el discipulado.')}
        </Text>
      )}
      {track ? (
        <View style={{ gap: 8 }}>
          {info.can_lesson && prog.next ? <Button title={tx('Anotar una lección')} icon="check-circle" small onPress={addLesson} loading={busy} /> : null}
          {info.can ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={tx('Cambiar quién enseña')} variant="outline" small onPress={() => openPicker('change')} style={{ flex: 1 }} />
              <Button title={tx('Dejar')} variant="ghost" small style={{ flex: 0.5 }} onPress={() => Alert.alert(tx('¿Deja el discipulado?'), tx('Sale de la lista. Las lecciones que hizo quedan guardadas.'), [
                { text: tx('Cancelar'), style: 'cancel' },
                { text: tx('Sí'), onPress: () => { run(() => discActive(c.id, false)); } },
              ])} />
            </View>
          ) : null}
        </View>
      ) : info.can ? (
        <Button title={tx('Empezar discipulado')} icon="book-open" small onPress={() => openPicker('start')} loading={busy} />
      ) : null}
      </>
      ) : null}

      {info.can ? (
        <>
          {fOn('decisiones') ? (
          <>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <SectionTitle>{tx('Decisiones')}</SectionTitle>
          {info.decisions.map((d) => (
            <Text key={d.id} style={line}>
              <Text style={{ fontWeight: '700' }}>{DECISION_LABEL[d.kind]}</Text> · {showDay(d.on_date)}{d.note ? ` · ${d.note}` : ''}
            </Text>
          ))}
          <Button title={tx('Anotar una decisión')} icon="heart" variant="outline" small onPress={() => router.push({ pathname: '/decisiones', params: { persona: c.id } } as unknown as Href)} />
          </>
          ) : null}

          {fOn('clase_miembros') && (c.status !== 'member' || info.mclass) ? (
            <>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <SectionTitle>{tx('Clase de miembros')}</SectionTitle>
              {info.mclass ? (
                <>
                  <Text style={line}>{info.mclass.final_on ? tx('Terminó el {showDay}.', { showDay: showDay(info.mclass.final_on) }) : tx('Hizo {mDone} de {n} lecciones.', { mDone, n: mNames.length })}</Text>
                  <Button title={tx('Ver la clase de miembros')} icon="list" variant="outline" small onPress={() => router.push('/clase-miembros' as Href)} />
                </>
              ) : (
                <Button title={tx('Empezar la clase de miembros')} icon="users" variant="outline" small loading={busy}
                  onPress={() => { run(() => memberClassSet(c.id, null), tx('Anotado en la clase de miembros')); }} />
              )}
            </>
          ) : null}
        </>
      ) : null}

      {fOn('bienvenida') && c.status === 'visitor' ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <SectionTitle>{tx('Bienvenida')}</SectionTitle>
          <CareButtons id={c.id} care={info.care} onChanged={load} />
        </>
      ) : null}

      {fOn('bautismos') && info.staff && ((c.baptized_on && c.baptized_here !== false) || (c.status === 'member' && c.member_since)) ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <SectionTitle>{tx('Certificados para imprimir')}</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {c.baptized_on && c.baptized_here !== false ? (
              <Button title={tx('De bautismo')} icon="printer" variant="outline" small style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/certificado/imprimir', params: { id: c.id, tipo: 'bautismo' } } as unknown as Href)} />
            ) : null}
            {c.status === 'member' && c.member_since ? (
              <Button title={tx('De miembro')} icon="printer" variant="outline" small style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/certificado/imprimir', params: { id: c.id, tipo: 'miembro' } } as unknown as Href)} />
            ) : null}
          </View>
        </>
      ) : null}

      <PickerModal
        visible={picker !== null}
        title={tx('¿Quién le enseña?')}
        items={teachers.map((t) => ({ id: t.id, title: t.name, photo: t.photo_path }))}
        allowNone
        noneLabel={picker === 'start' ? tx('Todavía no sé quién') : tx('Nadie por ahora')}
        onClose={() => setPicker(null)}
        onPick={(tid) => {
          const which = picker;
          setPicker(null);
          if (which === 'start') run(() => discStart(c.id, tid), tx('Empezó el discipulado'));
          else run(() => discTeacher(c.id, tid));
        }}
      />
    </Card>
  );
}
