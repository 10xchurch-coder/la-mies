// Un capítulo o lección: el texto para estudiar y el archivo (PDF) para abrir o descargar.
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading } from '@/components/ui';
import { StudyNotes } from '@/components/StudyNotes';
import { getMaterial } from '@/lib/api';
import { downloadUrl, signedUrl } from '@/lib/files';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Material } from '@/types';

export default function MaterialVer() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isStaff } = useAuth();
  const [m, setM] = useState<Material | null | undefined>(undefined);

  useEffect(() => {
    getMaterial(id).then(setM).catch(() => setM(null));
  }, [id]);

  const open = async (download: boolean) => {
    if (!m?.file_path) return;
    const url = download ? await downloadUrl('materials', m.file_path, m.file_name) : await signedUrl('materials', m.file_path);
    if (url) Linking.openURL(url);
    else Alert.alert('No se pudo abrir el archivo');
  };

  const remove = () => {
    Alert.alert('Borrar material', '¿Seguro? Las clases que lo tenían asignado quedan sin material.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('materials').delete().eq('id', id);
        if (error) Alert.alert('No se pudo', errorMessage(error));
        else router.back();
      } },
    ]);
  };

  if (m === undefined) return <Loading />;
  if (!m) return <View style={{ flex: 1 }}><Header title="Material" back /><Text style={{ padding: 24, color: colors.text }}>No se encontró.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={m.title} subtitle={m.series} back />
      <Screen>
        {m.file_path ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{m.file_name ?? 'Archivo'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Abrir" icon="eye" small onPress={() => open(false)} style={{ flex: 1 }} />
              <Button title="Descargar" icon="download" variant="outline" small onPress={() => open(true)} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : null}
        {m.body ? <Text selectable style={{ fontSize: 17, lineHeight: 27, color: colors.text }}>{m.body}</Text> : null}
        <StudyNotes kind="material" refId={String(id)} title={m.title} />
        {isStaff || m.created_by === profile?.id ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Editar" variant="outline" small onPress={() => router.push({ pathname: '/material/nuevo', params: { id: m.id } })} style={{ flex: 1 }} />
            <Button title="Borrar" variant="danger" small onPress={remove} style={{ flex: 1 }} />
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
