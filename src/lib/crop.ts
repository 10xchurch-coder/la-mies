// Cuentas del recortador de fotos (sin React, para poder probarlas).
export type Crop = { originX: number; originY: number; width: number; height: number };
export type Off = { x: number; y: number };

/** La foto siempre tapa todo el cuadro: no se puede correr tanto que quede un hueco. */
export function clampOffset(o: Off, dw: number, dh: number, fw: number, fh: number = fw): Off {
  const cl = (v: number, d: number, f: number) => (d <= f ? (f - d) / 2 : Math.min(0, Math.max(f - d, v)));
  return { x: cl(o.x, dw, fw), y: cl(o.y, dh, fh) };
}

/** Al acercar o alejar, el punto (cx, cy) del cuadro queda en el mismo lugar. */
export function zoomAround(o: Off, s1: number, s2: number, cx: number, cy: number): Off {
  return { x: cx - ((cx - o.x) / s1) * s2, y: cy - ((cy - o.y) / s1) * s2 };
}

/** Qué parte de la foto original se ve dentro del cuadro, en píxeles enteros. */
export function cropRect(o: Off, scale: number, fw: number, w: number, h: number, fh: number = fw): Crop {
  const cw = Math.max(1, Math.min(Math.round(fw / scale), w));
  const ch = Math.max(1, Math.min(Math.round(fh / scale), h));
  const x = Math.max(0, Math.min(w - cw, Math.round(-o.x / scale)));
  const y = Math.max(0, Math.min(h - ch, Math.round(-o.y / scale)));
  return { originX: x, originY: y, width: cw, height: ch };
}
