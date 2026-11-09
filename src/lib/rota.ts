// Arma una sugerencia de turnos de maestros para un mes, para todas las clases a la vez.
// Reglas: cada persona no pasa su límite por mes (contando maestro y ayudante), nadie está en dos clases
// el mismo día, se evita que alguien tenga dos turnos el mismo fin de semana, y se reparte parejo
// (primero el que menos turnos tiene y el que hace más que no enseña).

export type RotaClass = { id: string; days: string[]; teachers: string[]; helpers: string[] };
export type RotaExisting = { class_id: string; on_date: string; teacher_id: string | null; helper_id: string | null };
export type RotaSlot = { class_id: string; on_date: string; teacher_id: string | null; helper_id: string | null; kept: boolean };

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Días del mes (año, mes 0-11) que caen en alguno de los días de la semana dados. */
export function monthDates(year: number, month: number, days: string[]): string[] {
  const want = days.map((d) => DOW[d]).filter((n) => n !== undefined);
  const out: string[] = [];
  for (let d = new Date(year, month, 1, 12); d.getMonth() === month; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) {
    if (want.includes(d.getDay())) out.push(iso(d));
  }
  return out;
}

/** Clave de la semana (el lunes de esa semana): sábado y domingo quedan en la misma. */
function weekKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  const back = (dt.getDay() + 6) % 7; // días desde el lunes
  return iso(new Date(y, m - 1, d - back, 12));
}

export function planMonth(opts: {
  year: number;
  month: number;
  classes: RotaClass[];
  limits: Record<string, number | null | undefined>;
  existing: RotaExisting[];
  replace: boolean;
}): RotaSlot[] {
  const { year, month, classes, limits, existing, replace } = opts;
  const count = new Map<string, number>();
  const last = new Map<string, string>();
  const busyDay = new Map<string, Set<string>>(); // fecha -> personas ocupadas
  const busyWeek = new Map<string, Set<string>>(); // semana -> personas con turno
  const use = (pid: string | null, date: string) => {
    if (!pid) return;
    count.set(pid, (count.get(pid) ?? 0) + 1);
    if (!last.has(pid) || last.get(pid)! < date) last.set(pid, date);
    if (!busyDay.has(date)) busyDay.set(date, new Set());
    busyDay.get(date)!.add(pid);
    const w = weekKey(date);
    if (!busyWeek.has(w)) busyWeek.set(w, new Set());
    busyWeek.get(w)!.add(pid);
  };

  const slots: RotaSlot[] = [];
  for (const k of classes) for (const d of monthDates(year, month, k.days)) slots.push({ class_id: k.id, on_date: d, teacher_id: null, helper_id: null, kept: false });
  slots.sort((a, b) => a.on_date.localeCompare(b.on_date) || classes.findIndex((c) => c.id === a.class_id) - classes.findIndex((c) => c.id === b.class_id));

  // Lo que ya está cargado se respeta (salvo que se pida reemplazar) y cuenta para los límites.
  if (!replace) {
    for (const s of slots) {
      const e = existing.find((x) => x.class_id === s.class_id && x.on_date === s.on_date);
      if (e && (e.teacher_id || e.helper_id)) {
        s.teacher_id = e.teacher_id;
        s.helper_id = e.helper_id;
        s.kept = true;
        use(e.teacher_id, s.on_date);
        use(e.helper_id, s.on_date);
      }
    }
  }

  const pick = (pool: string[], date: string, exclude: string | null): string | null => {
    const day = busyDay.get(date) ?? new Set<string>();
    const week = busyWeek.get(weekKey(date)) ?? new Set<string>();
    const free = pool.filter((p) => p !== exclude && !day.has(p) && (limits[p] == null || (count.get(p) ?? 0) < (limits[p] as number)));
    if (!free.length) return null;
    free.sort((a, b) =>
      Number(week.has(a)) - Number(week.has(b))
      || (count.get(a) ?? 0) - (count.get(b) ?? 0)
      || (last.get(a) ?? '').localeCompare(last.get(b) ?? '')
      || pool.indexOf(a) - pool.indexOf(b));
    return free[0];
  };

  for (const s of slots) {
    if (s.kept) continue;
    const k = classes.find((c) => c.id === s.class_id)!;
    s.teacher_id = pick(k.teachers, s.on_date, null);
    use(s.teacher_id, s.on_date);
    if (k.helpers.length) {
      s.helper_id = pick(k.helpers, s.on_date, s.teacher_id);
      use(s.helper_id, s.on_date);
    }
  }
  return slots;
}
