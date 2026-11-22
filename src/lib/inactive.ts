// Inactivos: las opciones de tiempo y cómo decirlo. Sin pantalla ni base.

export const MONTH_CHOICES = [1, 2, 3, 6, 9, 12, 18, 24] as const;

/** "3 meses", "1 año", "1 año y medio", "2 años". */
export function monthsLabel(m: number): string {
  if (m % 12 === 0) return m === 12 ? '1 año' : `${m / 12} años`;
  if (m === 18) return '1 año y medio';
  return m === 1 ? '1 mes' : `${m} meses`;
}

/** Lo que escribió la persona en "otra cantidad": un número de meses válido (1 a 120) o null. */
export function parseMonths(t: string): number | null {
  const n = Number((t ?? '').replace(/\D/g, ''));
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : null;
}

/** Hace cuánto vino por última vez, dicho corto. */
export function sinceLabel(last: string | null, today = new Date()): string {
  if (!last) return 'Sin asistencia registrada';
  const d = new Date(`${last}T12:00:00`);
  const days = Math.floor((today.getTime() - d.getTime()) / 864e5);
  if (days < 1) return 'Vino hoy';
  if (days < 45) return `Vino hace ${days} días`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `Vino hace ${months} meses`;
  return `Vino hace ${Math.floor(months / 12)} años`;
}
