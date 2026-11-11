// Importar personas desde una planilla (CSV o Excel): la secretaría o el pastor eligen el archivo,
// la app adivina las columnas, muestra cuántas son nuevas y cuántas ya estaban, y recién ahí las agrega.
import React, { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, SectionTitle } from '@/components/ui';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { buildRows, detectFields, detectSource, FIELD_LABELS, parseCsv, type ImportField, type ImportRow } from '@/lib/importPeople';
import { colors } from '@/theme';

type Status = 'member' | 'visitor' | 'contact';
type Preview = { new: number; duplicates: number; invalid: number };
const FIELD_OPTIONS = (Object.keys(FIELD_LABELS) as ImportField[]).map((v) => ({ value: v, label: FIELD_LABELS[v] }));
const BATCH = 400;

// Una fecha de Excel viene como Date; se pasa a AAAA-MM-DD sin correrla un día por la zona horaria.
const cellText = (v: unknown): string => {
  if (v instanceof Date) { const d = new Date(v.getTime() + 12 * 3600 * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
  return v === null || v === undefined ? '' : String(v);
};

async function readFile(uri: string, name: string): Promise<string[][]> {
  const isSheet = /\.(xlsx|xlsm|xls|ods)$/i.test(name);
  if (isSheet) {
    const buf = Platform.OS === 'web' ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
    return rows.map((r) => r.map(cellText)).filter((r) => r.some((c) => c.trim() !== ''));
  }
  const text = Platform.OS === 'web' ? await (await fetch(uri)).text() : await new File(uri).text();
  return parseCsv(text);
}

export default function Importar() {
  const router = useRouter();
  const { can } = useAuth();
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][] | null>(null); // fila 0 = encabezados
  const [fields, setFields] = useState<ImportField[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [status, setStatus] = useState<Status>('member');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<Preview | null>(null);

  if (!can('personas.editar')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Importar personas" back />
        <Screen><Text style={{ color: colors.muted }}>Solo la secretaría o el pastor pueden importar personas.</Text></Screen>
      </View>
    );
  }

  const headers = table ? (hasHeader ? table[0] : table[0].map((_, i) => `Columna ${i + 1}`)) : [];
  const data = table ? (hasHeader ? table.slice(1) : table) : [];
  const built = table ? buildRows(data, fields) : { rows: [] as ImportRow[], dropped: 0 };
  const hasName = fields.includes('name');
  const hasPhone = fields.includes('phone');

  const pick = async () => {
    setMsg(null); setDone(null); setPreview(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.size && a.size > 5 * 1024 * 1024) { setMsg('El archivo es muy grande (máximo 5 MB).'); return; }
      const t = await readFile(a.uri, a.name);
      if (t.length < 2) { setMsg('No encontré filas con datos en ese archivo.'); return; }
      if (t.length > 3001) { setMsg('Tiene más de 3000 filas. Dividilo en partes más chicas.'); return; }
      setFileName(a.name);
      setTable(t);
      setHasHeader(true);
      setFields(detectFields(t[0]));
      const src = detectSource(t[0]);
      if (src !== 'generic') setMsg(`Parece una planilla exportada de ${src === 'planning_center' ? 'Planning Center' : 'Breeze'}. Ya elegimos las columnas: el celular, el correo personal y la dirección de casa. Revisalas abajo antes de importar.`);
    } catch (e) {
      setMsg(`No pude leer el archivo. Probá guardarlo como CSV o Excel (.xlsx). ${errorMessage(e)}`);
    }
  };

  const setField = (i: number, f: ImportField) => {
    setPreview(null);
    // Un campo se usa en una sola columna (menos "No usar"); si ya estaba en otra, esa pasa a "No usar".
    setFields((prev) => prev.map((x, j) => (j === i ? f : f !== 'skip' && x === f ? 'skip' : x)));
  };

  const send = async (rows: ImportRow[], commit: boolean): Promise<Preview> => {
    const total: Preview = { new: 0, duplicates: 0, invalid: 0 };
    // Entre tandas la base recuerda lo ya cargado, así que los repetidos se detectan igual.
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data, error } = await supabase.rpc('import_people', { p_rows: rows.slice(i, i + BATCH), p_status: status, p_since: null, p_commit: commit });
      if (error) throw error;
      const r = data as Preview;
      total.new += r.new; total.duplicates += r.duplicates; total.invalid += r.invalid;
    }
    return total;
  };

  const check = async () => {
    setBusy(true); setMsg(null);
    try { setPreview(await send(built.rows, false)); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); }
  };

  const doImport = () => {
    if (!preview || !preview.new) return;
    const label = status === 'member' ? 'miembros' : status === 'visitor' ? 'visitantes' : 'contactos';
    Alert.alert(`Agregar ${preview.new} ${label}`, `Se van a agregar ${preview.new} personas nuevas. Las ${preview.duplicates} que ya estaban no se tocan. ¿Seguimos?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Agregar', onPress: async () => {
          setBusy(true); setMsg(null);
          try { setDone(await send(built.rows, true)); setTable(null); setPreview(null); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Importar personas" subtitle="Desde una planilla de Excel o CSV" back />
      <Screen style={{ gap: 14 }}>
        {done ? (
          <Card style={{ gap: 6 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.green }}>Listo: {done.new} personas agregadas</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              {done.duplicates ? `${done.duplicates} ya estaban cargadas y no se tocaron. ` : ''}{done.invalid ? `${done.invalid} filas no tenían nombre y se saltearon. ` : ''}
              Cuando cada persona cree su cuenta con su celular, se une sola a su ficha.
            </Text>
            <Button title="Ver personas" onPress={() => router.replace('/directorio' as never)} />
          </Card>
        ) : null}

        {!table ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 21 }}>
              Elegí tu planilla (Excel .xlsx o CSV). La primera fila debería tener los títulos, por ejemplo: Nombre, Apellido, Celular, Correo, Dirección, Fecha de nacimiento. También sirve la planilla que exportás de Planning Center (CSV) o de Breeze (Excel).
              {'\n'}Solo hace falta el nombre; el celular es lo más importante, porque con él la app reconoce a cada persona cuando crea su cuenta.
            </Text>
            <Button title="Elegir archivo" icon="upload" onPress={pick} />
            {msg ? <Text style={{ color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 }}>{msg}</Text> : null}
          </Card>
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{fileName}</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>{data.length} filas encontradas</Text>
              <Button title="Elegir otro archivo" variant="ghost" small onPress={pick} />
            </Card>

            <SectionTitle>¿La primera fila son títulos?</SectionTitle>
            <Choice value={hasHeader ? 'si' : 'no'} onChange={(v) => { setHasHeader(v === 'si'); setPreview(null); setFields(v === 'si' ? detectFields(table[0]) : table[0].map(() => 'skip')); }}
              options={[{ value: 'si', label: 'Sí, son títulos' }, { value: 'no', label: 'No, ya son datos' }]} />

            <SectionTitle>Qué es cada columna</SectionTitle>
            {headers.map((h, i) => (
              <Card key={i} style={{ gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{h || `Columna ${i + 1}`}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>Ej: {data.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ') || '—'}</Text>
                <Choice value={fields[i] ?? 'skip'} onChange={(v) => setField(i, v)} options={FIELD_OPTIONS} />
              </Card>
            ))}

            <SectionTitle>Agregarlos como</SectionTitle>
            <Choice value={status} onChange={(v) => { setStatus(v); setPreview(null); }}
              options={[{ value: 'member', label: 'Miembros' }, { value: 'visitor', label: 'Visitantes' }, { value: 'contact', label: 'Contactos' }]} />

            {!hasName ? <Text style={{ color: colors.red, fontSize: 13 }}>Elegí qué columna es el Nombre.</Text> : null}
            {hasName && !hasPhone ? <Text style={{ color: colors.amberText, fontSize: 13, lineHeight: 18 }}>No marcaste ninguna columna de Celular. Sin celular, la app no puede reconocer a la persona cuando cree su cuenta y puede quedar duplicada.</Text> : null}
            {msg ? <Text style={{ color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 }}>{msg}</Text> : null}

            {preview ? (
              <Card style={{ gap: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.green }}>{preview.new} personas nuevas para agregar</Text>
                <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
                  {preview.duplicates} ya estaban cargadas (mismo celular o mismo nombre) y se van a saltear. {preview.invalid + built.dropped} filas sin nombre se descartan.
                </Text>
              </Card>
            ) : null}

            {!preview ? <Button title="Revisar antes de agregar" onPress={check} loading={busy} disabled={!hasName || !built.rows.length} />
              : <Button title={`Agregar ${preview.new} personas`} onPress={doImport} loading={busy} disabled={!preview.new} />}
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Nada se agrega hasta que toques "Agregar". Las personas que ya están cargadas nunca se modifican.</Text>
          </>
        )}
      </Screen>
    </View>
  );
}
