// Agregar o editar un misionero (pastor y secretaría).
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { SignedImage } from '@/components/SignedImage';
import { Button, Card, Empty, Field } from '@/components/ui';
import { missionariesList, saveMissionary } from '@/lib/api';
import { adjustMissionaryThumb, pickMissionaryPhoto, removeMissionaryFiles } from '@/lib/files';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function MisioneroEditar() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isStaff, church } = useAuth();
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [oldPhoto, setOldPhoto] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [oldThumb, setOldThumb] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    missionariesList().then((l) => {
      const m = l.find((x) => x.id === id);
      if (m) { setName(m.name); setField(m.field ?? ''); setBio(m.bio ?? ''); setPhoto(m.photo_path); setOldPhoto(m.photo_path); setThumb(m.thumb_path); setOldThumb(m.thumb_path); }
    }).catch(() => undefined);
  }, [id]);

  const pick = async () => {
    if (!church) return;
    try {
      const p = await pickMissionaryPhoto(church.id);
      if (p) { setPhoto(p.photo); setThumb(p.thumb); setFresh((f) => [...f, p.photo, ...(p.thumb ? [p.thumb] : [])]); }
    } catch (e) { Alert.alert(tx('No se pudo subir la foto'), errorMessage(e)); }
  };
  const fixCircle = async () => {
    if (!church || !photo) return;
    try {
      const t = await adjustMissionaryThumb(church.id, photo);
      if (t) { setThumb(t); setFresh((f) => [...f, t]); }
    } catch (e) { Alert.alert(tx('No se pudo subir la foto'), errorMessage(e)); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await saveMissionary({ id, name, field, bio, photo_path: photo, thumb_path: thumb });
      // Lo que ya no se usa (la foto o el círculo de antes, o lo que se probó y se cambió) se borra.
      const keep = new Set([photo, thumb]);
      await removeMissionaryFiles([oldPhoto, oldThumb, ...fresh].filter((p): p is string => !!p && !keep.has(p)));
      router.back();
    } catch (e) {
      Alert.alert(tx('No se pudo guardar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={id ? tx('Editar misionero') : tx('Agregar misionero')} back />
      <Screen>
        {!isStaff ? <Empty icon="lock" title={tx('Solo el pastor y la secretaría')} /> : (
          <Card style={{ gap: 12 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              {photo ? (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.label }}>{tx('Arriba en el perfil')}</Text>
                  <SignedImage bucket="missionaries" path={photo} style={{ width: 240, aspectRatio: 4 / 3, borderRadius: 12 }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.label }}>{tx('En la lista')}</Text>
                </>
              ) : null}
              <SignedImage bucket="missionaries" path={thumb ?? photo} style={{ width: 112, height: 112, borderRadius: 56 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={photo ? tx('Cambiar la foto') : tx('Elegir una foto')} icon="camera" variant="outline" small onPress={pick} />
                {photo ? <Button title={tx('Acomodar el círculo')} icon="crop" variant="outline" small onPress={fixCircle} /> : null}
              </View>
            </View>
            <Field label={tx('Nombre')} value={name} onChangeText={setName} placeholder={tx('Pastor …')} maxLength={120} />
            <Field label={tx('Dónde sirve')} value={field} onChangeText={setField} placeholder={tx('Ciudad, país')} maxLength={160} />
            <Field label={tx('Unas líneas sobre él y su obra')} value={bio} onChangeText={setBio} multiline maxLength={2000} />
            <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Lo ven todos los miembros que iniciaron sesión.')}</Text>
            <Button title={tx('Guardar')} icon="check" onPress={save} loading={busy} disabled={name.trim().length < 2} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
