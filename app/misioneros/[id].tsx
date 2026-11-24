// Un misionero: quién es y sus informes mes a mes (PDF y fotos).
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Modal, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
import { tx } from '@/lib/i18n';

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
      if (url) await Linking.openURL(url); else Alert.alert(tx('No se pudo abrir'), tx('Probá de nuevo en un momento.'));
    } catch (e) {
      Alert.alert(tx('No se pudo abrir'), errorMessage(e));
    }
  };
  const askDeleteReport = (r: MissionaryReport) => {
    Alert.alert(tx('¿Borrar este informe?'), tx('{monthLabel}. Se borran también su PDF y sus fotos. No se puede deshacer.', { monthLabel: monthLabel(r.month) }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Borrar'), style: 'destructive', onPress: () => deleteMissionaryReport(r.id).then(() => removeMissionaryFiles([r.pdf_path, ...r.photo_paths])).then(load).catch((e) => Alert.alert(tx('No se pudo borrar'), errorMessage(e))) },
    ]);
  };
  const askDeleteMissionary = () => {
    if (!m) return;
    Alert.alert(tx('¿Quitar a {name}?', { name: m.name }), tx('Se borran también todos sus informes. No se puede deshacer.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Quitar'), style: 'destructive', onPress: async () => {
        try {
          const all = reports ?? [];
          await deleteMissionary(m.id);
          await removeMissionaryFiles([m.photo_path, m.thumb_path, ...all.flatMap((r) => [r.pdf_path, ...r.photo_paths])]);
          router.back();
        } catch (e) { Alert.alert(tx('No se pudo quitar'), errorMessage(e)); }
      } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={m?.name ?? tx('Misionero')} subtitle={m?.field ?? undefined} back />
      <Screen>
        {m === undefined ? <Loading /> : m === null ? <Empty icon="globe" title={tx('No encontramos a este misionero')} /> : (
          <>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {m.photo_path ? (
                <SignedImage bucket="missionaries" path={m.photo_path} onPress={() => setBig(m.photo_path)} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 0 }} />
              ) : (
                <View style={{ height: 120, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="globe" size={44} color={colors.green} />
                </View>
              )}
              <View style={{ padding: 16, gap: 6 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.4 }}>{m.name}</Text>
                {m.field ? (
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                    <Feather name="map-pin" size={15} color={colors.green} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.muted, lineHeight: 20 }}>{m.field}</Text>
                  </View>
                ) : null}
                {reports?.length ? <Text style={{ fontSize: 13, color: colors.greenText, fontWeight: '700' }}>{tx('{n} {pl} · último: {monthLabel}', { n: reports.length, pl: reports.length === 1 ? tx('informe') : tx('informes'), monthLabel: monthLabel(reports[0].month) })}</Text> : null}
              </View>
            </Card>
            {m.bio ? (() => {
              // "Cómo orar por ellos:" en la biografía se muestra aparte, como lista para orar.
              const at = m.bio.search(/c[oó]mo orar/i);
              const about = (at >= 0 ? m.bio.slice(0, at) : m.bio).trim();
              const pray = at >= 0 ? m.bio.slice(at).split('\n').slice(1) : [];
              const prayItems = pray.filter((l) => l.trim().startsWith('•')).map((l) => l.replace(/^\s*•\s*/, ''));
              const rest = pray.filter((l) => l.trim() && !l.trim().startsWith('•')).join('\n').trim();
              return (
                <>
                  {about ? <Card><Text selectable style={{ fontSize: 15, color: colors.text, lineHeight: 23 }}>{about}</Text></Card> : null}
                  {prayItems.length ? (
                    <Card style={{ gap: 8, backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name="heart" size={18} color={colors.blueText} />
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.blueText }}>{tx('Cómo orar por ellos')}</Text>
                      </View>
                      {prayItems.map((t) => <Text key={t} style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>•  {t}</Text>)}
                    </Card>
                  ) : null}
                  {rest ? <Text selectable style={{ fontSize: 13, color: colors.muted, paddingHorizontal: 4 }}>{rest}</Text> : null}
                </>
              );
            })() : null}
            {isStaff ? (
              <View style={{ gap: 8 }}>
                <Button title={tx('Subir informe del mes')} icon="upload" onPress={() => router.push({ pathname: '/misioneros/informe', params: { missionary: m.id } } as unknown as Href)} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={tx('Editar datos')} icon="edit-2" variant="outline" small style={{ flex: 1 }} onPress={() => router.push({ pathname: '/misioneros/editar', params: { id: m.id } } as unknown as Href)} />
                  <Button title={tx('Quitar')} icon="trash-2" variant="ghost" small style={{ flex: 1 }} onPress={askDeleteMissionary} />
                </View>
              </View>
            ) : null}
            <SectionTitle>{tx('Informes')}</SectionTitle>
            {reports === null ? <Loading /> : !reports.length ? <Empty icon="file-text" title={tx('Todavía no hay informes')} text={isStaff ? tx('Subí el primero con el botón de arriba.') : undefined} /> : reports.map((r) => (
              <Card key={r.id} style={{ gap: 10 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, textTransform: 'capitalize' }}>{monthLabel(r.month)}</Text>
                {r.title ? <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.title}</Text> : null}
                {r.summary ? <Text selectable style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>{r.summary}</Text> : null}
                {r.pdf_path ? <Button title={tx('Abrir el informe (PDF)')} icon="file-text" variant="outline" onPress={() => openPdf(r)} /> : null}
                {r.photo_paths.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {r.photo_paths.map((p) => (
                      <SignedImage key={p} bucket="missionaries" path={p} onPress={() => setBig(p)} style={{ width: 104, height: 104, borderRadius: 10 }} />
                    ))}
                  </View>
                ) : null}
                {isStaff ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={tx('Editar')} icon="edit-2" variant="outline" small style={{ flex: 1 }} onPress={() => router.push({ pathname: '/misioneros/informe', params: { missionary: r.missionary_id, month: r.month } } as unknown as Href)} />
                    <Button title={tx('Borrar')} icon="trash-2" variant="ghost" small style={{ flex: 1 }} onPress={() => askDeleteReport(r)} />
                  </View>
                ) : null}
              </Card>
            ))}
          </>
        )}
      </Screen>
      <Modal visible={!!big} transparent animationType="fade" onRequestClose={() => setBig(null)}>
        <Pressable onPress={() => setBig(null)} accessibilityRole="button" accessibilityLabel={tx('Cerrar foto')} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          <SignedImage bucket="missionaries" path={big} fit="contain" style={{ width: '100%', height: '85%', backgroundColor: 'transparent' }} />
        </Pressable>
      </Modal>
    </View>
  );
}
