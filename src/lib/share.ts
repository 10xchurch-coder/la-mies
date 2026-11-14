// Compartir: una imagen (la tarjeta del versículo) o un texto, en el teléfono o en la web.
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export const WEB_URL = 'https://10xchurch-coder.github.io/la-mies';

/** Comparte un texto con las apps del teléfono (WhatsApp, Instagram…). En la web, usa el menú del navegador o copia. */
export async function shareText(text: string, title = 'La Mies'): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator & { share?: (d: { text: string; title?: string }) => Promise<void> };
    if (nav?.share) {
      try {
        await nav.share({ text, title });
        return 'shared';
      } catch {
        /* el usuario canceló o el navegador no deja: se copia */
      }
    }
    await Clipboard.setStringAsync(text);
    return 'copied';
  }
  await Share.share({ message: text, title });
  return 'shared';
}

/**
 * Abre el menú de compartir del teléfono con un texto. No copia nada por su cuenta:
 * si el navegador no deja compartir, devuelve 'failed' para que la pantalla ofrezca WhatsApp o copiar.
 */
export async function tryShareText(text: string, title = 'La Mies'): Promise<'shared' | 'cancelled' | 'failed'> {
  if (Platform.OS !== 'web') {
    await Share.share({ message: text, title });
    return 'shared';
  }
  const nav = globalThis.navigator as Navigator & { share?: (d: { text: string; title?: string }) => Promise<void> };
  if (!nav?.share) return 'failed';
  try {
    await nav.share({ text, title });
    return 'shared';
  } catch (e) {
    return (e as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** Comparte una imagen capturada de un componente (solo teléfono). Devuelve false si no se pudo. */
export async function shareImage(captureRef: () => Promise<string>): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = await captureRef();
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir versículo' });
  return true;
}
