// Un misionero: quién es y sus informes mes a mes (PDF y fotos).
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Modal, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { SignedImage } from '@/components/SignedImage';
import { Button, Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { deleteMissionary, deleteMissionaryReport, missionariesList, missionaryReports } from '@/lib/api';
import { downloadUrl, removeMissionaryFiles } from '@/lib/files';
import { monthLabel, newestFirst, pdfLabel } from '@/lib/missionaries';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Missionary, MissionaryReport } from '@/types';

export default function MisioneroDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff } = useAuth();
  const [m, setM] = useState<Missionary | null | undefined>(undefined);
  const [reports, setReports] = useState<MissionaryReport[] | null>(null);
  const [big, setBig] = useState<string | null>(null);

  const load = useCallback(() => {
    missionariesList().then((l) => setM(l.find((x) => x.id === id) ?? null)).catch(() => setM((old) => old ?? null));
    missionaryReports(id).then((r) => setReports(newestFirst(r))).catch(() => setReports((old) => old ?? []));
  }, [id]);
  useFocusEffect(load);

  const openPdf = async (r: MissionaryReport) => {
    if (!r.pdf_path) return;
    try {
      const url = await downloadUrl('missionaries', r.pdf_path, pdfLabel(r.pdf_name, r.month));
      if (url) await Linking.openURL(url); else Alert.alert('No se pudo abrir', 'Probá de nuevo en un momento.');
    } catch (e) {
      Alert.alert('No se pudo abrir', errorMessage(e));
    }
  };
  const askDeleteReport = (r: MissionaryReport) => {
    Alert.alert('¿Borrar este informe?', `${monthLabel(r.month)}. Se borran también su PDF y sus fotos. No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => deleteMissionaryReport(r.id).then(() => removeMissionaryFiles([r.pdf_path, ...r.photo_paths])).then(load).catch((e) => Alert.alert('No se pudo borrar', errorMessage(e))) },
    ]);
  };
  const askDeleteMissionary = () => {
    if (!m) return;
    Alert.alert(`¿Quitar a ${m.name}?`, 'Se borran también todos sus informes. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => {
        try {
          const all = reports ?? [];
          await deleteMissionary(m.id);
          await removeMissionaryFiles([m.photo_path, ...all.flatMap((r) => [r.pdf_path, ...r.photo_paths])]);
          router.back();
        } catch (e) { Alert.alert('No se pudo quitar', errorMessage(e)); }
      } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={m?.name ?? 'Misionero'} subtitle={m?.field ?? undefined} back />
      <Screen>
        {m === undefined ? <Loading /> : m === null ? <Empty icon="globe" title="No encontramos a este misionero" /> : (
          <>
            <Card style={{ alignItems: 'center', gap: 10 }}>
              <SignedImage bucket="missionaries" path={m.photo_path} style={{ width: 112, height: 112, borderRadius: 56 }} />
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{m.name}</Text>
              {m.field ? <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>{m.field}</Text> : null}
              {m.bio ? <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>{m.bio}</Text> : null}
            </Card>
            {isStaff ? (
              <View style={{ gap: 8 }}>
                <Button title="Subir informe del mes" icon="upload" onPress={() => router.push({ pathname: '/misioneros/informe', params: { missionary: m.id } } as unknown as Href)} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Editar datos" icon="edit-2" variant="outline" small style={{ flex: 1 }} onPress={() => router.push({ pathname: '/misioneros/editar', params: { id: m.id } } as unknown as Href)} />
                  <Button title="Quitar" icon="trash-2" variant="ghost" small style={{ flex: 1 }} onPress={askDeleteMissionary} />
                </View>
              </View>
            ) : null}
            <SectionTitle>Informes</SectionTitle>
            {reports === null ? <Loading /> : !reports.length ? <Empty icon="file-text" title="Todavía no hay informes" text={isStaff ? 'Subí el primero con el botón de arriba.' : undefined} /> : reports.map((r) => (
              <Card key={r.id} style={{ gap: 10 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, textTransform: 'capitalize' }}>{monthLabel(r.month)}</Text>
                {r.title ? <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.title}</Text> : null}
                {r.summary ? <Text selectable style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>{r.summary}</Text> : null}
                {r.pdf_path ? <Button title="Abrir el informe (PDF)" icon="file-text" variant="outline" onPress={() => openPdf(r)} /> : null}
                {r.photo_paths.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {r.photo_paths.map((p) => (
                      <SignedImage key={p} bucket="missionaries" path={p} onPress={() => setBig(p)} style={{ width: 104, height: 104, borderRadius: 10 }} />
                    ))}
                  </View>
                ) : null}
                {isStaff ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Editar" icon="edit-2" variant="outline" small style={{ flex: 1 }} onPress={() => router.push({ pathname: '/misioneros/informe', params: { missionary: r.missionary_id, month: r.month } } as unknown as Href)} />
                    <Button title="Borrar" icon="trash-2" variant="ghost" small style={{ flex: 1 }} onPress={() => askDeleteReport(r)} />
                  </View>
                ) : null}
              </Card>
            ))}
          </>
        )}
      </Screen>
      <Modal visible={!!big} transparent animationType="fade" onRequestClose={() => setBig(null)}>
        <Pressable onPress={() => setBig(null)} accessibilityRole="button" accessibilityLabel="Cerrar foto" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          <SignedImage bucket="missionaries" path={big} fit="contain" style={{ width: '100%', height: '85%', backgroundColor: 'transparent' }} />
        </Pressable>
      </Modal>
    </View>
  );
}
