// Modo presentación: vista de escenario. Es para los que cantan y el que predica (una tele o una tablet mirando al
// escenario): muestra en chico lo que está en el proyector, en grande LO QUE SIGUE, y la hora.
// Recibe lo mismo que la pantalla de salida, por los mismos caminos.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PresentSlide } from '@/components/PresentSlide';
import { useChurchLogo } from '@/components/BrandFooter';
import { Empty, Loading } from '@/components/ui';
import { BLACK, fitFont, isNewer, type LiveState } from '@/lib/present';
import { keepScreenOn } from '@/lib/presentAwake';
import { openPresentLink, type LinkStatus } from '@/lib/presentSync';
import { Header } from '@/components/Screen';
import { canPresent } from '@/lib/perms';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';
const FRESH_MS = 6 * 60 * 60 * 1000;
const YELLOW = '#FFD54A';
const SOFT = '#9AA39C';

/** La hora de este aparato, "19:05". Se actualiza sola. */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export default function Escenario() {
  const { church, perms, profile } = useAuth();
  const allowed = canPresent(perms, profile);
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const logo = useChurchLogo();
  const time = useClock();
  const [live, setLive] = useState<LiveState>(BLACK);
  const liveRef = useRef<LiveState | null>(null);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<LinkStatus>('conectando');
  const [got, setGot] = useState(false);
  const [bar, setBar] = useState(true);
  const [full, setFull] = useState(false);
  const churchId = church?.id;

  useEffect(() => {
    if (!churchId || !allowed) return;
    const take = (s: LiveState, sameClock: boolean) => {
      if (!isNewer(liveRef.current, s)) return;
      liveRef.current = s;
      setOffset(sameClock ? 0 : s.at - Date.now());
      setLive(s);
      setGot(true);
    };
    const link = openPresentLink(churchId, { onState: (s) => take(s, false), onStatus: setStatus });
    const last = link.lastLocal();
    if (last && Date.now() - last.at < FRESH_MS) take(last, true);
    return () => link.close();
  }, [churchId, allowed]);

  useEffect(() => (allowed ? keepScreenOn('lamies-escenario') : undefined), [allowed]);

  useEffect(() => {
    if (!bar) return;
    const id = setTimeout(() => setBar(false), got ? 4000 : 15000);
    return () => clearTimeout(id);
  }, [bar, got]);

  useEffect(() => {
    if (!isWeb || !allowed) return;
    const title = document.title;
    document.title = tx('Vista de escenario');
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#000000';
    const onFull = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFull);
    let lock: { release?: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const keepOn = () => { if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined); };
    keepOn();
    document.addEventListener('visibilitychange', keepOn);
    return () => {
      document.title = title;
      document.body.style.backgroundColor = prevBg;
      document.removeEventListener('fullscreenchange', onFull);
      document.removeEventListener('visibilitychange', keepOn);
      lock?.release?.().catch(() => undefined);
    };
  }, [allowed]);

  if (!church) return <View style={{ flex: 1, backgroundColor: '#000' }}><Loading /></View>;
  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Vista de escenario')} back />
        <Empty icon="lock" title={tx('Necesitás permiso')} text={tx('El pastor te puede dar el permiso para manejar la pantalla. Pedíselo: lo activa desde Roles y permisos.')} />
      </View>
    );
  }

  const goFull = () => {
    if (!isWeb) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      else document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch { /* el navegador no deja */ }
  };
  const leave = () => {
    if (isWeb && window.opener) { window.close(); return; }
    if (router.canGoBack()) router.back(); else router.replace('/presentar');
  };
  const pointer = isWeb ? ({ onMouseMove: () => setBar(true) } as object) : {};

  const pad = Math.round(Math.min(width, height) * 0.03);
  const tall = height > width; // teléfono parado: una cosa abajo de la otra
  const clockSize = Math.max(22, Math.min(height * 0.11, width * 0.09));
  const headH = clockSize * 1.25;
  // Lo que está ahora en el proyector, en chico.
  const nowW = Math.round(tall ? Math.min(width - pad * 2, height * 0.32) : Math.min(width * 0.3, (height - headH - pad * 3) * 0.6 * (16 / 9)));
  const nowH = Math.round((nowW * 9) / 16);
  // Lo que sigue, lo más grande que entre.
  const nextW = tall ? width - pad * 2 : width - nowW - pad * 3;
  const smallFs = Math.max(11, Math.min(22, height * 0.028));
  const nextH = (tall ? height - headH - nowH - pad * 5 - smallFs * 5 : height - headH - pad * 3) - smallFs * 3.2;
  const stage = live.stage;
  const next = stage?.next ?? null;
  const nextSize = next ? fitFont(next, nextW * 0.96, Math.max(40, nextH), height / 6) : 0;
  const mode = live.mode === 'black' ? 'PANTALLA EN NEGRO' : live.mode === 'logo' ? 'LOGO EN PANTALLA' : null;

  const nowBox = (
    <View style={{ gap: smallFs * 0.4, width: nowW }}>
      <Text style={{ color: SOFT, fontSize: smallFs, fontWeight: '800' }}>{tx('AHORA EN PANTALLA')}</Text>
      <View style={{ borderWidth: 2, borderColor: mode ? '#D93025' : '#2B332E', borderRadius: 6, overflow: 'hidden' }}>
        <PresentSlide live={live} width={nowW - 4} height={nowH - 4} clockOffset={offset} logoUrl={logo} churchName={church.name} />
      </View>
      {mode ? <Text style={{ color: '#FF6B5E', fontSize: smallFs, fontWeight: '800' }}>{mode}</Text> : null}
      {stage?.item ? (
        <Text style={{ color: '#FFFFFF', fontSize: smallFs * 1.1, fontWeight: '700' }} numberOfLines={2}>
          {stage.item}{stage.total > 1 ? tx(' · {n} de {total}', { n: stage.n, total: stage.total }) : ''}
        </Text>
      ) : null}
    </View>
  );
  const nextBox = (
    <View style={{ flex: 1, gap: smallFs * 0.4, minWidth: 0 }}>
      <Text style={{ color: YELLOW, fontSize: smallFs * 1.2, fontWeight: '800' }} numberOfLines={1}>
        {stage?.nextLabel && next ? tx('SIGUE · {replace}', { replace: stage.nextLabel.replace(/^Sigue:\s*/i, '') }) : tx('SIGUE')}
      </Text>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {next ? (
          <Text style={{ color: '#FFFFFF', fontSize: nextSize, lineHeight: nextSize * 1.3, fontWeight: '700' }}>{next}</Text>
        ) : (
          <Text style={{ color: SOFT, fontSize: Math.max(16, smallFs * 1.6), fontWeight: '700' }}>
            {!got ? tx('Acá va a aparecer lo que sigue cuando empiece la presentación.') : stage ? tx('No hay más diapositivas en la lista.') : tx('El que maneja la pantalla tiene que actualizar la app para ver acá lo que sigue.')}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000000', padding: pad, gap: pad }} onPress={() => setBar((b) => !b)} accessibilityLabel={tx('Vista de escenario')} {...pointer}>
      <StatusBar hidden />
      <View style={{ flexDirection: 'row', alignItems: 'center', height: headH, gap: pad }}>
        <Text style={{ color: '#FFFFFF', fontSize: clockSize, lineHeight: clockSize * 1.15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{time}</Text>
        <View style={{ flex: 1 }} />
        {status === 'sin-conexion' && !got ? <Text style={{ color: '#E0574E', fontSize: smallFs, fontWeight: '700' }}>{tx('Sin conexión con otros aparatos')}</Text> : null}
      </View>
      {tall ? (
        <View style={{ flex: 1, gap: pad }}>
          {nowBox}
          {nextBox}
        </View>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', gap: pad }}>
          {nextBox}
          {nowBox}
        </View>
      )}
      {bar ? (
        <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 }}>
          {isWeb ? (
            <Pressable onPress={goFull} accessibilityRole="button" style={{ backgroundColor: '#1F6B45', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>{full ? tx('Salir de pantalla completa') : tx('Pantalla completa')}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={leave} accessibilityRole="button" style={{ backgroundColor: '#2B332E', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>{tx('Cerrar')}</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}
