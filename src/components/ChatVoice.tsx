// Mensajes de voz del chat: grabar (tocar el micrófono, hablar, enviar) y escuchar.
// El audio viaja como un archivo adjunto con nombre "voz-….m4a"; quien tiene una versión vieja lo ve como documento.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import { signedUrl } from '@/lib/files';
import { colors } from '@/theme';

/** ¿Este mensaje con archivo es un mensaje de voz? */
export const isVoice = (name: string | null | undefined) => /^voz-.*\.(m4a|mp4|webm|ogg|wav|aac)$/i.test(name ?? '');

/**
 * ¿Se puede grabar acá? En iPhone hace falta la versión de la tienda que pide permiso de micrófono (compilación 6 o más):
 * en las anteriores, pedir el micrófono cierra la app.
 */
export const voiceAvailable: boolean = (() => {
  if (Platform.OS === 'ios') return Number(Constants.platform?.ios?.buildNumber ?? 0) >= 6;
  if (Platform.OS === 'web') return typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined';
  return true;
})();

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MAX_SECONDS = 180;

/** La barra de grabación: reemplaza a la casilla de escribir mientras se graba. */
export function VoiceRecorder({ onSend, onCancel }: { onSend: (uri: string, seconds: number) => Promise<void>; onCancel: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [seconds, setSeconds] = useState(0);
  const [state, setState] = useState<'starting' | 'recording' | 'sending'>('starting');
  const started = useRef(0);
  const finish = useRef<(send: boolean) => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) { Alert.alert('Sin permiso', 'Para mandar mensajes de voz, activá el micrófono para La Mies en los ajustes.'); onCancel(); return; }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!alive) return;
        recorder.record();
        started.current = Date.now();
        setState('recording');
      } catch {
        Alert.alert('No se pudo grabar', 'Probá de nuevo.');
        onCancel();
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) finish.current(true);
    }, 250);
    return () => clearInterval(t);
  }, [state]);

  finish.current = async (send: boolean) => {
    if (state !== 'recording') { if (!send) onCancel(); return; }
    const secs = (Date.now() - started.current) / 1000;
    setState('sending');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      const uri = recorder.uri;
      if (send && uri && secs >= 1) await onSend(uri, secs);
      else if (send) Alert.alert('Muy corto', 'Mantené la grabación al menos un segundo.');
    } catch {
      if (send) Alert.alert('No se pudo mandar', 'Probá de nuevo cuando tengas señal.');
    }
    onCancel();
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
      <Pressable onPress={() => finish.current(false)} disabled={state === 'sending'} accessibilityRole="button" accessibilityLabel="Borrar la grabación"
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.redSoft }}>
        <Feather name="trash-2" size={20} color={colors.redText} />
      </Pressable>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: colors.bgSoft }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: state === 'recording' ? colors.red : colors.gray }} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text }}>
          {state === 'starting' ? 'Preparando el micrófono…' : state === 'sending' ? 'Mandando…' : `Grabando  ${clock(seconds)}`}
        </Text>
      </View>
      <Pressable onPress={() => finish.current(true)} disabled={state !== 'recording'} accessibilityRole="button" accessibilityLabel="Enviar el mensaje de voz"
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, opacity: state === 'recording' ? 1 : 0.5 }}>
        {state === 'sending' ? <ActivityIndicator color="#FFF" /> : <Feather name="send" size={19} color="#FFF" />}
      </Pressable>
    </View>
  );
}

/** El globo de un mensaje de voz: tocar para escuchar o pausar. El audio se baja recién al tocar. */
export function VoiceBubble({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (url) return <VoicePlayer url={url} />;
  const load = async () => {
    setLoading(true);
    const u = await signedUrl('chat', path).catch(() => null);
    setLoading(false);
    if (u) setUrl(u); else Alert.alert('No se pudo abrir', 'Probá de nuevo cuando tengas señal.');
  };
  return <VoiceRow playing={false} loading={loading} label="Mensaje de voz" onPress={load} />;
}

function VoicePlayer({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url });
  const st = useAudioPlayerStatus(player);
  const first = useRef(true);
  useEffect(() => { if (first.current && st.isLoaded) { first.current = false; player.play(); } }, [st.isLoaded, player]);
  const toggle = () => {
    if (st.playing) return player.pause();
    if (st.duration && st.currentTime >= st.duration - 0.2) player.seekTo(0).catch(() => undefined);
    player.play();
  };
  const label = st.isLoaded ? `${clock(st.currentTime)} / ${clock(st.duration || 0)}` : 'Cargando…';
  return <VoiceRow playing={st.playing} loading={!st.isLoaded} label={label} progress={st.duration ? st.currentTime / st.duration : 0} onPress={toggle} />;
}

function VoiceRow({ playing, loading, label, progress = 0, onPress }: { playing: boolean; loading: boolean; label: string; progress?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={playing ? 'Pausar el mensaje de voz' : 'Escuchar el mensaje de voz'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingVertical: 4 }}>
      <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet }}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Feather name={playing ? 'pause' : 'play'} size={19} color="#FFF" />}
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.violetSoft, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`, height: 4, backgroundColor: colors.violet }} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>🎤 {label}</Text>
      </View>
    </Pressable>
  );
}
