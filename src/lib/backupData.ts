// Copia de todos los datos: lee cada tabla con los permisos de quien está logueado (nunca con una llave maestra),
// de a tandas, avisa cómo va, y baja un ZIP con una planilla por tabla.
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { downloadText } from './download';
import { backupName, backupPlan, backupReadme, nextRange, rowsToCsv, zipFiles, type BackupResult, type BackupTable } from './backup';

export type BackupProgress = { index: number; total: number; title: string; rows: number };
type Row = Record<string, unknown>;

async function readAll(t: BackupTable, churchId: string, onRows: (n: number) => void): Promise<Row[]> {
  const out: Row[] = [];
  let last: number | null = null;
  for (;;) {
    const range = nextRange(out.length, last);
    if (!range) break;
    let q = supabase.from(t.table).select(t.select ?? '*');
    if (t.byChurch) q = q.eq('church_id', churchId);
    for (const col of t.order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(range[0], range[1]);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    last = rows.length;
    onRows(out.length);
    if (out.length > 500000) throw new Error('Demasiadas filas');
  }
  // Por las dudas: si la tabla tiene la columna de la iglesia, no sale nada que no sea de esta iglesia.
  return out.filter((r) => !('church_id' in r) || r.church_id === churchId);
}

/** Baja un archivo que no es texto (el ZIP). */
async function downloadBytes(fileName: string, bytes: Uint8Array, mime: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const f = new File(Paths.cache, fileName);
  if (f.exists) f.delete();
  f.create();
  f.write(bytes);
  const Sharing = await import('expo-sharing');
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: fileName, UTI: 'public.zip-archive' });
}

export type BackupSummary = { results: BackupResult[]; rows: number; fileName: string; zipped: boolean };

/**
 * Hace la copia completa. `finance`: si la persona tiene permiso de finanzas (si no, esas planillas ni se piden).
 * Si una tabla falla, la copia sigue y esa planilla queda anotada como "no se pudo".
 */
export async function runBackup(o: { churchId: string; churchName: string; who: string; finance: boolean; onProgress: (p: BackupProgress) => void }): Promise<BackupSummary> {
  const plan = backupPlan(o.finance);
  const data: { t: BackupTable; rows: Row[]; error?: string }[] = [];
  for (let i = 0; i < plan.length; i++) {
    const t = plan[i];
    o.onProgress({ index: i, total: plan.length, title: t.title, rows: 0 });
    try {
      const rows = await readAll(t, o.churchId, (n) => o.onProgress({ index: i, total: plan.length, title: t.title, rows: n }));
      data.push({ t, rows });
    } catch (e) {
      data.push({ t, rows: [], error: String((e as Error)?.message ?? e) });
    }
  }
  const names = new Map<string, string>();
  for (const r of data.find((d) => d.t.table === 'contacts')?.rows ?? []) names.set(String(r.id), String(r.name ?? ''));

  const results: BackupResult[] = data.map((d) => ({ file: d.t.file, title: d.t.title, rows: d.rows.length, error: d.error }));
  const day = new Date().toISOString().slice(0, 10);
  const base = backupName(o.churchName, day);
  const files = [
    { name: 'LEEME.txt', text: backupReadme({ church: o.churchName, when: new Date().toLocaleString('es-AR'), who: o.who, results, finance: o.finance }) },
    ...data.filter((d) => !d.error).map((d) => ({ name: `${d.t.file}.csv`, text: rowsToCsv(d.rows, d.t.table === 'contacts' ? undefined : names) })),
  ];
  const total = results.reduce((a, r) => a + r.rows, 0);
  o.onProgress({ index: plan.length, total: plan.length, title: 'Armando el archivo', rows: total });
  let zipped = true;
  try {
    await downloadBytes(`${base}.zip`, zipFiles(files), 'application/zip');
  } catch {
    // Si el ZIP no se pudo armar en este equipo, se bajan las planillas de a una.
    zipped = false;
    for (const f of files) await downloadText(`${base}-${f.name}`, f.text, f.name.endsWith('.txt') ? 'text/plain' : 'text/csv');
  }
  // Queda anotado en el historial de la iglesia quién bajó la copia.
  await supabase.rpc('admin_log_export', { p_files: files.length, p_rows: total }).then(() => undefined, () => undefined);
  return { results, rows: total, fileName: zipped ? `${base}.zip` : base, zipped };
}
