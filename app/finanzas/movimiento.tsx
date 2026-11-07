// Cargar o corregir un movimiento: ingreso, gasto o pase entre fondos.
// Para una transferencia que entró, se adjunta la foto de la pantalla del banco; para un gasto, la del recibo.
// Las fotos quedan en la carpeta del mes del movimiento.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { DateChips } from '@/components/Picker';
import { Button, Card, Choice, Field, Loading, SectionTitle } from '@/components/ui';
import { addFinAttachment, addFinCategory, finAccounts, finCategories, finEntry, finFunds, saveFinEntry } from '@/lib/api';
import { pickAndUploadReceipt, signedUrl, type FinPhoto } from '@/lib/files';
import { addDays, fmtDateShort, fmtMoney, isoDate, parseDateAR, parseMoney } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinAccount, FinCategory, FinFund, FinKind, FinMethod } from '@/types';

const KIND_LABEL: Record<FinKind, string> = { income: 'Ingreso', expense: 'Gasto', transfer: 'Pase entre fondos' };
const METHOD_LABEL: Record<FinMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque', other: 'Otro' };

function Thumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedUrl('finance', path).then(setUrl); }, [path]);
  if (/\.pdf$/i.test(path)) return <View style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}><Feather name="file-text" size={26} color={colors.muted} /></View>;
  return <Image source={url ? { uri: url } : undefined} style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: colors.bgSoft }} contentFit="cover" />;
}

export default function Movimiento() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: FinKind; id?: string; fund?: string }>();
  const { church, financeLevel } = useAuth();
  const [kind, setKind] = useState<FinKind>(params.kind ?? 'income');
  const [funds, setFunds] = useState<FinFund[]>([]);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [cats, setCats] = useState<FinCategory[]>([]);
  const [loaded, setLoaded] = useState(!params.id);
  const [date, setDate] = useState(isoDate(new Date()));
  const [otherDate, setOtherDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [fund, setFund] = useState<string>('');
  const [toFund, setToFund] = useState<string>('');
  const [cat, setCat] = useState<string>('');
  const [account, setAccount] = useState<string>('');
  const [method, setMethod] = useState<FinMethod>('cash');
  const [counterpart, setCounterpart] = useState('');
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState<(FinPhoto & { kind: 'receipt' | 'bank_screen' })[]>([]);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([finFunds(), finAccounts(), finCategories()]).then(([f, a, c]) => {
      setFunds(f.filter((x) => x.active));
      setAccounts(a);
      setCats(c);
      if (!params.id) {
        setFund(params.fund ?? f.find((x) => x.kind === 'general')?.id ?? f[0]?.id ?? '');
        setAccount(a[0]?.id ?? '');
      }
    }).catch((e) => Alert.alert('No se pudo', errorMessage(e)));
    if (params.id) {
      finEntry(params.id).then((e) => {
        if (!e) return;
        setKind(e.kind); setDate(e.on_date); setAmount(String(e.amount).replace('.', ',')); setCurrency(e.currency === 'USD' ? 'USD' : 'ARS');
        setFund(e.fund_id); setToFund(e.to_fund_id ?? ''); setCat(e.category_id ?? ''); setAccount(e.account_id ?? '');
        setMethod(e.method); setCounterpart(e.counterpart ?? ''); setDesc(e.description ?? '');
        setLoaded(true);
      });
    }
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirCats = useMemo(() => cats.filter((c) => c.direction === (kind === 'income' ? 'in' : 'out')), [cats, kind]);
  const dates = useMemo(() => Array.from({ length: 10 }, (_, i) => isoDate(addDays(new Date(), -i))), []);
  const month = date.slice(0, 7);
  const fundObj = funds.find((f) => f.id === fund);
  const needsDetail = kind !== 'transfer' && fundObj?.kind === 'designated';

  const attach = async (k: 'receipt' | 'bank_screen') => {
    if (!church) return;
    try {
      const p = await pickAndUploadReceipt(church.id, month, k === 'bank_screen' ? 'Pantalla del banco' : 'Recibo / factura');
      if (p) setPhotos((x) => [...x, { ...p, kind: k }]);
    } catch (e) {
      Alert.alert('No se pudo subir', errorMessage(e));
    }
  };

  const createCat = async () => {
    if (!newCat?.trim()) return;
    try {
      const c = await addFinCategory(newCat.trim(), kind === 'income' ? 'in' : 'out');
      setCats((x) => [...x, c]);
      setCat(c.id);
      setNewCat(null);
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
  };

  const save = async () => {
    const v = parseMoney(amount);
    if (!v) { Alert.alert('Falta el monto', 'Escribí el monto, por ejemplo 15.000 o 15000,50.'); return; }
    if (!fund) { Alert.alert('Elegí el fondo'); return; }
    if (kind === 'transfer' && (!toFund || toFund === fund)) { Alert.alert('Elegí a qué fondo pasa'); return; }
    if (needsDetail && !desc.trim()) { Alert.alert('¿Para qué es?', 'En el fondo Designado, escribí para qué se dio o en qué se usó.'); return; }
    if (kind !== 'transfer' && method === 'transfer' && !photos.length && !params.id) {
      const go = await new Promise<boolean>((resolve) => Alert.alert('Sin foto', kind === 'income' ? '¿Guardar sin la foto de la pantalla del banco?' : '¿Guardar sin la foto del comprobante?', [
        { text: 'Agregar foto', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Guardar igual', onPress: () => resolve(true) },
      ]));
      if (!go) return;
    }
    setBusy(true);
    try {
      const id = await saveFinEntry({
        id: params.id, on_date: date, kind, fund_id: fund, to_fund_id: kind === 'transfer' ? toFund : null, amount: v, currency,
        category_id: kind === 'transfer' ? null : cat || null, account_id: account || null, method,
        counterpart: counterpart.trim() || null, description: desc.trim() || null,
      });
      for (const p of photos) await addFinAttachment({ entry_id: id, month, path: p.path, kind: p.kind, file_name: p.name });
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (financeLevel < 2) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Movimiento" back /><Text style={{ padding: 24, color: colors.muted }}>No tenés permiso para cargar.</Text></View>;
  if (!loaded) return <Loading />;

  const pill = (on: boolean) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.greenSoft : colors.bg, justifyContent: 'center' as const });
  const pillText = (on: boolean) => ({ fontSize: 14, fontWeight: (on ? '800' : '600') as '800' | '600', color: on ? colors.greenText : colors.text });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={params.id ? 'Corregir movimiento' : KIND_LABEL[kind]} back />
      <Screen>
        {!params.id ? (
          <Choice columns={3} options={(Object.keys(KIND_LABEL) as FinKind[]).map((k) => ({ value: k, label: k === 'transfer' ? 'Pase' : KIND_LABEL[k] }))} value={kind} onChange={(k) => { setKind(k); setCat(''); }} />
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Field label="Monto" value={amount} onChangeText={setAmount} placeholder="15.000" keyboardType="decimal-pad" style={{ flex: 1 }} autoFocus={!params.id} />
          <Choice columns={2} options={[{ value: 'ARS', label: '$' }, { value: 'USD', label: 'US$' }]} value={currency} onChange={setCurrency} style={{ width: 120 }} />
        </View>
        {parseMoney(amount) ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: -8 }}>{fmtMoney(parseMoney(amount), currency)}</Text> : null}

        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Fecha</Text>
        <DateChips dates={dates.includes(date) ? dates : [date, ...dates]} value={date} onChange={setDate} format={(d) => (d === isoDate(new Date()) ? 'Hoy' : fmtDateShort(d))} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Field label="Otra fecha" value={otherDate} onChangeText={setOtherDate} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
          <Button title="Usar" small variant="outline" onPress={() => { const d = parseDateAR(otherDate); if (d) setDate(d); else Alert.alert('Fecha inválida', 'Escribila así: 15/03/2026.'); }} />
        </View>

        <SectionTitle>{kind === 'transfer' ? 'Sale del fondo' : 'Fondo'}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {funds.map((f) => <Pressable key={f.id} onPress={() => setFund(f.id)} style={pill(fund === f.id)} accessibilityRole="button"><Text style={pillText(fund === f.id)}>{f.name}</Text></Pressable>)}
        </View>
        {kind === 'transfer' ? (
          <>
            <SectionTitle>Entra al fondo</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {funds.filter((f) => f.id !== fund).map((f) => <Pressable key={f.id} onPress={() => setToFund(f.id)} style={pill(toFund === f.id)} accessibilityRole="button"><Text style={pillText(toFund === f.id)}>{f.name}</Text></Pressable>)}
            </View>
          </>
        ) : (
          <>
            <SectionTitle>Categoría</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {dirCats.map((c) => <Pressable key={c.id} onPress={() => setCat(c.id)} style={pill(cat === c.id)} accessibilityRole="button"><Text style={pillText(cat === c.id)}>{c.name}</Text></Pressable>)}
              {financeLevel >= 3 && newCat === null ? <Pressable onPress={() => setNewCat('')} style={pill(false)} accessibilityRole="button"><Text style={pillText(false)}>+ Otra</Text></Pressable> : null}
            </View>
            {newCat !== null ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <Field label="Nueva categoría" value={newCat} onChangeText={setNewCat} style={{ flex: 1 }} />
                <Button title="Crear" small onPress={createCat} />
              </View>
            ) : null}

            <SectionTitle>Cómo</SectionTitle>
            <Choice columns={3} options={(['cash', 'transfer', 'card'] as FinMethod[]).map((m) => ({ value: m, label: METHOD_LABEL[m] }))} value={method} onChange={setMethod} />
            {accounts.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {accounts.map((a) => <Pressable key={a.id} onPress={() => setAccount(a.id)} style={pill(account === a.id)} accessibilityRole="button"><Text style={pillText(account === a.id)}>{a.name}</Text></Pressable>)}
              </View>
            ) : null}
            <Field label={kind === 'income' ? 'Quién lo dio (opcional)' : 'A quién se pagó (opcional)'} value={counterpart} onChangeText={setCounterpart} placeholder={kind === 'income' ? 'Ofrenda del culto, iglesia que apoya…' : 'Edenor, ferretería…'} />
          </>
        )}
        <Field label={needsDetail ? 'Para qué es (obligatorio en Designado)' : 'Detalle (opcional)'} value={desc} onChangeText={setDesc} multiline />

        <SectionTitle>Comprobantes</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p) => (
            <View key={p.path}>
              <Thumb path={p.path} />
              <Pressable onPress={() => setPhotos((x) => x.filter((y) => y.path !== p.path))} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Quitar">
                <Feather name="x" size={14} color="#FFF" />
              </Pressable>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {kind !== 'expense' ? <Button title="Pantalla del banco" icon="smartphone" variant="outline" small onPress={() => attach('bank_screen')} style={{ flex: 1 }} /> : null}
          {kind !== 'income' ? <Button title="Recibo / factura" icon="file-text" variant="outline" small onPress={() => attach('receipt')} style={{ flex: 1 }} /> : null}
          {kind === 'income' ? <Button title="Otro" icon="paperclip" variant="ghost" small onPress={() => attach('receipt')} style={{ flex: 1 }} /> : null}
        </View>
        <Text style={{ fontSize: 12, color: colors.muted }}>Se guardan en la carpeta de {new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}.</Text>

        <Card style={{ padding: 12, backgroundColor: colors.bgSoft, borderColor: colors.bgSoft }}>
          <Text style={{ fontSize: 14, color: colors.text }}>
            {KIND_LABEL[kind]} de <Text style={{ fontWeight: '800' }}>{fmtMoney(parseMoney(amount) ?? 0, currency)}</Text>
            {kind === 'transfer' ? ` de ${fundObj?.name ?? '…'} a ${funds.find((f) => f.id === toFund)?.name ?? '…'}` : ` en ${fundObj?.name ?? '…'}`} · {fmtDateShort(date)}
          </Text>
        </Card>
        <Button title="Guardar" onPress={save} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
