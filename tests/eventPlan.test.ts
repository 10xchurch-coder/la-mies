import test from 'node:test';
import assert from 'node:assert/strict';

// atTime vive en eventPlan.ts, que importa la base; acá se prueba la misma cuenta suelta.
function atTime(dayISO: string, hhmm: string): string | null {
  const m = /^(\d{1,2})[:.h]?(\d{2})?$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] ?? 0);
  if (h > 23 || mi > 59) return null;
  const d = new Date(`${dayISO}T00:00:00`);
  d.setHours(h, mi, 0, 0);
  return d.toISOString();
}

test('la hora del programa se entiende escrita de varias formas', () => {
  const at = (t: string) => { const r = atTime('2027-01-18', t); return r ? new Date(r).getHours() * 100 + new Date(r).getMinutes() : null; };
  assert.equal(at('9:30'), 930);
  assert.equal(at('09.30'), 930);
  assert.equal(at('20'), 2000);
  assert.equal(at('25:00'), null);
  assert.equal(at('mañana'), null);
});
