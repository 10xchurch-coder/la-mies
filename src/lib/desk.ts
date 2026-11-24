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
export type DeskTone = 'green' | 'blue' | 'amber' | 'violet' | 'teal' | 'pink';
export type DeskGroup = { title: string; tone: DeskTone; items: DeskItem[] };

import { pathOn, type Disabled } from './features';
import { tx } from './i18n';

// Las mismas áreas y colores que el menú del teléfono, para que todo se encuentre en el mismo lugar.
export const DESK_NAV: DeskGroup[] = [
  { get title() { return tx('Resumen'); }, tone: 'green', items: [
    { key: 'inicio', get label() { return tx('Inicio'); }, icon: 'home', to: '/escritorio', perms: [] },
  ] },
  { get title() { return tx('Reuniones'); }, tone: 'green', items: [
    { key: 'asistencia', get label() { return tx('Tomar asistencia'); }, icon: 'check-square', to: '/asistencia', perms: ['personas.asistencia'] },
    { key: 'hoy', get label() { return tx('Asistencia del día'); }, icon: 'eye', to: '/escritorio/asistencia', perms: ['personas.asistencia', 'personas.ver_todas', 'inf.panel'] },
    { key: 'calendario', get label() { return tx('Calendario'); }, icon: 'calendar', to: '/eventos', perms: [] },
    { key: 'rifas', get label() { return tx('Sorteos'); }, icon: 'award', to: '/rifas', perms: [] },
    { key: 'presentar', get label() { return tx('Modo presentación'); }, icon: 'monitor', to: '/presentar', perms: ['presentar.usar'] },
    { key: 'culto', get label() { return tx('Orden del culto'); }, icon: 'list', to: '/culto', perms: ['personas.ver_todas', 'inf.panel'] },
  ] },
  { get title() { return tx('Personas y seguimiento'); }, tone: 'amber', items: [
    { key: 'personas', get label() { return tx('Personas'); }, icon: 'users', to: '/escritorio/personas', perms: ['personas.ver_todas', 'personas.editar'] },
    { key: 'seguimiento', get label() { return tx('Para seguir'); }, icon: 'user-check', to: '/seguimiento', perms: [] },
    { key: 'discipulado', get label() { return tx('Discipulado'); }, icon: 'book-open', to: '/discipulado', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'decisiones', get label() { return tx('Decisiones'); }, icon: 'heart', to: '/decisiones', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'bienvenida', get label() { return tx('Visitas nuevas'); }, icon: 'gift', to: '/bienvenida', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'tarjeta-visita', get label() { return tx('Tarjeta de visita (QR)'); }, icon: 'grid', to: '/tarjeta-visita', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'clase-miembros', get label() { return tx('Clase de miembros'); }, icon: 'award', to: '/clase-miembros', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'ausencias', get label() { return tx('Faltaron'); }, icon: 'user-x', to: '/ausencias', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'inactivos', get label() { return tx('Inactivos'); }, icon: 'user-minus', to: '/inactivos', perms: ['personas.ver_todas', 'personas.editar'] },
    { key: 'fidelidad', get label() { return tx('Fidelidad'); }, icon: 'activity', to: '/fidelidad', perms: ['personas.ver_todas', 'inf.panel'] },
    { key: 'cumples', get label() { return tx('Cumpleaños'); }, icon: 'gift', to: '/cumples', perms: [] },
  ] },
  { get title() { return tx('Crecer'); }, tone: 'blue', items: [
    { key: 'clases', get label() { return tx('Clases'); }, icon: 'book-open', to: '/clases', perms: ['ens.ver', 'ens.editar'] },
    { key: 'devocionales', get label() { return tx('Devocionales'); }, icon: 'sunrise', to: '/admin/devocionales', perms: ['devocional.editar'] },
    { key: 'cancionero', get label() { return tx('Cancionero'); }, icon: 'music', to: '/canciones', perms: [] },
    { key: 'preguntas', get label() { return tx('Preguntas'); }, icon: 'help-circle', to: '/preguntas', perms: ['com.moderar'] },
    { key: 'musica', get label() { return tx('Música'); }, icon: 'headphones', to: '/musica', perms: [] },
    { key: 'radio', get label() { return tx('Radio'); }, icon: 'radio', to: '/radio', perms: [] },
  ] },
  { get title() { return tx('Comunidad'); }, tone: 'violet', items: [
    { key: 'anuncios', get label() { return tx('Anuncios'); }, icon: 'bell', to: '/anuncios', perms: ['com.anuncios'] },
    { key: 'ministerios', get label() { return tx('Ministerios'); }, icon: 'layers', to: '/ministerios', perms: ['ens.ver', 'ens.editar'] },
    { key: 'misioneros', get label() { return tx('Misioneros'); }, icon: 'globe', to: '/misioneros', perms: [] },
    { key: 'sugerencias', get label() { return tx('Sugerencias'); }, icon: 'message-square', to: '/sugerencias', perms: ['com.moderar'] },
    { key: 'mensajes', get label() { return tx('Mensajes'); }, icon: 'mail', to: '/mensajes', perms: [] },
    { key: 'ubicacion-familia', get label() { return tx('Ubicación en familia'); }, icon: 'map-pin', to: '/familia-ubicacion', perms: [] },
  ] },
  { get title() { return tx('Informes y evangelismo'); }, tone: 'teal', items: [
    { key: 'reporte', get label() { return tx('Informe semanal'); }, icon: 'file-text', to: '/reporte', perms: ['inf.panel'] },
    { key: 'progreso', get label() { return tx('Progreso de la iglesia'); }, icon: 'trending-up', to: '/progreso-iglesia', perms: ['inf.panel'] },
    { key: 'vivo', get label() { return tx('Evangelismo en vivo'); }, icon: 'map-pin', to: '/equipo', perms: ['inf.panel', 'evang.ver_salidas'] },
    { key: 'panel', get label() { return tx('Panel de salidas'); }, icon: 'bar-chart-2', to: '/panel', perms: ['inf.panel'] },
    { key: 'salieron', get label() { return tx('Quiénes salieron'); }, icon: 'user-check', to: '/salieron', perms: ['inf.panel', 'personas.asistencia'] },
    { key: 'salidas', get label() { return tx('Salidas'); }, icon: 'map', to: '/salidas', perms: ['evang.ver_salidas'] },
    { key: 'zonas', get label() { return tx('Zonas'); }, icon: 'grid', to: '/zonas', perms: ['evang.zonas'] },
  ] },
  { get title() { return tx('Administración'); }, tone: 'pink', items: [
    { key: 'finanzas', get label() { return tx('Finanzas'); }, icon: 'dollar-sign', to: '/finanzas', perms: ['fin.ver'] },
    { key: 'ofrendas', get label() { return tx('Ofrendas por persona'); }, icon: 'gift', to: '/finanzas/ofrendas', perms: ['fin.ver'] },
    { key: 'cuentas', get label() { return tx('Cuentas'); }, icon: 'key', to: '/admin/cuentas', perms: ['admin.permisos'] },
    { key: 'roles', get label() { return tx('Roles y permisos'); }, icon: 'shield', to: '/admin/roles', perms: ['admin.permisos'] },
    { key: 'funciones', get label() { return tx('Funciones de la iglesia'); }, icon: 'toggle-right', to: '/admin/funciones', perms: ['admin.permisos'] },
    { key: 'reglas', get label() { return tx('Seguimiento y mensajes'); }, icon: 'message-circle', to: '/admin/seguimiento', perms: ['admin.iglesia'] },
    { key: 'importar', get label() { return tx('Importar personas'); }, icon: 'upload', to: '/importar', perms: ['personas.editar'] },
    { key: 'copia', get label() { return tx('Copia de todos los datos'); }, icon: 'download', to: '/admin/copia', perms: ['admin.permisos'] },
    { key: 'ajustes', get label() { return tx('Ajustes'); }, icon: 'settings', to: '/ajustes', perms: [] },
  ] },
];

/** ¿Le corresponde el escritorio? A quien ve a todas las personas, el panel, las finanzas o administra. */
export function canUseDesk(perms: string[]): boolean {
  return perms.some((p) => p === 'personas.ver_todas' || p === 'personas.editar' || p === 'inf.panel' || p === 'fin.ver' || p.startsWith('admin.'));
}

/** El menú del costado, solo con lo que esta persona puede abrir. */
export function deskNavFor(perms: string[], disabled?: Disabled): DeskGroup[] {
  return DESK_NAV
    .map((g) => ({ title: g.title, tone: g.tone, items: g.items.filter((i) => (!i.perms.length || i.perms.some((p) => perms.includes(p))) && pathOn(disabled, i.to)) }))
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
  if (d === 0) return { text: tx('igual'), dir: 'same' };
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)}`, dir: d > 0 ? 'up' : 'down' };
}

/** El lunes de la semana de una fecha, como AAAA-MM-DD. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

// ---------- Asistencia del día ----------

export type DaySheetRow = { contact_id: string; name: string; status: string; present: boolean };
export type DaySummary = { present: number; members: number; visitors: number; missing: number };

/** Los números de una reunión: cuántos vinieron, cuántos son miembros, cuántas visitas, y cuántos miembros faltan marcar. */
export function summarizeSheet(rows: DaySheetRow[]): DaySummary {
  const here = rows.filter((r) => r.present);
  const members = here.filter((r) => r.status === 'member').length;
  return { present: here.length, members, visitors: here.length - members, missing: rows.filter((r) => !r.present && r.status === 'member').length };
}
