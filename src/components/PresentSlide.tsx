// Modo presentación: dibuja lo que va al proyector (fondo negro, letra blanca grande y centrada).
// Se usa en la pantalla de salida (a todo tamaño) y en las miniaturas del operador (chiquito).
import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { clock, fitFont, type LiveSlide, type LiveState } from '@/lib/present';

type Props = {
  live: LiveState;
  width: number;
  height: number;
  /** true en la pantalla de salida: acá sí se reproduce el video y corre la cuenta regresiva. */
  output?: boolean;
  /** Diferencia entre el reloj del operador y el de este aparato, en milisegundos. */
  clockOffset?: number;
  logoUrl?: string | null;
  churchName?: string;
};

const WHITE = '#FFFFFF';
const SOFT = '#C9D1CB';

function useTick(on: boolean, ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return n;
}

function Countdown({ slide, width, height, offset }: { slide: Extract<LiveSlide, { kind: 'countdown' }>; width: number; height: number; offset: number }) {
  useTick(true, 250);
  const left = (slide.endsAt - (Date.now() + offset)) / 1000;
  const done = left <= 0;
  const big = Math.min(height * 0.42, width * 0.26);
  return (
    <View style={{ alignItems: 'center', gap: height * 0.03 }}>
      {done && slide.message ? null : (
        <Text style={{ color: WHITE, fontSize: big, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: big * 1.1 }}>{clock(left)}</Text>
      )}
      {slide.message ? (
        <Text style={{ color: done ? WHITE : SOFT, fontSize: done ? fitFont(slide.message, width * 0.86, height * 0.6, height / 6) : Math.max(10, height * 0.07), fontWeight: '700', textAlign: 'center', paddingHorizontal: width * 0.05 }}>
          {slide.message}
        </Text>
      ) : null}
    </View>
  );
}

/** El video en la web. Si el navegador no deja arrancar con sonido, arranca mudo y pide un toque. */
function WebVideo({ slide }: { slide: Extract<LiveSlide, { kind: 'video' }> }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try { el.currentTime = 0; } catch { /* todavía no cargó */ }
  }, [slide.startedAt]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!slide.playing) { el.pause(); return; }
    el.play().catch(() => {
      el.muted = true;
      setMuted(true);
      el.play().catch(() => undefined);
    });
  }, [slide.playing, slide.startedAt, slide.url]);
  const unmute = () => { const el = ref.current; if (el) { el.muted = false; setMuted(false); } };
  return (
    <View style={{ width: '100%', height: '100%' }}>
      {React.createElement('video', {
        ref, src: slide.url, playsInline: true, preload: 'auto',
        style: { width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' },
      })}
      {muted ? (
        <Pressable onPress={unmute} accessibilityRole="button" style={{ position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' }}>
          <Text style={{ color: '#000', backgroundColor: '#FFD54A', fontSize: 18, fontWeight: '800', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, overflow: 'hidden' }}>
            Tocá acá para prender el sonido
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Note({ icon, text, height }: { icon: React.ComponentProps<typeof Feather>['name']; text: string; height: number }) {
  const fs = Math.max(9, Math.min(22, height * 0.09));
  return (
    <View style={{ alignItems: 'center', gap: fs * 0.4, paddingHorizontal: 8 }}>
      <Feather name={icon} size={fs * 2} color={SOFT} />
      <Text style={{ color: SOFT, fontSize: fs, fontWeight: '700', textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export function PresentSlide({ live, width, height, output, clockOffset = 0, logoUrl, churchName }: Props) {
  const box = { width, height, backgroundColor: '#000000', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const };
  if (live.mode === 'black' || (live.mode === 'slide' && !live.slide)) return <View style={box} />;
  if (live.mode === 'logo') {
    return (
      <View style={box}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={{ width: width * 0.5, height: height * 0.5 }} resizeMode="contain" />
        ) : (
          <Text style={{ color: WHITE, fontSize: fitFont(churchName || 'La Mies', width * 0.8, height * 0.5, height / 7), fontWeight: '800', textAlign: 'center' }}>{churchName || 'La Mies'}</Text>
        )}
      </View>
    );
  }
  const s = live.slide!;
  if (s.kind === 'image') {
    return <View style={box}><Image source={{ uri: s.url }} style={{ width, height }} resizeMode="contain" /></View>;
  }
  if (s.kind === 'video') {
    if (!output) return <View style={box}><Note icon="film" text={s.playing ? 'Video en pantalla' : 'Video en pausa'} height={height} /></View>;
    if (Platform.OS !== 'web') return <View style={box}><Note icon="film" text="Los videos se ven desde la computadora. Abrí la pantalla de salida en el navegador." height={height} /></View>;
    return <View style={box}><WebVideo key={s.url} slide={s} /></View>;
  }
  if (s.kind === 'countdown') {
    return <View style={box}><Countdown slide={s} width={width} height={height} offset={clockOffset} /></View>;
  }
  if (s.kind === 'notice') {
    const titleSize = fitFont(s.title || ' ', width * 0.86, height * 0.3, height / 7);
    const bodySize = fitFont(s.body || ' ', width * 0.84, height * 0.46, height / 11);
    return (
      <View style={[box, { paddingHorizontal: width * 0.06, gap: height * 0.05 }]}>
        {s.title ? <Text style={{ color: '#FFD54A', fontSize: titleSize, lineHeight: titleSize * 1.2, fontWeight: '800', textAlign: 'center' }}>{s.title}</Text> : null}
        {s.body ? <Text style={{ color: WHITE, fontSize: bodySize, lineHeight: bodySize * 1.3, fontWeight: '600', textAlign: 'center' }}>{s.body}</Text> : null}
      </View>
    );
  }
  // Texto: la letra de una canción, un pasaje o texto libre.
  const size = fitFont(s.text, width * 0.88, height * (s.footer ? 0.7 : 0.84), height / 6.5);
  const foot = Math.max(7, height * 0.05);
  return (
    <View style={[box, { paddingHorizontal: width * 0.06 }]}>
      <Text style={{ color: WHITE, fontSize: size, lineHeight: size * 1.3, fontWeight: '700', textAlign: 'center' }}>{s.text}</Text>
      {s.footer ? <Text style={{ color: SOFT, fontSize: foot, fontWeight: '600', textAlign: 'center', marginTop: height * 0.05 }}>{s.footer}</Text> : null}
    </View>
  );
}
