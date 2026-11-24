// Envuelve en tx('...') los textos en castellano que ve la gente, en app/ y src/. Se puede correr las veces que haga falta:
// la segunda vez no cambia nada. Lo que no se animó a tocar queda anotado en docs/INGLES-revisar.txt.
// Uso:  node scripts/i18n-codemod.mjs          (reescribe los archivos)
//       node scripts/i18n-codemod.mjs --dry    (solo cuenta, no escribe)
// Cómo decide y qué hacer después: docs/INGLES.md.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from './i18n-lib.mjs';

const dry = process.argv.includes('--dry');
const { keys, review, changed, stats } = run({ write: !dry });

const byWhy = new Map();
for (const r of review) byWhy.set(r.why.replace(/"[^"]*"/, '"…"'), (byWhy.get(r.why.replace(/"[^"]*"/, '"…"')) ?? 0) + 1);
const lines = [
  'Textos que el programa scripts/i18n-codemod.mjs NO tocó porque no está seguro. Hay que mirarlos a mano.',
  'Si un texto de acá se ve en pantalla, se puede envolver a mano con tx(...) donde se muestra.',
  '',
  ...[...byWhy].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${String(n).padStart(5)}  ${w}`),
  '',
  ...review.map((r) => `${r.file}:${r.line}  [${r.why}]  ${r.text}`),
  '',
];
if (!dry) writeFileSync(join(ROOT, 'docs', 'INGLES-revisar.txt'), lines.join('\n'));
console.log(`${dry ? 'PRUEBA (no se escribió nada). ' : ''}Archivos revisados: ${stats.files}. Archivos ${dry ? 'que cambiarían' : 'cambiados'}: ${changed.length}.`);
console.log(`Textos envueltos ahora: ${stats.wrapped} (frases armadas: ${stats.merged}, propiedades fuera de función: ${stats.getters}, listas: ${stats.lists}, valores traducidos al mostrarse: ${stats.dynamic}). Ya estaban envueltos: ${stats.already}. 'es-AR' cambiados: ${stats.locales}.`);
console.log(`Claves distintas: ${keys.size}. Para revisar a mano: ${review.length}${dry ? '' : ' (docs/INGLES-revisar.txt)'}.`);
