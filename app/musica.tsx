// La música de la iglesia: las listas de Spotify y YouTube Music con lo que cantamos y escuchamos.
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { churchLinks } from '@/lib/api';
import { KIND_LABEL, isMusic, sortLinks } from '@/lib/links';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchLink } from '@/types';
import { tx } from '@/lib/i18n';

const ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = { spotify: 'music', youtube_music: 'play-circle', music_other: 'headphones' };

export default function Musica() {
  const { can } = useAuth();
  const [rows, setRows] = useState<ChurchLink[] | null>(null);
  useFocusEffect(useCallback(() => {
    churchLinks().then((all) => setRows(sortLinks(all.filter((l) => isMusic(l.kind))))).catch(() => setRows((o) => o ?? []));
  }, []));
  const open = (l: ChurchLink) => { if (l.url) Linking.openURL(l.url).catch(() => Alert.alert(tx('No se pudo abrir'), tx('Probá de nuevo o copiá el enlace.'))); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Música')} subtitle={tx('Lo que cantamos y escuchamos en la iglesia')} back />
      <Screen>
        {can('com.anuncios') ? <Button title={tx('Editar los enlaces')} icon="edit-2" variant="outline" onPress={() => router.push('/admin/musica' as Href)} /> : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="music" title={tx('Todavía no hay música')} text={tx('Pronto vas a encontrar acá las listas de la iglesia.')} />
        ) : rows.map((l) => (
          <Pressable key={l.id} accessibilityRole="link" onPress={() => open(l)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={ICON[l.kind] ?? 'music'} size={22} color={colors.green} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{l.title}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{KIND_LABEL[l.kind]}{l.note ? ` · ${l.note}` : ''}</Text>
              </View>
              <Feather name="external-link" size={18} color={colors.muted} />
            </Card>
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}
