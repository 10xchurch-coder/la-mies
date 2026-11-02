// Importa las calles de OpenStreetMap a la tabla "roads" de Supabase.
// Se corre UNA vez por ciudad (y de nuevo cuando quieras actualizar).
//
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
//   node scripts/import-roads.mjs --city "Posadas" --bbox -27.50,-56.05,-27.30,-55.80
//
// --bbox es sur,oeste,norte,este (lat mínima, lng mínima, lat máxima, lng máxima).
// Sin --bbox usa el de Posadas (Misiones).
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno.');
  process.exit(1);
}
const city = args.city || 'Posadas';
const bbox = (args.bbox || '-27.50,-56.05,-27.30,-55.80').split(',').map(Number);
if (bbox.length !== 4 || bbox.some((n) => Number.isNaN(n))) {
  console.error('--bbox tiene que ser sur,oeste,norte,este');
  process.exit(1);
}

const TYPES = ['residential', 'primary', 'secondary', 'tertiary', 'unclassified', 'living_street', 'pedestrian', 'trunk', 'primary_link', 'secondary_link', 'tertiary_link', 'service'];
const query = `[out:json][timeout:180];
way["highway"~"^(${TYPES.join('|')})$"](${bbox.join(',')});
out geom;`;

console.log(`Pidiendo calles de ${city} a OpenStreetMap…`);
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `data=${encodeURIComponent(query)}`,
});
if (!res.ok) {
  console.error('Overpass respondió', res.status, await res.text());
  process.exit(1);
}
const json = await res.json();
const ways = (json.elements || []).filter((e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 2);
console.log(`${ways.length} calles recibidas.`);

const rows = [];
for (const w of ways) {
  const highway = w.tags?.highway;
  const name = w.tags?.name ?? null;
  if (highway === 'service' && !name) continue; // entradas de garaje, playas de estacionamiento
  const coords = w.geometry.map((g) => [Number(g.lat.toFixed(6)), Number(g.lon.toFixed(6))]);
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  rows.push({
    id: w.id,
    name,
    highway,
    city,
    coords,
    min_lat: Math.min(...lats),
    min_lng: Math.min(...lngs),
    max_lat: Math.max(...lats),
    max_lng: Math.max(...lngs),
  });
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
let done = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const { error } = await supabase.from('roads').upsert(batch, { onConflict: 'id' });
  if (error) {
    console.error('Error al guardar:', error.message);
    process.exit(1);
  }
  done += batch.length;
  process.stdout.write(`\r${done}/${rows.length} guardadas`);
}
console.log(`\nListo: ${done} calles de ${city} en la base.`);
