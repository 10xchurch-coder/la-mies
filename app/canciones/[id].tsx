// Una canción: la letra grande para cantarla, el tono, y el botón para escucharla en Spotify o YouTube.
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { deleteSong, getSong } from '@/lib/api';
import { lyricBlocks } from '@/lib/songs';
import { shareText } from '@/lib/share';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Song } from '@/types';

const SIZES = [16, 19, 23, 28];

export default function Cancion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const [s, setS] = useState<Song | null | undefined>(undefined);
  const [size, setSize] = useState(1);
  useFocusEffect(useCallback(() => { getSong(id).then(setS).catch(() => setS(null)); }, [id]));
  if (s === undefined) return <Loading />;
  if (!s) return <Empty icon="music" title="Esta canción ya no está" />;
  const fs = SIZES[size];
  const open = (u: string) => Linking.openURL(u).catch(() => Alert.alert('No se pudo abrir', 'Probá de nuevo.'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={s.title} subtitle={[s.author, s.song_key ? `Tono: ${s.song_key}` : null].filter(Boolean).join(' · ') || undefined} back />
      <Screen>
        {s.spotify_url || s.youtube_url ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {s.spotify_url ? (
              <Pressable onPress={() => open(s.spotify_url!)} accessibilityRole="link" style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: '#1DB954', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Feather name="play" size={18} color="#000" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#000' }}>Escuchar en Spotify</Text>
              </Pressable>
            ) : null}
            {s.youtube_url ? (
              <Pressable onPress={() => open(s.youtube_url!)} accessibilityRole="link" style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: '#FF0000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Feather name="youtube" size={18} color="#FFF" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }}>YouTube</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>Letra</Text>
          <Button title="A−" small variant="outline" onPress={() => setSize((x) => Math.max(0, x - 1))} disabled={size === 0} />
          <Button title="A+" small variant="outline" onPress={() => setSize((x) => Math.min(SIZES.length - 1, x + 1))} disabled={size === SIZES.length - 1} />
        </View>
        <Card style={{ gap: fs * 0.9 }}>
          {s.lyrics.trim() ? lyricBlocks(s.lyrics).map((b, i) => (
            <View key={i} style={{ gap: 2 }}>
              {b.label ? <Text style={{ fontSize: Math.max(12, fs - 5), fontWeight: '900', color: colors.green, letterSpacing: 0.5 }}>{b.label.toUpperCase()}</Text> : null}
              {b.lines.map((l, j) => <Text key={j} selectable style={{ fontSize: fs, lineHeight: fs * 1.45, color: colors.text, fontWeight: b.chorus ? '700' : '400' }}>{l}</Text>)}
            </View>
          )) : <Text style={{ fontSize: 14, color: colors.muted }}>Todavía no tiene la letra.</Text>}
        </Card>
        <Button title="Compartir la letra" icon="share-2" variant="ghost" onPress={() => shareText(`${s.title}${s.author ? ` — ${s.author}` : ''}\n\n${s.lyrics}${s.spotify_url ? `\n\n${s.spotify_url}` : ''}`, s.title)} />
        {can('com.anuncios') ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Editar" icon="edit-2" variant="outline" onPress={() => router.push(`/canciones/editar?id=${s.id}` as Href)} style={{ flex: 1 }} />
            <Button title="Borrar" icon="trash-2" variant="ghost" style={{ flex: 1 }} onPress={() => Alert.alert('¿Borrar la canción?', s.title, [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Borrar', style: 'destructive', onPress: () => deleteSong(s.id).then(() => router.back()).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
            ])} />
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
