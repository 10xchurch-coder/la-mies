// Fotos y archivos: elegir, achicar, subir a Supabase Storage y mostrar con links firmados.
// Cada archivo vive en una carpeta con el id de la iglesia; la base solo deja leer
// los de la propia iglesia (ver 0004_church.sql).
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { supabase, errorMessage } from './supabase';

export type Bucket = 'photos' | 'materials' | 'sermons' | 'finance' | 'chat';
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // límite del plan gratuito de Supabase

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function safeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-60);
}

async function upload(bucket: Bucket, churchId: string, uri: string, name: string, contentType: string): Promise<string> {
  const path = `${churchId}/${randomId()}-${safeName(name)}`;
  const body = Platform.OS === 'web' ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(errorMessage(error));
  return path;
}

/** Pregunta cámara o galería, deja recortar en cuadrado, achica a 480 px y sube. Devuelve la ruta o null. */
export async function pickAndUploadPhoto(churchId: string, o: { free?: boolean; width?: number } = {}): Promise<string | null> {
  const source = await new Promise<'camera' | 'library' | null>((resolve) => {
    Alert.alert('Foto', '¿De dónde sacamos la foto?', [
      { text: 'Sacar foto', onPress: () => resolve('camera') },
      { text: 'Elegir de la galería', onPress: () => resolve('library') },
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
  if (!source) return null;
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Sin permiso', source === 'camera' ? 'Activá el permiso de cámara en Ajustes del teléfono.' : 'Activá el permiso de fotos en Ajustes del teléfono.');
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = o.free ? { mediaTypes: ['images'], allowsEditing: false, quality: 0.85 } : { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const small = await manipulateAsync(res.assets[0].uri, [{ resize: { width: o.width ?? 480 } }], { compress: 0.7, format: SaveFormat.JPEG });
  return upload('photos', churchId, small.uri, 'foto.jpg', 'image/jpeg');
}

export type PickedFile = { uri: string; name: string; size: number | null; mimeType: string };

export async function pickDocument(kind: 'audio' | 'any'): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: kind === 'audio' ? ['audio/*'] : ['application/pdf', 'audio/*', 'image/*', 'application/*', 'text/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.size && a.size > MAX_FILE_BYTES) {
    Alert.alert('Archivo muy grande', 'El máximo es 50 MB. Para audios largos, exportalo en MP3 a 64 kbps (una hora pesa unos 28 MB).');
    return null;
  }
  return { uri: a.uri, name: a.name, size: a.size ?? null, mimeType: a.mimeType ?? 'application/octet-stream' };
}

export function uploadPicked(bucket: Bucket, churchId: string, f: PickedFile): Promise<string> {
  return upload(bucket, churchId, f.uri, f.name, f.mimeType);
}

// ---------- Links firmados (se piden en lote y se guardan una hora) ----------
const cache = new Map<string, { url: string; until: number }>();
const queue = new Map<Bucket, Map<string, ((u: string | null) => void)[]>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const work = [...queue.entries()];
  queue.clear();
  for (const [bucket, items] of work) {
    const paths = [...items.keys()];
    try {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
      const byPath = new Map((data ?? []).map((d) => [d.path ?? '', d.signedUrl ?? null]));
      for (const [p, cbs] of items) {
        const url = byPath.get(p) ?? null;
        if (url) cache.set(`${bucket}/${p}`, { url, until: Date.now() + 50 * 60 * 1000 });
        cbs.forEach((cb) => cb(url));
      }
    } catch {
      items.forEach((cbs) => cbs.forEach((cb) => cb(null)));
    }
  }
}

export function signedUrl(bucket: Bucket, path: string | null | undefined): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  const hit = cache.get(`${bucket}/${path}`);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    let b = queue.get(bucket);
    if (!b) queue.set(bucket, (b = new Map()));
    const list = b.get(path) ?? [];
    list.push(resolve);
    b.set(path, list);
    if (!timer) timer = setTimeout(flush, 40);
  });
}

export function cachedSignedUrl(bucket: Bucket, path: string | null | undefined): string | null {
  if (!path) return null;
  const hit = cache.get(`${bucket}/${path}`);
  return hit && hit.until > Date.now() ? hit.url : null;
}

/** Link para descargar con el nombre original. */
export async function downloadUrl(bucket: Bucket, path: string, name?: string | null): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, name ? { download: name } : undefined);
  return data?.signedUrl ?? null;
}

// ---------- Finanzas: comprobantes en carpetas por mes ----------
export type FinPhoto = { path: string; name: string };

/** Saca o elige la foto del recibo / pantalla del banco (o un PDF) y la sube a finance/<iglesia>/<AAAA-MM>/. */
export async function pickAndUploadReceipt(churchId: string, month: string, label: string): Promise<FinPhoto | null> {
  const source = await new Promise<'camera' | 'library' | 'file' | null>((resolve) => {
    Alert.alert(label, '¿De dónde?', [
      { text: 'Sacar foto', onPress: () => resolve('camera') },
      { text: 'Elegir de la galería', onPress: () => resolve('library') },
      { text: 'Archivo (PDF)', onPress: () => resolve('file') },
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
  if (!source) return null;
  const folder = `finance/${churchId}/${month}`;
  if (source === 'file') {
    const f = await pickDocument('any');
    if (!f) return null;
    if (f.size && f.size > 15 * 1024 * 1024) { Alert.alert('Archivo muy grande', 'El máximo es 15 MB.'); return null; }
    const path = `${folder}/${randomId()}-${safeName(f.name)}`;
    const body = Platform.OS === 'web' ? await (await fetch(f.uri)).arrayBuffer() : await new File(f.uri).arrayBuffer();
    const { error } = await supabase.storage.from('finance').upload(path, body, { contentType: f.mimeType, upsert: false });
    if (error) throw new Error(errorMessage(error));
    return { path, name: f.name };
  }
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Sin permiso', source === 'camera' ? 'Activá el permiso de cámara en Ajustes del teléfono.' : 'Activá el permiso de fotos en Ajustes del teléfono.');
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 0.9 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  // Se achica a 1600 px de ancho: se leen bien los números y pesa poco.
  const resize = a.width && a.width > 1600 ? [{ resize: { width: 1600 } }] : [];
  const img = await manipulateAsync(a.uri, resize, { compress: 0.75, format: SaveFormat.JPEG });
  const path = `${folder}/${randomId()}.jpg`;
  const body = Platform.OS === 'web' ? await (await fetch(img.uri)).arrayBuffer() : await new File(img.uri).arrayBuffer();
  const { error } = await supabase.storage.from('finance').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(errorMessage(error));
  return { path, name: a.fileName ?? 'foto.jpg' };
}

// ---------- Chat: fotos, GIF y documentos ----------
export type ChatAttachment = { path: string; name: string; size: number; kind: 'image' | 'file' };
const CHAT_MAX_BYTES = 15 * 1024 * 1024;

/** Saca una foto o elige una de la galería (los GIF se mandan tal cual, para que se muevan). */
export async function pickChatImage(churchId: string, source: 'camera' | 'library'): Promise<ChatAttachment | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Sin permiso', source === 'camera' ? 'Activá el permiso de cámara en Ajustes del teléfono.' : 'Activá el permiso de fotos en Ajustes del teléfono.');
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 0.9 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const isGif = a.mimeType === 'image/gif' || /\.gif$/i.test(a.fileName ?? a.uri);
  if (isGif) {
    if (a.fileSize && a.fileSize > CHAT_MAX_BYTES) { Alert.alert('GIF muy grande', 'El máximo es 15 MB.'); return null; }
    const path = await upload('chat', churchId, a.uri, a.fileName ?? 'animacion.gif', 'image/gif');
    return { path, name: a.fileName ?? 'animacion.gif', size: a.fileSize ?? 0, kind: 'image' };
  }
  const resize = a.width && a.width > 1280 ? [{ resize: { width: 1280 } }] : [];
  const img = await manipulateAsync(a.uri, resize, { compress: 0.75, format: SaveFormat.JPEG });
  const path = await upload('chat', churchId, img.uri, 'foto.jpg', 'image/jpeg');
  return { path, name: 'foto.jpg', size: 0, kind: 'image' };
}

/** Elige un documento (PDF, Word, Excel, PowerPoint o texto) de hasta 15 MB. */
export async function pickChatDocument(churchId: string): Promise<ChatAttachment | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.size && a.size > CHAT_MAX_BYTES) { Alert.alert('Archivo muy grande', 'El máximo es 15 MB.'); return null; }
  const path = await upload('chat', churchId, a.uri, a.name, a.mimeType ?? 'application/octet-stream');
  return { path, name: a.name, size: a.size ?? 0, kind: 'file' };
}
