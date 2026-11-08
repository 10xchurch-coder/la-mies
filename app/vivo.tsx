// El culto en vivo: la transmisión de YouTube, comentarios de la iglesia, mis notas y compartir.
// Si no hay transmisión, muestra cuándo es la próxima reunión y la última prédica.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, Share, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, SectionTitle } from '@/components/ui';
import { addLiveComment, deleteLiveComment, listSermons, liveComments, liveNotes, liveState, saveLiveNotes, setLive, type LiveComment, type LiveState } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Sermon } from '@/types';

function Player({ id }: { id: string }) {
  if (Platform.OS === 'web') {
    return (
      <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
        {React.createElement('iframe', {
          src: `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`,
          style: { width: '100%', height: '100%', border: 0 },
          allow: 'autoplay; encrypted-media; picture-in-picture',
          allowFullScreen: true,
        })}
      </View>
    );
  }
  // En el teléfono se abre en YouTube (la app vuelve sola con el botón atrás).
  return (
    <Pressable onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${id}`)} accessibilityRole="button" accessibilityLabel="Ver la transmisión"
      style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
      <Image source={{ uri: `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg` }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#E11D48', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="play" size={34} color="#FFF" style={{ marginLeft: 4 }} />
        </View>
        <Text style={{ color: '#FFF', fontWeight: '800', marginTop: 8 }}>Tocá para verlo</Text>
      </View>
    </Pressable>
  );
}

export default function Vivo() {
  const router = useRouter();
  const { can, church } = useAuth();
  const [st, setSt] = useState<LiveState | null>(null);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(true);
  const [last, setLast] = useState<Sermon | null>(null);
  const [link, setLink] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const video = st?.live_video_id ?? null;

  const load = useCallback(() => {
    liveState().then(setSt).catch(() => undefined);
    listSermons().then((s) => setLast(s[0] ?? null)).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  // Comentarios: se actualizan cada 5 segundos; el estado en vivo, cada 30.
  useEffect(() => {
    if (!video) return;
    let alive = true;
    const pull = () => liveComments(video).then((c) => alive && setComments(c)).catch(() => undefined);
    pull();
    liveNotes(video).then((n) => alive && setNotes(n)).catch(() => undefined);
    const a = setInterval(pull, 5000);
    const b = setInterval(() => liveState().then((x) => alive && setSt(x)).catch(() => undefined), 30000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [video]);

  const onNotes = (t: string) => {
    setNotes(t);
    setNotesSaved(false);
    if (timer.current) clearTimeout(timer.current);
    if (!video) return;
    timer.current = setTimeout(() => saveLiveNotes(video, t).then(() => setNotesSaved(true)).catch(() => undefined), 1200);
  };

  const send = async () => {
    if (!video || !text.trim()) return;
    const body = text.trim();
    setText('');
    try {
      await addLiveComment(video, body);
      setComments(await liveComments(video));
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
      setText(body);
    }
  };

  const share = () => {
    if (!video) return;
    Share.share({ message: `Estamos en vivo en la ${church?.name ?? 'iglesia'}. Miralo acá: https://www.youtube.com/watch?v=${video}` }).catch(() => undefined);
  };

  const goLive = async () => {
    try { await setLive(link.trim() || null); setLink(''); load(); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="En vivo" subtitle={video ? 'El culto está en vivo ahora' : 'Transmisión del culto'} back />
      <Screen>
        {video ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E11D48', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 12 }}>EN VIVO</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={2}>{st?.live_title ?? 'Culto en vivo'}</Text>
            </View>
            <Player id={video} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Compartir" icon="share-2" variant="outline" onPress={share} style={{ flex: 1 }} />
              <Button title="Abrir en YouTube" icon="youtube" variant="outline" onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${video}`)} style={{ flex: 1 }} />
            </View>

            <SectionTitle>Mis notas</SectionTitle>
            <Field label="Notas" value={notes} onChangeText={onNotes} multiline placeholder="Escribí lo que Dios te habla durante el mensaje…" hint={notesSaved ? '(se guardan solas)' : '(guardando…)'} />
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: -6 }}>Las vas a encontrar después en la prédica, en Prédicas.</Text>

            <SectionTitle>Comentarios de la iglesia</SectionTitle>
            <Card style={{ padding: 0 }}>
              {comments.map((c, i) => (
                <Pressable key={c.id} onLongPress={() => (c.mine || can('com.moderar')) && Alert.alert('Borrar el comentario', c.body, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Borrar', style: 'destructive', onPress: () => deleteLiveComment(c.id).then(() => setComments(comments.filter((x) => x.id !== c.id))) },
                ])} style={{ padding: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.text }}><Text style={{ fontWeight: '800' }}>{c.author ?? 'Alguien'}</Text>  {c.body}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{fmtTime(c.created_at)}</Text>
                </Pressable>
              ))}
              {!comments.length ? <Text style={{ padding: 12, color: colors.muted }}>Sé el primero en comentar: un saludo, un “¡amén!” o un pedido de oración.</Text> : null}
            </Card>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput value={text} onChangeText={setText} placeholder="Escribí un comentario" placeholderTextColor={colors.muted} maxLength={500}
                onSubmitEditing={send} returnKeyType="send"
                style={{ flex: 1, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.input, paddingHorizontal: 16, fontSize: 15, color: colors.text, backgroundColor: colors.bg }} />
              <Pressable onPress={send} accessibilityRole="button" accessibilityLabel="Enviar" style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="send" size={18} color="#FFF" />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
              <Feather name="radio" size={34} color={colors.muted} />
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>No hay transmisión ahora</Text>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Cuando el culto esté en vivo te llega un aviso y lo ves acá, con comentarios y notas.</Text>
            </Card>
            {last ? (
              <>
                <SectionTitle>La última prédica</SectionTitle>
                <Pressable onPress={() => router.push({ pathname: '/predica/[id]', params: { id: last.id } })} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Feather name="play-circle" size={28} color={colors.green} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{last.title}</Text>
                      {last.passage ? <Text style={{ fontSize: 13, color: colors.muted }}>{last.passage}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              </>
            ) : null}
          </>
        )}

        {can('predicas.subir') ? (
          <Card style={{ gap: 8, marginTop: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>Para quien maneja la transmisión</Text>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              La app se da cuenta sola cuando el canal de YouTube está en vivo (lo revisa cada 3 minutos) y avisa a todos. Si no aparece, pegá el link de la transmisión.
            </Text>
            {video ? (
              <Button title="Terminar la transmisión en la app" variant="ghost" small onPress={() => setLive(null).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e)))} />
            ) : (
              <>
                <Field label="Link de la transmisión" value={link} onChangeText={setLink} placeholder="https://youtube.com/live/…" autoCapitalize="none" />
                <Button title="Estamos en vivo" icon="radio" small onPress={goLive} disabled={!link.trim()} />
              </>
            )}
            {st?.live_since ? <Text style={{ fontSize: 11, color: colors.muted }}>En vivo desde las {fmtTime(st.live_since)}</Text> : null}
          </Card>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
