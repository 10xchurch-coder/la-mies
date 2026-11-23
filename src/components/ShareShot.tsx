// La imagen que se comparte (versículo o frase del día), dibujada aparte en alta definición:
// siempre 1440 × 2560 píxeles (más que la pantalla de cualquier teléfono), con letra propia, en cualquier teléfono, para que el texto y el logo salgan nítidos
// en los estados de WhatsApp, Instagram, etc. No se ve en la pantalla: se arma, se captura y se saca.
import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { DayBackground } from './VerseCard';
import { useChurchLogo } from './BrandFooter';
import { useAuth } from '../store/auth';
import type { DailyContent } from '../types';
import { TITLE_FONT, VERSE_FONT, VERSE_FONT_BOLD, loadShareFonts } from '../lib/shareFonts';

const PX_W = 1440;
const PX_H = 2560;

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
  // null = todavía cargando las letras; false = no se pudo (queda la letra del teléfono).
  const [fonts, setFonts] = useState<boolean | null>(null);
  useEffect(() => { loadShareFonts().then(setFonts); }, []);
  const fired = useRef(false);

  // Se espera a que carguen el logo y la foto de fondo (o 3,5 segundos como mucho) antes de capturar.
  useEffect(() => { if (!logo) setLogoOk(true); }, [logo]);
  useEffect(() => {
    const fire = () => { if (!fired.current && ref.current) { fired.current = true; onReady(ref.current); } };
    if (fonts === null) return;
    const t = setTimeout(fire, logoOk ? 1500 : 3500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoOk, fonts]);

  // Sombra corta y firme: una sombra ancha deja un halo que hace ver la letra borrosa.
  const shadow = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 1.5 * k, textShadowOffset: { width: 0, height: 0.75 * k } };
  // Con letra propia no se pide "negrita" aparte: cada archivo ya trae su grosor (pedirla la engrosa mal y la deja borrosa).
  const verseFont = fonts ? { fontFamily: kind === 'verse' ? VERSE_FONT : VERSE_FONT_BOLD } : { fontWeight: (kind === 'verse' ? '700' : '800') as '700' | '800' };
  const titleFont = fonts ? { fontFamily: TITLE_FONT } : { fontWeight: '800' as const };
  const nameFont = fonts ? { fontFamily: VERSE_FONT_BOLD } : { fontWeight: '800' as const };
  const text = kind === 'verse' ? item.verse : item.message ?? item.verse;
  const n = text.length;
  const size = kind === 'verse' ? (n > 380 ? 18.5 : n > 220 ? 21.5 : 25.5) : (n > 220 ? 22 : 29);
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
          {kind === 'verse' ? <T style={{ color: '#FFFFFF', fontSize: 25 * k, ...titleFont, ...shadow }}>{item.reference}</T> : null}
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 18 * k, gap: 18 * k }}>
          <T style={{ color: '#FFFFFF', fontSize: size * k, lineHeight: size * 1.45 * k, ...verseFont, ...shadow }}>{text}</T>
          {kind === 'phrase' ? <T style={{ color: 'rgba(255,255,255,0.95)', fontSize: 16 * k, ...titleFont, ...shadow }}>{item.reference}</T> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 12 * k, maxWidth: '100%' }}>
          {logo ? <Image source={{ uri: logo }} style={{ width: 40 * k, height: 44 * k }} contentFit="contain" cachePolicy="memory-disk" onLoad={() => setLogoOk(true)} onError={() => setLogoOk(true)} /> : null}
          <View style={{ flexShrink: 1 }}>
            <T numberOfLines={2} style={{ color: '#FFFFFF', fontSize: 18 * k, ...nameFont, ...shadow }}>{church?.name ?? 'La Mies'}</T>
            <T style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12.5 * k, fontWeight: '600', marginTop: 2 * k, ...shadow }}>App La Mies · RV1960</T>
          </View>
        </View>
      </View>
    </View>
  );
}
