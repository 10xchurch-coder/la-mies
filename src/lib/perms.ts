// Permisos y roles. Lo mismo que public.all_perms() y public.role_perms() en la base.

import { tx } from './i18n';
export type Perm =
  | 'personas.ver_todas' | 'personas.editar' | 'personas.asistencia' | 'personas.privados'
  | 'com.anuncios' | 'com.moderar' | 'cal.editar' | 'predicas.subir' | 'devocional.editar'
  | 'ens.ver' | 'ens.editar' | 'ens.material'
  | 'evang.corregir' | 'evang.marcar_otros' | 'evang.ver_salidas' | 'evang.zonas'
  | 'inf.panel' | 'fin.ver' | 'fin.cargar' | 'fin.tesoreria' | 'fin.roles'
  | 'admin.permisos' | 'admin.iglesia' | 'presentar.usar';

export const PERM_GROUPS: { title: string; perms: { key: Perm; label: string; hint?: string }[] }[] = [
  { get title() { return tx('Personas'); }, perms: [
    { key: 'personas.ver_todas', get label() { return tx('Ver a todas las personas'); }, get hint() { return tx('Si no, cada uno ve solo a los suyos'); } },
    { key: 'personas.editar', get label() { return tx('Cargar y editar miembros'); } },
    { key: 'personas.asistencia', get label() { return tx('Tomar asistencia'); } },
    { key: 'personas.privados', get label() { return tx('Ver teléfonos y domicilios de los hermanos'); } },
  ] },
  { get title() { return tx('Comunicación'); }, perms: [
    { key: 'com.anuncios', get label() { return tx('Mandar anuncios a toda la iglesia'); } },
    { key: 'com.moderar', get label() { return tx('Moderar oración, comentarios, denuncias y sugerencias'); } },
  ] },
  { get title() { return tx('Calendario y contenido'); }, perms: [
    { key: 'cal.editar', get label() { return tx('Editar el calendario y los horarios'); } },
    { key: 'predicas.subir', get label() { return tx('Subir prédicas y manejar la transmisión'); } },
    { key: 'devocional.editar', get label() { return tx('Editar el devocional, Crecimiento y Capacitación'); } },
    { key: 'presentar.usar', get label() { return tx('Usar el Modo presentación (proyector)'); }, get hint() { return tx('Armar la lista del culto y manejar la pantalla. Solo el pastor lo tiene de entrada'); } },
  ] },
  { get title() { return tx('Enseñanza'); }, perms: [
    { key: 'ens.ver', get label() { return tx('Ver todas las clases y ministerios'); } },
    { key: 'ens.editar', get label() { return tx('Crear clases y ministerios, asignar maestros'); } },
    { key: 'ens.material', get label() { return tx('Cargar material'); } },
  ] },
  { get title() { return tx('Evangelismo'); }, perms: [
    { key: 'evang.corregir', get label() { return tx('Corregir el mapa, las veredas y las casas'); } },
    { key: 'evang.marcar_otros', get label() { return tx('Marcar calles hechas a nombre de otros'); } },
    { key: 'evang.ver_salidas', get label() { return tx('Ver y arreglar las salidas de todos'); } },
    { key: 'evang.zonas', get label() { return tx('Zonas y rutas'); } },
  ] },
  { get title() { return tx('Informes'); }, perms: [
    { key: 'inf.panel', get label() { return tx('Panel del pastor e informes'); } },
  ] },
  { get title() { return tx('Finanzas'); }, perms: [
    { key: 'fin.ver', get label() { return tx('Ver saldos, movimientos y comprobantes'); } },
    { key: 'fin.cargar', get label() { return tx('Cargar ingresos, gastos y comprobantes'); } },
    { key: 'fin.tesoreria', get label() { return tx('Tesorería: corregir, anular, fondos y pases'); } },
    { key: 'fin.roles', get label() { return tx('Dar roles de finanzas'); } },
  ] },
  { get title() { return tx('Administración'); }, perms: [
    { key: 'admin.permisos', get label() { return tx('Dar roles y permisos'); }, get hint() { return tx('Solo el pastor y el administrador de la app'); } },
    { key: 'admin.iglesia', get label() { return tx('Ajustes de la iglesia y código de ingreso'); } },
  ] },
];

export const ALL_PERMS: Perm[] = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

export type RoleKey = 'app_admin' | 'admin' | 'assistant_pastor' | 'secretary' | 'deacon' | 'captain' | 'evangelism' | 'member';

export const ROLES: { key: RoleKey; label: string; hint: string }[] = [
  { key: 'admin', get label() { return tx('Pastor'); }, get hint() { return tx('Todo. Nadie por debajo lo puede quitar ni limitar.'); } },
  { key: 'app_admin', get label() { return tx('Administrador de la app'); }, get hint() { return tx('Todo, igual que el pastor. Para cuando la app la maneja otra persona.'); } },
  { key: 'assistant_pastor', get label() { return tx('Pastor asistente'); }, get hint() { return tx('Todo menos roles, permisos y finanzas.'); } },
  { key: 'secretary', get label() { return tx('Secretaría'); }, get hint() { return tx('Casi todo. Elegís por persona qué conserva.'); } },
  { key: 'deacon', get label() { return tx('Diácono'); }, get hint() { return tx('Ve personas, asistencia, clases, el panel y los informes.'); } },
  { key: 'captain', get label() { return tx('Jefe de ruta'); }, get hint() { return tx('Su gente, asistencia, anuncios, el panel y el mapa.'); } },
  { key: 'evangelism', get label() { return tx('Coordinador de evangelismo'); }, get hint() { return tx('Corrige el mapa, marca calles por otros y ve todas las salidas.'); } },
  { key: 'member', get label() { return tx('Miembro'); }, get hint() { return tx('Sin permisos especiales.'); } },
];

export const roleLabel = (r: string | null | undefined): string => ROLES.find((x) => x.key === r)?.label ?? tx('Miembro');

export const FIN_ROLES: { key: 'treasurer' | 'secretary' | 'viewer'; label: string; hint: string }[] = [
  { key: 'treasurer', get label() { return tx('Tesorero'); }, get hint() { return tx('Todo con la plata: carga, corrige, anula, fondos, pases y saldos iniciales.'); } },
  { key: 'secretary', get label() { return tx('Auxiliar de tesorería'); }, get hint() { return tx('Carga ingresos, gastos y comprobantes; corrige lo suyo por 7 días.'); } },
  { key: 'viewer', get label() { return tx('Revisor de cuentas'); }, get hint() { return tx('Ve todo y no cambia nada.'); } },
];

const without = (xs: Perm[]) => ALL_PERMS.filter((p) => !xs.includes(p));
export function rolePerms(role: string | null | undefined): Perm[] {
  switch (role) {
    case 'app_admin': case 'admin': return ALL_PERMS;
    case 'assistant_pastor': return ALL_PERMS.filter((p) => !p.startsWith('fin.') && p !== 'admin.permisos' && p !== 'presentar.usar');
    case 'secretary': return without(['admin.permisos', 'fin.tesoreria', 'fin.roles', 'presentar.usar']);
    case 'deacon': return ['personas.ver_todas', 'personas.asistencia', 'personas.privados', 'ens.ver', 'inf.panel'];
    case 'evangelism': return ['evang.corregir', 'evang.marcar_otros', 'evang.ver_salidas', 'evang.zonas'];
    case 'captain': return ['com.anuncios', 'ens.ver', 'personas.asistencia', 'inf.panel', 'evang.corregir', 'personas.privados', 'evang.zonas'];
    default: return [];
  }
}

export const isTopRole = (r: string | null | undefined) => r === 'admin' || r === 'app_admin';

/**
 * ¿Puede usar el Modo presentación? El pastor y el administrador, siempre; los demás, solo si el pastor les dio
 * el permiso "presentar.usar" en Roles y permisos.
 */
export function canPresent(perms: readonly string[], profile: { role?: string | null; extra_roles?: string[] | null } | null | undefined): boolean {
  return perms.includes('presentar.usar') || rolesOf(profile).some(isTopRole);
}

/** Quien ve finanzas, administra o ve los datos de todos tiene que desbloquear la app con Face ID / huella / código.
 *  El miembro común abre la app directo (puede activarlo él si quiere). */
export function needsAppLock(perms: string[]): boolean {
  return perms.some((p) => p.startsWith('fin.') || p.startsWith('admin.') || p === 'inf.panel' || p === 'personas.editar' || p === 'personas.ver_todas');
}

export function financeLevelFromPerms(perms: string[]): number {
  if (perms.includes('fin.roles')) return 4;
  if (perms.includes('fin.tesoreria')) return 3;
  if (perms.includes('fin.cargar')) return 2;
  if (perms.includes('fin.ver')) return 1;
  return 0;
}

/** Todos los roles de una persona: el principal y los extra. */
export function rolesOf(p: { role?: string | null; extra_roles?: string[] | null } | null | undefined): string[] {
  if (!p) return [];
  return [p.role ?? 'member', ...(p.extra_roles ?? [])].filter((r, i, a) => a.indexOf(r) === i);
}
/** ¿Tiene este rol (como principal o extra)? */
export function hasRole(p: { role?: string | null; extra_roles?: string[] | null } | null | undefined, role: string): boolean {
  return rolesOf(p).includes(role);
}
/** "Pastor asistente · Jefe de ruta" */
export function rolesLabel(p: { role?: string | null; extra_roles?: string[] | null } | null | undefined): string {
  const r = rolesOf(p).filter((x) => x !== 'member');
  return r.length ? r.map((x) => roleLabel(x)).join(' · ') : roleLabel('member');
}
