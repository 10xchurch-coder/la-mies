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
import { tx } from '@/lib/i18n';

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
        <Header title={tx('Importaciones')} back />
        <Empty icon="lock" title={tx('Solo la secretaría o el pastor')} />
      </View>
    );
  }
  if (batches === null) return <Loading />;

  const b = id ? batches.find((x) => x.id === id) ?? null : null;
  const small = { fontSize: 13, color: colors.muted, lineHeight: 18 } as const;
  const line = (x: ImportBatch) => [tx('{added} agregadas', { added: x.added }), x.merged ? tx('{merged} unidas', { merged: x.merged }) : '', x.skipped ? tx('{skipped} salteadas', { skipped: x.skipped }) : ''].filter(Boolean).join(' · ');

  if (!id) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Importaciones')} subtitle={tx('Las listas que se cargaron')} back />
        <Screen>
          {!batches.length ? <Empty icon="upload" title={tx('Todavía no se importó ninguna lista')} text={tx('Cuando cargues una planilla, queda anotada acá.')} /> : null}
          {batches.map((x) => (
            <Pressable key={x.id} onPress={() => router.push(`/admin/importacion?lote=${x.id}` as Href)} accessibilityRole="button">
              <Card style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{x.file_name || tx('Lista')} · {fmtDayYear(x.created_at)}</Text>
                  {x.undo_at ? <Tag text={tx('Para deshacer')} tone="red" /> : null}
                  {x.by_network ? <Tag text={tx('La cargó el equipo de La Mies')} tone="blue" /> : null}
                </View>
                <Text style={small}>{line(x)}</Text>
              </Card>
            </Pressable>
          ))}
          <Button title={tx('Importar otra lista')} icon="upload" variant="outline" onPress={() => router.push('/admin/importar' as Href)} />
        </Screen>
      </View>
    );
  }

  const list = people ?? [];
  const clean = list.filter(untouched);
  const mark = (on: boolean) => batchUndo(id, on).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
  const removeOne = (c: BatchContact) => Alert.alert(tx('¿Quitar a {name}?', { name: c.name }), tx('Se borra la ficha. No se puede recuperar.'), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Quitar'), style: 'destructive', onPress: () => { deleteContact(c.id).then(load).catch((e) => Alert.alert(tx('No se pudo quitar'), errorMessage(e))); } },
  ]);
  const removeClean = () => Alert.alert(tx('¿Quitar {n} {pl}?', { n: clean.length, pl: clean.length === 1 ? tx('ficha') : tx('fichas') }),
    tx('Se borran las fichas de esta importación que nadie tocó. Las que alguien cambió o que ya tienen cuenta quedan en la lista para que las mires una por una. No se puede recuperar.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      {
        text: tx('Quitar'), style: 'destructive', onPress: async () => {
          let failed = 0;
          setLeft(clean.length);
          for (const c of clean) {
            try { await deleteContact(c.id); } catch { failed++; }
            setLeft((n) => (n ?? 1) - 1);
          }
          setLeft(null);
          load();
          if (failed) Alert.alert(tx('Algunas no se pudieron quitar'), tx('{failed} fichas siguen en la lista. Abrilas y miralas una por una.', { failed }));
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Una importación')} subtitle={b ? `${b.file_name || tx('Lista')} · ${fmtDayYear(b.created_at)}` : undefined} back />
      <Screen>
        {!b ? <Empty icon="upload" title={tx('No encontré esa importación')} /> : (
          <>
            <Card style={{ gap: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{line(b)}</Text>
              {b.by_network ? <Text style={small}>{tx('La cargó el equipo de La Mies, porque el pastor lo pidió.')}</Text> : null}
              <Text style={small}>{tx('Quedan {n} {pl} de esta importación.', { n: list.length, pl: list.length === 1 ? tx('ficha') : tx('fichas') })}</Text>
              {b.undo_at ? (
                <>
                  <Text style={{ color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 }}>
                    {tx('Está marcada para deshacer. Quitá las fichas de abajo. Las que se unieron a fichas que ya estaban no cambian.')}
                  </Text>
                  {clean.length ? <Button title={left !== null ? tx('Quitando… faltan {left}', { left }) : tx('Quitar las {n} que nadie tocó', { n: clean.length })} icon="trash-2" variant="danger" onPress={removeClean} disabled={left !== null} /> : null}
                  <Button title={tx('Al final la dejo: sacar la marca')} variant="ghost" small onPress={() => mark(false)} />
                </>
              ) : <Button title={tx('Deshacer esta importación')} icon="rotate-ccw" variant="danger" small onPress={() => mark(true)} />}
            </Card>
            <SectionTitle>{tx('Las fichas que entraron')}</SectionTitle>
            {people === null ? <Loading /> : !list.length ? <Text style={small}>{tx('No queda ninguna ficha de esta importación.')}</Text> : null}
            {list.slice(0, 300).map((c) => (
              <Card key={c.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable style={{ flex: 1, gap: 2 }} accessibilityRole="button" onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: c.id } })}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{c.name}</Text>
                  <Text style={small}>{[c.phone ? formatPhone(c.phone) : tx('Sin celular'), untouched(c) ? '' : c.profile_id ? tx('Ya tiene cuenta') : tx('Alguien la cambió')].filter(Boolean).join(' · ')}</Text>
                </Pressable>
                {b.undo_at ? <Button title={tx('Quitar')} variant="danger" small onPress={() => removeOne(c)} /> : null}
              </Card>
            ))}
            {list.length > 300 ? <Text style={small}>{tx('Y {v1} más.', { v1: list.length - 300 })}</Text> : null}
          </>
        )}
      </Screen>
    </View>
  );
}
