// Modo presentación: la pantalla de salida. Es lo que ve la iglesia en el proyector: fondo negro y nada más.
// En la computadora se abre en otra ventana y se lleva al proyector; en una tablet o un teléfono se ve a pantalla completa
// y lo maneja otro aparato.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PresentSlide } from '@/components/PresentSlide';
import { useChurchLogo } from '@/components/BrandFooter';
import { Loading } from '@/components/ui';
import { BLACK, isNewer, type LiveState, type RemoteCommand } from '@/lib/present';
import { keepScreenOn } from '@/lib/presentAwake';
import { openPresentLink, type LinkStatus, type PresentLink } from '@/lib/presentSync';
import { canPresent } from '@/lib/perms';
import { useAuth } from '@/store/auth';
import { tx } from '@/lib/i18n';

const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';
// Lo guardado en esta computadora sirve solo si es de hace poco (no la última diapositiva del domingo pasado).
const FRESH_MS = 6 * 60 * 60 * 1000;

function toggleFull() {
  if (!isWeb) return;
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  } catch { /* el navegador no deja */ }
}

export default function Salida() {
  const { church, perms, profile } = useAuth();
  // La pantalla la puede mostrar cualquiera de la iglesia; manejarla desde acá (teclado, toques), solo quien tiene el permiso.
  const isLeader = canPresent(perms, profile);
  const router = useRouter();
  const linkRef = useRef<PresentLink | null>(null);
  const { width, height } = useWindowDimensions();
  const logo = useChurchLogo();
  const [live, setLive] = useState<LiveState>(BLACK);
  const liveRef = useRef<LiveState | null>(null);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<LinkStatus>('conectando');
  const [got, setGot] = useState(false);
  const [bar, setBar] = useState(true);
  const [full, setFull] = useState(false);
  const churchId = church?.id;

  useEffect(() => {
    if (!churchId) return;
    const take = (s: LiveState, sameClock: boolean) => {
      if (!isNewer(liveRef.current, s)) return;
      liveRef.current = s;
      // En otra ventana de la misma computadora el reloj es el mismo; en otro aparato se acomoda con la hora del operador.
      setOffset(sameClock ? 0 : s.at - Date.now());
      setLive(s);
      setGot(true);
    };
    const link = openPresentLink(churchId, { onState: (s) => take(s, false), onStatus: setStatus });
    linkRef.current = link;
    const last = link.lastLocal();
    if (last && Date.now() - last.at < FRESH_MS) take(last, true);
    return () => { link.close(); linkRef.current = null; };
  }, [churchId]);

  // En la tablet o el teléfono, que la pantalla no se apague sola en medio del culto.
  useEffect(() => keepScreenOn('lamies-salida'), []);

  // Teclado en esta ventana (después de tocar "Pantalla completa" el teclado queda acá y no en la del operador):
  // las mismas teclas que en la otra ventana, y F para pantalla completa.
  useEffect(() => {
    if (!isWeb || !isLeader) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') { if (!e.repeat) toggleFull(); return; }
      const c: RemoteCommand | null =
        k === 'arrowright' || k === 'arrowdown' || k === ' ' || k === 'pagedown' ? 'next'
        : k === 'arrowleft' || k === 'arrowup' || k === 'pageup' ? 'prev'
        : k === 'b' ? 'black' : k === 'l' ? 'logo' : null;
      if (!c) return;
      e.preventDefault();
      if (e.repeat && (c === 'black' || c === 'logo')) return;
      linkRef.current?.sendCommand(c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLeader]);

  // La barra de ayuda se esconde sola a los segundos; vuelve al tocar o mover el mouse.
  useEffect(() => {
    if (!bar) return;
    const id = setTimeout(() => setBar(false), got ? 4000 : 15000);
    return () => clearTimeout(id);
  }, [bar, got]);

  useEffect(() => {
    if (!isWeb) return;
    const title = document.title;
    document.title = tx('Pantalla de salida');
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#000000';
    const onFull = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFull);
    // Que la pantalla no se apague sola (si el navegador lo permite).
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
  }, []);

  if (!church) return <View style={{ flex: 1, backgroundColor: '#000' }}><Loading /></View>;

  const goFull = toggleFull;
  // En la tablet o el teléfono (un solo aparato conectado al proyector): tocar la derecha pasa, la izquierda vuelve
  // y el medio muestra los botones. Solo para los líderes.
  const touchNav = !isWeb && isLeader;
  const onTap = (x: number) => {
    if (touchNav && got) {
      if (x > width * 0.67) { linkRef.current?.sendCommand('next'); return; }
      if (x < width * 0.33) { linkRef.current?.sendCommand('prev'); return; }
    }
    setBar((b) => !b);
  };
  const leave = () => {
    if (isWeb && window.opener) { window.close(); return; }
    if (router.canGoBack()) router.back(); else router.replace('/presentar');
  };
  const pointer = isWeb ? ({ onMouseMove: () => setBar(true) } as object) : {};

  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000000' }} onPress={(e) => onTap(e.nativeEvent?.pageX ?? width / 2)} accessibilityLabel={tx('Pantalla de salida')} {...pointer}>
      <StatusBar hidden />
      <PresentSlide live={live} width={width} height={height} output clockOffset={offset} logoUrl={logo} churchName={church.name} />
      {!got ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ color: '#8B918C', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{tx('Pantalla de salida')}</Text>
          <Text style={{ color: '#6B716C', fontSize: 16, textAlign: 'center', lineHeight: 23, maxWidth: 520 }}>
            {tx('{pl}Acá va a aparecer lo que elijas en el Modo presentación.{pl2}', { pl: isWeb ? tx('Llevá esta ventana al proyector y poné pantalla completa. ') : '', pl2: touchNav ? tx(' Tocá la derecha de la pantalla para pasar y la izquierda para volver.') : '' })}
          </Text>
          {status === 'sin-conexion' ? <Text style={{ color: '#E0574E', fontSize: 14, textAlign: 'center' }}>{tx('Sin conexión con otros aparatos. En esta misma computadora anda igual.')}</Text> : null}
        </View>
      ) : null}
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
