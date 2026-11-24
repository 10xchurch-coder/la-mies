// Fotos y archivos: elegir, achicar, subir a Supabase Storage y mostrar con links firmados.
// Cada archivo vive en una carpeta con el id de la iglesia; la base solo deja leer
// los de la propia iglesia (ver 0004_church.sql).
import { Alert, Image as RNImage, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { supabase, errorMessage } from './supabase';
import { cropPhoto } from '@/components/PhotoCropper';

export type Bucket = 'photos' | 'materials' | 'sermons' | 'finance' | 'chat' | 'missionaries' | 'present';
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

/** Tamaño real de una foto (si el selector no lo dio). */
function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => RNImage.getSize(uri, (width, height) => resolve({ width, height }), () => resolve({ width: 0, height: 0 })));
}

/** Muestra el recortador (acercar, alejar, mover) y deja la foto cuadrada del ancho pedido. Null si canceló. */
async function cropAndShrink(uri: string, w: number, h: number, width: number, round = true, aspect = 1, text: { title?: string; hint?: string } = {}): Promise<string | null> {
  if (!w || !h) ({ width: w, height: h } = await imageSize(uri));
  const crop = await cropPhoto(uri, w, h, round, aspect, text);
  if (!crop) return null;
  const out = await manipulateAsync(uri, [{ crop }, { resize: { width: Math.min(width, crop.width) } }], { compress: 0.75, format: SaveFormat.JPEG });
  return out.uri;
}

/** Trae una foto que ya está subida para volver a acomodarla. */
async function localCopy(bucket: Bucket, path: string): Promise<string | null> {
  const url = await signedUrl(bucket, path);
  if (!url) return null;
  if (Platform.OS === 'web') return URL.createObjectURL(await (await fetch(url)).blob());
  const { File: F, Paths } = await import('expo-file-system');
  const dest = new F(Paths.cache, `ajustar-${randomId()}.jpg`);
  const got = await F.downloadFileAsync(url, dest);
  return got.uri;
}

/**
 * Pregunta cámara o galería (o acomodar la foto que ya tiene), deja acercar, alejar y mover la foto
 * dentro del cuadro, la achica y la sube. Devuelve la ruta nueva o null.
 */
export async function pickAndUploadPhoto(churchId: string, o: { free?: boolean; width?: number; current?: string | null } = {}): Promise<string | null> {
  const source = await new Promise<'camera' | 'library' | 'current' | null>((resolve) => {
    Alert.alert('Foto', '¿De dónde sacamos la foto?', [
      { text: 'Sacar foto', onPress: () => resolve('camera') },
      { text: 'Elegir de la galería', onPress: () => resolve('library') },
      ...(o.current && !o.free ? [{ text: 'Acomodar la foto actual', onPress: () => resolve('current' as const) }] : []),
      { text: 'Cancelar', style: 'cancel' as const, onPress: () => resolve(null) },
    ]);
  });
  if (!source) return null;
  if (source === 'current') {
    const uri = o.current ? await localCopy('photos', o.current) : null;
    if (!uri) { Alert.alert('No se pudo abrir la foto actual'); return null; }
    const done = await cropAndShrink(uri, 0, 0, o.width ?? 640);
    return done ? upload('photos', churchId, done, 'foto.jpg', 'image/jpeg') : null;
  }
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Sin permiso', source === 'camera' ? 'Activá el permiso de cámara en Ajustes del teléfono.' : 'Activá el permiso de fotos en Ajustes del teléfono.');
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: o.free ? 0.85 : 0.9 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (o.free) {
    const small = await manipulateAsync(a.uri, [{ resize: { width: o.width ?? 480 } }], { compress: 0.7, format: SaveFormat.JPEG });
    return upload('photos', churchId, small.uri, 'foto.jpg', 'image/jpeg');
  }
  const done = await cropAndShrink(a.uri, a.width, a.height, o.width ?? 640);
  return done ? upload('photos', churchId, done, 'foto.jpg', 'image/jpeg') : null;
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

/** Sube un mensaje de voz recién grabado. */
export async function uploadChatVoice(churchId: string, uri: string): Promise<ChatAttachment> {
  const web = Platform.OS === 'web';
  const blobType = web ? (await (await fetch(uri)).blob()).type : '';
  const ext = web ? (blobType.includes('mp4') ? 'm4a' : blobType.includes('ogg') ? 'ogg' : 'webm') : 'm4a';
  const name = `voz-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`;
  const path = await upload('chat', churchId, uri, name, ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`);
  return { path, name, size: 0, kind: 'file' };
}

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

// ---------- Misioneros: foto, PDF del informe y fotos del mes ----------
const BIG = { title: '1 de 2: la foto grande', hint: 'Así se ve arriba en el perfil del misionero.' };
const CIRCLE = { title: '2 de 2: el círculo', hint: 'Así se ve en la lista. Acercala para que se vean bien las caras.' };

/** Foto del misionero: primero la grande del perfil, después el círculo de la lista (de la misma foto). */
export async function pickMissionaryPhoto(churchId: string): Promise<{ photo: string; thumb: string | null } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('Sin permiso', 'Activá el permiso de fotos en Ajustes del teléfono.'); return null; }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const big = await cropAndShrink(a.uri, a.width, a.height, 1000, false, 4 / 3, BIG);
  if (!big) return null;
  const photo = await upload('missionaries', churchId, big, 'misionero.jpg', 'image/jpeg');
  const small = await cropAndShrink(a.uri, a.width, a.height, 400, true, 1, CIRCLE);
  const thumb = small ? await upload('missionaries', churchId, small, 'misionero-circulo.jpg', 'image/jpeg') : null;
  return { photo, thumb };
}

/** Volver a acomodar solo el círculo, a partir de la foto grande que ya está. */
export async function adjustMissionaryThumb(churchId: string, photoPath: string): Promise<string | null> {
  const uri = await localCopy('missionaries', photoPath);
  if (!uri) { Alert.alert('No se pudo abrir la foto'); return null; }
  const small = await cropAndShrink(uri, 0, 0, 400, true, 1, { title: 'El círculo', hint: CIRCLE.hint });
  return small ? upload('missionaries', churchId, small, 'misionero-circulo.jpg', 'image/jpeg') : null;
}

/** El PDF del informe del mes (hasta 25 MB). */
export async function pickMissionaryPdf(churchId: string): Promise<{ path: string; name: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.size && a.size > 25 * 1024 * 1024) { Alert.alert('Archivo muy grande', 'El PDF pesa más de 25 MB. Probá achicarlo antes de subirlo.'); return null; }
  const path = await upload('missionaries', churchId, a.uri, a.name, 'application/pdf');
  return { path, name: a.name };
}

/** Varias fotos del mes a la vez, cada una achicada a 1600 px. Devuelve las rutas. */
export async function pickMissionaryPhotos(churchId: string, max: number): Promise<string[]> {
  if (max <= 0) return [];
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('Sin permiso', 'Activá el permiso de fotos en Ajustes del teléfono.'); return []; }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max, quality: 0.9 });
  if (res.canceled || !res.assets?.length) return [];
  const out: string[] = [];
  for (const a of res.assets.slice(0, max)) {
    const resize = a.width && a.width > 1600 ? [{ resize: { width: 1600 } }] : [];
    const img = await manipulateAsync(a.uri, resize, { compress: 0.75, format: SaveFormat.JPEG });
    out.push(await upload('missionaries', churchId, img.uri, 'foto.jpg', 'image/jpeg'));
  }
  return out;
}

/** Borra archivos de misioneros que ya no se usan. Si falla no pasa nada: solo quedan huérfanos. */
export async function removeMissionaryFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  await supabase.storage.from('missionaries').remove(list).catch(() => undefined);
}

// ---------- Modo presentación: fotos, videos y música para el proyector ----------
const PRESENT_TEXT = {
  image: { word: 'La foto', types: ['image/*'] },
  video: { word: 'El video', types: ['video/*'] },
  audio: { word: 'El audio', types: ['audio/*'] },
} as const;

/** Elige una foto, un video o un audio (hasta 50 MB) y lo sube al depósito de la presentación. Null si canceló. */
export async function pickPresentMedia(churchId: string, kind: 'image' | 'video' | 'audio'): Promise<{ path: string; name: string } | null> {
  const t = PRESENT_TEXT[kind];
  const tooBig = () => Alert.alert('Archivo muy grande', `${t.word} pesa más de 50 MB. Probá con uno más corto o más liviano.`);
  // En el teléfono o la tablet, las fotos y los videos salen de la galería.
  if (Platform.OS !== 'web' && kind !== 'audio') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Sin permiso', 'Activá el permiso de fotos en Ajustes del teléfono.'); return null; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind === 'image' ? 'images' : 'videos'], allowsEditing: false, quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    if (kind === 'image') {
      // 1920 px de ancho alcanza para un proyector y pesa poco.
      const resize = a.width && a.width > 1920 ? [{ resize: { width: 1920 } }] : [];
      const img = await manipulateAsync(a.uri, resize, { compress: 0.82, format: SaveFormat.JPEG });
      return { path: await upload('present', churchId, img.uri, 'foto.jpg', 'image/jpeg'), name: a.fileName ?? 'foto.jpg' };
    }
    if (a.fileSize && a.fileSize > MAX_FILE_BYTES) { tooBig(); return null; }
    const name = a.fileName ?? 'video.mp4';
    return { path: await upload('present', churchId, a.uri, name, a.mimeType ?? 'video/mp4'), name };
  }
  const res = await DocumentPicker.getDocumentAsync({ type: [...t.types], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.size && a.size > MAX_FILE_BYTES) { tooBig(); return null; }
  const mime = a.mimeType ?? '';
  if (!mime.startsWith(`${kind}/`)) { Alert.alert('Ese archivo no sirve', kind === 'image' ? 'Elegí una foto.' : kind === 'video' ? 'Elegí un video (MP4 anda en todos lados).' : 'Elegí un audio (MP3 anda en todos lados).'); return null; }
  return { path: await upload('present', churchId, a.uri, a.name, mime), name: a.name };
}

/** Borra archivos de la presentación que ya no se usan. Si falla no pasa nada: solo quedan huérfanos. */
export async function removePresentFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  await supabase.storage.from('present').remove(list).catch(() => undefined);
}

const presentUrls = new Map<string, { url: string; until: number }>();
/** Link firmado de un archivo de la presentación. Dura 8 horas, para que alcance todo el culto. */
export async function presentUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const hit = presentUrls.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('present').createSignedUrl(path, 8 * 3600);
  const url = data?.signedUrl ?? null;
  if (url) presentUrls.set(path, { url, until: Date.now() + 7 * 3600 * 1000 });
  return url;
}
