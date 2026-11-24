// Leer un texto en voz alta con la voz del teléfono o de la computadora (gratis y sin internet).
// En el teléfono hace falta una versión de la app que traiga el lector de voz; si no, speakAvailable es false.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

const web = Platform.OS === 'web';
const hasNative = !web && !!requireOptionalNativeModule('ExpoSpeech');
export const speakAvailable: boolean = web ? typeof window !== 'undefined' && 'speechSynthesis' in window : hasNative;

let token = 0;

/** Lee los pedazos uno atrás del otro. onPart avisa cuál se está leyendo (-1 al terminar o al parar). */
export async function speakParts(parts: string[], onPart: (i: number) => void, rate = 1): Promise<void> {
  stopSpeaking();
  const mine = ++token;
  if (!speakAvailable) return;
  if (web) {
    const say = (i: number) => {
      if (mine !== token) return;
      if (i >= parts.length) { onPart(-1); return; }
      onPart(i);
      const u = new SpeechSynthesisUtterance(parts[i]);
      u.lang = 'es-AR'; u.rate = rate;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('es'));
      if (voice) u.voice = voice;
      u.onend = () => say(i + 1);
      u.onerror = () => { if (mine === token) onPart(-1); };
      window.speechSynthesis.speak(u);
    };
    say(0);
    return;
  }
  const Speech = await import('expo-speech');
  const say = (i: number) => {
    if (mine !== token) return;
    if (i >= parts.length) { onPart(-1); return; }
    onPart(i);
    Speech.speak(parts[i], { language: 'es-AR', rate, onDone: () => say(i + 1), onError: () => { if (mine === token) onPart(-1); } });
  };
  say(0);
}

export function stopSpeaking(): void {
  token++;
  if (!speakAvailable) return;
  if (web) { window.speechSynthesis.cancel(); return; }
  import('expo-speech').then((S) => S.stop()).catch(() => undefined);
}
