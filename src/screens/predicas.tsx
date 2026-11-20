// Prédicas: cada semana, el video de YouTube y el audio para escuchar o descargar.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Empty, Loading, Tag } from '@/components/ui';
import { listSermons } from '@/lib/api';
import { fmtDateOnly, youtubeId } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Sermon } from '@/types';

export default function Predicas() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const [rows, setRows] = useState<Sermon[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listSermons().then(setRows).catch(() => setRows([]));
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Prédicas"
        subtitle="Mirá o escuchá cuando quieras"
        right={isStaff ? (
          <Pressable onPress={() => router.push('/predica/nueva')} accessibilityRole="button" accessibilityLabel="Subir prédica" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="plus" size={22} color="#FFF" />
          </Pressable>
        ) : undefined}
      />
      {rows === null ? <Loading /> : (
        <Screen>
          {!rows.length ? <Empty icon="mic" title="Todavía no hay prédicas" text={isStaff ? 'Tocá + para cargar la de esta semana: el link de YouTube y el audio.' : 'Cuando se carguen, van a aparecer acá.'} /> : null}
          {rows.map((s) => {
            const yt = youtubeId(s.youtube_url);
            return (
              <Pressable key={s.id} onPress={() => router.push({ pathname: '/predica/[id]', params: { id: s.id } })} accessibilityRole="button" style={{ gap: 8 }}>
                {yt ? (
                  <View style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: 16 / 9, backgroundColor: colors.bgSoft }}>
                    <Image source={{ uri: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` }} style={{ flex: 1 }} contentFit="cover" />
                    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="play" size={28} color="#FFF" />
                      </View>
                    </View>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {!yt ? (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="headphones" size={22} color={colors.green} />
                    </View>
                  ) : null}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{s.title}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{[s.preacher, fmtDateOnly(s.preached_on), s.passage].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {s.audio_path ? <Tag text="Audio" tone="green" /> : null}
                </View>
              </Pressable>
            );
          })}
        </Screen>
      )}
    </View>
  );
}
