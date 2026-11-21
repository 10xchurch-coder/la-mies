// Enlaces de la iglesia: música (Spotify, YouTube Music) y radio. Lógica sola, sin pantalla ni base, para poder probarla.

export type LinkKind = 'spotify' | 'youtube_music' | 'music_other' | 'radio_fm' | 'radio_stream' | 'radio_other';

export const MUSIC_KINDS: LinkKind[] = ['spotify', 'youtube_music', 'music_other'];
export const RADIO_KINDS: LinkKind[] = ['radio_fm', 'radio_stream', 'radio_other'];

export const KIND_LABEL: Record<LinkKind, string> = {
  spotify: 'Spotify',
  youtube_music: 'YouTube Music',
  music_other: 'Otra lista',
  radio_fm: 'Radio FM',
  radio_stream: 'Radio por internet (para escuchar en la app)',
  radio_other: 'Otro enlace de la radio',
};

/** Deja una dirección lista para abrir: agrega https:// si falta y rechaza lo que no es una página web. */
export function cleanUrl(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (!/^https?:\/\//i.test(withScheme)) return null;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Si el enlace es de Spotify o de YouTube Music, de qué tipo es (para sugerir la opción correcta). */
export function kindFromUrl(url: string): LinkKind | null {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com') || host === 'spotify.link') return 'spotify';
  if (host === 'music.youtube.com') return 'youtube_music';
  return null;
}

export const isMusic = (k: string): boolean => (MUSIC_KINDS as string[]).includes(k);
export const isRadio = (k: string): boolean => (RADIO_KINDS as string[]).includes(k);

/** Ordena: primero Spotify, YouTube Music y el resto; dentro de cada uno, por la posición que se eligió. */
export function sortLinks<T extends { kind: string; position: number; title: string }>(rows: T[]): T[] {
  const rank = (k: string) => { const i = ([...MUSIC_KINDS, ...RADIO_KINDS] as string[]).indexOf(k); return i < 0 ? 99 : i; };
  return [...rows].sort((a, b) => rank(a.kind) - rank(b.kind) || a.position - b.position || a.title.localeCompare(b.title));
}
