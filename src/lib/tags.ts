// Lo que se graba en un chip o se pone en un QR: la tarjeta de una persona, la etiqueta de un chico y la etiqueta del adulto que lo retira.
// También la cuenta de cuántos hay adentro en un evento. Sin pantalla ni base, para poder probarse solo.

import { tx } from './i18n';
const PERSON = 'lamies:persona:';
const CHILD = 'lamies:nino:';
const PICKUP = 'lamies:retiro:';
const TICKET = 'lamies:ticket:';
const KEY = /^[0-9a-f]{32}$/;

/** Lo que lleva el chip (o el QR) de una persona. La clave es al azar: no dice quién es. */
export const personPayload = (token: string): string => `${PERSON}${token.trim().toLowerCase()}`;
/** Lo que lleva la etiqueta del chico. */
export const childPayload = (tag: string): string => `${CHILD}${tag.trim().toLowerCase()}`;
/** Lo que lleva la etiqueta del adulto que lo retira. */
export const pickupPayload = (tag: string): string => `${PICKUP}${tag.trim().toLowerCase()}`;

export type TagKind = 'persona' | 'nino' | 'retiro' | 'ticket';
export type ParsedTag = { kind: TagKind; value: string };

/** Del texto leído en un chip o en un QR dice qué es y saca su clave. Null si no es de La Mies. */
export function parseTag(text: string | null | undefined): ParsedTag | null {
  const t = (text ?? '').trim();
  const low = t.toLowerCase();
  const key = (prefix: string): string | null => {
    const v = low.slice(prefix.length).trim();
    return KEY.test(v) ? v : null;
  };
  if (low.startsWith(PERSON)) { const v = key(PERSON); return v ? { kind: 'persona', value: v } : null; }
  if (low.startsWith(CHILD)) { const v = key(CHILD); return v ? { kind: 'nino', value: v } : null; }
  if (low.startsWith(PICKUP)) { const v = key(PICKUP); return v ? { kind: 'retiro', value: v } : null; }
  if (low.startsWith(TICKET)) {
    const v = t.slice(TICKET.length).replace(/[\s-]/g, '').toUpperCase();
    return /^[0-9A-F]{8}$/.test(v) ? { kind: 'ticket', value: v } : null;
  }
  return null;
}

/** La clave de la tarjeta de una persona, o null si el texto no es una tarjeta de persona. */
export const parsePerson = (text: string | null | undefined): string | null => {
  const p = parseTag(text);
  return p?.kind === 'persona' ? p.value : null;
};

/** El código corto que se escribe a mano para retirar a un chico: 4 números. */
export function cleanPickupCode(text: string | null | undefined): string | null {
  const d = (text ?? '').replace(/\D/g, '');
  return d.length === 4 ? d : null;
}

/**
 * Lo que presenta el adulto para retirar a un chico, ya limpio para mandar a la base:
 * el código de 4 números escrito a mano, o la clave de su etiqueta (QR o chip). Null si no sirve.
 * La etiqueta de un chico NO sirve como etiqueta de adulto.
 */
export function adultProof(text: string | null | undefined): string | null {
  const tag = parseTag(text);
  if (tag) return tag.kind === 'retiro' ? tag.value : null;
  return cleanPickupCode(text);
}

export type PickupCheck = 'ok' | 'no' | 'ask';
/**
 * ¿Coincide lo que trae el adulto con el chico?
 * 'ok' coincide · 'no' no coincide · 'ask' no se puede saber acá (hay que preguntarle a la base, que es la que decide).
 * `child.pickupTag` solo se conoce justo después de la entrada; el código sí está siempre en la lista.
 */
export function pickupCheck(child: { code: string; pickupTag?: string | null }, adult: string | null | undefined): PickupCheck {
  const tag = parseTag(adult);
  if (tag) {
    if (tag.kind !== 'retiro') return 'no';
    if (!child.pickupTag) return 'ask';
    return tag.value === child.pickupTag.toLowerCase() ? 'ok' : 'no';
  }
  const code = cleanPickupCode(adult);
  if (!code) return 'no';
  return code === child.code ? 'ok' : 'no';
}

// ---------- La puerta de un evento ----------
export type DoorRow = { people: number; checked_in_at: string | null; checked_out_at: string | null; entrance?: string | null };
export type EntranceCount = { name: string; checked_in: number; inside: number };
export type DoorTotals = { registered: number; checked_in: number; inside: number; gone: number; by_entrance: EntranceCount[] };

/** El nombre de la entrada tal como se guarda: sin espacios de más y de 40 letras como mucho. Vacío = sin nombre. */
export const cleanEntrance = (name: string | null | undefined): string => (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
/** Cómo se muestra una entrada (las que no tienen nombre van juntas). */
export const entranceLabel = (name: string | null | undefined): string => cleanEntrance(name) || tx('Sin nombre');

/**
 * Cuenta personas (no inscripciones): anotados, los que entraron, los que están adentro ahora y los que ya se fueron.
 * Es la misma cuenta que hace la base en event_door_live.
 */
export function doorTotals(rows: DoorRow[]): DoorTotals {
  const t: DoorTotals = { registered: 0, checked_in: 0, inside: 0, gone: 0, by_entrance: [] };
  const by = new Map<string, EntranceCount>();
  for (const r of rows) {
    const n = Math.max(0, Math.floor(Number(r.people) || 0));
    t.registered += n;
    if (!r.checked_in_at) continue;      // el que nunca entró no está adentro, aunque tenga marcada una salida
    t.checked_in += n;
    const inside = !r.checked_out_at;
    if (inside) t.inside += n; else t.gone += n;
    const name = cleanEntrance(r.entrance);
    const e = by.get(name) ?? { name, checked_in: 0, inside: 0 };
    e.checked_in += n;
    if (inside) e.inside += n;
    by.set(name, e);
  }
  t.by_entrance = [...by.values()].sort((a, b) => b.checked_in - a.checked_in || a.name.localeCompare(b.name));
  return t;
}

/** Qué tan lleno está el lugar, de 0 a 100. Null si el evento no tiene cupo. */
export function fillPercent(inside: number, capacity: number | null | undefined): number | null {
  if (!capacity || capacity <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((inside / capacity) * 100)));
}

export type ScanResult = 'in' | 'back' | 'already' | 'out' | 'already_out' | 'not_in';
/** El cartel que ve quien atiende la puerta después de leer una credencial. */
export function scanFlash(result: ScanResult, name: string, people = 1): { tone: 'green' | 'amber' | 'red'; text: string } {
  const many = people > 1 ? tx(' ({people} personas)', { people }) : '';
  switch (result) {
    case 'in': return { tone: 'green', text: tx('✓ Entró {name}{many}', { name, many }) };
    case 'back': return { tone: 'green', text: tx('✓ {name} volvió a entrar{many}', { name, many }) };
    case 'already': return { tone: 'amber', text: tx('{name}: esta entrada ya se usó y sigue adentro', { name }) };
    case 'out': return { tone: 'green', text: tx('✓ Salió {name}{many}', { name, many }) };
    case 'already_out': return { tone: 'amber', text: tx('{name} ya había salido', { name }) };
    default: return { tone: 'red', text: tx('{name} todavía no entró', { name }) };
  }
}
