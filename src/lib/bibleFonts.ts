// Carga la letra elegida para leer la Biblia, recién cuando hace falta (así la app no arranca más lento).
import * as Font from 'expo-font';
import type { BibleFontId } from './bibleLook';

const FILES: Record<Exclude<BibleFontId, 'sistema'>, () => Record<string, number>> = {
  lora: () => ({ Lora_400Regular: require('@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf'), Lora_700Bold: require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf') }),
  merriweather: () => ({ Merriweather_400Regular: require('@expo-google-fonts/merriweather/400Regular/Merriweather_400Regular.ttf'), Merriweather_700Bold: require('@expo-google-fonts/merriweather/700Bold/Merriweather_700Bold.ttf') }),
  literata: () => ({ Literata_400Regular: require('@expo-google-fonts/literata/400Regular/Literata_400Regular.ttf'), Literata_700Bold: require('@expo-google-fonts/literata/700Bold/Literata_700Bold.ttf') }),
  garamond: () => ({ EBGaramond_400Regular: require('@expo-google-fonts/eb-garamond/400Regular/EBGaramond_400Regular.ttf'), EBGaramond_700Bold: require('@expo-google-fonts/eb-garamond/700Bold/EBGaramond_700Bold.ttf') }),
  noto: () => ({ NotoSerif_400Regular: require('@expo-google-fonts/noto-serif/400Regular/NotoSerif_400Regular.ttf'), NotoSerif_700Bold: require('@expo-google-fonts/noto-serif/700Bold/NotoSerif_700Bold.ttf') }),
  opensans: () => ({ OpenSans_400Regular: require('@expo-google-fonts/open-sans/400Regular/OpenSans_400Regular.ttf'), OpenSans_700Bold: require('@expo-google-fonts/open-sans/700Bold/OpenSans_700Bold.ttf') }),
  atkinson: () => ({ AtkinsonHyperlegible_400Regular: require('@expo-google-fonts/atkinson-hyperlegible/400Regular/AtkinsonHyperlegible_400Regular.ttf'), AtkinsonHyperlegible_700Bold: require('@expo-google-fonts/atkinson-hyperlegible/700Bold/AtkinsonHyperlegible_700Bold.ttf') }),
};
const done = new Map<string, Promise<boolean>>();

/** True cuando la letra quedó lista. False si no se pudo cargar: se lee con la letra del teléfono. */
export function loadBibleFont(id: BibleFontId): Promise<boolean> {
  if (id === 'sistema') return Promise.resolve(true);
  let p = done.get(id);
  if (!p) {
    p = Font.loadAsync(FILES[id]()).then(() => true).catch(() => { done.delete(id); return false; });
    done.set(id, p);
  }
  return p;
}
