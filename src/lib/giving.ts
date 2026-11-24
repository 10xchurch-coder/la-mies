// Ofrendas por persona: cuentas y textos. Acá no hay nada de la base ni de la pantalla, para poder probarse solo.
// Son el registro de quién dio. No cambian el saldo de los fondos (eso se carga en Finanzas, como siempre).

export type GivingMethod = 'cash' | 'transfer' | 'card' | 'check' | 'other';

export const METHOD_LABEL: Record<GivingMethod, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque', other: 'Otro',
};
export const METHODS: { value: GivingMethod; label: string }[] = (Object.keys(METHOD_LABEL) as GivingMethod[]).map((m) => ({ value: m, label: METHOD_LABEL[m] }));
export const methodLabel = (m: string | null | undefined): string => METHOD_LABEL[m as GivingMethod] ?? 'Otro';

/** Una ofrenda como la ve quien lleva las finanzas. */
export type GivingRow = {
  id: string; contact_id: string | null; person_name: string; fund_id: string; on_date: string; amount: number; currency: string;
  method: GivingMethod; note: string | null; created_by: string | null; created_at: string; voided_at: string | null; void_reason: string | null;
};

/** Una línea del estado (sirve para el de finanzas y para "Mis ofrendas"). */
export type StatementLine = { on_date: string; amount: number; currency: string; method: string; fund: string; note: string | null };
export type FundTotal = { fund: string; currency: string; total: number; count: number };
export type Statement = { year: number; lines: StatementLine[]; byFund: FundTotal[]; totals: { currency: string; total: number }[]; count: number };

const cents = (n: number) => Math.round((Number(n) || 0) * 100);

/** El estado de un año: la lista (de la más vieja a la más nueva), el total por fondo y el total de cada moneda. */
export function buildStatement(lines: StatementLine[], year: number): Statement {
  const mine = lines.filter((l) => l.on_date.slice(0, 4) === String(year)).sort((a, b) => a.on_date.localeCompare(b.on_date));
  const funds = new Map<string, { fund: string; currency: string; c: number; count: number }>();
  const tot = new Map<string, number>();
  for (const l of mine) {
    const k = `${l.fund}|${l.currency}`;
    const f = funds.get(k) ?? { fund: l.fund, currency: l.currency, c: 0, count: 0 };
    f.c += cents(l.amount); f.count += 1;
    funds.set(k, f);
    tot.set(l.currency, (tot.get(l.currency) ?? 0) + cents(l.amount));
  }
  const byFund = [...funds.values()].map((f) => ({ fund: f.fund, currency: f.currency, total: f.c / 100, count: f.count }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.total - a.total || a.fund.localeCompare(b.fund, 'es'));
  const totals = [...tot.entries()].map(([currency, c]) => ({ currency, total: c / 100 })).sort((a, b) => a.currency.localeCompare(b.currency));
  return { year, lines: mine, byFund, totals, count: mine.length };
}

/** Los años que tienen ofrendas, del más nuevo al más viejo. Siempre incluye el año actual. */
export function yearsOf(dates: string[], today = new Date()): number[] {
  const set = new Set<number>([today.getFullYear()]);
  for (const d of dates) { const y = Number(d.slice(0, 4)); if (y > 1900 && y < 3000) set.add(y); }
  return [...set].sort((a, b) => b - a);
}

/** Total por persona (para la lista de finanzas). Las anuladas no cuentan. */
export function totalsByPerson(rows: Pick<GivingRow, 'contact_id' | 'person_name' | 'amount' | 'currency' | 'voided_at'>[]): { key: string; contact_id: string | null; name: string; currency: string; total: number; count: number }[] {
  const m = new Map<string, { key: string; contact_id: string | null; name: string; currency: string; c: number; count: number }>();
  for (const r of rows) {
    if (r.voided_at) continue;
    const key = `${r.contact_id ?? `sin-ficha:${r.person_name}`}|${r.currency}`;
    const x = m.get(key) ?? { key, contact_id: r.contact_id, name: r.person_name || 'Sin nombre', currency: r.currency, c: 0, count: 0 };
    x.c += cents(r.amount); x.count += 1;
    m.set(key, x);
  }
  return [...m.values()].map((x) => ({ key: x.key, contact_id: x.contact_id, name: x.name, currency: x.currency, total: x.c / 100, count: x.count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.currency.localeCompare(b.currency));
}

const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n: number, currency: string) => {
  const v = Number(n) || 0;
  return `${currency === 'USD' ? 'US$' : '$'} ${v.toLocaleString('es-AR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const dayAR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** La hoja para imprimir (o guardar como PDF): iglesia, persona, año, totales por fondo y la lista. */
export function statementHtml(o: { church: string; motto?: string | null; city?: string | null; person: string; statement: Statement; printedOn?: string }): string {
  const s = o.statement;
  const rows = s.lines.map((l) => `<tr><td>${esc(dayAR(l.on_date))}</td><td>${esc(l.fund)}</td><td>${esc(methodLabel(l.method))}</td><td>${esc(l.note)}</td><td class="n">${esc(money(l.amount, l.currency))}</td></tr>`).join('');
  const funds = s.byFund.map((f) => `<tr><td>${esc(f.fund)}</td><td class="n">${f.count}</td><td class="n">${esc(money(f.total, f.currency))}</td></tr>`).join('');
  const totals = s.totals.map((t) => `<p class="total">Total del año: <b>${esc(money(t.total, t.currency))}</b></p>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(`Ofrendas ${s.year} - ${o.person}`)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 6px}
.sub{color:#555;margin:2px 0}.who{margin:18px 0 0;font-size:16px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
th{font-size:12px;color:#444}.n{text-align:right;white-space:nowrap}.total{font-size:16px;margin:10px 0 0;text-align:right}
.foot{margin-top:28px;color:#666;font-size:11px}
@media print{body{margin:12mm}tr{break-inside:avoid}}
</style></head><body>
<h1>${esc(o.church)}</h1>
${o.motto ? `<p class="sub">${esc(o.motto)}</p>` : ''}${o.city ? `<p class="sub">${esc(o.city)}</p>` : ''}
<p class="who"><b>${esc(o.person)}</b> · Ofrendas del año ${s.year}</p>
${s.count === 0 ? '<p>No hay ofrendas anotadas en este año.</p>' : `
<h2>Total por fondo</h2>
<table><thead><tr><th>Fondo</th><th class="n">Veces</th><th class="n">Total</th></tr></thead><tbody>${funds}</tbody></table>
${totals}
<h2>Detalle</h2>
<table><thead><tr><th>Fecha</th><th>Fondo</th><th>Forma</th><th>Nota</th><th class="n">Monto</th></tr></thead><tbody>${rows}</tbody></table>`}
<p class="foot">Hoja hecha con la app La Mies${o.printedOn ? ` el ${esc(o.printedOn)}` : ''}. Es un resumen de lo anotado por la tesorería de la iglesia.</p>
</body></html>`;
}

/** Revisa lo que se escribió antes de guardar. Devuelve el problema en palabras simples, o null si está bien. */
export function givingProblem(o: { contactId: string | null; fundId: string | null; amount: number | null; date: string | null }, today = new Date()): string | null {
  if (!o.contactId) return 'Elegí a la persona.';
  if (!o.fundId) return 'Elegí el fondo.';
  if (!o.amount || o.amount <= 0) return 'Escribí el monto.';
  if (!o.date) return 'Escribí la fecha así: 05/11/2026.';
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (new Date(`${o.date}T00:00:00`).getTime() > t.getTime()) return 'La fecha no puede ser de un día que todavía no llegó.';
  return null;
}
