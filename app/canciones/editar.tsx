// Cargar o corregir una canción: título, autor, tono, enlaces y la letra (pegada tal cual; [Coro] marca el coro).
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading } from '@/components/ui';
import { getSong, saveSong } from '@/lib/api';
import { cleanUrl } from '@/lib/links';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function EditarCancion() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { can } = useAuth();
  const [loaded, setLoaded] = useState(!id);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [key, setKey] = useState('');
  const [spotify, setSpotify] = useState('');
  const [youtube, setYoutube] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    getSong(id).then((s) => {
      if (s) { setTitle(s.title); setAuthor(s.author ?? ''); setKey(s.song_key ?? ''); setSpotify(s.spotify_url ?? ''); setYoutube(s.youtube_url ?? ''); setLyrics(s.lyrics); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [id]);
  if (!can('com.anuncios')) return <Empty icon="lock" title={tx('Solo quien manda anuncios')} />;
  if (!loaded) return <Loading />;

  const save = async () => {
    if (!title.trim()) { Alert.alert(tx('Falta el título')); return; }
    const sp = spotify.trim() ? cleanUrl(spotify) : null;
    const yt = youtube.trim() ? cleanUrl(youtube) : null;
    if (spotify.trim() && !sp) { Alert.alert(tx('El enlace de Spotify no sirve'), tx('Pegá el enlace completo.')); return; }
    if (youtube.trim() && !yt) { Alert.alert(tx('El enlace de YouTube no sirve'), tx('Pegá el enlace completo.')); return; }
    setBusy(true);
    try {
      const sid = await saveSong({ id, title, author: author || null, lyrics, spotify_url: sp, youtube_url: yt, song_key: key || null });
      router.replace(`/canciones/${sid}` as Href);
    } catch (e) { Alert.alert(tx('No se pudo guardar'), errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={id ? tx('Corregir canción') : tx('Nueva canción')} back />
      <Screen>
        <Card style={{ gap: 10 }}>
          <Field label={tx('Título')} value={title} onChangeText={setTitle} />
          <Field label={tx('Autor o grupo')} hint={tx('(opcional)')} value={author} onChangeText={setAuthor} />
          <Field label={tx('Tono')} hint={tx('(opcional, para los músicos)')} value={key} onChangeText={setKey} placeholder={tx('Re, Sol, Mi menor…')} />
          <Field label={tx('Enlace de Spotify')} hint={tx('(opcional)')} value={spotify} onChangeText={setSpotify} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Field label={tx('Enlace de YouTube')} hint={tx('(opcional)')} value={youtube} onChangeText={setYoutube} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Field label={tx('Letra')} value={lyrics} onChangeText={setLyrics} multiline style={{ minHeight: 260 }} />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Dejá una línea vacía entre las estrofas. Escribí [Coro] o [Estrofa 2] arriba de cada parte si querés que se vea el título.')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={tx('Cancelar')} variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
            <Button title={tx('Guardar')} onPress={save} loading={busy} style={{ flex: 2 }} />
          </View>
        </Card>
      </Screen>
    </View>
  );
}
