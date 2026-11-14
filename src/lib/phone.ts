// Teléfonos en el formato de Misiones: +54 9 3764 27-2200.
// Si alguien escribe solo el número de acá (6 cifras), se le agrega +54 9 y el código de área.
// Si escribe otro código de área (o un número con +, de otro país), se respeta lo que escribió.
// No importa nada de la app para poder probarse sola.

/** Código de área que se agrega cuando el número viene sin él. */
export const DEFAULT_AREA = '3764';

/** Las 10 cifras nacionales (código de área + número) o null si no se puede entender. */
export function nationalDigits(raw: string | null | undefined, area = DEFAULT_AREA): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  let d = t.replace(/\D/g, '');
  if (t.startsWith('+') && !d.startsWith('54')) return null; // otro país
  if (t.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // Con el 15 en el medio (376 15 455 1234): se saca el 15.
  if (d.length > 10) {
    for (let a = 2; a <= 4; a++) {
      if (d.slice(a, a + 2) === '15' && d.length - 2 === 10) { d = d.slice(0, a) + d.slice(a + 2); break; }
    }
  }
  if (d.length === 8 && d.startsWith('15')) d = area + d.slice(2);
  else if (d.length === 6) d = area + d;
  else if (d.length === 7) d = area.slice(0, 3) + d;
  return d.length === 10 ? d : null;
}

/** El número como se muestra y se guarda. Si no se entiende, queda como lo escribieron. */
export function formatPhone(raw: string | null | undefined, area = DEFAULT_AREA): string {
  const t = (raw ?? '').trim();
  const d = nationalDigits(t, area);
  if (!d) return t;
  return d.startsWith('11') ? `+54 9 11 ${d.slice(2, 6)}-${d.slice(6)}` : `+54 9 ${d.slice(0, 4)} ${d.slice(4, 6)}-${d.slice(6)}`;
}

/** Para los enlaces de "Llamar": solo + y cifras. */
export function telDigits(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  const d = nationalDigits(t);
  if (d) return `+549${d}`;
  return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, '');
}
