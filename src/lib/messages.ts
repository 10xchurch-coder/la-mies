// Mensajes de WhatsApp ya escritos, desde la persona que los manda (no "la iglesia").
// Se abren en el WhatsApp del teléfono con el texto puesto; se pueden cambiar antes de enviar.
import { fillMessage, mergeFollowup, type FollowupConfig } from './followupConfig';
import { Alert, Linking } from 'react-native';
import { whatsappNumber } from './format';
import { showActions } from '../components/ActionSheet';
import type { ChurchService } from '../types';

export type MessageKind = 'firstvisit' | 'secondvisit' | 'promise' | 'followup' | 'missed1' | 'missed2' | 'missed3' | 'visit' | 'plain';

export type MessageContext = {
  /** Nombre de la persona a la que se le escribe. */
  to: string;
  /** Quien escribe (su nombre en la app). */
  from: string | null | undefined;
  church: string | null | undefined;
  /** Día prometido: "sat" | "sun". */
  promiseDay?: string | null;
  services?: ChurchService[];
};

const DAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function firstName(n: string | null | undefined): string {
  return (n ?? '').trim().split(/\s+/)[0] ?? '';
}

function hhmm(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

/** "el domingo a las 10:00" según las reuniones de la iglesia. */
export function serviceWhen(services: ChurchService[] | undefined, promiseDay?: string | null): string {
  const main = (services ?? []).filter((s) => s.active && s.main).sort((a, b) => a.sort_order - b.sort_order);
  const want = promiseDay === 'sat' ? 6 : promiseDay === 'sun' ? 0 : null;
  const s = (want != null ? main.find((x) => x.dow === want) : null) ?? main.find((x) => x.dow === 0) ?? main[0];
  if (!s) return 'este domingo';
  return `el ${DAY[s.dow]} a las ${hhmm(s.time)}`;
}

/** Los mensajes que escribió esta iglesia (Ajustes > Seguimiento y mensajes). Los carga la sesión al entrar. */
let config: FollowupConfig = mergeFollowup(null);
export function setFollowupConfig(raw: unknown): void {
  config = mergeFollowup(raw);
}
export function followupConfig(): FollowupConfig {
  return config;
}

export function messageText(kind: MessageKind, c: MessageContext): string {
  if (kind === 'plain') return '';
  return fillMessage(config.messages[kind], {
    nombre: firstName(c.to),
    yo: firstName(c.from) || 'yo',
    iglesia: c.church ?? 'la iglesia',
    cuando: serviceWhen(c.services, c.promiseDay),
  });
}

export const MESSAGE_LABEL: Record<Exclude<MessageKind, 'plain'>, string> = {
  firstvisit: 'Gracias por visitarnos',
  secondvisit: 'Vino por segunda vez',
  promise: 'Recordarle el culto',
  followup: 'Invitarlo después de conocerlo',
  missed1: 'Lo extrañamos (faltó 1 semana)',
  missed2: 'Coordinar una visita (faltó 2 semanas)',
  missed3: 'Oré por vos (faltó 3 semanas)',
  visit: 'Coordinar una visita',
};

/** Abre WhatsApp con el mensaje escrito. */
export function openWhatsApp(phone: string | null | undefined, text: string): void {
  if (!phone) {
    Alert.alert('Sin teléfono', 'Esta persona no tiene un número cargado.');
    return;
  }
  const url = `https://wa.me/${whatsappNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir WhatsApp'));
}

/** Menú para elegir qué mensaje mandar. */
export function chooseWhatsApp(phone: string | null | undefined, c: MessageContext, kinds: MessageKind[] = ['promise', 'followup', 'visit', 'missed1', 'missed3']): void {
  if (!phone) {
    Alert.alert('Sin teléfono', 'Esta persona no tiene un número cargado.');
    return;
  }
  showActions(`WhatsApp a ${firstName(c.to)}`, 'Elegí un mensaje. Se abre tu WhatsApp con el texto escrito y lo podés cambiar antes de enviarlo.', [
    ...kinds.filter((k): k is Exclude<MessageKind, 'plain'> => k !== 'plain').map((k) => ({ text: MESSAGE_LABEL[k], icon: 'message-circle' as const, hint: messageText(k, c).slice(0, 90) + '…', onPress: () => openWhatsApp(phone, messageText(k, c)) })),
    { text: 'Sin mensaje', icon: 'message-square' as const, onPress: () => openWhatsApp(phone, '') },
  ]);
}
