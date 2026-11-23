// Lo leído en la Biblia pasa solo al plan de lectura: al pasar de capítulo (o tocar "Marcar como leído"),
// el capítulo queda anotado, y cuando se leyeron todos los de un día, ese día se tilda en el plan.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveBiblePlanDone, type BiblePlanRow } from '@/lib/api';
import { chapterKey, daysCompletedBy } from '@/lib/bible';
import { planReadings } from '@/lib/biblePlan';

const KEY = 'lamies.biblia.leidos';
type Store = { plan: string; started_on: string; read: string[] };

/** Los capítulos leídos desde que empezó este plan. Si la persona cambió de plan, empieza de cero. */
export async function loadRead(row: BiblePlanRow): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Store>) : null;
    if (s && s.plan === row.plan && s.started_on === row.started_on && Array.isArray(s.read)) return new Set(s.read.filter((x) => typeof x === 'string'));
  } catch {
    // Si no se puede leer, se empieza de cero.
  }
  return new Set();
}

// Aviso corto "Marcado en tu plan" para mostrar en la pantalla de la Biblia (también en la que se abre justo después).
type Listener = (text: string) => void;
const listeners = new Set<Listener>();
let last: { text: string; at: number } | null = null;
export function onPlanMarked(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** El último aviso, si es de hace pocos segundos (la pantalla del capítulo siguiente se abre antes de que termine de guardarse). */
export function recentPlanNote(): string | null {
  return last && Date.now() - last.at < 8000 ? last.text : null;
}

export type MarkResult = { read: Set<string>; done: number[]; newly: number[] };

/** Anota el capítulo como leído y tilda los días del plan que con eso quedan completos. */
export async function markChapterRead(row: BiblePlanRow, book: number, chapter: number): Promise<MarkResult> {
  const read = await loadRead(row);
  read.add(chapterKey(book, chapter));
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ plan: row.plan, started_on: row.started_on, read: [...read] } satisfies Store));
  } catch {
    // Sin poder guardar, igual se tilda el día si quedó completo.
  }
  const newly = daysCompletedBy(row.plan, book, chapter, read, row.done);
  const done = [...row.done, ...newly];
  if (newly.length) {
    await saveBiblePlanDone(done);
    last = { text: `✓ Marcado en tu plan: ${planReadings(row.plan)[newly[newly.length - 1]]}`, at: Date.now() };
    listeners.forEach((fn) => fn(last!.text));
  }
  return { read, done, newly };
}
