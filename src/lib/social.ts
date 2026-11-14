// Las redes de la iglesia (y su podcast) para mostrarlas en la app. Cada iglesia carga las suyas.
// No importa nada de la app para poder probarse sola.

export type ChurchSocial = Partial<Record<'whatsapp' | 'instagram' | 'facebook' | 'youtube' | 'podcast' | 'threads' | 'x' | 'tiktok' | 'podcast_name', string | null>>;
export type SocialLink = { key: string; label: string; icon: string; url: string };

const ORDER: { key: Exclude<keyof ChurchSocial, 'podcast_name'>; label: string; icon: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' },
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook' },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
  { key: 'podcast', label: 'Podcast', icon: 'mic-outline' },
  { key: 'threads', label: 'Threads', icon: 'at-outline' },
  { key: 'x', label: 'X', icon: 'logo-twitter' },
  { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
];

const url = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

/** Los enlaces que la iglesia tiene cargados, en orden, más el sitio web al final. */
export function socialLinks(social: ChurchSocial | null | undefined, website?: string | null): SocialLink[] {
  const out: SocialLink[] = [];
  for (const o of ORDER) {
    const v = (social?.[o.key] ?? '').trim();
    // El podcast se muestra con su nombre propio si la iglesia lo cargó.
    if (v) out.push({ key: o.key, label: o.key === 'podcast' ? (social?.podcast_name ?? '').trim() || o.label : o.label, icon: o.icon, url: url(v) });
  }
  const w = (website ?? '').trim();
  if (w) out.push({ key: 'web', label: 'Sitio web', icon: 'globe-outline', url: url(w) });
  return out;
}
