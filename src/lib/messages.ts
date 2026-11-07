// Mensajes de WhatsApp ya escritos, desde la persona que los manda (no "la iglesia").
// Se abren en el WhatsApp del teléfono con el texto puesto; se pueden cambiar antes de enviar.
import { Alert, Linking } from 'react-native';
import { whatsappNumber } from './format';
import { showActions } from '../components/ActionSheet';
import type { ChurchService } from '../types';

export type MessageKind = 'promise' | 'followup' | 'missed1' | 'missed2' | 'missed3' | 'visit' | 'plain';

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

export function messageText(kind: MessageKind, c: MessageContext): string {
  const to = firstName(c.to);
  const me = firstName(c.from) || 'yo';
  const ch = c.church ?? 'la iglesia';
  const when = serviceWhen(c.services, c.promiseDay);
  switch (kind) {
    case 'promise':
      return `Hola ${to}, soy ${me} de ${ch}. Te escribo para recordarte que ${when} tenemos el culto. ¡Me encantaría verte ahí! Si necesitás que te pasemos a buscar, avisame.`;
    case 'followup':
      return `Hola ${to}, soy ${me} de ${ch}. Fue una alegría conocerte. Te quería invitar: ${when} tenemos el culto y me encantaría que vengas. ¿Te puedo ayudar en algo?`;
    case 'missed1':
      return `Hola ${to}, soy ${me}. ¡Te extrañamos este fin de semana en la iglesia! Quería saber cómo estás. ¿Hay algo en lo que te podamos ayudar, o algo por lo que podamos orar?`;
    case 'missed2':
      return `Hola ${to}, soy ${me}. Hace dos semanas que no te vemos y te extrañamos mucho. Me gustaría pasar a visitarte esta semana. ¿Qué día y horario te queda bien?`;
    case 'missed3':
      return `Hola ${to}, soy ${me}. Recién oré por vos. Espero que estés bien. Dios te ama; buscalo de todo corazón y Él te va a sostener. Te esperamos ${when}.`;
    case 'visit':
      return `Hola ${to}, soy ${me} de ${ch}. Me gustaría pasar a visitarte esta semana. ¿Qué día y horario te queda bien?`;
    default:
      return '';
  }
}

export const MESSAGE_LABEL: Record<Exclude<MessageKind, 'plain'>, string> = {
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
