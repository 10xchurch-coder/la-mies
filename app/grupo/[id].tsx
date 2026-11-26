// Un grupo pequeño: lo de esta semana (la prédica con su guía, o la lección propia), la asistencia, los líderes y quiénes van.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Empty, Loading, RowLink, SectionTitle, Tag } from '@/components/ui';
import {
  classStudents, classTeachers, groupJoinRequest, groupLessons, groupSetLesson, listClasses, listMembers, listPeople, listProfiles, myGroupIds, sermonsUntil,
} from '@/lib/api';
import { draftGuide, guideShareText, nextMeeting, sermonForMeeting } from '@/lib/groupGuide';
import { tryShareText } from '@/lib/share';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDateOnly, fmtDateShort, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow, ClassTeacher, Contact, Material, Profile, Sermon } from '@/types';
import { tx } from '@/lib/i18n';
import { GuideView, whenText } from '@/components/GroupGuide';

export default function Grupo() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isStaff, can } = useAuth();
  const [k, setK] = useState<ClassRow | null | undefined>(undefined);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [members, setMembers] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Contact[]>([]);
  const [allPeople, setAllPeople] = useState<Contact[]>([]);
  const [mine, setMine] = useState(false);
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [lessons, setLessons] = useState<Material[]>([]);
  const [picker, setPicker] = useState<null | 'leader' | 'helper' | 'member'>(null);
  const [asked, setAsked] = useState(false);

  const meeting = useMemo(() => isoDate(nextMeeting(k?.days)), [k]);

  const load = useCallback(async () => {
    try {
      const [cs, t] = await Promise.all([listClasses(), classTeachers(id)]);
      const g = cs.find((c) => c.id === id) ?? null;
      setK(g);
      setTeachers(t);
      if (!g) return;
      const when = isoDate(nextMeeting(g.days));
      myGroupIds().then((ids) => setMine(ids.includes(id))).catch(() => undefined);
      if ((g.study ?? 'predica') === 'predica') sermonsUntil(when).then(setSermons).catch(() => setSermons([]));
      else groupLessons(id).then(setLessons).catch(() => setLessons([]));
      listMembers().then(setMembers).catch(() => setMembers([]));
      listProfiles().then(setProfiles).catch(() => setProfiles([]));
      classStudents(id).then(setStudents).catch(() => setStudents([]));
    } catch {
      setK(null);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (k === undefined) return <Loading />;
  if (!k) return <View style={{ flex: 1 }}><Header title={tx('Grupo pequeño')} back /><Text style={{ padding: 24, color: colors.text }}>{tx('No se encontró.')}</Text></View>;

  const canManage = isStaff || can('ens.editar');
  const isLeader = teachers.some((t) => t.profile_id === profile?.id);
  const leads = canManage || isLeader;
  const nameOf = (t: ClassTeacher) => (t.profile_id ? profiles.find((p) => p.id === t.profile_id)?.display_name ?? members.find((m) => m.profile_id === t.profile_id)?.name : members.find((m) => m.id === t.contact_id)?.name) ?? tx('Líder');
  const sermon = sermonForMeeting(sermons, meeting);
  const guide = sermon ? (sermon.group_guide?.trim() || draftGuide(sermon)) : '';
  const lesson = lessons.find((l) => l.id === k.current_material) ?? lessons[0] ?? null;

  const addLeader = async (cid: string | null, helper: boolean) => {
    setPicker(null);
    const c = members.find((m) => m.id === cid);
    if (!c) return;
    const { error } = c.profile_id
      ? await supabase.from('class_teachers').upsert({ class_id: id, profile_id: c.profile_id, is_helper: helper }, { onConflict: 'class_id,profile_id' })
      : await supabase.from('class_teachers').upsert({ class_id: id, contact_id: c.id, is_helper: helper }, { onConflict: 'class_id,contact_id' });
    if (error) Alert.alert(tx('No se pudo'), errorMessage(error));
    load();
  };
  const removeLeader = (t: ClassTeacher) => Alert.alert(tx('Quitar'), tx('¿Sacar a {name} de los líderes del grupo?', { name: nameOf(t) }), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Quitar'), style: 'destructive', onPress: async () => {
      const q = supabase.from('class_teachers').delete().eq('class_id', id);
      await (t.profile_id ? q.eq('profile_id', t.profile_id) : q.eq('contact_id', t.contact_id ?? ''));
      load();
    } },
  ]);
  const addMember = async (cid: string | null) => {
    setPicker(null);
    if (!cid) return;
    const { error } = await supabase.from('class_students').upsert({ class_id: id, contact_id: cid });
    if (error) Alert.alert(tx('No se pudo'), errorMessage(error));
    load();
  };
  const removeMember = (c: Contact) => Alert.alert(tx('Quitar del grupo'), tx('¿Sacar a {name} de este grupo? No se borra su ficha.', { name: c.name }), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Quitar'), style: 'destructive', onPress: async () => {
      await supabase.from('class_students').delete().eq('class_id', id).eq('contact_id', c.id);
      load();
    } },
  ]);
  const join = async () => {
    try {
      const n = await groupJoinRequest(id);
      setAsked(true);
      Alert.alert(tx('¡Listo!'), n ? tx('Les avisamos a los líderes del grupo. Te van a escribir.') : tx('El grupo todavía no tiene líderes en la app. Avisale al pastor.'));
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    }
  };
  const share = () => sermon && tryShareText(guideShareText(`${k.name} · ${sermon.title}`, guide));
  const useLesson = async (m: Material) => {
    try { await groupSetLesson(id, m.id); load(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={k.name} subtitle={[whenText(k), k.place].filter(Boolean).join(' · ')} back />
      <Screen>
        {k.about ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{k.about}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {isLeader ? <Tag text={tx('Sos líder de este grupo')} tone="green" /> : mine ? <Tag text={tx('Sos parte de este grupo')} tone="green" /> : null}
        </View>
        {!isLeader && !mine && !canManage ? (
          <Button title={asked ? tx('Ya les avisamos a los líderes') : tx('Quiero sumarme')} icon="user-plus" onPress={join} disabled={asked} />
        ) : null}

        <SectionTitle>{tx('Esta semana · {date}', { date: fmtDateShort(meeting) })}</SectionTitle>
        {(k.study ?? 'predica') === 'predica' ? (
          sermon ? (
            <>
              <Pressable onPress={() => router.push({ pathname: '/predica/[id]', params: { id: sermon.id } } as never)} accessibilityRole="button">
                <Card style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{tx('REPASAMOS LA PRÉDICA')}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{sermon.title}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>{[sermon.passage, sermon.preacher, fmtDateOnly(sermon.preached_on)].filter(Boolean).join(' · ')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Feather name="play-circle" size={18} color={colors.green} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green }}>{tx('Ver, escuchar y leer el bosquejo')}</Text>
                  </View>
                </Card>
              </Pressable>
              {sermon.summary ? <Text style={{ fontSize: 14, lineHeight: 21, color: colors.text }}>{sermon.summary}</Text> : null}
              <SectionTitle>{tx('Guía para el grupo')}</SectionTitle>
              {!sermon.group_guide?.trim() ? (
                <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>
                  {tx('El pastor todavía no escribió preguntas para esta prédica. Estas salen solas del bosquejo y sirven igual.')}
                </Text>
              ) : null}
              <GuideView text={guide} />
              {leads ? <Button title={tx('Mandar las preguntas al grupo')} icon="share-2" variant="outline" onPress={share} /> : null}
              {canManage ? (
                <Button title={sermon.group_guide?.trim() ? tx('Cambiar la guía') : tx('Escribir la guía')} icon="edit-3" variant="ghost"
                  onPress={() => router.push({ pathname: '/predica/nueva', params: { id: sermon.id, guia: '1' } } as never)} />
              ) : null}
            </>
          ) : (
            <Empty icon="play-circle" title={tx('Todavía no hay prédicas cargadas')} text={tx('Cuando el pastor cargue la prédica del domingo, aparece acá con sus preguntas.')} />
          )
        ) : (
          <>
            {lesson ? (
              <Pressable onPress={() => router.push({ pathname: '/grupo/leccion', params: { id: lesson.id, group: id } } as never)} accessibilityRole="button">
                <Card style={{ gap: 6, borderColor: colors.green, borderWidth: 2 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{tx('LA LECCIÓN DE ESTA SEMANA')}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{lesson.title}</Text>
                  {lesson.body ? <Text numberOfLines={3} style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{lesson.body.replace(/^\s*(#+|[-•])\s*/gm, '')}</Text> : null}
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green }}>{tx('Abrir la lección')}</Text>
                </Card>
              </Pressable>
            ) : (
              <Empty icon="book" title={tx('Todavía no hay lecciones')} text={leads ? tx('Tocá “Agregar lección” para cargar la primera.') : tx('El líder las va a cargar.')} />
            )}
            {lessons.length > 1 ? (
              <Card style={{ padding: 0 }}>
                {lessons.map((m) => (
                  <RowLink key={m.id} icon={m.id === lesson?.id ? 'star' : 'book-open'} title={`${m.chapter_order}. ${m.title}`}
                    subtitle={m.id === lesson?.id ? tx('Esta semana') : leads ? tx('Tocá para abrir o elegirla para esta semana') : undefined}
                    onPress={() => (leads && m.id !== lesson?.id
                      ? Alert.alert(m.title, undefined, [
                        { text: tx('Abrir'), onPress: () => router.push({ pathname: '/grupo/leccion', params: { id: m.id, group: id } } as never) },
                        { text: tx('Usar esta semana'), onPress: () => useLesson(m) },
                        { text: tx('Cancelar'), style: 'cancel' },
                      ])
                      : router.push({ pathname: '/grupo/leccion', params: { id: m.id, group: id } } as never))} />
                ))}
              </Card>
            ) : null}
            {leads ? <Button title={tx('Agregar lección')} icon="plus" variant="outline" onPress={() => router.push({ pathname: '/grupo/leccion', params: { group: id, order: String(lessons.length + 1) } } as never)} /> : null}
          </>
        )}

        {leads ? (
          <Button title={tx('Tomar asistencia · {date}', { date: fmtDateShort(meeting) })} icon="check-square"
            onPress={() => router.push({ pathname: '/grupo/asistencia', params: { id, date: meeting } } as never)} />
        ) : null}

        <SectionTitle>{tx('Líderes')}</SectionTitle>
        <Card style={{ padding: 0 }}>
          {teachers.map((t) => (
            <RowLink key={t.profile_id ?? t.contact_id} icon="user" title={nameOf(t)}
              subtitle={`${t.is_helper ? tx('Ayudante o anfitrión') : tx('Líder')}${canManage ? tx(' · tocá para quitarlo') : ''}`}
              onPress={canManage ? () => removeLeader(t) : undefined} />
          ))}
          {!teachers.length ? <Text style={{ padding: 14, color: colors.muted }}>{tx('Todavía no tiene líder.')}</Text> : null}
        </Card>
        {canManage ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={tx('Agregar líder')} icon="user-plus" variant="outline" small onPress={() => setPicker('leader')} style={{ flex: 1 }} />
            <Button title={tx('Agregar ayudante')} icon="user-plus" variant="outline" small onPress={() => setPicker('helper')} style={{ flex: 1 }} />
          </View>
        ) : null}

        {leads ? (
          <>
            <SectionTitle right={<Text onPress={() => { listPeople().then(setAllPeople).catch(() => undefined); setPicker('member'); }} style={{ color: colors.green, fontWeight: '800', fontSize: 13 }}>{tx('+ Agregar')}</Text>}>
              {tx('Quiénes van ({n})', { n: students.length })}
            </SectionTitle>
            {students.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {students.map((s) => (
                  <Pressable key={s.id} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: s.id } })} onLongPress={() => removeMember(s)}
                    style={{ width: 72, alignItems: 'center', gap: 4 }}>
                    <Face name={s.name} path={s.photo_path} size={56} />
                    <Text numberOfLines={2} style={{ fontSize: 11, fontWeight: '600', textAlign: 'center', color: colors.text }}>{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Tocá “+ Agregar” para sumar a quienes van al grupo.')}</Text>}
            {students.length ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Mantené apretado a alguien para sacarlo del grupo.')}</Text> : null}
          </>
        ) : null}

        {canManage ? <Button title={tx('Cambiar nombre, días o lugar')} icon="settings" variant="ghost" onPress={() => router.push({ pathname: '/grupo/editar', params: { id } } as never)} /> : null}
      </Screen>

      <PickerModal visible={picker === 'leader' || picker === 'helper'} title={picker === 'helper' ? tx('Elegí el ayudante o anfitrión') : tx('Elegí el líder')}
        items={members.filter((m) => !teachers.some((t) => (m.profile_id && t.profile_id === m.profile_id) || t.contact_id === m.id)).map((m) => ({ id: m.id, title: m.name, subtitle: m.profile_id ? undefined : tx('No tiene la app'), photo: m.photo_path }))}
        onClose={() => setPicker(null)} onPick={(cid) => addLeader(cid, picker === 'helper')} />
      <PickerModal visible={picker === 'member'} title={tx('¿Quién va al grupo?')}
        items={allPeople.filter((p) => !students.some((s) => s.id === p.id)).map((p) => ({ id: p.id, title: p.name, photo: p.photo_path }))}
        onClose={() => setPicker(null)} onPick={addMember} />
    </View>
  );
}
