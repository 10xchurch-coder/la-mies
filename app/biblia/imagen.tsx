// Armar una imagen con un versículo: se elige una foto (o una propia), la letra, el tamaño, la forma,
// letra blanca o negra, cuánto se ve la foto, el desenfoque y el brillo. Después se comparte o se guarda.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PixelRatio, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Header } from '@/components/Screen';
import { Button } from '@/components/ui';
import { bookName, chapterText, cleanPlace, verseSpan, versionOf } from '@/lib/bible';
import { ALL_PHOTOS, photoUrl } from '@/lib/backgrounds';
import { loadBibleFont } from '@/lib/bibleFonts';
import { BIBLE_FONTS, fontOf, type BibleFontId } from '@/lib/bibleLook';
import { ART_SHAPES, DEFAULT_ART, artFontSize, blurRadius, brightLayer, photoOpacity, readLayer, shapeOf, step, type ArtLook } from '@/lib/verseArt';
import { colors } from '@/theme';

const ART_FONTS = BIBLE_FONTS.filter((f) => f.id !== 'sistema');

type Props = { W: number; look: ArtLook; photo: string; own: string | null; text: string; refText: string; fontId: BibleFontId; fontOk: boolean };

/** La imagen dibujada con un ancho dado (todo se agranda parejo desde 360). */
function Art({ W, look, photo, own, text, refText, fontId, fontOk }: Props) {
  const shape = shapeOf(look.shape);
  const H = (W * shape.h) / shape.w;
  const k = W / 360;
  const f = fontOf(fontId);
  const size = artFontSize(text.length, look) * (shape.id === '9x16' ? 1.08 : 1) * f.scale;
  const ink = look.white ? '#FFFFFF' : '#141414';
  const bright = brightLayer(look);
  const read = readLayer(look);
  const reg = fontOk && f.regular ? { fontFamily: f.regular } : null;
  const bold = fontOk && f.bold ? { fontFamily: f.bold } : { fontWeight: '800' as const };
  return (
    <View style={{ width: W, height: H, overflow: 'hidden', backgroundColor: look.white ? '#000000' : '#FFFFFF' }}>
      <Image source={{ uri: own ?? photoUrl(photo, shape.w, shape.h, 85) }} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: photoOpacity(look) }} contentFit="cover" blurRadius={blurRadius(look) * (Platform.OS === 'web' ? k : 1)} cachePolicy="memory-disk" />
      {bright.alpha ? <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: bright.color, opacity: bright.alpha }} /> : null}
      <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: read.color, opacity: read.alpha }} />
      <View style={{ flex: 1, paddingHorizontal: 30 * k, paddingVertical: 34 * k, justifyContent: 'center', gap: 14 * k }}>
        <Text allowFontScaling={false} style={[{ color: ink, fontSize: size * k, lineHeight: size * 1.42 * k, textAlign: 'center' }, reg]}>{text}</Text>
        <Text allowFontScaling={false} style={[{ color: ink, fontSize: Math.max(11, size * 0.6) * k, textAlign: 'center' }, bold]}>{refText}</Text>
      </View>
    </View>
  );
}

/** En la computadora la imagen se dibuja aparte, en alta definición, y se descarga. */
async function renderWeb(p: Omit<Props, 'W' | 'fontOk'>): Promise<Blob> {
  const shape = shapeOf(p.look.shape);
  const K = shape.w / 360;
  const canvas = document.createElement('canvas');
  canvas.width = shape.w; canvas.height = shape.h;
  const ctx = canvas.getContext('2d')!;
  const f = fontOf(p.fontId);
  await loadBibleFont(p.fontId);
  const fam = (b: boolean) => `"${(b ? f.bold : f.regular) ?? 'system-ui'}", Georgia, serif`;
  ctx.fillStyle = p.look.white ? '#000' : '#FFF';
  ctx.fillRect(0, 0, shape.w, shape.h);
  const img = await new Promise<HTMLImageElement | null>((res) => {
    const im = new window.Image(); im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = p.own ?? photoUrl(p.photo, shape.w, shape.h, 90);
  });
  if (img) {
    const s = Math.max(shape.w / img.width, shape.h / img.height) * (blurRadius(p.look) ? 1.06 : 1);
    ctx.save();
    ctx.globalAlpha = photoOpacity(p.look);
    if (blurRadius(p.look)) ctx.filter = `blur(${blurRadius(p.look) * K}px)`;
    ctx.drawImage(img, (shape.w - img.width * s) / 2, (shape.h - img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
  }
  for (const layer of [brightLayer(p.look), readLayer(p.look)]) {
    if (!layer.alpha) continue;
    ctx.globalAlpha = layer.alpha; ctx.fillStyle = layer.color; ctx.fillRect(0, 0, shape.w, shape.h); ctx.globalAlpha = 1;
  }
  const size = artFontSize(p.text.length, p.look) * (shape.id === '9x16' ? 1.08 : 1) * f.scale * K;
  const maxW = shape.w - 60 * K;
  ctx.fillStyle = p.look.white ? '#FFFFFF' : '#141414';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${size}px ${fam(false)}`;
  const lines: string[] = [];
  let line = '';
  for (const w of p.text.split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  const lh = size * 1.42;
  const refSize = Math.max(11 * K, size * 0.6);
  let y = (shape.h - (lines.length * lh + 14 * K + refSize)) / 2 + size;
  for (const l of lines) { ctx.fillText(l, shape.w / 2, y); y += lh; }
  ctx.font = `700 ${refSize}px ${fam(true)}`;
  ctx.fillText(p.refText, shape.w / 2, y + 14 * K - (lh - size) + refSize * 0.4);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar la imagen'))), 'image/jpeg', 0.95));
}

export default function ImagenVersiculo() {
  const params = useLocalSearchParams<{ libro?: string; cap?: string; vs?: string; v?: string }>();
  const { width } = useWindowDimensions();
  const place = cleanPlace(params.libro, params.cap) ?? { book: 42, chapter: 3 };
  const version = versionOf(params.v);
  const all = useMemo(() => chapterText(version, place.book, place.chapter), [version, place.book, place.chapter]);
  const nums = useMemo(() => (params.vs ?? '').split(',').map(Number).filter((n) => n >= 1 && n <= all.length).sort((a, b) => a - b), [params.vs, all.length]);
  const text = nums.map((n) => all[n - 1]).join(' ');
  const refText = `${bookName(place.book)} ${place.chapter}:${verseSpan(nums)} · ${version.short}`;

  const [look, setLook] = useState<ArtLook>(DEFAULT_ART);
  const [photo, setPhoto] = useState(ALL_PHOTOS[0]);
  const [own, setOwn] = useState<string | null>(null);
  const [fontId, setFontId] = useState<BibleFontId>('lora');
  const [fontOk, setFontOk] = useState(false);
  const [busy, setBusy] = useState<null | 'share' | 'save'>(null);
  const shotRef = useRef<React.ComponentRef<typeof View>>(null);

  useEffect(() => {
    let alive = true;
    setFontOk(false);
    loadBibleFont(fontId).then((ok) => { if (alive) setFontOk(ok); });
    return () => { alive = false; };
  }, [fontId]);

  const shape = shapeOf(look.shape);
  const previewW = Math.min(width - 32, 420, shape.id === '9x16' ? 250 : shape.id === '3x4' ? 320 : 420);
  const set = (patch: Partial<ArtLook>) => setLook((l) => ({ ...l, ...patch }));
  const props = { look, photo, own, text, refText, fontId };

  const pickOwn = async () => {
    try {
      const Picker = await import('expo-image-picker');
      const r = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!r.canceled && r.assets[0]) setOwn(r.assets[0].uri);
    } catch {
      Alert.alert('No se pudo abrir tus fotos', 'Probá de nuevo.');
    }
  };

  /** Arma la imagen en alta definición. En el teléfono devuelve el archivo; en la computadora la descarga o comparte. */
  const make = async (how: 'share' | 'save') => {
    if (!text || busy) return;
    setBusy(how);
    try {
      const name = `${bookName(place.book)}-${place.chapter}-${nums[0] ?? 1}.jpg`.replace(/\s+/g, '-').toLowerCase();
      if (Platform.OS === 'web') {
        const blob = await renderWeb(props);
        const { shareCardBlob } = await import('@/lib/shareCardWeb');
        if (how === 'share') await shareCardBlob(blob, refText, name);
        else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = name; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        return;
      }
      const { captureRef } = await import('react-native-view-shot');
      const uri = await captureRef(shotRef as unknown as number, { format: 'jpg', quality: 0.95, result: 'tmpfile' });
      // En el teléfono, "Guardar" abre el menú de compartir: ahí está "Guardar imagen". Así la app no pide permiso para ver tus fotos.
      const Sharing = await import('expo-sharing');
      await Sharing.shareAsync(uri.startsWith('file://') ? uri : `file://${uri}`, { mimeType: 'image/jpeg', dialogTitle: refText, UTI: 'public.jpeg' });
    } catch {
      Alert.alert('No se pudo armar la imagen', 'Probá de nuevo. Si elegiste una foto tuya, probá con otra.');
    } finally {
      setBusy(null);
    }
  };

  const title = (t: string) => <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{t}</Text>;
  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? colors.blueSoft : colors.bg }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: on ? colors.blueText : colors.text }}>{label}</Text>
    </Pressable>
  );
  /** Un control de menos y más, con puntitos que muestran dónde está. */
  const stepper = (label: string, value: number, max: number, onChange: (v: number) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }}>{label}</Text>
      <Pressable onPress={() => onChange(step(value, -1, max))} disabled={value <= 0} accessibilityRole="button" accessibilityLabel={`Menos ${label.toLowerCase()}`}
        style={{ width: 44, height: 40, borderRadius: 10, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center', opacity: value <= 0 ? 0.4 : 1 }}>
        <Feather name="minus" size={18} color={colors.text} />
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 4, width: 16 * (max + 1), justifyContent: 'center' }}>
        {Array.from({ length: max + 1 }, (_, i) => <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i <= value ? colors.blue : colors.border }} />)}
      </View>
      <Pressable onPress={() => onChange(step(value, 1, max))} disabled={value >= max} accessibilityRole="button" accessibilityLabel={`Más ${label.toLowerCase()}`}
        style={{ width: 44, height: 40, borderRadius: 10, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center', opacity: value >= max ? 0.4 : 1 }}>
        <Feather name="plus" size={18} color={colors.text} />
      </Pressable>
    </View>
  );

  const dpr = PixelRatio.get();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Imagen del versículo" subtitle={refText} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
        {!text ? <Text style={{ color: colors.muted }}>Volvé a la Biblia y tocá uno o más versículos.</Text> : (
          <>
            <View style={{ alignItems: 'center' }}>
              <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                <Art W={previewW} fontOk={fontOk} {...props} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title={busy === 'share' ? 'Armando…' : 'Compartir'} icon="share-2" style={{ flex: 1 }} disabled={!!busy} onPress={() => make('share')} />
              <Button title={busy === 'save' ? 'Guardando…' : Platform.OS === 'web' ? 'Descargar' : 'Guardar'} icon="download" variant="outline" style={{ flex: 1 }} disabled={!!busy} onPress={() => make('save')} />
            </View>

            <View style={{ gap: 8 }}>
              {title('FOTO DE FONDO')}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Pressable onPress={pickOwn} accessibilityRole="button" accessibilityLabel="Usar una foto mía"
                  style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderColor: own ? colors.blue : colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <Feather name="image" size={20} color={colors.blueText} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.blueText }}>Mi foto</Text>
                </Pressable>
                {ALL_PHOTOS.map((id) => {
                  const on = !own && photo === id;
                  return (
                    <Pressable key={id} onPress={() => { setOwn(null); setPhoto(id); }} accessibilityRole="button" accessibilityLabel="Elegir esta foto" accessibilityState={{ selected: on }}
                      style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', borderWidth: on ? 3 : 0, borderColor: colors.blue }}>
                      <Image source={{ uri: photoUrl(id, 200, 200, 60) }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={{ gap: 8 }}>
              {title('FORMA')}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{ART_SHAPES.map((s) => chip(s.label, look.shape === s.id, () => set({ shape: s.id })))}</View>
            </View>
            <View style={{ gap: 8 }}>
              {title('LETRA')}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{ART_FONTS.map((f) => chip(f.label, fontId === f.id, () => setFontId(f.id)))}</View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {chip('Letra blanca', look.white, () => set({ white: true }))}
                {chip('Letra negra', !look.white, () => set({ white: false }))}
              </View>
            </View>
            <View style={{ gap: 10 }}>
              {title('AJUSTES')}
              {stepper('Tamaño de la letra', look.size, 6, (v) => set({ size: v }))}
              {stepper('Cuánto se ve la foto', look.opacity, 4, (v) => set({ opacity: v }))}
              {stepper('Desenfoque', look.blur, 4, (v) => set({ blur: v }))}
              {stepper('Brillo', look.bright, 4, (v) => set({ bright: v }))}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Fotos de Unsplash, de uso libre.</Text>
          </>
        )}
      </ScrollView>
      {/* La imagen en alta definición, fuera de la pantalla, lista para capturar en el teléfono. */}
      {Platform.OS !== 'web' && text ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
          <View ref={shotRef} collapsable={false}>
            <Art W={shape.w / dpr} fontOk={fontOk} {...props} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
