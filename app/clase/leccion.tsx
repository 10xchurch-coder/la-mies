// La lección de un día de la clase: título, texto, y si hace falta un archivo o un enlace.
// La abre el maestro o quien lo reemplace. La cargan los maestros de la clase y los líderes.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading } from '@/components/ui';
import { classTeachers, listClasses } from '@/lib/api';
import { lessonDays, saveLesson, type LessonDay } from '@/lib/culto';
import { downloadUrl, pickDocument, signedUrl, uploadPicked, type PickedFile } from '@/lib/files';
import { fmtDateShort } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Leccion() {
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const { profile, church, can } = useAuth();
  const [day, setDay] = useState<LessonDay | null | undefined>(undefined);
  const [className, setClassName] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<{ path: string | null; name: string | null }>({ path: null, name: null });
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    lessonDays(id, date, date).then((d) => setDay(d[0] ?? null)).catch(() => setDay(null));
  }, [id, date]);
  useEffect(() => {
    load();
    listClasses().then((cs) => setClassName(cs.find((c) => c.id === id)?.name ?? '')).catch(() => undefined);
    classTeachers(id).then((t) => setIsTeacher(t.some((x) => x.profile_id === profile?.id))).catch(() => undefined);
  }, [load, id, profile?.id]);

  const lesson = day?.lesson ?? null;
  // Una lección cargada acá (se puede cambiar) o un capítulo de un libro de la biblioteca (se abre, no se cambia desde acá).
  const own = !!lesson && lesson.series === 'Lecciones' && lesson.class_id === id;
  const canEdit = can('ens.editar') || isTeacher;

  const startEdit = () => {
    setTitle(own ? lesson?.title ?? '' : '');
    setBody(own ? lesson?.body ?? '' : '');
    setLink(own ? lesson?.link_url ?? '' : '');
    setFile(own ? { path: lesson?.file_path ?? null, name: lesson?.file_name ?? null } : { path: null, name: null });
    setPicked(null);
    setEdit(true);
  };

  const save = async () => {
    const url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) { Alert.alert('Revisá el enlace', 'Tiene que empezar con https://'); return; }
    setBusy(true);
    try {
      let path = file.path; let name = file.name;
      if (picked) {
        if (!church?.id) throw new Error('Sin iglesia');
        path = await uploadPicked('materials', church.id, picked);
        name = picked.name;
      }
      await saveLesson({ classId: id, date, title: title.trim(), body: body.trim() || null, link: url || null, filePath: path, fileName: name });
      setEdit(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (download: boolean) => {
    if (!lesson?.file_path) return;
    const url = download ? await downloadUrl('materials', lesson.file_path, lesson.file_name) : await signedUrl('materials', lesson.file_path);
    if (url) Linking.openURL(url); else Alert.alert('No se pudo abrir el archivo');
  };

  if (day === undefined) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Lección del día" subtitle={[className, date ? fmtDateShort(date) : ''].filter(Boolean).join(' · ')} back />
      <Screen>
        {edit ? (
          <>
            <Field label="Título de la lección" value={title} onChangeText={setTitle} placeholder="David y Goliat" />
            <Field label="Texto para enseñar" hint="(opcional)" value={body} onChangeText={setBody} multiline placeholder={'El pasaje, la historia, las preguntas y la actividad.\nEscribilo para que otro maestro lo pueda dar si vos no podés ir.'} />
            <Field label="Enlace" hint="(opcional: un video o una página)" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" />
            <Card style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{picked?.name ?? file.name ?? 'Sin archivo'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={picked || file.path ? 'Cambiar el archivo' : 'Subir un archivo'} icon="paperclip" variant="outline" small style={{ flex: 1 }} onPress={() => pickDocument('any').then((f) => { if (f) setPicked(f); })} />
                {picked || file.path ? <Button title="Quitar" variant="ghost" small onPress={() => { setPicked(null); setFile({ path: null, name: null }); }} /> : null}
              </View>
            </Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancelar" variant="ghost" onPress={() => setEdit(false)} style={{ flex: 1 }} />
              <Button title="Guardar" onPress={save} loading={busy} disabled={title.trim().length < 2} style={{ flex: 2 }} />
            </View>
          </>
        ) : (
          <>
            {day?.note ? (
              <Card style={{ gap: 4, backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: colors.blueText }}>NOTA PARA EL MAESTRO</Text>
                <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{day.note}</Text>
              </Card>
            ) : null}
            {lesson ? (
              <>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{lesson.title}</Text>
                {!own ? <Text style={{ fontSize: 13, color: colors.muted }}>{lesson.series}</Text> : null}
                {lesson.file_path ? (
                  <Card style={{ gap: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{lesson.file_name ?? 'Archivo'}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Abrir" icon="eye" small onPress={() => openFile(false)} style={{ flex: 1 }} />
                      <Button title="Descargar" icon="download" variant="outline" small onPress={() => openFile(true)} style={{ flex: 1 }} />
                    </View>
                  </Card>
                ) : null}
                {lesson.link_url ? <Button title="Abrir el enlace" icon="external-link" variant="outline" onPress={() => Linking.openURL(lesson.link_url as string)} /> : null}
                {lesson.body ? <Text selectable style={{ fontSize: 17, lineHeight: 27, color: colors.text }}>{lesson.body}</Text> : null}
                {!own ? <Button title="Abrir el capítulo completo" icon="book-open" variant="outline" small onPress={() => router.push({ pathname: '/material/[id]', params: { id: lesson.id } } as unknown as Href)} /> : null}
              </>
            ) : (
              <Text style={{ fontSize: 15, color: colors.muted, lineHeight: 22 }}>Todavía no hay lección para este día.{canEdit ? '' : ' Pedile al maestro de la clase o a un líder que la cargue.'}</Text>
            )}
            {canEdit ? <Button title={own ? 'Cambiar la lección' : lesson ? 'Escribir otra lección para este día' : 'Cargar la lección'} icon="edit-3" variant={lesson ? 'outline' : 'primary'} onPress={startEdit} /> : null}
          </>
        )}
      </Screen>
    </View>
  );
}
