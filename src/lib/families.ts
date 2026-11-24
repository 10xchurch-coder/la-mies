// Familias: una familia es solo un vínculo entre personas (papá, mamá, hijos, abuelos...).
// Que uno venga NO quiere decir que vino la familia: la asistencia y el seguimiento son de cada persona.
// Acá no hay nada de la base ni de la pantalla, para poder probarse solo.

export type FamilyRole = 'padre' | 'madre' | 'hijo' | 'hija' | 'abuelo' | 'abuela' | 'otro';

export const FAMILY_ROLES: { value: FamilyRole; label: string }[] = [
  { value: 'padre', label: 'Papá' },
  { value: 'madre', label: 'Mamá' },
  { value: 'hijo', label: 'Hijo' },
  { value: 'hija', label: 'Hija' },
  { value: 'abuelo', label: 'Abuelo' },
  { value: 'abuela', label: 'Abuela' },
  { value: 'otro', label: 'Otro familiar' },
];

const LABEL = new Map(FAMILY_ROLES.map((r) => [r.value, r.label]));
export const roleLabel = (r: string | null | undefined): string => LABEL.get(r as FamilyRole) ?? 'Familiar';

export const isChildRole = (r: string | null | undefined): boolean => r === 'hijo' || r === 'hija';

/** Lo que devuelve la base por cada integrante (household_family). */
export type FamilyMember = {
  household_id: string;
  household_name: string;
  contact_id: string;
  name: string;
  photo_path: string | null;
  role: FamilyRole;
  can_pickup: boolean;
  age: number | null;
  has_account: boolean;
  can_open: boolean;
  can_manage: boolean;
};

const ORDER: Record<FamilyRole, number> = { padre: 1, madre: 2, hijo: 3, hija: 3, abuelo: 4, abuela: 4, otro: 5 };

/** Primero los papás, después los hijos (del más grande al más chico), los abuelos y el resto. */
export function sortFamily<T extends { role: string; name: string; age?: number | null }>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const d = (ORDER[a.role as FamilyRole] ?? 9) - (ORDER[b.role as FamilyRole] ?? 9);
    if (d) return d;
    if (isChildRole(a.role) && a.age != null && b.age != null && a.age !== b.age) return b.age - a.age;
    return a.name.localeCompare(b.name, 'es');
  });
}

/** Los grandes de la familia que pueden retirar a un chico (nunca otro hijo, nunca el mismo chico). */
export function pickupAdults<T extends { contact_id: string; role: string; can_pickup: boolean }>(members: T[], childId?: string): T[] {
  return members.filter((m) => m.can_pickup && !isChildRole(m.role) && m.contact_id !== childId);
}

/** "Rubén Sosa" -> "Familia Sosa". Es solo una idea para el nombre: se puede cambiar. */
export function familyNameFor(personName: string | null | undefined): string {
  const words = (personName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return 'Familia';
  return `Familia ${words[words.length - 1]}`;
}

/** El lugar más probable de una persona en la familia, por su edad y su sexo. Siempre se puede cambiar. */
export function suggestRole(p: { sex?: 'm' | 'f' | null; age?: number | null }): FamilyRole {
  const young = p.age != null && p.age < 18;
  if (young) return p.sex === 'f' ? 'hija' : 'hijo';
  if (p.sex === 'm') return 'padre';
  if (p.sex === 'f') return 'madre';
  return 'otro';
}

export type FamilyGroup<T> = { key: string; title: string; rows: T[] };

/**
 * Agrupa una lista de personas por familia (para el directorio y las listas).
 * Las familias van por orden de nombre; al final, los que no tienen familia cargada.
 * Agrupar es solo para verlos juntos: no cambia nada de la asistencia de nadie.
 */
export function groupByFamily<T>(rows: T[], familyOf: (row: T) => { id: string; name: string } | null | undefined, noFamilyTitle = 'Sin familia cargada'): FamilyGroup<T>[] {
  const groups = new Map<string, FamilyGroup<T>>();
  const alone: T[] = [];
  for (const r of rows) {
    const f = familyOf(r);
    if (!f) { alone.push(r); continue; }
    const g = groups.get(f.id) ?? { key: f.id, title: f.name, rows: [] };
    g.rows.push(r);
    groups.set(f.id, g);
  }
  const out = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  if (alone.length) out.push({ key: 'sin-familia', title: noFamilyTitle, rows: alone });
  return out;
}
