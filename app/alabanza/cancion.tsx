// Una canción: tono, tempo, letra y acordes. La carga el líder de música; el equipo la lee.
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, Tag } from '@/components/ui';
import { getSong, saveSong, worshipAccess, type Song } from '@/lib/worship';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

export default function Cancion() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [canPlan, setCanPlan] = useState(false);
  const [song, setSong] = useState<Song | null>(null);
  const [editing, setEditing] = useState(!id);
  const [ready, setReady] = useState(!id);
  const [f, setF] = useState({ title: '', author: '', song_key: '', bpm: '', themes: '', lyrics: '', chords: '', link: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    worshipAccess().then((a) => setCanPlan(a.plan)).catch(() => undefined);
    if (!id) return;
    getSong(id).then((s) => {
      setSong(s);
      if (s) setF({ title: s.title, author: s.author ?? '', song_key: s.song_key ?? '', bpm: s.bpm ? String(s.bpm) : '', themes: s.themes ?? '', lyrics: s.lyrics ?? '', chords: s.chords ?? '', link: s.link ?? '', notes: s.notes ?? '' });
    }).catch(() => undefined).finally(() => setReady(true));
  }, [id]);

  const save = async () => {
    setBusy(true);
    try {
      const bpm = parseInt(f.bpm, 10);
      const t = (v: string) => v.trim() || null;
      await saveSong(id ?? null, { title: f.title.trim(), author: t(f.author), song_key: t(f.song_key), bpm: bpm >= 30 && bpm <= 260 ? bpm : null, themes: t(f.themes), lyrics: t(f.lyrics), chords: t(f.chords), link: t(f.link), notes: t(f.notes) });
      router.back();
    } catch (e) {
      Alert.alert('No se guardó', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const archive = () => Alert.alert('Archivar canción', 'No se borra: deja de aparecer en la lista, pero queda en los cultos donde ya se usó.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Archivar', style: 'destructive', onPress: () => saveSong(id as string, { archived: true }).then(() => router.back()).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
  ]);

  if (!ready) return <Loading />;
  if (!editing && song) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={song.title} subtitle={song.author ?? undefined} back />
        <Screen style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {song.song_key ? <Tag text={`Tono: ${song.song_key}`} tone="blue" /> : null}
            {song.bpm ? <Tag text={`${song.bpm} bpm`} tone="gray" /> : null}
            {song.themes ? <Tag text={song.themes} tone="green" /> : null}
          </View>
          {song.notes ? <Card><Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{song.notes}</Text></Card> : null}
          {song.link ? <Button title="Escuchar o ver" icon="play-circle" variant="ghost" onPress={() => Linking.openURL(song.link as string).catch(() => Alert.alert('No se pudo abrir el enlace'))} /> : null}
          {song.chords ? <Card style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>ACORDES</Text><Text style={{ fontSize: 15, lineHeight: 22, color: colors.text, fontFamily: 'monospace' }}>{song.chords}</Text></Card> : null}
          {song.lyrics ? <Card style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>LETRA</Text><Text style={{ fontSize: 17, lineHeight: 26, color: colors.text }}>{song.lyrics}</Text></Card> : null}
          {canPlan ? <Button title="Editar" icon="edit-2" variant="ghost" onPress={() => setEditing(true)} /> : null}
        </Screen>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={id ? 'Editar canción' : 'Canción nueva'} back />
      <Screen style={{ gap: 14 }}>
        <Field label="Título" value={f.title} onChangeText={set('title')} />
        <Field label="Autor" hint="(opcional)" value={f.author} onChangeText={set('author')} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1 }} label="Tono" value={f.song_key} onChangeText={set('song_key')} placeholder="Sol" maxLength={8} />
          <Field style={{ flex: 1 }} label="Tempo (bpm)" value={f.bpm} onChangeText={set('bpm')} keyboardType="number-pad" placeholder="80" />
        </View>
        <Field label="Temas" hint="(para buscarla: cruz, adoración, navidad…)" value={f.themes} onChangeText={set('themes')} />
        <Field label="Enlace" hint="(video o audio de referencia)" value={f.link} onChangeText={set('link')} autoCapitalize="none" keyboardType="url" />
        <Field label="Notas para el equipo" value={f.notes} onChangeText={set('notes')} multiline />
        <Field label="Acordes" value={f.chords} onChangeText={set('chords')} multiline />
        <Field label="Letra" hint="(cargá solo canciones que la iglesia puede usar: himnos de dominio público o con su licencia)" value={f.lyrics} onChangeText={set('lyrics')} multiline />
        <Button title="Guardar" onPress={save} loading={busy} disabled={!f.title.trim()} />
        {id ? <Button title="Archivar canción" icon="archive" variant="ghost" onPress={archive} /> : null}
      </Screen>
    </View>
  );
}
