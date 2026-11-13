// Escritorio (la versión para computadora de pastores, secretaría y administración).
// Acá va solo la lógica: qué secciones ve cada uno, y cómo se filtra y ordena la tabla de personas.
// No importa nada de la app para poder probarse sola.

export type DeskItem = {
  key: string;
  label: string;
  icon: string;
  /** Ruta que abre. Las que empiezan con /escritorio se ven dentro del escritorio. */
  to: string;
  /** Alcanza con tener uno de estos permisos. Vacío: lo ve cualquiera que entra al escritorio. */
  perms: string[];
};
export type DeskGroup = { title: string; items: DeskItem[] };

export const DESK_NAV: DeskGroup[] = [
  { title: 'Resumen', items: [
    { key: 'inicio', label: 'Inicio', icon: 'home', to: '/escritorio', perms: [] },
  ] },
  { title: 'Personas', items: [
    { key: 'personas', label: 'Personas', icon: 'users', to: '/escritorio/personas', perms: ['personas.ver_todas', 'personas.editar'] },
    { key: 'asistencia', label: 'Tomar asistencia', icon: 'check-square', to: '/asistencia', perms: ['personas.asistencia'] },
    { key: 'ausencias', label: 'Ausencias', icon: 'user-x', to: '/ausencias', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'fidelidad', label: 'Fidelidad', icon: 'activity', to: '/fidelidad', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'seguimiento', label: 'Para seguir', icon: 'user-check', to: '/seguimiento', perms: [] },
    { key: 'cumples', label: 'Cumpleaños', icon: 'gift', to: '/cumples', perms: [] },
  ] },
  { title: 'Iglesia', items: [
    { key: 'calendario', label: 'Calendario', icon: 'calendar', to: '/eventos', perms: [] },
    { key: 'anuncios', label: 'Anuncios', icon: 'bell', to: '/anuncios', perms: ['com.anuncios'] },
    { key: 'ministerios', label: 'Ministerios', icon: 'layers', to: '/ministerios', perms: ['ens.ver', 'ens.editar'] },
    { key: 'clases', label: 'Clases', icon: 'book-open', to: '/clases', perms: ['ens.ver', 'ens.editar'] },
    { key: 'devocionales', label: 'Devocionales', icon: 'sunrise', to: '/admin/devocionales', perms: ['devocional.editar'] },
    { key: 'sugerencias', label: 'Sugerencias', icon: 'message-square', to: '/sugerencias', perms: ['com.moderar'] },
  ] },
  { title: 'Evangelismo', items: [
    { key: 'vivo', label: 'En vivo ahora', icon: 'radio', to: '/equipo', perms: ['inf.panel', 'evang.ver_salidas'] },
    { key: 'panel', label: 'Panel de salidas', icon: 'bar-chart-2', to: '/panel', perms: ['inf.panel'] },
    { key: 'salidas', label: 'Salidas', icon: 'map', to: '/salidas', perms: ['evang.ver_salidas'] },
    { key: 'zonas', label: 'Zonas', icon: 'grid', to: '/zonas', perms: ['evang.zonas'] },
  ] },
  { title: 'Informes y finanzas', items: [
    { key: 'reporte', label: 'Informe semanal', icon: 'file-text', to: '/reporte', perms: ['inf.panel'] },
    { key: 'progreso', label: 'Progreso de la iglesia', icon: 'trending-up', to: '/progreso-iglesia', perms: ['inf.panel'] },
    { key: 'finanzas', label: 'Finanzas', icon: 'dollar-sign', to: '/finanzas', perms: ['fin.ver'] },
  ] },
  { title: 'Administración', items: [
    { key: 'cuentas', label: 'Cuentas', icon: 'key', to: '/admin/cuentas', perms: ['admin.permisos'] },
    { key: 'roles', label: 'Roles y permisos', icon: 'shield', to: '/admin/roles', perms: ['admin.permisos'] },
    { key: 'importar', label: 'Importar personas', icon: 'upload', to: '/importar', perms: ['personas.editar'] },
    { key: 'ajustes', label: 'Ajustes', icon: 'settings', to: '/ajustes', perms: [] },
  ] },
];

/** ¿Le corresponde el escritorio? A quien ve a todas las personas, el panel, las finanzas o administra. */
export function canUseDesk(perms: string[]): boolean {
  return perms.some((p) => p === 'personas.ver_todas' || p === 'personas.editar' || p === 'inf.panel' || p === 'fin.ver' || p.startsWith('admin.'));
}

/** El menú del costado, solo con lo que esta persona puede abrir. */
export function deskNavFor(perms: string[]): DeskGroup[] {
  return DESK_NAV
    .map((g) => ({ title: g.title, items: g.items.filter((i) => !i.perms.length || i.perms.some((p) => perms.includes(p))) }))
    .filter((g) => g.items.length > 0);
}

// ---------- Tabla de personas ----------

export type DeskPerson = {
  id: string; name: string; status: string; phone: string | null; email: string | null; address: string | null; address_hint: string | null;
  group_id: string | null; birthdate: string | null; age: number | null; baptized: boolean; baptized_on: string | null; member_since: string | null;
  created_at: string; profile_id: string | null;
};
export type PersonSort = 'name' | 'status' | 'group' | 'age' | 'last' | 'pct' | 'created';
export type PersonFilter = {
  q: string;
  status: 'all' | 'member' | 'visitor' | 'contact';
  group: string;            // 'all' | 'none' | id
  extra: 'all' | 'unbaptized' | 'no_phone' | 'no_account' | 'absent';
};

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ageOf(p: { birthdate: string | null; age: number | null }, today = new Date()): number | null {
  if (p.birthdate) {
    const [y, m, d] = p.birthdate.split('-').map(Number);
    if (!y || !m || !d) return p.age;
    let a = today.getFullYear() - y;
    if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) a--;
    return a;
  }
  return p.age;
}

/** Días desde la última vez que vino (null: nunca vino o no se sabe). */
export function daysSince(iso: string | null | undefined, today = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((today.getTime() - t) / 86400000));
}

export function filterPeople<T extends DeskPerson>(rows: T[], f: PersonFilter, last: Map<string, string | null>, today = new Date()): T[] {
  const s = norm(f.q.trim());
  return rows.filter((c) => {
    if (f.status !== 'all' && c.status !== f.status) return false;
    if (f.group === 'none' ? !!c.group_id : f.group !== 'all' && c.group_id !== f.group) return false;
    if (f.extra === 'unbaptized' && (c.baptized || c.baptized_on)) return false;
    if (f.extra === 'no_phone' && c.phone) return false;
    if (f.extra === 'no_account' && c.profile_id) return false;
    if (f.extra === 'absent') {
      const d = daysSince(last.get(c.id), today);
      if (c.status === 'contact' || (d !== null && d < 21)) return false;
    }
    if (s && !norm(`${c.name} ${c.phone ?? ''} ${c.email ?? ''} ${c.address ?? ''} ${c.address_hint ?? ''}`).includes(s)) return false;
    return true;
  });
}

const STATUS_ORDER: Record<string, number> = { member: 0, visitor: 1, contact: 2 };

export function sortPeople<T extends DeskPerson>(
  rows: T[], by: PersonSort, dir: 1 | -1,
  ctx: { groupName: Map<string, string>; last: Map<string, string | null>; pct: Map<string, number> },
): T[] {
  // Los que no tienen el dato van siempre al final, sin importar el sentido.
  const withNulls = <V,>(a: V | null | undefined, b: V | null | undefined, cmp: (x: V, y: V) => number) => {
    const na = a === null || a === undefined || a === '';
    const nb = b === null || b === undefined || b === '';
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return cmp(a as V, b as V) * dir;
  };
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'es');
  const cmp = (a: T, b: T): number => {
    switch (by) {
      case 'status': return ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)) * dir;
      case 'group': return withNulls(ctx.groupName.get(a.group_id ?? ''), ctx.groupName.get(b.group_id ?? ''), (x, y) => x.localeCompare(y, 'es'));
      case 'age': return withNulls(ageOf(a), ageOf(b), (x, y) => x - y);
      case 'last': return withNulls(ctx.last.get(a.id), ctx.last.get(b.id), (x, y) => x.localeCompare(y));
      case 'pct': return withNulls(ctx.pct.get(a.id), ctx.pct.get(b.id), (x, y) => x - y);
      case 'created': return a.created_at.localeCompare(b.created_at) * dir;
      default: return byName(a, b) * dir;
    }
  };
  return [...rows].sort((a, b) => cmp(a, b) || byName(a, b));
}

/** Arma un archivo CSV que abre bien en Excel (con BOM y punto y coma). */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

/** Cambio contra el período anterior, para mostrar "+3" o "−2". */
export function delta(now: number, before: number | null | undefined): { text: string; dir: 'up' | 'down' | 'same' } | null {
  if (before === null || before === undefined) return null;
  const d = now - before;
  if (d === 0) return { text: 'igual', dir: 'same' };
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)}`, dir: d > 0 ? 'up' : 'down' };
}

/** El lunes de la semana de una fecha, como AAAA-MM-DD. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}
