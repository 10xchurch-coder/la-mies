// Misioneros: los meses del informe y cómo se ordenan. Sin nada de la base ni de la pantalla para poder probarse sola.

import { txList } from './i18n';
const MONTHS = txList(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);

/** "2026-11-01" -> "noviembre de 2026". Si no es una fecha, devuelve lo mismo que le dieron. */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const i = Number(m[2]) - 1;
  return i >= 0 && i < 12 ? `${MONTHS[i]} de ${m[1]}` : month;
}

/** Primer día del mes de una fecha: "2026-11-19" -> "2026-11-01". */
export function monthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Los últimos `n` meses, empezando por el actual: para elegir de qué mes es el informe. */
export function recentMonths(now: Date, n = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(monthStart(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return out;
}

/** Los informes del más nuevo al más viejo. */
export function newestFirst<T extends { month: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}

/** Nombre del archivo para mostrar: "informe-noviembre-2026.pdf" si no tiene uno propio. */
export function pdfLabel(pdfName: string | null | undefined, month: string): string {
  if (pdfName && pdfName.trim()) return pdfName.trim();
  const m = /^(\d{4})-(\d{2})/.exec(month);
  return m ? `informe-${MONTHS[Number(m[2]) - 1] ?? m[2]}-${m[1]}.pdf` : 'informe.pdf';
}
