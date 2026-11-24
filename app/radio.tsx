// La radio de la iglesia: la radio por internet suena acá mismo; la FM muestra la frecuencia.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { churchLinks } from '@/lib/api';
import { KIND_LABEL, isRadio, sortLinks } from '@/lib/links';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchLink } from '@/types';
import { tx } from '@/lib/i18n';

function Stream({ link }: { link: ChurchLink }) {
  // El reproductor se crea recién cuando la persona toca "Escuchar", para no gastar datos antes.
  const [on, setOn] = useState(false);
  return on ? <Playing link={link} onStop={() => setOn(false)} /> : (
    <Button title={tx('Escuchar')} icon="play" onPress={() => setOn(true)} />
  );
}

function Playing({ link, onStop }: { link: ChurchLink; onStop: () => void }) {
  const player = useAudioPlayer({ uri: link.url ?? '' });
  const st = useAudioPlayerStatus(player);
  useEffect(() => { try { player.play(); } catch { /* sin señal */ } return () => { try { player.pause(); } catch { /* ya cerrado */ } }; }, [player]);
  return (
    <View style={{ gap: 8 }}>
      <Button title={st.playing ? tx('Pausar') : tx('Seguir escuchando')} icon={st.playing ? 'pause' : 'play'}
        onPress={() => { try { st.playing ? player.pause() : player.play(); } catch { Alert.alert(tx('No se pudo'), tx('Revisá tu conexión.')); } }} />
      <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{st.isBuffering ? tx('Conectando…') : st.playing ? tx('Sonando en vivo') : tx('En pausa')}</Text>
      <Button title={tx('Cerrar')} variant="ghost" small onPress={onStop} />
    </View>
  );
}

export default function Radio() {
  const { can } = useAuth();
  const [rows, setRows] = useState<ChurchLink[] | null>(null);
  useFocusEffect(useCallback(() => {
    churchLinks().then((all) => setRows(sortLinks(all.filter((l) => isRadio(l.kind))))).catch(() => setRows((o) => o ?? []));
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Radio')} subtitle={tx('Escuchá la radio de la iglesia')} back />
      <Screen>
        {can('com.anuncios') ? <Button title={tx('Editar la radio')} icon="edit-2" variant="outline" onPress={() => router.push('/admin/radio' as Href)} /> : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="radio" title={tx('La radio todavía no está lista')} text={tx('Cuando esté al aire, la vas a poder escuchar desde acá.')} />
        ) : rows.map((l) => (
          <Card key={l.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="radio" size={22} color={colors.green} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{l.title}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{KIND_LABEL[l.kind].split(' (')[0]}{l.note ? ` · ${l.note}` : ''}</Text>
              </View>
            </View>
            {l.kind === 'radio_stream' && l.url ? <Stream link={l} /> : null}
            {l.kind !== 'radio_stream' && l.url ? (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(l.url as string).catch(() => undefined)}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green }}>{tx('Abrir →')}</Text>
              </Pressable>
            ) : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
