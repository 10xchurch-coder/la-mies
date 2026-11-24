// Arma la lista de todos los textos en castellano que la app pide traducidos (src/i18n/claves.json)
// y dice cuáles todavía no tienen inglés en src/i18n/en.json. Sirve antes y después de correr scripts/i18n-codemod.mjs.
// Uso:  node scripts/i18n-extract.mjs                       (actualiza claves.json y deja los que faltan en src/i18n/faltan.json)
//       node scripts/i18n-extract.mjs --agregar archivo.json (suma a en.json las traducciones de ese archivo: { "castellano": "inglés" })
//       node scripts/i18n-extract.mjs --limpiar              (además saca de en.json las claves que la app ya no usa)
// Explicado en docs/INGLES.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from './i18n-lib.mjs';

const dir = join(ROOT, 'src', 'i18n');
const enPath = join(dir, 'en.json');
const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
const sorted = (o) => Object.fromEntries(Object.keys(o).sort((a, b) => a.localeCompare(b, 'es')).map((k) => [k, o[k]]));
const save = (p, o) => writeFileSync(p, `${JSON.stringify(o, null, 1)}\n`);

const en = read(enPath);
const add = process.argv.indexOf('--agregar');
if (add > 0) {
  const extra = read(process.argv[add + 1]);
  let n = 0;
  for (const [k, v] of Object.entries(extra)) if (typeof v === 'string' && v.trim()) { en[k] = v; n++; }
  console.log(`Traducciones sumadas: ${n}.`);
}

const { keys, pending } = run({ write: false });
const all = [...new Set([...keys.keys(), ...pending.keys()])];
if (process.argv.includes('--limpiar')) {
  const live = new Set(all);
  let gone = 0;
  for (const k of Object.keys(en)) if (!live.has(k)) { delete en[k]; gone++; }
  console.log(`Claves viejas sacadas de en.json: ${gone}.`);
}
save(enPath, sorted(en));
writeFileSync(join(dir, 'claves.json'), `${JSON.stringify([...all].sort((a, b) => a.localeCompare(b, 'es')), null, 0).replace(/","/g, '",\n"')}\n`);

const missing = all.filter((k) => en[k] === undefined);
save(join(dir, 'faltan.json'), Object.fromEntries(missing.map((k) => [k, ''])));
const unused = Object.keys(en).filter((k) => !all.includes(k)).length;
const words = (list) => list.reduce((a, k) => a + k.trim().split(/\s+/).length, 0);
console.log(`Claves (textos distintos): ${all.length}  (${words(all)} palabras). De esas, ${pending.size} son textos anotados para revisar a mano.`);
console.log(`Con inglés: ${all.length - missing.length}. Faltan: ${missing.length} (${words(missing)} palabras) -> src/i18n/faltan.json`);
console.log(`En en.json hay ${unused} claves que la app ya no usa${unused ? ' (se sacan con --limpiar)' : ''}.`);
