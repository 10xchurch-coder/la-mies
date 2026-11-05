// Cargar la prédica de la semana: título, predicador, pasaje, link de YouTube y el audio.
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { DateChips } from '@/components/Picker';
import { Button, Card, Field } from '@/components/ui';
import { getSermon } from '@/lib/api';
import { pickDocument, uploadPicked, type PickedFile } from '@/lib/files';
import { supabase, errorMessage } from '@/lib/supabase';
import { addDays, fmtBytes, fmtDateShort, isoDate, youtubeId } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function NuevaPredica() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { church, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [preacher, setPreacher] = useState(profile?.display_name ?? '');
  const [passage, setPassage] = useState('');
  const [description, setDescription] = useState('');
  const [youtube, setYoutube] = useState('');
  const [date, setDate] = useState(isoDate(new Date()));
  const [file, setFile] = useState<PickedFile | null>(null);
  const [existingAudio, setExistingAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getSermon(id).then((s) => {
      if (!s) return;
      setTitle(s.title);
      setPreacher(s.preacher ?? '');
      setPassage(s.passage ?? '');
      setDescription(s.description ?? '');
      setYoutube(s.youtube_url ?? '');
      setDate(s.preached_on);
      setExistingAudio(s.audio_name ?? (s.audio_path ? 'Audio cargado' : null));
    }).catch(() => undefined);
  }, [id]);

  const dates = Array.from({ length: 14 }, (_, i) => isoDate(addDays(new Date(), -i)));

  const save = async () => {
    if (!title.trim() || !church) {
      Alert.alert('Falta el título');
      return;
    }
    if (youtube.trim() && !youtubeId(youtube)) {
      Alert.alert('El link de YouTube no parece válido', 'Copiá el link desde el botón Compartir del video.');
      return;
    }
    setBusy(true);
    try {
      const row: Record<string, unknown> = {
        title: title.trim(), preacher: preacher.trim() || null, passage: passage.trim() || null, description: description.trim() || null,
        youtube_url: youtube.trim() || null, preached_on: date,
      };
      if (file) {
        row.audio_path = await uploadPicked('sermons', church.id, file);
        row.audio_name = file.name;
      }
      const { error } = id ? await supabase.from('sermons').update(row).eq('id', id) : await supabase.from('sermons').insert(row);
      if (error) throw error;
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={id ? 'Editar prédica' : 'Subir prédica'} back />
      <Screen>
        <Field label="Título" value={title} onChangeText={setTitle} />
        <Field label="Predicador" value={preacher} onChangeText={setPreacher} autoCapitalize="words" />
        <Field label="Pasaje" hint="(opcional)" placeholder="Ej: Juan 3:1-21" value={passage} onChangeText={setPassage} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Fecha</Text>
        <DateChips dates={dates.includes(date) ? dates : [date, ...dates]} value={date} onChange={setDate} format={(d) => (d === isoDate(new Date()) ? 'Hoy' : fmtDateShort(d))} />
        <Field label="Link de YouTube" hint="(opcional)" autoCapitalize="none" keyboardType="url" placeholder="https://youtu.be/..." value={youtube} onChangeText={setYoutube} />
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Audio</Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            {file ? `${file.name} ${fmtBytes(file.size)}` : existingAudio ? `Actual: ${existingAudio}` : 'MP3 o M4A, hasta 50 MB. Una prédica de una hora en MP3 a 64 kbps pesa unos 28 MB.'}
          </Text>
          <Button title={file || existingAudio ? 'Cambiar audio' : 'Elegir audio'} icon="music" variant="outline" small onPress={() => pickDocument('audio').then((f) => f && setFile(f))} />
        </Card>
        <Field label="Descripción" hint="(opcional)" value={description} onChangeText={setDescription} multiline />
        <Button title="Guardar" onPress={save} loading={busy} />
        {busy && file ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Subiendo el audio… puede tardar un par de minutos.</Text> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
