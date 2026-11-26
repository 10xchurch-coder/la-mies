// Grupos pequeños: la guía para repasar la prédica, y qué día se reúne cada grupo.
// Solo lógica: sin pantalla ni base, para poder probarse sola.
import { findRefs, refLabel } from './sermonOutline';
import { tx } from './i18n';

/** Un pedazo de la guía: un título ("# Para empezar") o un renglón. */
export type GuidePart = { kind: 'title'; text: string } | { kind: 'item'; text: string } | { kind: 'text'; text: string };

/** La guía escrita a mano → títulos, preguntas y texto suelto. "# " es título; "- " o "1." es una pregunta. */
export function parseGuide(text: string | null | undefined): GuidePart[] {
  const out: GuidePart[] = [];
  for (const raw of (text ?? '').split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#')) out.push({ kind: 'title', text: l.replace(/^#+\s*/, '') });
    else if (/^([-•*]|\d+[.)])\s+/.test(l)) out.push({ kind: 'item', text: l.replace(/^([-•*]|\d+[.)])\s+/, '') });
    else out.push({ kind: 'text', text: l });
  }
  return out;
}

/** Cuántas preguntas tiene la guía. */
export const guideQuestions = (text: string | null | undefined): number => parseGuide(text).filter((p) => p.kind === 'item').length;

const clean = (s: string) => s.replace(/_{2,}/g, '…').replace(/\s+/g, ' ').replace(/[:.\s]+$/, '').trim();

/**
 * Un borrador de guía armado con la prédica: el pasaje, los puntos del bosquejo y preguntas sencillas.
 * El pastor lo cambia como quiera antes de guardarlo.
 */
export function draftGuide(s: { title: string; passage?: string | null; notes_outline?: string | null }): string {
  const points: string[] = [];
  const refs: string[] = [];
  const title = clean(s.title).toLowerCase();
  for (const raw of (s.notes_outline ?? '').split('\n')) {
    if (!raw.trim() || /^\s+[-•*]/.test(raw) || /^\s*[-•*]\s/.test(raw)) continue; // los sub-puntos no
    const found = findRefs(raw.replace(/^\s*\d+[.)]\s*/, ''));
    for (const r of found.refs) refs.push(refLabel(r));
    const text = clean(found.rest.replace(/\(\s*(v{1,2}\.?|vers[íi]culos?)\s*[\d\s,:-]*\)/gi, '').replace(/\(\s*\)/g, ''));
    if (text && text.toLowerCase() !== title) points.push(text);
  }
  const read = [s.passage?.trim(), ...refs].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).slice(0, 4);
  const lines: string[] = [];
  lines.push(`# ${tx('Para empezar')}`);
  lines.push(`- ${tx('¿Qué fue lo que más te quedó del mensaje "{title}"?', { title: s.title.trim() })}`);
  if (read.length) {
    lines.push('', `# ${tx('Leamos juntos')}`);
    read.forEach((r) => lines.push(`- ${r}`));
  }
  lines.push('', `# ${tx('Repasemos')}`);
  if (points.length) points.slice(0, 5).forEach((p) => lines.push(`- ${tx('{point}: ¿qué nos enseña esto?', { point: p })}`));
  else lines.push(`- ${tx('¿Cuál fue la idea principal del mensaje?')}`, `- ${tx('¿Qué versículo te ayudó más? ¿Por qué?')}`);
  lines.push('', `# ${tx('Para esta semana')}`);
  lines.push(`- ${tx('¿Qué vas a hacer distinto esta semana con lo que aprendiste?')}`);
  lines.push(`- ${tx('¿A quién le podés contar lo que aprendiste?')}`);
  lines.push('', `# ${tx('Oremos')}`);
  lines.push(`- ${tx('Por los pedidos del grupo y para vivir lo que aprendimos.')}`);
  return lines.join('\n');
}

/** La guía como texto para mandar por WhatsApp (títulos en negrita, preguntas con viñeta). */
export function guideShareText(title: string, guide: string | null | undefined): string {
  const body = parseGuide(guide).map((p) => (p.kind === 'title' ? `\n*${p.text}*` : p.kind === 'item' ? `• ${p.text}` : p.text)).join('\n').trim();
  return `*${title.trim()}*\n${body}`;
}

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** La próxima reunión (hoy cuenta) según los días del grupo. Sin días → hoy. */
export function nextMeeting(days: readonly string[] | null | undefined, from: Date = new Date()): Date {
  const set = new Set((days ?? []).map((d) => DOW[d]).filter((n) => n !== undefined));
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (!set.size) return d;
  for (let i = 0; i < 7; i++) {
    if (set.has(d.getDay())) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** La prédica que toca repasar: la última predicada hasta el día de la reunión. */
export function sermonForMeeting<T extends { preached_on: string }>(sermons: readonly T[], meeting: string): T | null {
  let best: T | null = null;
  for (const s of sermons) if (s.preached_on <= meeting && (!best || s.preached_on > best.preached_on)) best = s;
  return best;
}
