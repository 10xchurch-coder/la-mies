// Comprobantes en carpetas por mes. Dentro de cada carpeta: fotos de recibos y de la pantalla del banco,
// con el movimiento al que pertenecen. Se puede subir un comprobante suelto y unirlo después.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { addFinAttachment, finAttachments, finEntries, finMonthsWithFiles } from '@/lib/api';
import { pickAndUploadReceipt } from '@/lib/files';
import { fmtDateShort, fmtMoney, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinAttachment, FinEntry } from '@/types';
import { ReceiptThumb } from './[id]';
import { monthTitle } from './movimientos';

export default function Comprobantes() {
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const { church, financeLevel } = useAuth();
  const [months, setMonths] = useState<{ month: string; n: number }[] | null>(null);
  const [open, setOpen] = useState<string | null>(params.month ?? null);
  const [files, setFiles] = useState<FinAttachment[] | null>(null);
  const [entries, setEntries] = useState<FinEntry[]>([]);

  const load = useCallback(() => {
    finMonthsWithFiles().then((m) => {
      const cur = isoDate(new Date()).slice(0, 7);
      setMonths(m.some((x) => x.month === cur) ? m : [{ month: cur, n: 0 }, ...m]);
    }).catch(() => setMonths([]));
    if (open) {
      setFiles(null);
      finAttachments({ month: open }).then(setFiles).catch(() => setFiles([]));
      const [y, mo] = open.split('-').map(Number);
      finEntries(`${open}-01`, isoDate(new Date(y, mo, 0))).then(setEntries).catch(() => undefined);
    }
  }, [open]);
  useFocusEffect(load);

  const upload = async () => {
    if (!church || !open) return;
    try {
      const p = await pickAndUploadReceipt(church.id, open, 'Comprobante');
      if (!p) return;
      await addFinAttachment({ entry_id: null, month: open, path: p.path, kind: 'receipt', file_name: p.name });
      load();
    } catch (e) {
      Alert.alert('No se pudo subir', errorMessage(e));
    }
  };

  if (!open) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Comprobantes" subtitle="Una carpeta por mes" back />
        <Screen>
          {months === null ? <Loading /> : !months.length ? <Empty icon="folder" title="Todavía no hay comprobantes" /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(months ?? []).map((m) => (
              <Pressable key={m.month} onPress={() => setOpen(m.month)} accessibilityRole="button"
                style={{ width: '31%', flexGrow: 1, minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 }}>
                <Feather name="folder" size={28} color={colors.amber} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{monthTitle(m.month)}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{m.n} {m.n === 1 ? 'archivo' : 'archivos'}</Text>
              </Pressable>
            ))}
          </View>
        </Screen>
      </View>
    );
  }

  const byEntry = new Map<string | null, FinAttachment[]>();
  for (const f of files ?? []) byEntry.set(f.entry_id, [...(byEntry.get(f.entry_id) ?? []), f]);
  const loose = byEntry.get(null) ?? [];
  const withEntry = entries.filter((e) => byEntry.has(e.id));
  const missing = entries.filter((e) => !e.voided_at && e.kind !== 'transfer' && e.method !== 'cash' && !byEntry.has(e.id));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={monthTitle(open)} subtitle="Comprobantes del mes" back />
      <Screen>
        <Button title="Todas las carpetas" icon="folder" variant="ghost" small onPress={() => { setOpen(null); setFiles(null); }} />
        {financeLevel >= 2 ? <Button title="Subir comprobante suelto" icon="upload" variant="outline" onPress={upload} /> : null}
        {files === null ? <Loading /> : !files.length ? <Empty icon="image" title="No hay comprobantes en este mes" /> : null}
        {withEntry.map((e) => (
          <Pressable key={e.id} onPress={() => router.push(`/finanzas/${e.id}` as Href)} accessibilityRole="button">
            <Card style={{ gap: 8, padding: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                {fmtDateShort(e.on_date)} · {e.kind === 'income' ? 'Ingreso' : e.kind === 'expense' ? 'Gasto' : 'Pase'} {fmtMoney(e.amount, e.currency)}
                {e.counterpart ? ` · ${e.counterpart}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(byEntry.get(e.id) ?? []).map((a) => <ReceiptThumb key={a.id} a={a} size={84} />)}
              </View>
            </Card>
          </Pressable>
        ))}
        {loose.length ? (
          <Card style={{ gap: 8, padding: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Sueltos (sin movimiento)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {loose.map((a) => <ReceiptThumb key={a.id} a={a} size={84} />)}
            </View>
          </Card>
        ) : null}
        {missing.length ? (
          <Card style={{ gap: 6, padding: 12, backgroundColor: colors.amberSoft, borderColor: colors.amberSoft }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.amberText }}>Falta el comprobante ({missing.length})</Text>
            {missing.slice(0, 10).map((e) => (
              <Text key={e.id} onPress={() => router.push(`/finanzas/${e.id}` as Href)} style={{ fontSize: 13, color: colors.text }}>
                · {fmtDateShort(e.on_date)} {e.kind === 'income' ? 'ingreso' : 'gasto'} {fmtMoney(e.amount, e.currency)}{e.counterpart ? ` (${e.counterpart})` : ''}
              </Text>
            ))}
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}
