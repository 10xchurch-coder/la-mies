// Recibos: leer el total, recordar a qué categoría va cada comercio (como QuickBooks) y la fecha por defecto. Sin pantalla ni base.

/** "Ferretería El Tornillo S.R.L." -> "ferreteria el tornillo": para reconocer al mismo comercio aunque se escriba distinto. */
export function vendorKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(s\.?\s?r\.?\s?l|s\.?\s?a|s\.?\s?a\.?\s?s|sociedad anonima|de|del|la|el|los|las)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * La categoría que se usó la última vez para ese comercio. `history` va del más nuevo al más viejo.
 * Si el nombre no coincide exacto, sirve que uno contenga al otro ("edenor" y "edenor sa posadas").
 */
export function categoryForVendor(vendor: string | null | undefined, history: { counterpart: string | null; category_id: string | null }[]): string | null {
  const k = vendorKey(vendor);
  if (k.length < 3) return null;
  for (const h of history) {
    const hk = vendorKey(h.counterpart);
    if (h.category_id && hk.length >= 3 && (hk === k || hk.includes(k) || k.includes(hk))) return h.category_id;
  }
  return null;
}

/** Un número escrito a la argentina o a la inglesa: "12.345,67", "12345,67", "12,345.67", "$ 1.500" -> número. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  const decSep = lastComma > lastDot ? ',' : '.';
  const decPart = s.slice(s.lastIndexOf(decSep) + 1);
  if (s.includes(decSep) && decPart.length > 0 && decPart.length <= 2) {
    s = s.slice(0, s.lastIndexOf(decSep)).replace(/[.,]/g, '') + '.' + decPart;
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Del texto de un ticket, el total. Busca primero las líneas que dicen TOTAL (no "subtotal"), y si no hay, el número más grande con decimales.
 */
export function guessTotal(text: string): number | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const amountsIn = (l: string) => (l.match(/\$?\s?\d[\d.,]*\d|\$?\s?\d/g) ?? []).map(parseAmount).filter((n): n is number => n !== null);
  const totals: number[] = [];
  lines.forEach((l, i) => {
    const low = l.toLowerCase();
    if (/\btotal\b/.test(low) && !/sub\s?-?total|total\s+de\s+items|cant/.test(low)) {
      const here = amountsIn(l);
      const next = here.length ? here : amountsIn(lines[i + 1] ?? '');
      if (next.length) totals.push(next[next.length - 1]);
    }
  });
  if (totals.length) return Math.max(...totals);
  const withCents = lines.flatMap((l) => (l.match(/\d[\d.]*,\d{2}\b|\d[\d,]*\.\d{2}\b/g) ?? []).map(parseAmount)).filter((n): n is number => n !== null);
  return withCents.length ? Math.max(...withCents) : null;
}

/** Hoy en formato dd/mm/aaaa (el que se ve en el campo Fecha). */
export function todayDMY(d = new Date()): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** "2026-11-22" -> "22/11/2026". */
export function isoToDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Efectivo o banco: el modo de pago sale de la cuenta elegida. */
export function methodForAccount(kind: string | null | undefined): 'cash' | 'transfer' {
  return kind === 'bank' ? 'transfer' : 'cash';
}
