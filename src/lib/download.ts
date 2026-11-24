// Descargar: listas (CSV para Excel) e informes o mapas (imagen). En la web baja el archivo o abre "Imprimir / Guardar como PDF";
// en el teléfono abre el menú para guardarlo en Archivos o Fotos, o mandarlo por WhatsApp o correo.
import { Platform } from 'react-native';
import { demoBlocked } from './demo';

/** "Informe semanal 15/11" -> "informe-semanal-15-11" (sin tildes ni símbolos, para el nombre del archivo). */
export function fileSlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'la-mies';
}

/** Baja un texto (CSV, etc.) como archivo. */
export async function downloadText(fileName: string, content: string, mime = 'text/csv'): Promise<void> {
  if (demoBlocked('Bajar esta lista')) return;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const f = new File(Paths.cache, fileName);
  if (f.exists) f.delete();
  f.create();
  f.write(content);
  const Sharing = await import('expo-sharing');
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: fileName, UTI: mime === 'text/csv' ? 'public.comma-separated-values-text' : undefined });
}

/** Comparte una imagen que ya está en el teléfono (por ejemplo, la foto del mapa). */
export async function shareImageFile(uri: string, title: string): Promise<void> {
  const Sharing = await import('expo-sharing');
  await Sharing.shareAsync(uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
}

/**
 * Descarga lo que se ve en una parte de la pantalla.
 * Teléfono: una imagen de esa parte (completa, aunque haya que bajar para verla). Web: "Imprimir", donde se elige "Guardar como PDF".
 */
export async function downloadView(ref: unknown, title: string): Promise<void> {
  if (Platform.OS === 'web') {
    const prev = document.title;
    document.title = title;
    window.print();
    document.title = prev;
    return;
  }
  const { captureRef } = await import('react-native-view-shot');
  const uri = await captureRef(ref as number, { format: 'png', quality: 1, result: 'tmpfile' });
  await shareImageFile(uri, title);
}
