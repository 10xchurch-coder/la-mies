// Una prédica: arriba el video de YouTube, después el resumen, el audio (escuchar o descargar)
// y el bosquejo para completar con los espacios en blanco (cada uno guarda sus respuestas).
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, SectionTitle } from '@/components/ui';
import { getSermon, liveNotes, mySermonNotes, saveSermonNotes } from '@/lib/api';
import { downloadUrl, signedUrl } from '@/lib/files';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDateOnly, youtubeId } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Sermon } from '@/types';

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:` : ''}${h && m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}

function AudioPlayer({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url });
  const st = useAudioPlayerStatus(player);
  const jump = (d: number) => player.seekTo(Math.max(0, Math.min((st.duration || 0) - 1, (st.currentTime || 0) + d)));
  const pct = st.duration ? Math.min(1, (st.currentTime || 0) / st.duration) : 0;
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bgSoft, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: colors.green }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>{mmss(st.currentTime)}</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{st.duration ? mmss(st.duration) : st.isBuffering ? 'Cargando…' : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <Pressable onPress={() => jump(-15)} accessibilityLabel="Atrás 15 segundos" style={{ padding: 8, alignItems: 'center' }}>
          <Feather name="rotate-ccw" size={26} color={colors.text} />
          <Text style={{ fontSize: 10, color: colors.muted }}>15 s</Text>
        </Pressable>
        <Pressable onPress={() => (st.playing ? player.pause() : player.play())} accessibilityLabel={st.playing ? 'Pausa' : 'Escuchar'}
          style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={st.playing ? 'pause' : 'play'} size={30} color="#FFF" />
        </Pressable>
        <Pressable onPress={() => jump(30)} accessibilityLabel="Adelante 30 segundos" style={{ padding: 8, alignItems: 'center' }}>
          <Feather name="rotate-cw" size={26} color={colors.text} />
          <Text style={{ fontSize: 10, color: colors.muted }}>30 s</Text>
        </Pressable>
      </View>
    </Card>
  );
}

// El bosquejo: cada "___" es un espacio para completar. Se guarda solo, un segundo después de escribir.
/** Lo que la persona escribió mientras miraba el culto en vivo. */
function LiveNotes({ video }: { video: string }) {
  const [t, setT] = useState('');
  useEffect(() => { liveNotes(video).then(setT).catch(() => undefined); }, [video]);
  if (!t.trim()) return null;
  return (
    <Card style={{ gap: 6, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>Tus notas del culto en vivo</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{t}</Text>
    </Card>
  );
}

function SermonNotes({ sermonId, outline }: { sermonId: string; outline: string | null }) {
  const lines = (outline ?? '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  const blanks = lines.reduce((n, l) => n + (l.split('___').length - 1), 0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    mySermonNotes(sermonId).then((n) => {
      if (n) { setAnswers(n.answers ?? []); setNotes(n.notes ?? ''); }
      loaded.current = true;
    }).catch(() => { loaded.current = true; });
  }, [sermonId]);

  const queue = (a: string[], n: string) => {
    if (!loaded.current) return;
    if (timer.current) clearTimeout(timer.current);
    setSaved('saving');
    timer.current = setTimeout(() => {
      saveSermonNotes(sermonId, a, n.trim() || null).then(() => setSaved('ok')).catch(() => setSaved('idle'));
    }, 900);
  };

  let k = -1;
  return (
    <>
      <SectionTitle>{blanks ? 'Bosquejo para completar' : 'Mis apuntes'}</SectionTitle>
      {lines.length ? (
        <Card style={{ gap: 10 }}>
          {lines.map((line, li) => {
            const parts = line.split('___');
            return (
              <View key={li} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 }}>
                {parts.map((part, pi) => {
                  const idx = pi < parts.length - 1 ? ++k : -1;
                  return (
                    <React.Fragment key={pi}>
                      {part ? <Text style={{ fontSize: 15, lineHeight: 24, color: colors.text }}>{part}</Text> : null}
                      {idx >= 0 ? (
                        <TextInput value={answers[idx] ?? ''} accessibilityLabel={`Espacio ${idx + 1}`}
                          onChangeText={(t) => { const a = [...answers]; while (a.length <= idx) a.push(''); a[idx] = t; setAnswers(a); queue(a, notes); }}
                          style={{ minWidth: 90, borderBottomWidth: 2, borderBottomColor: colors.green, fontSize: 15, fontWeight: '700', color: colors.greenText, paddingVertical: 2, paddingHorizontal: 4, marginHorizontal: 2 }} />
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </View>
            );
          })}
        </Card>
      ) : null}
      <Field label="Mis notas" value={notes} onChangeText={(t) => { setNotes(t); queue(answers, t); }} multiline placeholder="Lo que Dios me habló hoy…" />
      <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'right' }}>{saved === 'saving' ? 'Guardando…' : saved === 'ok' ? 'Guardado' : 'Solo vos ves tus apuntes'}</Text>
    </>
  );
}

export default function PredicaVer() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff } = useAuth();
  const [s, setS] = useState<Sermon | null | undefined>(undefined);
  const [audio, setAudio] = useState<string | null>(null);

  useEffect(() => {
    getSermon(id).then((x) => {
      setS(x);
      if (x?.audio_path) signedUrl('sermons', x.audio_path).then(setAudio);
    }).catch(() => setS(null));
  }, [id]);

  if (s === undefined) return <Loading />;
  if (!s) return <View style={{ flex: 1 }}><Header title="Prédica" back /><Text style={{ padding: 24, color: colors.text }}>No se encontró.</Text></View>;
  const yt = youtubeId(s.youtube_url);

  const download = async () => {
    if (!s.audio_path) return;
    const url = await downloadUrl('sermons', s.audio_path, s.audio_name ?? `${s.title}.mp3`);
    if (url) Linking.openURL(url);
  };

  const remove = () => Alert.alert('Borrar prédica', '¿Seguro?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar', style: 'destructive', onPress: async () => {
      const { error } = await supabase.from('sermons').delete().eq('id', id);
      if (error) Alert.alert('No se pudo', errorMessage(error));
      else router.back();
    } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={s.title} subtitle={[s.preacher, fmtDateOnly(s.preached_on)].filter(Boolean).join(' · ')} back />
      <Screen>
        {yt ? (
          <Pressable onPress={() => s.youtube_url && Linking.openURL(s.youtube_url)} accessibilityRole="button" accessibilityLabel="Ver en YouTube">
            <View style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: 16 / 9, backgroundColor: colors.bgSoft }}>
              <Image source={{ uri: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` }} style={{ flex: 1 }} contentFit="cover" />
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 48, borderRadius: 24, backgroundColor: '#C4302B' }}>
                  <Feather name="youtube" size={22} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '800' }}>Ver en YouTube</Text>
                </View>
              </View>
            </View>
          </Pressable>
        ) : s.youtube_url ? <Button title="Ver el video" icon="youtube" onPress={() => Linking.openURL(s.youtube_url as string)} /> : null}
        {yt ? <LiveNotes video={yt} /> : null}
        {s.passage ? <Text style={{ fontSize: 15, fontWeight: '700', color: colors.green }}>{s.passage}</Text> : null}
        {s.description ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{s.description}</Text> : null}
        {s.summary ? (
          <>
            <SectionTitle>Resumen</SectionTitle>
            <Text style={{ fontSize: 15, lineHeight: 23, color: colors.text }}>{s.summary}</Text>
          </>
        ) : null}
        {s.audio_path ? <SectionTitle>Escuchar</SectionTitle> : null}
        {audio ? <AudioPlayer url={audio} /> : s.audio_path ? <Loading /> : null}
        {s.audio_path ? <Button title="Descargar el audio" icon="download" variant="outline" onPress={download} /> : null}
        <SermonNotes sermonId={s.id} outline={s.notes_outline ?? null} />
        {isStaff ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Editar" variant="outline" small onPress={() => router.push({ pathname: '/predica/nueva', params: { id } })} style={{ flex: 1 }} />
            <Button title="Borrar" variant="danger" small onPress={remove} style={{ flex: 1 }} />
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
