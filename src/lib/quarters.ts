// Trimestres y años ya cerrados, para el informe de finanzas de la iglesia. Sin pantalla, para poder probarlo.
export type Period = { key: string; label: string; from: string; to: string };
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Los últimos trimestres que ya terminaron (el más nuevo primero) y los años completos que abarcan. */
export function closedPeriods(today: Date, quarters = 4): Period[] {
  const out: Period[] = [];
  let y = today.getFullYear();
  let q = Math.floor(today.getMonth() / 3); // trimestre en curso (0-3); el anterior es el último cerrado
  const years = new Set<number>();
  for (let i = 0; i < quarters; i++) {
    q -= 1;
    if (q < 0) { q = 3; y -= 1; }
    const m1 = q * 3 + 1, m3 = m1 + 2;
    out.push({ key: `${y}-T${q + 1}`, label: `${q + 1}.º trimestre ${y}`, from: iso(y, m1, 1), to: iso(y, m3, lastDay(y, m3)) });
    if (q === 3) years.add(y);
  }
  for (const yr of [...years].sort((a, b) => b - a)) out.push({ key: `${yr}`, label: `Año ${yr}`, from: iso(yr, 1, 1), to: iso(yr, 12, 31) });
  return out;
}
