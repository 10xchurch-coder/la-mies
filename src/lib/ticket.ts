// La entrada de un evento: el código corto que va en el QR y cómo se lee de vuelta. Sin pantalla ni base.

const PREFIX = 'lamies:ticket:';

/** Lo que lleva el QR de la entrada. */
export const ticketPayload = (code: string): string => `${PREFIX}${code.trim().toUpperCase()}`;

/** Del texto que lee la cámara (o que se escribe a mano) saca el código, o null si no es una entrada. */
export function parseTicket(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const body = t.toLowerCase().startsWith(PREFIX) ? t.slice(PREFIX.length) : t;
  const code = body.replace(/[\s-]/g, '').toUpperCase();
  return /^[0-9A-F]{8}$/.test(code) ? code : null;
}

/** "1A2B3C4D" -> "1A2B-3C4D", más fácil de leer y de dictar. */
export const showCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;
