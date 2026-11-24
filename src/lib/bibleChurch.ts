// La Biblia de cada iglesia: qué versiones deja usar a su gente y cuál se abre primero.
// Sin nada de la app ni de la base, para poder probarse sola. Cuando se sume una versión nueva a la app
// (ver VERSIONS en lib/bible), aparece sola en la lista para que cada iglesia la permita o no.

export type BibleChurchConfig = {
  /** Las versiones permitidas (ids de VERSIONS). null: todas las que trae la app, también las que se sumen después. */
  versions: string[] | null;
  /** La que se abre para quien nunca eligió, o cuando la que tenía ya no está permitida. null: la primera permitida. */
  def: string | null;
};
export const OPEN_BIBLE: BibleChurchConfig = { versions: null, def: null };

type V = { id: string; lang?: 'es' | 'en' };

/** Lee lo que guarda la base ({ versions: [...], default: '...' }) y saca lo que no existe. Nunca deja a la iglesia sin Biblia. */
export function cleanBibleConfig(raw: unknown, all: readonly string[]): BibleChurchConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { versions?: unknown; default?: unknown };
  let versions: string[] | null = null;
  if (Array.isArray(r.versions)) {
    const ok = all.filter((id) => (r.versions as unknown[]).includes(id));
    // Si no queda ninguna de las que existen (o están todas), es lo mismo que no haber elegido.
    versions = ok.length && ok.length < all.length ? ok : null;
  }
  const allowed = versions ?? all;
  const def = typeof r.default === 'string' && allowed.includes(r.default) ? r.default : null;
  return { versions, def };
}

/** Las versiones que la iglesia permite, en el orden de la app. */
export function allowedOf<T extends V>(all: readonly T[], cfg: BibleChurchConfig): T[] {
  if (!cfg.versions) return [...all];
  const ok = all.filter((v) => cfg.versions!.includes(v.id));
  return ok.length ? ok : [...all];
}

/** La versión de la iglesia para quien no eligió: la que marcó el pastor, o la primera permitida. */
export function churchDefault<T extends V>(all: readonly T[], cfg: BibleChurchConfig): T {
  const ok = allowedOf(all, cfg);
  return ok.find((v) => v.id === cfg.def) ?? ok[0];
}

/**
 * En qué versión leer. `wanted` es la que la persona tenía guardada (o nada si nunca eligió).
 * - Si la tiene permitida, va esa.
 * - Si tenía una que la iglesia ya no permite, va la de la iglesia.
 * - Si nunca eligió: con la app en inglés va una versión en inglés, pero solo si la iglesia la permite; si no, la de la iglesia.
 */
export function pickVersion<T extends V>(all: readonly T[], cfg: BibleChurchConfig, wanted: string | null | undefined, lang: string): T {
  const ok = allowedOf(all, cfg);
  const hit = wanted ? ok.find((v) => v.id === wanted) : undefined;
  if (hit) return hit;
  if (!wanted && lang === 'en') {
    const en = ok.find((v) => v.lang === 'en');
    if (en) return en;
  }
  return churchDefault(all, cfg);
}

/** Lo que se manda a guardar: las permitidas (en el orden de la app) y la de inicio. Avisa si no queda ninguna. */
export function bibleConfigToSave(all: readonly string[], versions: readonly string[], def: string | null | undefined): { versions: string[]; default: string } {
  const ok = all.filter((id) => versions.includes(id));
  if (!ok.length) throw new Error('Dejá prendida al menos una versión de la Biblia.');
  return { versions: ok, default: def && ok.includes(def) ? def : ok[0] };
}
