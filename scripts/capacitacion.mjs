// Arma content/capacitacion.json desde content/capacitacion/*.md (varios por archivo: "=== Título | resumen | minutos").
// Los versículos se escriben como en Crecimiento («texto» Cita) y acá pasan al formato de Capacitación ("> Cita | texto").
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('content/capacitacion');
const out = [];
const errors = [];
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  const parts = text.slice(m[0].length).split(/^=== /m).slice(1);
  parts.forEach((p, i) => {
    const nl = p.indexOf('\n');
    const [title, summary, minutes] = p.slice(0, nl).split('|').map((s) => s.trim());
    const body = p.slice(nl + 1).trim().split('\n').map((l) => {
      if (!l.startsWith('> ')) return l;
      const v = l.match(/^> «([\s\S]+)» (.+)$/);
      if (!v) { errors.push(`versículo raro en ${title}: ${l.slice(0, 60)}`); return l; }
      if (/\.»/.test(l)) errors.push(`punto antes de la cita en ${title}`);
      return `> ${v[2]} | ${v[1]}`;
    }).join('\n');
    out.push({ slug: slugify(`${meta.category}-${title}`), category: meta.category, title, summary, body, minutes: Number(minutes) || null, sort_order: Number(meta.order) + i });
  });
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
fs.writeFileSync('content/capacitacion.json', JSON.stringify(out));
console.log(`${out.length} temas de capacitación`);
