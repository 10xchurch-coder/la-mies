// Permisos y roles. Lo mismo que public.all_perms() y public.role_perms() en la base.

export type Perm =
  | 'personas.ver_todas' | 'personas.editar' | 'personas.asistencia' | 'personas.privados'
  | 'com.anuncios' | 'com.moderar' | 'cal.editar' | 'predicas.subir' | 'devocional.editar'
  | 'ens.ver' | 'ens.editar' | 'ens.material'
  | 'evang.corregir' | 'evang.marcar_otros' | 'evang.ver_salidas' | 'evang.zonas'
  | 'inf.panel' | 'fin.ver' | 'fin.cargar' | 'fin.tesoreria' | 'fin.roles'
  | 'admin.permisos' | 'admin.iglesia';

export const PERM_GROUPS: { title: string; perms: { key: Perm; label: string; hint?: string }[] }[] = [
  { title: 'Personas', perms: [
    { key: 'personas.ver_todas', label: 'Ver a todas las personas', hint: 'Si no, cada uno ve solo a los suyos' },
    { key: 'personas.editar', label: 'Cargar y editar miembros' },
    { key: 'personas.asistencia', label: 'Tomar asistencia' },
    { key: 'personas.privados', label: 'Ver teléfonos y domicilios de los hermanos' },
  ] },
  { title: 'Comunicación', perms: [
    { key: 'com.anuncios', label: 'Mandar anuncios a toda la iglesia' },
    { key: 'com.moderar', label: 'Moderar oración, comentarios, denuncias y sugerencias' },
  ] },
  { title: 'Calendario y contenido', perms: [
    { key: 'cal.editar', label: 'Editar el calendario y los horarios' },
    { key: 'predicas.subir', label: 'Subir prédicas y manejar la transmisión' },
    { key: 'devocional.editar', label: 'Editar el devocional, Crecimiento y Capacitación' },
  ] },
  { title: 'Enseñanza', perms: [
    { key: 'ens.ver', label: 'Ver todas las clases y ministerios' },
    { key: 'ens.editar', label: 'Crear clases y ministerios, asignar maestros' },
    { key: 'ens.material', label: 'Cargar material' },
  ] },
  { title: 'Evangelismo', perms: [
    { key: 'evang.corregir', label: 'Corregir el mapa, las veredas y las casas' },
    { key: 'evang.marcar_otros', label: 'Marcar calles hechas a nombre de otros' },
    { key: 'evang.ver_salidas', label: 'Ver y arreglar las salidas de todos' },
    { key: 'evang.zonas', label: 'Zonas y rutas' },
  ] },
  { title: 'Informes', perms: [
    { key: 'inf.panel', label: 'Panel del pastor e informes' },
  ] },
  { title: 'Finanzas', perms: [
    { key: 'fin.ver', label: 'Ver saldos, movimientos y comprobantes' },
    { key: 'fin.cargar', label: 'Cargar ingresos, gastos y comprobantes' },
    { key: 'fin.tesoreria', label: 'Tesorería: corregir, anular, fondos y pases' },
    { key: 'fin.roles', label: 'Dar roles de finanzas' },
  ] },
  { title: 'Administración', perms: [
    { key: 'admin.permisos', label: 'Dar roles y permisos', hint: 'Solo el pastor y el administrador de la app' },
    { key: 'admin.iglesia', label: 'Ajustes de la iglesia y código de ingreso' },
  ] },
];

export const ALL_PERMS: Perm[] = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

export type RoleKey = 'app_admin' | 'admin' | 'assistant_pastor' | 'secretary' | 'deacon' | 'captain' | 'evangelism' | 'member';

export const ROLES: { key: RoleKey; label: string; hint: string }[] = [
  { key: 'admin', label: 'Pastor', hint: 'Todo. Nadie por debajo lo puede quitar ni limitar.' },
  { key: 'app_admin', label: 'Administrador de la app', hint: 'Todo, igual que el pastor. Para cuando la app la maneja otra persona.' },
  { key: 'assistant_pastor', label: 'Pastor asistente', hint: 'Todo menos roles, permisos y finanzas.' },
  { key: 'secretary', label: 'Secretaría', hint: 'Casi todo. Elegís por persona qué conserva.' },
  { key: 'deacon', label: 'Diácono', hint: 'Ve personas, asistencia, clases, el panel y los informes.' },
  { key: 'captain', label: 'Jefe de ruta', hint: 'Su gente, asistencia, anuncios, el panel y el mapa.' },
  { key: 'evangelism', label: 'Coordinador de evangelismo', hint: 'Corrige el mapa, marca calles por otros y ve todas las salidas.' },
  { key: 'member', label: 'Miembro', hint: 'Sin permisos especiales.' },
];

export const roleLabel = (r: string | null | undefined): string => ROLES.find((x) => x.key === r)?.label ?? 'Miembro';

export const FIN_ROLES: { key: 'treasurer' | 'secretary' | 'viewer'; label: string; hint: string }[] = [
  { key: 'treasurer', label: 'Tesorero', hint: 'Todo con la plata: carga, corrige, anula, fondos, pases y saldos iniciales.' },
  { key: 'secretary', label: 'Auxiliar de tesorería', hint: 'Carga ingresos, gastos y comprobantes; corrige lo suyo por 7 días.' },
  { key: 'viewer', label: 'Revisor de cuentas', hint: 'Ve todo y no cambia nada.' },
];

const without = (xs: Perm[]) => ALL_PERMS.filter((p) => !xs.includes(p));
export function rolePerms(role: string | null | undefined): Perm[] {
  switch (role) {
    case 'app_admin': case 'admin': return ALL_PERMS;
    case 'assistant_pastor': return ALL_PERMS.filter((p) => !p.startsWith('fin.') && p !== 'admin.permisos');
    case 'secretary': return without(['admin.permisos', 'fin.tesoreria', 'fin.roles']);
    case 'deacon': return ['personas.ver_todas', 'personas.asistencia', 'personas.privados', 'ens.ver', 'inf.panel'];
    case 'evangelism': return ['evang.corregir', 'evang.marcar_otros', 'evang.ver_salidas', 'evang.zonas'];
    case 'captain': return ['com.anuncios', 'ens.ver', 'personas.asistencia', 'inf.panel', 'evang.corregir', 'personas.privados', 'evang.zonas'];
    default: return [];
  }
}

export const isTopRole = (r: string | null | undefined) => r === 'admin' || r === 'app_admin';

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
