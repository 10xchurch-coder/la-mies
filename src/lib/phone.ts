// Teléfonos de Argentina: +54 9 376 485-7649 (código de área + número = 10 cifras).
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

// Códigos de área de 3 cifras (el 11 es el único de 2; todos los demás son de 4).
const AREA3 = new Set(['220', '221', '223', '230', '236', '237', '249', '260', '261', '263', '264', '266', '280', '291', '294', '297', '298', '299',
  '336', '341', '342', '343', '345', '348', '351', '353', '358', '362', '364', '370', '376', '379', '380', '381', '383', '385', '387', '388']);

/** Cuántas cifras tiene el código de área de un número que empieza así. */
export function areaLength(d: string): number {
  if (d.startsWith('11')) return 2;
  return AREA3.has(d.slice(0, 3)) ? 3 : 4;
}

/** Las 10 cifras puestas lindas: "376 485-7649", "11 4567-8901", "3755 42-1234". Si faltan, las que haya. */
export function formatNational(d: string): string {
  const a = areaLength(d);
  if (d.length <= a) return d;
  const rest = d.slice(a);
  const first = 10 - a - 4;
  return rest.length <= first ? `${d.slice(0, a)} ${rest}` : `${d.slice(0, a)} ${rest.slice(0, first)}-${rest.slice(first)}`;
}

/** Lo que se va escribiendo en la casilla: solo las cifras del número (sin 54, 9, 0 ni 15), hasta 10. */
export function typedDigits(text: string | null | undefined): string {
  let d = (text ?? '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('549')) d = d.slice(3);
  else if (d.length > 10 && d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length > 10) {
    const a = areaLength(d);
    if (d.slice(a, a + 2) === '15') d = d.slice(0, a) + d.slice(a + 2);
  }
  return d.slice(0, 10);
}

/** ¿Es un número de otro país? (empieza con + y no es +54) */
export function isForeign(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return t.startsWith('+') && !t.replace(/\s/g, '').startsWith('+54');
}

/** Qué tiene de malo el número (o null si está bien). Vacío está bien salvo que sea obligatorio. */
export function phoneProblem(text: string | null | undefined, required = false): string | null {
  const t = (text ?? '').trim();
  if (!t) return required ? 'Escribí el número de celular.' : null;
  if (isForeign(t)) return t.replace(/\D/g, '').length >= 8 ? null : 'Al número de otro país le faltan cifras.';
  const d = typedDigits(t);
  if (!/^[123]/.test(d)) return 'Empezá por el código de área (por ejemplo 376).';
  if (d.length < 10) {
    const n = 10 - d.length;
    return `Le ${n === 1 ? 'falta 1 número' : `faltan ${n} números`}. Con el código de área son 10 (por ejemplo 376 412-3456).`;
  }
  return null;
}

/** El número como se muestra y se guarda. Si no se entiende, queda como lo escribieron. */
export function formatPhone(raw: string | null | undefined, area = DEFAULT_AREA): string {
  const t = (raw ?? '').trim();
  const d = nationalDigits(t, area);
  if (!d) return t;
  return `+54 9 ${formatNational(d)}`;
}

/** Para los enlaces de "Llamar": solo + y cifras. */
export function telDigits(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  const d = nationalDigits(t);
  if (d) return `+549${d}`;
  return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, '');
}
