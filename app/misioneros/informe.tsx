// Subir (o corregir) el informe de un mes: PDF, fotos y unas líneas. Pastor y secretaría.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { DateChips } from '@/components/Picker';
import { SignedImage } from '@/components/SignedImage';
import { Button, Card, Empty, Field, Toggle } from '@/components/ui';
import { missionariesList, missionaryReports, saveMissionaryReport } from '@/lib/api';
import { pickMissionaryPdf, pickMissionaryPhotos, removeMissionaryFiles } from '@/lib/files';
import { monthLabel, monthStart, pdfLabel, recentMonths } from '@/lib/missionaries';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { MissionaryReport } from '@/types';

const MAX_PHOTOS = 30;

export default function InformeMisionero() {
  const { missionary, month: monthParam } = useLocalSearchParams<{ missionary: string; month?: string }>();
  const { isStaff, church } = useAuth();
  const months = useMemo(() => {
    const base = recentMonths(new Date(), 8);
    return monthParam && !base.includes(monthParam) ? [...base, monthParam] : base;
  }, [monthParam]);
  const [name, setName] = useState('');
  const [month, setMonth] = useState(monthParam || monthStart(new Date()));
  const [existing, setExisting] = useState<MissionaryReport | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [pdf, setPdf] = useState<{ path: string; name: string } | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [announce, setAnnounce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Lo que se subió en esta pantalla y no se guardó: si se cancela, se borra.
  const [fresh, setFresh] = useState<string[]>([]);

  useEffect(() => { missionariesList().then((l) => setName(l.find((x) => x.id === missionary)?.name ?? '')).catch(() => undefined); }, [missionary]);

  // Al elegir el mes, se carga lo que ya hubiera para ese mes (así se puede corregir).
  useEffect(() => {
    let alive = true;
    missionaryReports(missionary).then((all) => {
      if (!alive) return;
      const r = all.find((x) => x.month === month) ?? null;
      setExisting(r);
      setTitle(r?.title ?? ''); setSummary(r?.summary ?? '');
      setPdf(r?.pdf_path ? { path: r.pdf_path, name: pdfLabel(r.pdf_name, r.month) } : null);
      setPhotos(r?.photo_paths ?? []);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [missionary, month]);

  const run = async (f: () => Promise<void>) => {
    setUploading(true);
    try { await f(); } catch (e) { Alert.alert('No se pudo subir', errorMessage(e)); } finally { setUploading(false); }
  };
  const choosePdf = () => church && run(async () => {
    const p = await pickMissionaryPdf(church.id);
    if (p) { setPdf(p); setFresh((f) => [...f, p.path]); }
  });
  const addPhotos = () => church && run(async () => {
    const paths = await pickMissionaryPhotos(church.id, MAX_PHOTOS - photos.length);
    if (paths.length) { setPhotos((p) => [...p, ...paths]); setFresh((f) => [...f, ...paths]); }
  });

  const save = async () => {
    setBusy(true);
    try {
      await saveMissionaryReport({ missionary_id: missionary, month, title, summary, pdf_path: pdf?.path ?? null, pdf_name: pdf?.name ?? null, photo_paths: photos, announce });
      // Lo que ya no se usa (cambió el PDF, se sacaron fotos, o se subió y se descartó) se borra.
      const keep = new Set<string | null | undefined>([pdf?.path, ...photos]);
      const old = existing ? [existing.pdf_path, ...existing.photo_paths] : [];
      await removeMissionaryFiles([...old, ...fresh].filter((p) => !keep.has(p)));
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    const keep = new Set<string | null | undefined>([existing?.pdf_path, ...(existing?.photo_paths ?? [])]);
    await removeMissionaryFiles(fresh.filter((p) => !keep.has(p)));
    router.back();
  };

  const empty = !pdf && !photos.length && !summary.trim();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Informe del mes" subtitle={name || undefined} back />
      <Screen>
        {!isStaff ? <Empty icon="lock" title="Solo el pastor y la secretaría" /> : (
          <>
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>¿De qué mes es?</Text>
              <DateChips dates={months} value={month} onChange={setMonth} format={monthLabel} />
              {existing ? <Text style={{ fontSize: 12, color: colors.amberText }}>Ya hay un informe de este mes. Lo que guardes lo reemplaza.</Text> : null}
            </Card>
            <Card style={{ gap: 12 }}>
              <Field label="Título (opcional)" value={title} onChangeText={setTitle} maxLength={160} placeholder="Por ejemplo: Un mes de bautismos" />
              <Field label="Resumen corto (opcional)" value={summary} onChangeText={setSummary} multiline maxLength={4000} hint="Unas líneas para que lean antes de abrir el PDF." />
            </Card>
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Informe en PDF</Text>
              {pdf ? <Text style={{ fontSize: 13, color: colors.greenText }}>✔ {pdf.name}</Text> : <Text style={{ fontSize: 13, color: colors.muted }}>Todavía no elegiste el PDF.</Text>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={pdf ? 'Cambiar PDF' : 'Elegir PDF'} icon="file-text" variant="outline" small style={{ flex: 1 }} onPress={choosePdf} disabled={uploading} />
                {pdf ? <Button title="Sacar" variant="ghost" small style={{ flex: 1 }} onPress={() => setPdf(null)} /> : null}
              </View>
            </Card>
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Fotos ({photos.length})</Text>
              {photos.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {photos.map((p) => (
                    <View key={p}>
                      <SignedImage bucket="missionaries" path={p} style={{ width: 96, height: 96, borderRadius: 10 }} />
                      <Button title="Sacar" variant="ghost" small onPress={() => setPhotos((l) => l.filter((x) => x !== p))} />
                    </View>
                  ))}
                </View>
              ) : null}
              <Button title={uploading ? 'Subiendo…' : 'Agregar fotos'} icon="image" variant="outline" small onPress={addPhotos} disabled={uploading || photos.length >= MAX_PHOTOS} />
            </Card>
            {!existing ? <Toggle label="Avisar a toda la iglesia" hint="Les llega una notificación de que hay un informe nuevo." value={announce} onChange={setAnnounce} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancelar" variant="outline" style={{ flex: 1 }} onPress={cancel} disabled={busy} />
              <Button title="Guardar informe" icon="check" style={{ flex: 2 }} onPress={save} loading={busy} disabled={uploading || empty} />
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}
