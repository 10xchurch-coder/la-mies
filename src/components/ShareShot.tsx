// La imagen que se comparte (versículo o frase del día), dibujada aparte en alta definición:
// siempre 1080 × 1920 píxeles, en cualquier teléfono, para que el texto y el logo salgan nítidos
// en los estados de WhatsApp, Instagram, etc. No se ve en la pantalla: se arma, se captura y se saca.
import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { DayBackground } from './VerseCard';
import { useChurchLogo } from './BrandFooter';
import { useAuth } from '../store/auth';
import type { DailyContent } from '../types';

const PX_W = 1080;
const PX_H = 1920;

export type ShotKind = 'verse' | 'phrase';
export type ShotView = React.ComponentRef<typeof View>;

export function ShareShot({ item, kind, onReady }: { item: DailyContent; kind: ShotKind; onReady: (view: ShotView) => void }) {
  const { church } = useAuth();
  const logo = useChurchLogo();
  const ref = useRef<ShotView>(null);
  const dpr = PixelRatio.get();
  const W = PX_W / dpr;
  const H = PX_H / dpr;
  const k = W / 360; // todo está pensado para 360 de ancho y se agranda parejo
  const [logoOk, setLogoOk] = useState(!logo);
  const fired = useRef(false);

  // Se espera a que carguen el logo y la foto de fondo (o 3,5 segundos como mucho) antes de capturar.
  useEffect(() => { if (!logo) setLogoOk(true); }, [logo]);
  useEffect(() => {
    const fire = () => { if (!fired.current && ref.current) { fired.current = true; onReady(ref.current); } };
    const t = setTimeout(fire, logoOk ? 1400 : 3500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoOk]);

  const shadow = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 8 * k, textShadowOffset: { width: 0, height: k } };
  const text = kind === 'verse' ? item.verse : item.message ?? item.verse;
  const n = text.length;
  const size = kind === 'verse' ? (n > 380 ? 18 : n > 220 ? 21 : 25) : (n > 220 ? 22 : 30);
  const T = (p: React.ComponentProps<typeof Text>) => <Text allowFontScaling={false} {...p} />;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: 1 }}>
      <View ref={ref} collapsable={false} style={{ width: W, height: H, overflow: 'hidden', backgroundColor: '#1F3B2C', paddingHorizontal: 28 * k, paddingTop: 64 * k, paddingBottom: 72 * k, justifyContent: 'space-between' }}>
        <DayBackground background={item.background} date={item.on_date} width={PX_W / 2} height={PX_H / 2} dim={kind === 'phrase' ? 'normal' : 'normal'} />
        <View style={{ gap: 6 * k }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * k }}>
            <Feather name={kind === 'verse' ? 'sun' : 'feather'} size={13 * k} color="rgba(255,255,255,0.85)" />
            <T style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 * k, fontWeight: '700', letterSpacing: 1.2 * k, textTransform: 'uppercase' }}>{kind === 'verse' ? 'Versículo del día' : 'Para pensar hoy'}</T>
          </View>
          {kind === 'verse' ? <T style={{ color: '#FFFFFF', fontSize: 22 * k, fontWeight: '800', ...shadow }}>{item.reference}</T> : null}
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 18 * k, gap: 18 * k }}>
          <T style={{ color: '#FFFFFF', fontSize: size * k, lineHeight: size * 1.4 * k, fontWeight: kind === 'verse' ? '700' : '800', ...shadow }}>{text}</T>
          {kind === 'phrase' ? <T style={{ color: 'rgba(255,255,255,0.92)', fontSize: 15 * k, fontWeight: '700', ...shadow }}>{item.reference}</T> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 12 * k, maxWidth: '100%' }}>
          {logo ? <Image source={{ uri: logo }} style={{ width: 40 * k, height: 44 * k }} contentFit="contain" cachePolicy="memory-disk" onLoad={() => setLogoOk(true)} onError={() => setLogoOk(true)} /> : null}
          <View style={{ flexShrink: 1 }}>
            <T numberOfLines={2} style={{ color: '#FFFFFF', fontSize: 18 * k, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 * k, textShadowOffset: { width: 0, height: k } }}>{church?.name ?? 'La Mies'}</T>
            <T style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12.5 * k, fontWeight: '600', marginTop: k, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 * k, textShadowOffset: { width: 0, height: k } }}>App La Mies · RV1960</T>
          </View>
        </View>
      </View>
    </View>
  );
}
