// Un movimiento: datos, comprobantes (agregar más), corregir o anular con motivo, y su historial.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, SectionTitle } from '@/components/ui';
import { addFinAttachment, finAccounts, finAttachments, finCategories, finEntry, finFunds, voidFinEntry } from '@/lib/api';
import { downloadUrl, pickAndUploadReceipt, signedUrl } from '@/lib/files';
import { fmtDateOnly, fmtMoney } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinAccount, FinAttachment, FinCategory, FinEntry, FinFund } from '@/types';

const METHOD: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque', other: 'Otro' };

export function ReceiptThumb({ a, size = 96 }: { a: FinAttachment; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const pdf = /\.pdf$/i.test(a.path);
  useEffect(() => { if (!pdf) signedUrl('finance', a.path).then(setUrl); }, [a.path, pdf]);
  const open = async () => {
    const u = await downloadUrl('finance', a.path, pdf ? a.file_name ?? 'comprobante.pdf' : null);
    if (u) Linking.openURL(u);
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Abrir comprobante">
      {pdf ? (
        <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Feather name="file-text" size={28} color={colors.muted} />
          <Text style={{ fontSize: 10, color: colors.muted }}>PDF</Text>
        </View>
      ) : (
        <Image source={url ? { uri: url } : undefined} style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.bgSoft }} contentFit="cover" />
      )}
      <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2, width: size }} numberOfLines={1}>{a.kind === 'bank_screen' ? 'Banco' : a.kind === 'receipt' ? 'Recibo' : 'Otro'}</Text>
    </Pressable>
  );
}

export default function MovimientoVer() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { church, financeLevel, profile } = useAuth();
  const [e, setE] = useState<FinEntry | null | undefined>(undefined);
  const [funds, setFunds] = useState<FinFund[]>([]);
  const [cats, setCats] = useState<FinCategory[]>([]);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [files, setFiles] = useState<FinAttachment[]>([]);
  const [history, setHistory] = useState<{ action: string; at: string; by: string | null }[]>([]);
  const [voiding, setVoiding] = useState<string | null>(null);

  const load = useCallback(() => {
    finEntry(id).then(setE).catch(() => setE(null));
    finAttachments({ entryId: id }).then(setFiles).catch(() => undefined);
    Promise.all([finFunds(), finCategories(), finAccounts()]).then(([f, c, a]) => { setFunds(f); setCats(c); setAccounts(a); }).catch(() => undefined);
    if (financeLevel >= 3) {
      supabase.from('fin_audit').select('action, at, by_user').eq('entry_id', id).order('at').then(async ({ data }) => {
        const ids = [...new Set((data ?? []).map((d) => d.by_user).filter(Boolean))] as string[];
        const { data: ps } = ids.length ? await supabase.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
        setHistory((data ?? []).map((d) => ({ action: d.action, at: d.at, by: (ps ?? []).find((p) => p.id === d.by_user)?.display_name ?? null })));
      });
    }
  }, [id, financeLevel]);
  useFocusEffect(load);

  if (e === undefined) return <Loading />;
  if (!e) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Movimiento" back /><Text style={{ padding: 24, color: colors.muted }}>No se encontró.</Text></View>;

  const fname = (x: string | null) => funds.find((f) => f.id === x)?.name ?? '';
  const canEdit = !e.voided_at && (financeLevel >= 3 || (financeLevel === 2 && e.created_by === profile?.id && Date.now() - new Date(e.created_at).getTime() < 7 * 86400000));
  const title = e.kind === 'transfer' ? 'Pase entre fondos' : e.kind === 'income' ? 'Ingreso' : 'Gasto';

  const add = async () => {
    if (!church) return;
    try {
      const p = await pickAndUploadReceipt(church.id, e.on_date.slice(0, 7), e.kind === 'income' ? 'Pantalla del banco' : 'Recibo / factura');
      if (!p) return;
      await addFinAttachment({ entry_id: e.id, month: e.on_date.slice(0, 7), path: p.path, kind: e.kind === 'income' ? 'bank_screen' : 'receipt', file_name: p.name });
      load();
    } catch (err) {
      Alert.alert('No se pudo subir', errorMessage(err));
    }
  };

  const doVoid = async () => {
    if (!voiding?.trim()) { Alert.alert('Poné el motivo'); return; }
    try {
      await voidFinEntry(e.id, voiding.trim());
      setVoiding(null);
      load();
    } catch (err) {
      Alert.alert('No se pudo anular', errorMessage(err));
    }
  };

  const rows: [string, string][] = [
    ['Fecha', fmtDateOnly(e.on_date)],
    e.kind === 'transfer' ? ['Fondos', `${fname(e.fund_id)} → ${fname(e.to_fund_id)}`] : ['Fondo', fname(e.fund_id)],
    ...(e.category_id ? [['Categoría', cats.find((c) => c.id === e.category_id)?.name ?? '']] as [string, string][] : []),
    ...(e.kind !== 'transfer' ? [['Cómo', `${METHOD[e.method]}${e.account_id ? ` · ${accounts.find((a) => a.id === e.account_id)?.name ?? ''}` : ''}`]] as [string, string][] : []),
    ...(e.counterpart ? [[e.kind === 'income' ? 'Quién lo dio' : 'A quién', e.counterpart]] as [string, string][] : []),
    ...(e.description ? [['Detalle', e.description]] as [string, string][] : []),
    ...(e.source ? [['Origen', e.source === 'planilla' ? 'Planilla anterior' : e.source]] as [string, string][] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={title} subtitle={e.voided_at ? 'ANULADO' : undefined} back />
      <Screen>
        <Text style={{ fontSize: 32, fontWeight: '800', color: e.voided_at ? colors.muted : e.kind === 'income' ? colors.greenText : e.kind === 'expense' ? colors.red : colors.text, textDecorationLine: e.voided_at ? 'line-through' : 'none' }}>
          {fmtMoney(e.amount, e.currency)}
        </Text>
        {e.voided_at ? <Card style={{ padding: 12, backgroundColor: colors.redSoft, borderColor: colors.redSoft }}><Text style={{ color: colors.redText }}>Anulado el {fmtDateOnly(e.voided_at.slice(0, 10))}: {e.void_reason}</Text></Card> : null}
        <Card style={{ padding: 0 }}>
          {rows.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: 'row', padding: 12, gap: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ width: 100, fontSize: 13, color: colors.muted }}>{k}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{v}</Text>
            </View>
          ))}
        </Card>

        <SectionTitle>{`Comprobantes (${files.length})`}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {files.map((a) => <ReceiptThumb key={a.id} a={a} />)}
        </View>
        {financeLevel >= 2 && !e.voided_at ? <Button title="Agregar comprobante" icon="camera" variant="outline" small onPress={add} /> : null}

        {canEdit ? (
          voiding === null ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Corregir" icon="edit-2" variant="outline" onPress={() => router.push(`/finanzas/movimiento?id=${e.id}` as Href)} style={{ flex: 1 }} />
              <Button title="Anular" icon="slash" variant="danger" onPress={() => setVoiding('')} style={{ flex: 1 }} />
            </View>
          ) : (
            <Card style={{ gap: 8 }}>
              <Field label="Motivo de la anulación" value={voiding} onChangeText={setVoiding} placeholder="Cargado dos veces" autoFocus />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Cancelar" variant="ghost" small onPress={() => setVoiding(null)} style={{ flex: 1 }} />
                <Button title="Anular" variant="danger" small onPress={doVoid} style={{ flex: 2 }} />
              </View>
            </Card>
          )
        ) : null}

        {history.length ? (
          <>
            <SectionTitle>Historial</SectionTitle>
            {history.map((h, i) => (
              <Text key={i} style={{ fontSize: 12, color: colors.muted }}>
                {new Date(h.at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · {h.action === 'create' ? 'Cargado' : h.action === 'void' ? 'Anulado' : 'Corregido'}{h.by ? ` por ${h.by}` : ''}
              </Text>
            ))}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
