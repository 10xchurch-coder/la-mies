// En la web (el iPhone usa esta versión) no se puede "sacar una foto" de la pantalla como en el teléfono, así que la tarjeta
// del versículo se dibuja acá directo, con el mismo fondo, el mismo estilo de letra y el mismo orden que en la app:
// "Versículo del día" y la cita arriba, el versículo grande al medio y abajo el logo de la iglesia con su nombre y "App La Mies".
import { BACKGROUNDS } from './backgroundColors';
import { chosenPhotoId, dailyPhotoId, photoUrl } from './backgrounds';

export type CardKind = 'verse' | 'phrase';
export type CardInput = {
  kind: CardKind;
  reference: string;
  verse: string;
  message: string | null;
  background: string | null;
  onDate: string;
  churchName: string;
  logoUrl: string | null;
  /** Foto subida por la iglesia (ya con permiso para bajarla). */
  uploadedUrl?: string | null;
};

// Se diseña en 360 × 640 y se dibuja a 4× (1440 × 2560): WhatsApp achica y comprime lo que se sube a los estados,
// así que conviene darle una imagen más grande que la pantalla para que el texto llegue nítido.
const W = 1440, H = 2560, K = 4;
const FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Parte un texto en renglones que entren en el ancho dado. */
export function wrapLines(measure: (t: string) => number, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && measure(test) > maxWidth) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** Cuánto achicar la letra del versículo según su largo (igual que en la app). */
export function verseSize(len: number): { size: number; line: number } {
  if (len > 380) return { size: 18, line: 26 };
  if (len > 220) return { size: 21, line: 30 };
  return { size: 25, line: 35 };
}

export async function renderCardPng(input: CardInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(K, K);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const w = W / K, h = H / K;

  // Fondo: color elegido, foto subida o la foto del día.
  const bg = input.background && BACKGROUNDS[input.background];
  ctx.fillStyle = '#1F3B2C';
  ctx.fillRect(0, 0, w, h);
  if (bg) {
    const g = ctx.createLinearGradient(w * 0.1, 0, w * 0.9, h);
    g.addColorStop(0, bg.colors[0]); g.addColorStop(0.5, bg.colors[1]); g.addColorStop(1, bg.colors[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } else {
    const chosen = chosenPhotoId(input.background);
    const src = input.uploadedUrl ?? photoUrl(chosen ?? dailyPhotoId(input.onDate), W, H, 90);
    const img = await loadImage(src);
    if (img) {
      const s = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    }
  }
  // Oscurecer un poco para que el texto blanco se lea sobre cualquier foto.
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,0.38)'); shade.addColorStop(0.5, 'rgba(0,0,0,0.22)'); shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);

  const PAD = 28;
  const maxW = w - PAD * 2;
  const shadow = (blur: number, a: number) => { ctx.shadowColor = `rgba(0,0,0,${a})`; ctx.shadowBlur = blur; ctx.shadowOffsetY = 1; };
  const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Arriba: etiqueta chiquita (con letras separadas) y la cita.
  let y = 96;
  ctx.font = `800 11px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  let x = PAD;
  for (const ch of (input.kind === 'phrase' ? 'PARA PENSAR HOY' : 'VERSÍCULO DEL DÍA')) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + 1.2; }
  y += 26;
  ctx.font = `800 ${input.kind === 'phrase' ? 15 : 22}px ${FONT}`;
  ctx.fillStyle = input.kind === 'phrase' ? 'rgba(255,255,255,0.95)' : '#FFFFFF';
  const refText = input.reference; // "RV1960" va abajo, al lado de "App La Mies"
  const refY = y;

  // Al medio: el versículo (o la frase), centrado en el espacio que queda.
  const footTop = h - 92;
  const body = input.kind === 'phrase' ? (input.message ?? '') : input.verse;
  const sz = input.kind === 'phrase' ? { size: 30, line: 40 } : verseSize(input.verse.length);
  ctx.font = `${input.kind === 'phrase' ? 800 : 700} ${sz.size}px ${FONT}`;
  const lines = wrapLines((t) => ctx.measureText(t).width, body, maxW);
  const textH = lines.length * sz.line;
  const midTop = refY + (input.kind === 'phrase' ? 0 : 22);
  const areaH = footTop - 24 - midTop;
  let ty = midTop + Math.max(0, (areaH - textH - (input.kind === 'phrase' ? 40 : 0)) / 2);
  if (input.kind === 'phrase') {
    // La frase va arriba de la cita, como en la app.
    ctx.fillStyle = '#FFFFFF'; shadow(3, 0.55);
    for (const l of lines) { ty += sz.line; ctx.fillText(l, PAD, ty - 10); }
    noShadow();
    ctx.font = `700 15px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(refText, PAD, ty + 26);
  } else {
    ctx.font = `800 22px ${FONT}`; ctx.fillStyle = '#FFFFFF'; shadow(3, 0.55);
    ctx.fillText(refText, PAD, refY);
    ctx.font = `700 ${sz.size}px ${FONT}`; shadow(3, 0.6);
    for (const l of lines) { ty += sz.line; ctx.fillText(l, PAD, ty - 10); }
    noShadow();
  }

  // Abajo: el logo de la iglesia con su nombre al lado y, debajo y más chico, "App La Mies".
  const logo = input.logoUrl ? await loadImage(input.logoUrl) : null;
  const LH = 44, GAP = 12; // alto del logo y espacio hasta el nombre
  const LW = logo ? Math.min(LH, (logo.width / logo.height) * LH) : 0;
  ctx.font = `800 18px ${FONT}`;
  const nameMax = maxW - (logo ? LW + GAP : 0);
  const nameW = Math.min(ctx.measureText(input.churchName).width, nameMax);
  const rowW = (logo ? LW + GAP : 0) + nameW;
  const x0 = (w - rowW) / 2;
  const rowY = h - 70;
  if (logo) {
    // El logo va solo, sin círculo. Un resplandor claro muy suave lo despega de los fondos oscuros.
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 0;
    const lh = (logo.height / logo.width) * LW;
    ctx.drawImage(logo, x0, rowY - lh / 2, LW, lh);
    ctx.restore();
  }
  const nameX = x0 + (logo ? LW + GAP : 0);
  ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF'; shadow(3, 0.6);
  ctx.fillText(input.churchName, nameX, rowY - 1, nameMax);
  ctx.font = `600 12.5px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('App La Mies · RV1960', nameX, rowY + 16);
  noShadow();

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar la imagen'))), 'image/jpeg', 0.95));
}

/** Comparte la imagen con el menú del navegador (WhatsApp, Instagram…) o, si no se puede, la baja. */
export async function shareCardBlob(blob: Blob, caption: string, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = globalThis.navigator as Navigator & { canShare?: (d: unknown) => boolean };
  const name = blob.type === 'image/jpeg' ? fileName.replace(/\.png$/i, '.jpg') : fileName;
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  if (nav?.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], text: caption });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
