// Cancionero: las canciones que cantamos en la iglesia, con la letra y el enlace para escucharlas. Para aprenderlas en la semana.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { listSongs } from '@/lib/api';
import { searchKey } from '@/lib/songs';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Song } from '@/types';
import { tx } from '@/lib/i18n';

export default function Canciones() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Song[] | null>(null);
  const [q, setQ] = useState('');
  useFocusEffect(useCallback(() => { listSongs().then(setRows).catch(() => setRows((o) => o ?? [])); }, []));
  const shown = useMemo(() => {
    const k = searchKey(q);
    return (rows ?? []).filter((s) => !k || searchKey(`${s.title} ${s.author ?? ''} ${s.lyrics}`).includes(k));
  }, [rows, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Cancionero')} subtitle={rows ? `${rows.length} ${rows.length === 1 ? tx('canción') : tx('canciones')}` : undefined} back />
      <Screen>
        {can('com.anuncios') ? <Button title={tx('Agregar una canción')} icon="plus" onPress={() => router.push('/canciones/editar' as Href)} /> : null}
        {rows?.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft }}>
            <Feather name="search" size={18} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar por título o por una frase')} placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} autoCorrect={false} />
          </View>
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="music" title={tx('Todavía no hay canciones')} text={tx('Pronto vas a encontrar acá las canciones que cantamos, con la letra.')} />
        ) : !shown.length ? <Text style={{ fontSize: 14, color: colors.muted }}>{tx('No encontré ninguna con eso.')}</Text> : (
          <Card style={{ padding: 0 }}>
            {shown.map((s, i) => (
              <Pressable key={s.id} onPress={() => router.push(`/canciones/${s.id}` as Href)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="music" size={17} color={colors.green} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{s.author ? `${s.author} · ` : ''}{s.lyrics.split('\n').find((l) => l.trim()) ?? ''}</Text>
                </View>
                {s.spotify_url ? <Feather name="headphones" size={16} color={colors.muted} /> : null}
              </Pressable>
            ))}
          </Card>
        )}
      </Screen>
    </View>
  );
}
