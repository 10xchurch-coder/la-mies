// Arma content/crecimiento.json a partir de content/crecimiento/*.md.
// Un archivo normal = un artículo (frontmatter: slug, section, title, summary, order).
// Un archivo con "multi: true" = varios artículos separados por líneas "=== slug | título | resumen".
// Uso: node scripts/crecimiento.mjs   (falla si encuentra un error de formato)
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('content/crecimiento');
const out = [];
const errors = [];

function front(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return [{}, text];
  const meta = Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return [meta, text.slice(m[0].length)];
}
const clean = (b) => b.replace(/^# .*\n+/, '').trim();

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
  const [meta, body] = front(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (meta.multi === 'true') {
    const parts = body.split(/^=== /m).slice(1);
    parts.forEach((p, i) => {
      const nl = p.indexOf('\n');
      const [slug, title, summary] = p.slice(0, nl).split('|').map((s) => s.trim());
      out.push({ slug, section: meta.section, title, summary, body: clean(p.slice(nl + 1)), sort_order: Number(meta.order) + i });
    });
  } else {
    out.push({ slug: meta.slug, section: meta.section, title: meta.title, summary: meta.summary, body: clean(body), sort_order: Number(meta.order) });
  }
}

const seen = new Set();
for (const a of out) {
  if (!a.slug || !a.title || !a.section || !a.body) errors.push(`incompleto: ${a.slug ?? a.title}`);
  if (seen.has(a.slug)) errors.push(`slug repetido: ${a.slug}`);
  seen.add(a.slug);
  for (const l of a.body.split('\n').filter((x) => x.startsWith('> '))) {
    if (!/^> «[^»]+» [1-3]? ?[A-ZÁÉÍÓÚ][a-záéíóúñ]+(?: [a-z]+ [A-Z][a-z]+)? \d+:\d+(-\d+)?$/.test(l)) errors.push(`versículo con formato raro en ${a.slug}: ${l.slice(0, 60)}…${l.slice(-30)}`);
    if (/\.» /.test(l)) errors.push(`punto antes de la cita en ${a.slug}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
fs.writeFileSync('content/crecimiento.json', JSON.stringify(out));
const by = out.reduce((m, a) => ({ ...m, [a.section]: (m[a.section] ?? 0) + 1 }), {});
console.log(`${out.length} artículos`, by);
