// Cancionero: dividir la letra en partes y buscar sin importar tildes. Sin pantalla ni base.

/** "Canción del Señor" -> "cancion del senor". */
export const searchKey = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export type LyricBlock = { label: string | null; chorus: boolean; lines: string[] };

/** La letra en estrofas: se separan con una línea vacía; "[Coro]" o "Coro:" arriba de una parte le da título. */
export function lyricBlocks(text: string): LyricBlock[] {
  const out: LyricBlock[] = [];
  for (const chunk of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    const m = lines[0].trim().match(/^\[(.+)\]$|^((?:coro|estribillo|estrofa|verso|puente|final|intro)[^:]*):\s*$/i);
    const label = m ? (m[1] ?? m[2]).trim() : null;
    const body = m ? lines.slice(1) : lines;
    if (!body.length && !label) continue;
    out.push({ label, chorus: !!label && /coro|estribillo/i.test(label), lines: body });
  }
  return out;
}
