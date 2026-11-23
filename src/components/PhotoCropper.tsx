// Antes de subir una foto: acercar, alejar y mover para elegir qué parte queda.
// Funciona igual en el teléfono (arrastrar y pellizcar), en la computadora (arrastrar y la ruedita)
// y con los botones − / +. Devuelve el recorte en píxeles de la foto original.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '@/theme';
import { clampOffset, cropRect, zoomAround, type Crop } from '@/lib/crop';

type Req = { uri: string; width: number; height: number; round: boolean; aspect: number; resolve: (c: Crop | null) => void };
let open: ((r: Req) => void) | null = null;

/** Abre el recortador. Si la pantalla no está lista, devuelve la foto entera centrada en cuadrado. */
export function cropPhoto(uri: string, width: number, height: number, round = true, aspect = 1): Promise<Crop | null> {
  return new Promise((resolve) => {
    if (!open || !width || !height) {
      const cw = Math.min(width, height * aspect), ch = cw / aspect;
      resolve({ originX: Math.round((width - cw) / 2), originY: Math.round((height - ch) / 2), width: Math.round(cw), height: Math.round(ch) });
      return;
    }
    open({ uri, width, height, round: round && aspect === 1, aspect, resolve });
  });
}

const MAX_ZOOM = 6;

export function PhotoCropperHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => {
    open = (r) => setReq(r);
    return () => { open = null; };
  }, []);
  if (!req) return null;
  return <Cropper key={req.uri} req={req} onDone={(c) => { req.resolve(c); setReq(null); }} />;
}

function Cropper({ req, onDone }: { req: Req; onDone: (c: Crop | null) => void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const F = Math.round(Math.min(sw - 40, (sh - 260) * req.aspect, req.aspect >= 1 ? 480 : 420));
  const FH = Math.round(F / req.aspect);
  const base = Math.max(F / req.width, FH / req.height);
  const [z, setZ] = useState(1);
  const [off, setOff] = useState(() => ({ x: (F - req.width * base) / 2, y: (FH - req.height * base) / 2 }));
  const st = useRef({ z: 1, off, start: off, startZ: 1, dist: 0 });
  st.current.z = z; st.current.off = off;

  const apply = (nz: number, cx: number, cy: number) => {
    const zz = Math.min(MAX_ZOOM, Math.max(1, nz));
    const o = zoomAround(st.current.off, base * st.current.z, base * zz, cx, cy);
    setZ(zz);
    setOff(clampOffset(o, req.width * base * zz, req.height * base * zz, F, FH));
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { st.current.start = st.current.off; st.current.startZ = st.current.z; st.current.dist = 0; },
    onPanResponderMove: (e, g) => {
      const t = e.nativeEvent.touches;
      if (t && t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!st.current.dist) { st.current.dist = d; st.current.startZ = st.current.z; return; }
        apply(st.current.startZ * (d / st.current.dist), F / 2, FH / 2);
        st.current.start = st.current.off;
        return;
      }
      if (st.current.dist) return; // se levantó un dedo del pellizco: esperar al próximo gesto
      const s = base * st.current.z;
      setOff(clampOffset({ x: st.current.start.x + g.dx, y: st.current.start.y + g.dy }, req.width * s, req.height * s, F, FH));
    },
    onPanResponderRelease: () => { st.current.dist = 0; },
    onPanResponderTerminate: () => { st.current.dist = 0; },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [F, FH, base]);

  // Computadora: la ruedita del mouse (o dos dedos en el trackpad) acerca y aleja.
  const frame = useRef<unknown>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = frame.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      apply(st.current.z * Math.exp(-ev.deltaY / 400), ev.clientX - r.left, ev.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [F, FH, base]);

  const s = base * z;
  const btn = (label: string, onPress: () => void, primary = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ flex: label.length > 2 ? 2 : 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
        backgroundColor: primary ? colors.green : 'rgba(255,255,255,0.14)' }}>
      <Text style={{ color: '#fff', fontSize: label.length > 2 ? 16 : 22, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onDone(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Acomodá la foto</Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center' }}>
          {Platform.OS === 'web' ? 'Arrastrala para moverla. Con la ruedita o los botones la acercás y alejás.' : 'Arrastrala con el dedo para moverla. Pellizcá o usá los botones para acercar y alejar.'}
        </Text>
        <View ref={frame as never} {...pan.panHandlers}
          style={{ width: F, height: FH, overflow: 'hidden', borderRadius: req.round ? F / 2 : 16, backgroundColor: '#222',
            borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', ...(Platform.OS === 'web' ? { cursor: 'grab', touchAction: 'none' } as object : {}) }}>
          <Image source={{ uri: req.uri }} {...({ draggable: false } as object)}
            style={{ position: 'absolute', left: off.x, top: off.y, width: req.width * s, height: req.height * s }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, width: F }}>
          {btn('−', () => apply(z / 1.25, F / 2, FH / 2))}
          {btn('+', () => apply(z * 1.25, F / 2, FH / 2))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, width: F }}>
          {btn('Cancelar', () => onDone(null))}
          {btn('Usar esta foto', () => onDone(cropRect(off, s, F, req.width, req.height, FH)), true)}
        </View>
      </View>
    </Modal>
  );
}
