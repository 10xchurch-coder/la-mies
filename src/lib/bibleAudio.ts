// La Biblia narrada (grabaciones con varias voces). Se van sumando de a capítulos.
// La lista de lo que ya está grabado se baja una vez; si un capítulo no está, la app lo lee con la voz del teléfono.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const BASE = 'https://raw.githubusercontent.com/10xchurch-coder/la-mies/audio-rvg/';
let index: Record<string, Set<string>> | null = null;
let asking: Promise<void> | null = null;
let askedAt = 0;

/** Trae la lista de capítulos narrados (como mucho, una vez cada media hora). Sin internet, queda vacía. */
export function loadNarrated(): Promise<void> {
  if (index && Date.now() - askedAt < 30 * 60 * 1000) return Promise.resolve();
  asking ??= fetch(`${BASE}index.json`).then((r) => (r.ok ? r.json() : {})).then((j: Record<string, string[]>) => {
    index = Object.fromEntries(Object.entries(j ?? {}).map(([k, v]) => [k, new Set(Array.isArray(v) ? v : [])]));
    askedAt = Date.now();
  }).catch(() => { index ??= {}; }).finally(() => { asking = null; });
  return asking;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** La dirección de la grabación de ese capítulo, o null si todavía no está grabado en esa versión. */
export function narratedUrl(version: string, book: number, chapter: number): string | null {
  return index?.[version]?.has(`${pad(book)}-${pad(chapter)}`) ? `${BASE}${pad(book)}/${pad(chapter)}.mp3` : null;
}

let player: AudioPlayer | null = null;
/** Para la grabación que esté sonando. */
export function stopNarration(): void {
  try { player?.pause(); player?.remove(); } catch { /* ya estaba cerrado */ }
  player = null;
}
/** Hace sonar una grabación. onEnd avisa cuando termina sola (o si no se pudo). */
export function playNarration(url: string, onEnd: () => void): void {
  stopNarration();
  try {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => undefined);
    const p = createAudioPlayer({ uri: url });
    player = p;
    p.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish && player === p) { stopNarration(); onEnd(); } });
    p.play();
  } catch { stopNarration(); onEnd(); }
}
