// Las letras de las imágenes para compartir: Lora (con serifa, cálida y fácil de leer) para el versículo
// y Playfair Display para la cita. Se cargan recién cuando alguien comparte, para no demorar el arranque.
import * as Font from 'expo-font';

export const VERSE_FONT = 'Lora_600SemiBold';
export const VERSE_FONT_BOLD = 'Lora_700Bold';
export const TITLE_FONT = 'PlayfairDisplay_800ExtraBold';

let loading: Promise<boolean> | null = null;

/** True si las letras quedaron listas; false si no se pudieron cargar (se usa la letra del teléfono). */
export function loadShareFonts(): Promise<boolean> {
  loading ??= Font.loadAsync({
    [VERSE_FONT]: require('@expo-google-fonts/lora/600SemiBold/Lora_600SemiBold.ttf'),
    [VERSE_FONT_BOLD]: require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf'),
    [TITLE_FONT]: require('@expo-google-fonts/playfair-display/800ExtraBold/PlayfairDisplay_800ExtraBold.ttf'),
  }).then(() => true).catch(() => { loading = null; return false; });
  return loading;
}
