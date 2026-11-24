// Lo que la Biblia recuerda en el teléfono: dónde quedó la persona y cómo le gusta leer (letra, tamaño, fondo, espacio).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lamies.biblia';

export type BiblePrefs = { version?: string; book: number; chapter: number; size: number; font?: string; theme?: string; spacing?: string;
  /** La segunda versión para leer dos a la vez (id de VERSIONS). Si falta, no se compara. */
  compare?: string;
  /** En el teléfono: true para ver las dos versiones en dos columnas en vez de una debajo de la otra. */
  compareCols?: boolean };
export const DEFAULT_PREFS: BiblePrefs = { book: 42, chapter: 1, size: 19 };
export const SIZES = [14, 15, 17, 19, 22, 26, 30];

export async function loadBiblePrefs(): Promise<BiblePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<BiblePrefs>;
    return {
      version: typeof p.version === 'string' ? p.version : undefined,
      book: Number.isInteger(p.book) && p.book! >= 0 && p.book! < 66 ? p.book! : DEFAULT_PREFS.book,
      chapter: Number.isInteger(p.chapter) && p.chapter! >= 1 ? p.chapter! : 1,
      size: typeof p.size === 'number' && SIZES.includes(p.size) ? p.size : DEFAULT_PREFS.size,
      font: typeof p.font === 'string' ? p.font : undefined,
      theme: typeof p.theme === 'string' ? p.theme : undefined,
      spacing: typeof p.spacing === 'string' ? p.spacing : undefined,
      compare: typeof p.compare === 'string' && p.compare ? p.compare : undefined,
      compareCols: p.compareCols === true ? true : undefined,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveBiblePrefs(p: BiblePrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Si no se puede guardar, la Biblia sigue andando; solo no recuerda dónde quedó.
  }
}
