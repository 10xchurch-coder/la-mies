// Importar personas, la versión fácil. Se elige una planilla (Excel o CSV) o se pega el texto copiado de una planilla.
// La app encuentra sola los títulos y las columnas, muestra los problemas fila por fila, deja elegir qué hacer con los
// repetidos, carga de a tandas con una barra de avance y al final deja deshacer la importación.
// El equipo de La Mies puede usarla para cargar en una iglesia que se lo pidió (?iglesia=...): lo decide la base.
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, SectionTitle, Tag } from '@/components/ui';
import { batchUndo, importRows, newBatchId, type ImportResult } from '@/lib/altaData';
import { downloadText } from '@/lib/download';
import { downloadTemplateXlsx, readTableFile } from '@/lib/importFile';
import {
  analyzeTable, analyzeText, blocking, buildSmartRows, chunk, countRows, isFileDup, rowsToSend, SERVER_TEXT, SMART_LABELS, SMART_OPTIONS, templateCsv,
  type ParsedTable, type ServerCode, type SmartField,
} from '@/lib/importSmart';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

type Status = 'member' | 'visitor' | 'contact';
type Mode = 'skip' | 'merge';
const BATCH = 100;
const MAX_ROWS = 3000;
const SHOWN = 60;

export default function ImportarFacil() {
  const router = useRouter();
  const { can, church, profile } = useAuth();
  const { iglesia, nombre, pais } = useLocalSearchParams<{ iglesia?: string; nombre?: string; pais?: string }>();
  // Cargar en otra iglesia: solo el equipo de La Mies, y solo si el pastor lo pidió (lo revisa la base).
  const other = typeof iglesia === 'string' && iglesia && iglesia !== church?.id ? iglesia : null;
  const country = other ? (typeof pais === 'string' && pais ? pais : 'AR') : ((church as { country?: string } | null)?.country ?? 'AR');

  const [source, setSource] = useState<'file' | 'paste'>('file');
  const [pasted, setPasted] = useState('');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [fields, setFields] = useState<SmartField[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('member');
  const [mode, setMode] = useState<Mode>('skip');
  const [codes, setCodes] = useState<Map<number, ServerCode> | null>(null); // fila de la planilla -> qué dijo la base
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState<{ done: number; total: number } | null>(null);
  const [done, setDone] = useState<{ batch: string; new: number; merged: number; duplicates: number; invalid: number; undone: boolean } | null>(null);

  const rows = useMemo(() => (table ? buildSmartRows(table.data, fields, { country, firstLine: table.skippedTop + (table.hasHeader ? 2 : 1) }) : []), [table, fields, country]);
  const counts = useMemo(() => countRows(rows), [rows]);
  const out = useMemo(() => rowsToSend(rows), [rows]);

  const allowed = other ? !!profile?.is_network_admin : can('personas.editar');
  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Importar personas')} back />
        <Empty icon="lock" title={other ? tx('Solo para el equipo de La Mies') : tx('Solo la secretaría o el pastor')} text={tx('Desde acá se carga la lista de personas de la iglesia.')} />
      </View>
    );
  }

  const start = (t: ParsedTable, name: string) => {
    if (!t.data.length) { setMsg(tx('No encontré filas con datos. Fijate que la planilla tenga al menos una persona.')); return; }
    if (t.data.length > MAX_ROWS) { setMsg(tx('Tiene más de {MAX_ROWS} filas. Dividila en partes más chicas.', { MAX_ROWS })); return; }
    setFileName(name); setTable(t); setFields(t.fields); setCodes(null); setDone(null); setSent(null); setEditing(null); setMsg(null);
  };
  const pick = async () => {
    setMsg(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.size && a.size > 5 * 1024 * 1024) { setMsg(tx('El archivo es muy grande (máximo 5 MB).')); return; }
      if (/\.(pdf|docx?|jpe?g|png)$/i.test(a.name)) { setMsg(tx('Ese archivo no es una planilla. Sirve Excel (.xlsx o .xls) o CSV. Si tu lista está en Word o en PDF, copiá el texto y usá "Pegar la lista".')); return; }
      start(analyzeTable(await readTableFile(a.uri, a.name)), a.name);
    } catch (e) {
      setMsg(tx('No pude leer el archivo. Probá guardarlo como Excel (.xlsx) o CSV, o copiá las celdas y usá "Pegar la lista". {errorMessage}', { errorMessage: errorMessage(e) }));
    }
  };
  const usePasted = () => {
    if (pasted.trim().length < 3) { setMsg(tx('Pegá acá la lista copiada de tu planilla.')); return; }
    start(analyzeText(pasted), tx('Lista pegada'));
  };
  const template = () => {
    if (Platform.OS === 'web') { try { downloadTemplateXlsx(); return; } catch { /* sigue con la de texto */ } }
    downloadText('planilla-modelo-la-mies.csv', templateCsv()).catch((e) => setMsg(errorMessage(e)));
  };

  const setField = (i: number, f: SmartField) => {
    setCodes(null); setEditing(null);
    // Un campo se usa en una sola columna (menos "No usar"); si ya estaba en otra, esa pasa a "No usar".
    setFields((prev) => prev.map((x, j) => (j === i ? f : f !== 'skip' && x === f ? 'skip' : x)));
  };

  /** Manda las filas de a tandas. Sin `batch` solo revisa; con `batch` las carga. */
  const send = async (batch: string | null): Promise<ImportResult & { byLine: Map<number, ServerCode> }> => {
    const total: ImportResult = { new: 0, merged: 0, duplicates: 0, invalid: 0, committed: !!batch, rows: [], batch };
    const byLine = new Map<number, ServerCode>();
    let at = 0;
    setSent({ done: 0, total: out.send.length });
    for (const part of chunk(out.send, BATCH)) {
      const r = await importRows({ rows: part, status, mode, commit: !!batch, batch, church: other, file: fileName });
      total.new += r.new; total.merged += r.merged; total.duplicates += r.duplicates; total.invalid += r.invalid;
      (r.rows ?? []).forEach((c, k) => byLine.set(out.lines[at + k], c));
      at += part.length;
      setSent({ done: at, total: out.send.length });
    }
    return { ...total, byLine };
  };

  const check = async () => {
    setBusy(true); setMsg(null);
    try { setCodes((await send(null)).byLine); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); setSent(null); }
  };

  const churchDups = codes ? [...codes.values()].filter((c) => c === 'dup_phone' || c === 'dup_name').length : 0;
  const toAdd = codes ? [...codes.values()].filter((c) => c === 'new').length : 0;

  const doImport = () => {
    const merge = mode === 'merge' && churchDups > 0;
    const label = status === 'member' ? 'miembros' : status === 'visitor' ? 'visitantes' : 'contactos';
    Alert.alert(tx('Cargar {toAdd} {pl}', { toAdd, pl: toAdd === 1 ? tx('persona') : tx('personas') }),
      tx('Se van a agregar {toAdd} como {label}{v1}. {v2} ¿Seguimos?', { toAdd, label, v1: other && nombre ? tx(' en {nombre}', { nombre }) : '', v2: churchDups ? (merge ? tx('A las {churchDups} que ya estaban se les completa lo que les falte, sin pisar nada.', { churchDups }) : tx('Las {churchDups} que ya estaban no se tocan.', { churchDups })) : '' }), [
        { text: tx('Cancelar'), style: 'cancel' },
        {
          text: tx('Cargar'), onPress: async () => {
            setBusy(true); setMsg(null);
            const batch = newBatchId();
            try {
              const r = await send(batch);
              setDone({ batch, new: r.new, merged: r.merged, duplicates: r.duplicates, invalid: r.invalid, undone: false });
              setTable(null); setCodes(null); setPasted('');
            } catch (e) {
              setMsg(tx('Se cortó en el medio. Lo que ya se cargó quedó guardado: tocá "Revisar" otra vez y seguí; los que ya entraron no se repiten. {errorMessage}', { errorMessage: errorMessage(e) }));
              setCodes(null);
            } finally { setBusy(false); setSent(null); }
          },
        },
      ]);
  };

  const undo = () => {
    if (!done) return;
    Alert.alert(tx('Deshacer esta importación'), other
      ? tx('La importación queda marcada y le llega un aviso al pastor y a la secretaría de esa iglesia para que quiten esas fichas. Vos no ves sus personas.')
      : tx('La importación queda marcada y te mostramos las fichas que entraron, para que las quites. No se quita nada solo.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      {
        text: tx('Deshacer'), style: 'destructive', onPress: () => {
          batchUndo(done.batch).then(() => {
            setDone({ ...done, undone: true });
            if (!other) router.push(`/admin/importacion?lote=${done.batch}` as Href);
          }).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
        },
      },
    ]);
  };

  const p = { fontSize: 14, color: colors.text, lineHeight: 20 } as const;
  const small = { fontSize: 12, color: colors.muted, lineHeight: 17 } as const;
  const warn = { color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 } as const;
  const hasName = fields.includes('name') || fields.includes('lastname');
  const hasPhone = fields.includes('phone');
  const problemRows = rows.filter((r) => r.problems.length > 0);
  const dupRows = codes ? rows.filter((r) => { const c = codes.get(r.line); return c === 'dup_phone' || c === 'dup_name'; }) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Importar personas')} subtitle={other ? tx('Para {nombre} (equipo de La Mies)', { nombre: nombre || tx('otra iglesia') }) : tx('Desde una planilla o una lista pegada')} back />
      <Screen style={{ gap: 14 }}>
        {other ? <Text style={warn}>{tx('Estás cargando la lista de otra iglesia porque su pastor lo pidió. Queda anotado en el historial de esa iglesia. No vas a ver sus personas: solo cuántas entraron.')}</Text> : null}

        {done ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.green }}>{tx('Listo: {new} {pl}', { new: done.new, pl: done.new === 1 ? tx('persona agregada') : tx('personas agregadas') })}</Text>
            <Text style={p}>
              {tx('{v1}{v2}{v3}Cuando cada persona cree su cuenta con su celular, se une sola a su ficha.', { v1: done.merged ? tx('A {merged} que ya estaban se les completaron datos. ', { merged: done.merged }) : '', v2: done.duplicates ? tx('{duplicates} ya estaban y no se tocaron. ', { duplicates: done.duplicates }) : '', v3: done.invalid ? tx('{invalid} no se pudieron cargar. ', { invalid: done.invalid }) : '' })}
            </Text>
            {done.undone ? <Text style={warn}>{tx('Esta importación quedó marcada para deshacer.')}</Text> : null}
            {!other ? <Button title={tx('Ver las personas')} icon="users" onPress={() => router.replace('/directorio' as Href)} /> : null}
            {!other ? <Button title={tx('Ver esta importación')} variant="outline" small onPress={() => router.push(`/admin/importacion?lote=${done.batch}` as Href)} /> : null}
            {!done.undone && done.new > 0 ? <Button title={tx('Deshacer esta importación')} icon="rotate-ccw" variant="danger" small onPress={undo} /> : null}
          </Card>
        ) : null}

        {!table ? (
          <>
            <Card style={{ gap: 10 }}>
              <Text style={p}>
                {tx('Traé la lista como la tengas. La app busca sola los títulos (Nombre, Apellido, Celular, Dirección…) y te muestra todo antes de cargar nada. Solo hace falta el nombre. El celular es lo más útil: con él la app reconoce a cada persona cuando crea su cuenta.')}
              </Text>
              <Choice value={source} onChange={(v) => { setSource(v); setMsg(null); }} options={[{ value: 'file', label: tx('Tengo un archivo') }, { value: 'paste', label: tx('Pegar la lista') }]} />
              {source === 'file' ? (
                <>
                  <Button title={tx('Elegir el archivo')} icon="upload" onPress={pick} />
                  <Text style={small}>{tx('Sirve Excel (.xlsx o .xls) y CSV. Si está en Hojas de cálculo de Google: Archivo → Descargar → Excel.')}</Text>
                </>
              ) : (
                <>
                  <Field label={tx('Pegá acá la lista')} hint={tx('(abrí tu planilla, seleccioná las celdas, copiá y pegá)')} value={pasted} onChangeText={setPasted} multiline numberOfLines={8}
                    style={{ minHeight: 160 }} autoCapitalize="none" autoCorrect={false} placeholder={tx('Nombre\tCelular\nMarcela Quiroga\t376 400-0001')} />
                  <Button title={tx('Leer la lista')} icon="arrow-right" onPress={usePasted} disabled={!pasted.trim()} />
                </>
              )}
              {msg ? <Text style={warn}>{msg}</Text> : null}
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('¿Todavía no tenés la lista armada?')}</Text>
              <Text style={p}>{tx('Bajá la planilla modelo, llenala y subila acá. Trae unas filas de ejemplo con nombres inventados: borralas y poné a tu gente.')}</Text>
              <Button title={tx('Bajar la planilla modelo')} icon="download" variant="outline" small onPress={template} />
              {!other ? <Button title={tx('Prefiero que la cargue el equipo de La Mies')} variant="ghost" small onPress={() => router.push('/admin/importar-ayuda' as Href)} /> : null}
              {!other ? <Button title={tx('Ver las importaciones anteriores')} variant="ghost" small onPress={() => router.push('/admin/importacion' as Href)} /> : null}
            </Card>
          </>
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{fileName}</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {tx('{n} {pl} con datos. {v1}', { n: table.data.length, pl: table.data.length === 1 ? tx('fila') : tx('filas'), v1: table.hasHeader ? tx('Los títulos están en la fila {v1}.', { v1: table.skippedTop + 1 }) : tx('No encontré una fila de títulos: miré los datos para saber qué es cada columna.') })}
              </Text>
              <Button title={tx('Empezar de nuevo con otra lista')} variant="ghost" small onPress={() => { setTable(null); setCodes(null); setMsg(null); }} />
            </Card>

            <SectionTitle>{tx('Qué es cada columna')}</SectionTitle>
            {table.headers.map((h, i) => {
              const f = fields[i] ?? 'skip';
              const sample = table.data.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ');
              if (f === 'skip' && !sample) return null;
              const ask = f === 'skip' || editing === i;
              return (
                <Card key={i} style={{ gap: 8, padding: 12, borderColor: f === 'skip' ? colors.amber : colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.text }}>{h}</Text>
                    {f !== 'skip' ? <Tag text={SMART_LABELS[f]} tone="green" /> : <Tag text={tx('Sin usar')} tone="amber" />}
                  </View>
                  <Text style={small} numberOfLines={1}>{tx('Ej:')} {sample || '—'}</Text>
                  {ask ? (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>{tx('¿Qué es esta columna?')}</Text>
                      <Choice value={f} onChange={(v) => setField(i, v)} options={SMART_OPTIONS} />
                    </>
                  ) : <Button title={tx('Cambiar')} variant="ghost" small onPress={() => setEditing(i)} />}
                </Card>
              );
            })}

            <SectionTitle>{tx('Cargarlos como')}</SectionTitle>
            <Choice value={status} onChange={(v) => { setStatus(v); setCodes(null); }}
              options={[{ value: 'member', label: tx('Miembros') }, { value: 'visitor', label: tx('Visitantes') }, { value: 'contact', label: tx('Contactos') }]} />
            {fields.includes('member') ? <Text style={small}>{tx('Como hay una columna "¿Miembro?", cada fila usa lo que diga ahí: "sí" entra como miembro y "no" como visitante.')}</Text> : null}

            {!hasName ? <Text style={{ color: colors.red, fontSize: 13 }}>{tx('Falta decir qué columna es el Nombre.')}</Text> : null}
            {hasName && !hasPhone ? <Text style={warn}>{tx('No hay ninguna columna de Celular. Se puede cargar igual, pero sin celular la app no reconoce a la persona cuando cree su cuenta.')}</Text> : null}

            <SectionTitle>{tx('Cómo viene la lista')}</SectionTitle>
            <Card style={{ gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{tx('{ready} de {total} filas se pueden cargar', { ready: counts.ready, total: counts.total })}</Text>
              {counts.noName ? <Text style={p}>{tx('• {noName} sin nombre: no se cargan.', { noName: counts.noName })}</Text> : null}
              {counts.fileDups ? <Text style={p}>{tx('• {fileDups} repetidas dentro del archivo: se carga una sola vez.', { fileDups: counts.fileDups })}</Text> : null}
              {counts.warnings ? <Text style={p}>{tx('• {warnings} con algún dato mal escrito: se cargan sin ese dato.', { warnings: counts.warnings })}</Text> : null}
              {!counts.noName && !counts.fileDups && !counts.warnings ? <Text style={p}>{tx('No encontré problemas.')}</Text> : null}
            </Card>
            {problemRows.slice(0, SHOWN).map((r) => (
              <Card key={r.line} style={{ gap: 2, padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.text }}>{tx('Fila {line}{v1}', { line: r.line, v1: r.name ? ` · ${r.name}` : '' })}</Text>
                  <Tag text={blocking(r) || isFileDup(r) ? tx('No se carga') : tx('Se carga')} tone={blocking(r) || isFileDup(r) ? 'red' : 'amber'} />
                </View>
                {r.problems.map((x, k) => <Text key={k} style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>{x.text}</Text>)}
              </Card>
            ))}
            {problemRows.length > SHOWN ? <Text style={small}>{tx('Y {v1} filas más con avisos parecidos.', { v1: problemRows.length - SHOWN })}</Text> : null}

            {codes ? (
              <>
                <SectionTitle>{tx('Comparado con lo que ya hay en la iglesia')}</SectionTitle>
                <Card style={{ gap: 4 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.green }}>{tx('{toAdd} {pl} para cargar', { toAdd, pl: toAdd === 1 ? tx('persona nueva') : tx('personas nuevas') })}</Text>
                  <Text style={p}>{churchDups ? tx('{churchDups} ya están en la iglesia (mismo celular, o mismo nombre sin celular).', { churchDups }) : tx('Ninguna estaba cargada de antes.')}</Text>
                </Card>
                {churchDups ? (
                  <Card style={{ gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{tx('¿Qué hacemos con las {churchDups} que ya están?', { churchDups })}</Text>
                    <Choice value={mode} onChange={setMode} options={[{ value: 'skip', label: tx('Saltearlas') }, { value: 'merge', label: tx('Unirlas') }]} />
                    <Text style={small}>{mode === 'skip' ? tx('Saltearlas: la ficha que ya está queda como está.') : tx('Unirlas: a la ficha que ya está se le completa solo lo que tenga vacío (correo, dirección, fechas). Nunca se pisa un dato. Esto no se puede deshacer.')}</Text>
                    {!other ? dupRows.slice(0, SHOWN).map((r) => (
                      <Text key={r.line} style={{ fontSize: 13, color: colors.text }}>{tx('Fila {line} · {name}: {SERVER_TEXT}', { line: r.line, name: r.name, SERVER_TEXT: SERVER_TEXT[codes.get(r.line) as ServerCode] })}</Text>
                    )) : null}
                  </Card>
                ) : null}
              </>
            ) : null}

            {msg ? <Text style={warn}>{msg}</Text> : null}
            {sent ? (
              <View style={{ gap: 4 }}>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ height: 10, width: `${sent.total ? Math.round((sent.done / sent.total) * 100) : 0}%`, backgroundColor: colors.green }} />
                </View>
                <Text style={small}>{codes ? tx('Cargando') : tx('Revisando')}: {sent.done} {tx('de')} {sent.total}</Text>
              </View>
            ) : null}
            {!codes ? <Button title={tx('Revisar contra la iglesia')} icon="search" onPress={check} loading={busy} disabled={!hasName || !counts.ready} />
              : <Button title={toAdd || (mode === 'merge' && churchDups) ? tx('Cargar {toAdd} {pl}{v1}', { toAdd, pl: toAdd === 1 ? tx('persona') : tx('personas'), v1: mode === 'merge' && churchDups ? tx(' y unir {churchDups}', { churchDups }) : '' }) : tx('No hay nada nuevo para cargar')} icon="check" onPress={doImport} loading={busy} disabled={!toAdd && !(mode === 'merge' && churchDups)} />}
            <Text style={small}>{tx('Nada se carga hasta que toques "Cargar". Después vas a poder deshacer la importación.')}</Text>
          </>
        )}
      </Screen>
    </View>
  );
}
