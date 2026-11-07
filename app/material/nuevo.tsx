// Cargar un capítulo: serie (el libro), número, título, texto y/o un archivo.
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field } from '@/components/ui';
import { getMaterial } from '@/lib/api';
import { pickDocument, uploadPicked, type PickedFile } from '@/lib/files';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtBytes } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function NuevoMaterial() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; series?: string; order?: string; classId?: string }>();
  const { church } = useAuth();
  const [series, setSeries] = useState(params.series ?? '');
  const [order, setOrder] = useState(params.order ?? '1');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [existingFile, setExistingFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    getMaterial(params.id).then((m) => {
      if (!m) return;
      setSeries(m.series);
      setOrder(String(m.chapter_order));
      setTitle(m.title);
      setBody(m.body ?? '');
      setExistingFile(m.file_name);
    }).catch(() => undefined);
  }, [params.id]);

  const save = async () => {
    if (!series.trim() || !title.trim() || !church) {
      Alert.alert('Faltan datos', 'Poné el nombre del libro o serie y el título del capítulo.');
      return;
    }
    setBusy(true);
    try {
      const row: Record<string, unknown> = { series: series.trim(), chapter_order: Number(order) || 1, title: title.trim(), body: body.trim() || null };
      if (params.classId) row.class_id = params.classId;
      if (file) {
        row.file_path = await uploadPicked('materials', church.id, file);
        row.file_name = file.name;
      }
      const { error } = params.id
        ? await supabase.from('materials').update(row).eq('id', params.id)
        : await supabase.from('materials').insert(row);
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
      <Header title={params.id ? 'Editar material' : 'Cargar material'} back />
      <Screen>
        <Field label="Libro o serie" placeholder="Ej: Vida de Jesús para niños" value={series} onChangeText={setSeries} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="N°" keyboardType="number-pad" value={order} onChangeText={(t) => setOrder(t.replace(/\D/g, ''))} style={{ width: 70 }} />
          <Field label="Título del capítulo" placeholder="Ej: El nacimiento de Jesús" value={title} onChangeText={setTitle} style={{ flex: 1 }} />
        </View>
        <Field label="Texto" hint="(opcional: pegá acá la lección)" value={body} onChangeText={setBody} multiline />
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Archivo</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            {file ? `${file.name} ${fmtBytes(file.size)}` : existingFile ? `Actual: ${existingFile}` : 'PDF, Word, imagen o audio · hasta 50 MB'}
          </Text>
          <Button title={file || existingFile ? 'Cambiar archivo' : 'Elegir archivo'} icon="paperclip" variant="outline" small onPress={() => pickDocument('any').then((f) => f && setFile(f))} />
        </Card>
        <Button title="Guardar" onPress={save} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
