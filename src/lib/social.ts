// Las redes de la iglesia (y su podcast) para mostrarlas en la app. Cada iglesia carga las suyas.
// No importa nada de la app para poder probarse sola.

import { tx } from './i18n';
export type ChurchSocial = Partial<Record<'whatsapp' | 'instagram' | 'facebook' | 'youtube' | 'podcast' | 'threads' | 'x' | 'tiktok' | 'podcast_name', string | null>>;
export type SocialLink = { key: string; label: string; icon: string; url: string; color: string | null };

// color: el de cada marca. null = el color del texto (X, Threads y TikTok son negros: así se ven también en modo oscuro).
const ORDER: { key: Exclude<keyof ChurchSocial, 'podcast_name'>; label: string; icon: string; color: string | null }[] = [
  { key: 'whatsapp', get label() { return tx('WhatsApp'); }, icon: 'logo-whatsapp', color: '#25D366' },
  { key: 'instagram', get label() { return tx('Instagram'); }, icon: 'logo-instagram', color: '#E1306C' },
  { key: 'facebook', get label() { return tx('Facebook'); }, icon: 'logo-facebook', color: '#1877F2' },
  { key: 'youtube', get label() { return tx('YouTube'); }, icon: 'logo-youtube', color: '#FF0000' },
  { key: 'podcast', get label() { return tx('Podcast'); }, icon: 'mic-outline', color: '#9933CC' },
  { key: 'threads', get label() { return tx('Threads'); }, icon: 'at-outline', color: null },
  { key: 'x', label: 'X', icon: 'logo-twitter', color: null },
  { key: 'tiktok', get label() { return tx('TikTok'); }, icon: 'logo-tiktok', color: null },
];

const url = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

/** Los enlaces que la iglesia tiene cargados, en orden, más el sitio web al final. */
export function socialLinks(social: ChurchSocial | null | undefined, website?: string | null): SocialLink[] {
  const out: SocialLink[] = [];
  for (const o of ORDER) {
    const v = (social?.[o.key] ?? '').trim();
    // El podcast se muestra con su nombre propio si la iglesia lo cargó.
    if (v) out.push({ key: o.key, label: o.key === 'podcast' ? (social?.podcast_name ?? '').trim() || o.label : o.label, icon: o.icon, url: url(v), color: o.color });
  }
  const w = (website ?? '').trim();
  if (w) out.push({ key: 'web', label: tx('Sitio web'), icon: 'globe-outline', url: url(w), color: null });
  return out;
}
