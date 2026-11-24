// Leer una planilla elegida en el teléfono o en la web (Excel .xlsx/.xls, hoja de cálculo .ods, o texto .csv/.txt) y devolver sus filas crudas.
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';
import { parseDelimited, TEMPLATE_HEADERS, TEMPLATE_ROWS } from './importSmart';

// Una fecha de Excel viene como Date; se pasa a AAAA-MM-DD sin correrla un día por la zona horaria.
const cellText = (v: unknown): string => {
  if (v instanceof Date) { const d = new Date(v.getTime() + 12 * 3600 * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
  return v === null || v === undefined ? '' : String(v);
};

export const isSheetName = (name: string): boolean => /\.(xlsx|xlsm|xls|ods)$/i.test(name);

/** Las filas de la primera hoja que tenga datos. */
export function sheetRows(bytes: Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  for (const n of wb.SheetNames) {
    const ws = wb.Sheets[n];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' }).map((r) => r.map(cellText)).filter((r) => r.some((c) => c.trim() !== ''));
    if (rows.length) return rows;
  }
  return [];
}

export async function readTableFile(uri: string, name: string): Promise<string[][]> {
  if (isSheetName(name)) {
    const buf = Platform.OS === 'web' ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
    return sheetRows(new Uint8Array(buf));
  }
  const text = Platform.OS === 'web' ? await (await fetch(uri)).text() : await new File(uri).text();
  return parseDelimited(text);
}

/** Baja la planilla modelo en Excel (solo en la web; en el teléfono se usa la de texto). */
export function downloadTemplateXlsx(): void {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Personas');
  XLSX.writeFile(wb, 'planilla-modelo-la-mies.xlsx');
}
