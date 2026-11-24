// Idiomas de la app. El castellano es el texto que está escrito en el código; los demás idiomas son una lista
// "texto en castellano" -> "texto traducido" (src/i18n/en.json). Si un texto no está en la lista, se ve en castellano.
// Sin nada de la app ni de React Native, para poder probarse solo y usarse desde cualquier archivo de src/lib.
// Cómo se usa y cómo se agregan textos: docs/INGLES.md.

export type Lang = 'es' | 'en';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'es', name: 'Español' },
  { id: 'en', name: 'English' },
];
export const DEFAULT_LANG: Lang = 'es';

type Dict = Record<string, string>;
type Vars = Record<string, unknown>;

let lang: Lang = DEFAULT_LANG;
const dicts: Partial<Record<Lang, Dict>> = {};
const listeners = new Set<() => void>();

export const isLang = (x: unknown): x is Lang => x === 'es' || x === 'en';
export const getLang = (): Lang => lang;
/** Cierto si ya está cargada la lista de textos de ese idioma (el castellano no necesita lista). */
export const hasDict = (l: Lang): boolean => l === 'es' || !!dicts[l];

/** Guarda la lista de textos de un idioma. La carga src/lib/i18nStore.ts recién cuando hace falta. */
export function registerDict(l: Lang, dict: Dict): void {
  dicts[l] = dict;
}

/** Cambia el idioma en el que responde `t`. No guarda nada: para eso está saveLang (src/lib/i18nStore.ts). */
export function setLangNow(next: Lang): void {
  if (next === lang) return;
  lang = next;
  listeners.forEach((fn) => fn());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// {nombre} se cambia por el valor; {n|uno|varios} elige según si n es 1 (solo se usa en las traducciones).
const HOLE = /\{(\w+)(?:\|([^{}|]*)\|([^{}|]*))?\}/g;

/** Lo que se ve de un valor dentro de un texto: nada para null, undefined, true y false (igual que en pantalla). */
function show(v: unknown): string {
  return v === null || v === undefined || typeof v === 'boolean' ? '' : String(v);
}

function fill(text: string, vars: Vars | undefined): string {
  if (text.indexOf('{') < 0) return text;
  return text.replace(HOLE, (whole, name: string, one: string | undefined, many: string | undefined) => {
    if (one !== undefined) return vars && name in vars ? (Number(vars[name]) === 1 ? one : many ?? '') : whole;
    return vars && name in vars ? show(vars[name]) : whole;
  });
}

/**
 * El texto en el idioma elegido. Se le pasa el texto EN CASTELLANO (esa es la clave):
 *   t('Guardar')                                -> "Guardar" / "Save"
 *   t('Faltaron {n} personas', { n })           -> "Faltaron 3 personas" / "3 people were absent"
 * Si no hay traducción, devuelve el castellano. Los huecos que no vienen en `vars` quedan como están.
 */
export function t(es: string, vars?: Vars): string {
  const found = lang === 'es' ? undefined : dicts[lang]?.[es];
  const text = found === undefined ? es : found;
  return vars || found !== undefined ? fill(text, vars) : text;
}

/** El mismo `t` con otro nombre: es el que escribe el programa scripts/i18n-codemod.mjs (en la app hay muchas variables llamadas `t`). */
export const tx = t;

/**
 * Para listas de textos que están fuera de una función (se crean una sola vez, al abrir la app):
 * cada vez que se lee un elemento, sale en el idioma de ese momento. Lo demás (largo, map, join) anda igual.
 */
export function txList<T extends readonly string[]>(list: T): T {
  return new Proxy(list as unknown as string[], {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'string' && typeof prop === 'string' && /^\d+$/.test(prop) ? t(v) : v;
    },
  }) as unknown as T;
}

/** Para toLocaleDateString y parecidos: fechas y números como se escriben en ese idioma. */
export function txLocale(): 'es-AR' | 'en-US' {
  return lang === 'en' ? 'en-US' : 'es-AR';
}

/** Los huecos de un texto: "Hola {nombre}, faltan {n|día|días}" -> ["nombre", "n"]. Lo usan las pruebas. */
export function holes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HOLE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
