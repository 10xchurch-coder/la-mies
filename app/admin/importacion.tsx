// Las importaciones de personas: cuándo se hizo cada una y cuántas entraron. Al abrir una se ven sus fichas.
// "Deshacer" la deja marcada; las fichas se quitan con el mismo permiso y el mismo botón de borrar de siempre (deleteContact).
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, SectionTitle, Tag } from '@/components/ui';
import { batchContacts, batchUndo, listBatches, type BatchContact, type ImportBatch } from '@/lib/altaData';
import { deleteContact } from '@/lib/api';
import { fmtDayYear } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

/** Una ficha "sin tocar": nadie la cambió después de cargarla y no tiene cuenta unida. Solo esas se quitan de una vez. */
const untouched = (c: BatchContact) => !c.profile_id && Math.abs(new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) < 5000;

export default function Importacion() {
  const router = useRouter();
  const { can } = useAuth();
  const { lote } = useLocalSearchParams<{ lote?: string }>();
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [people, setPeople] = useState<BatchContact[] | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const allowed = can('personas.editar');
  const id = typeof lote === 'string' && lote ? lote : null;

  const load = useCallback(() => {
    if (!allowed) return;
    listBatches().then(setBatches).catch(() => setBatches([]));
    if (id) batchContacts(id).then(setPeople).catch(() => setPeople([])); else setPeople(null);
  }, [allowed, id]);
  useFocusEffect(load);

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Importaciones" back />
        <Empty icon="lock" title="Solo la secretaría o el pastor" />
      </View>
    );
  }
  if (batches === null) return <Loading />;

  const b = id ? batches.find((x) => x.id === id) ?? null : null;
  const small = { fontSize: 13, color: colors.muted, lineHeight: 18 } as const;
  const line = (x: ImportBatch) => [`${x.added} agregadas`, x.merged ? `${x.merged} unidas` : '', x.skipped ? `${x.skipped} salteadas` : ''].filter(Boolean).join(' · ');

  if (!id) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Importaciones" subtitle="Las listas que se cargaron" back />
        <Screen>
          {!batches.length ? <Empty icon="upload" title="Todavía no se importó ninguna lista" text="Cuando cargues una planilla, queda anotada acá." /> : null}
          {batches.map((x) => (
            <Pressable key={x.id} onPress={() => router.push(`/admin/importacion?lote=${x.id}` as Href)} accessibilityRole="button">
              <Card style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{x.file_name || 'Lista'} · {fmtDayYear(x.created_at)}</Text>
                  {x.undo_at ? <Tag text="Para deshacer" tone="red" /> : null}
                  {x.by_network ? <Tag text="La cargó el equipo de La Mies" tone="blue" /> : null}
                </View>
                <Text style={small}>{line(x)}</Text>
              </Card>
            </Pressable>
          ))}
          <Button title="Importar otra lista" icon="upload" variant="outline" onPress={() => router.push('/admin/importar' as Href)} />
        </Screen>
      </View>
    );
  }

  const list = people ?? [];
  const clean = list.filter(untouched);
  const mark = (on: boolean) => batchUndo(id, on).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e)));
  const removeOne = (c: BatchContact) => Alert.alert(`¿Quitar a ${c.name}?`, 'Se borra la ficha. No se puede recuperar.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Quitar', style: 'destructive', onPress: () => { deleteContact(c.id).then(load).catch((e) => Alert.alert('No se pudo quitar', errorMessage(e))); } },
  ]);
  const removeClean = () => Alert.alert(`¿Quitar ${clean.length} ${clean.length === 1 ? 'ficha' : 'fichas'}?`,
    'Se borran las fichas de esta importación que nadie tocó. Las que alguien cambió o que ya tienen cuenta quedan en la lista para que las mires una por una. No se puede recuperar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive', onPress: async () => {
          let failed = 0;
          setLeft(clean.length);
          for (const c of clean) {
            try { await deleteContact(c.id); } catch { failed++; }
            setLeft((n) => (n ?? 1) - 1);
          }
          setLeft(null);
          load();
          if (failed) Alert.alert('Algunas no se pudieron quitar', `${failed} fichas siguen en la lista. Abrilas y miralas una por una.`);
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Una importación" subtitle={b ? `${b.file_name || 'Lista'} · ${fmtDayYear(b.created_at)}` : undefined} back />
      <Screen>
        {!b ? <Empty icon="upload" title="No encontré esa importación" /> : (
          <>
            <Card style={{ gap: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{line(b)}</Text>
              {b.by_network ? <Text style={small}>La cargó el equipo de La Mies, porque el pastor lo pidió.</Text> : null}
              <Text style={small}>Quedan {list.length} {list.length === 1 ? 'ficha' : 'fichas'} de esta importación.</Text>
              {b.undo_at ? (
                <>
                  <Text style={{ color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 }}>
                    Está marcada para deshacer. Quitá las fichas de abajo. Las que se unieron a fichas que ya estaban no cambian.
                  </Text>
                  {clean.length ? <Button title={left !== null ? `Quitando… faltan ${left}` : `Quitar las ${clean.length} que nadie tocó`} icon="trash-2" variant="danger" onPress={removeClean} disabled={left !== null} /> : null}
                  <Button title="Al final la dejo: sacar la marca" variant="ghost" small onPress={() => mark(false)} />
                </>
              ) : <Button title="Deshacer esta importación" icon="rotate-ccw" variant="danger" small onPress={() => mark(true)} />}
            </Card>
            <SectionTitle>Las fichas que entraron</SectionTitle>
            {people === null ? <Loading /> : !list.length ? <Text style={small}>No queda ninguna ficha de esta importación.</Text> : null}
            {list.slice(0, 300).map((c) => (
              <Card key={c.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable style={{ flex: 1, gap: 2 }} accessibilityRole="button" onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: c.id } })}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{c.name}</Text>
                  <Text style={small}>{[c.phone ? formatPhone(c.phone) : 'Sin celular', untouched(c) ? '' : c.profile_id ? 'Ya tiene cuenta' : 'Alguien la cambió'].filter(Boolean).join(' · ')}</Text>
                </Pressable>
                {b.undo_at ? <Button title="Quitar" variant="danger" small onPress={() => removeOne(c)} /> : null}
              </Card>
            ))}
            {list.length > 300 ? <Text style={small}>Y {list.length - 300} más.</Text> : null}
          </>
        )}
      </Screen>
    </View>
  );
}
