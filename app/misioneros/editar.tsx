// Agregar o editar un misionero (pastor y secretaría).
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { SignedImage } from '@/components/SignedImage';
import { Button, Card, Empty, Field } from '@/components/ui';
import { missionariesList, saveMissionary } from '@/lib/api';
import { pickMissionaryPhoto, removeMissionaryFiles } from '@/lib/files';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function MisioneroEditar() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isStaff, church } = useAuth();
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [oldPhoto, setOldPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    missionariesList().then((l) => {
      const m = l.find((x) => x.id === id);
      if (m) { setName(m.name); setField(m.field ?? ''); setBio(m.bio ?? ''); setPhoto(m.photo_path); setOldPhoto(m.photo_path); }
    }).catch(() => undefined);
  }, [id]);

  const pick = async () => {
    if (!church) return;
    try {
      const p = await pickMissionaryPhoto(church.id);
      if (p) setPhoto(p);
    } catch (e) { Alert.alert('No se pudo subir la foto', errorMessage(e)); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await saveMissionary({ id, name, field, bio, photo_path: photo });
      if (oldPhoto && oldPhoto !== photo) await removeMissionaryFiles([oldPhoto]);
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={id ? 'Editar misionero' : 'Agregar misionero'} back />
      <Screen>
        {!isStaff ? <Empty icon="lock" title="Solo el pastor y la secretaría" /> : (
          <Card style={{ gap: 12 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <SignedImage bucket="missionaries" path={photo} style={{ width: 112, height: 112, borderRadius: 56 }} />
              <Button title={photo ? 'Cambiar la foto' : 'Elegir una foto'} icon="camera" variant="outline" small onPress={pick} />
            </View>
            <Field label="Nombre" value={name} onChangeText={setName} placeholder="Pastor …" maxLength={120} />
            <Field label="Dónde sirve" value={field} onChangeText={setField} placeholder="Ciudad, país" maxLength={160} />
            <Field label="Unas líneas sobre él y su obra" value={bio} onChangeText={setBio} multiline maxLength={2000} />
            <Text style={{ fontSize: 12, color: colors.muted }}>Lo ven todos los miembros que iniciaron sesión.</Text>
            <Button title="Guardar" icon="check" onPress={save} loading={busy} disabled={name.trim().length < 2} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
