// Cargar o corregir un movimiento. Se entra desde los botones Ingreso o Gasto de Finanzas (y "Pasar plata" para un pase).
// Gasto: lo primero es la foto del recibo; la app lee el total y el comercio, y elige la categoría que se usó la última vez para ese comercio.
// Ingreso: solo monto, fecha, fondo y si entró en efectivo o al banco.
// La fecha ya viene con la de hoy; se toca para cambiarla.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Field, Loading, SectionTitle } from '@/components/ui';
import { addFinAttachment, addFinCategory, finAccounts, finCategories, finEntry, finFunds, finVendorHistory, finCategoryUsage, readReceipt, saveFinEntry, readBankBalance, bankIncomeGuess, saveBankSnapshot } from '@/lib/api';
import { pickAndUploadReceipt, signedUrl, type FinPhoto } from '@/lib/files';
import { fmtDateShort, fmtMoney, isoDate, parseDateAR, parseMoney } from '@/lib/format';
import { categoryForVendor, isoToDMY, methodForAccount, todayDMY } from '@/lib/receipt';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { FinAccount, FinCategory, FinFund, FinKind } from '@/types';
import { tx, txLocale } from '@/lib/i18n';
import { featureOn } from '@/lib/features';

const TITLE: Record<FinKind, string> = { get income() { return tx('Ingreso'); }, get expense() { return tx('Gasto'); }, get transfer() { return tx('Pasar plata'); } };

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
  const [history, setHistory] = useState<{ counterpart: string | null; category_id: string | null }[]>([]);
  const [loaded, setLoaded] = useState(!params.id);
  const [dateText, setDateText] = useState(todayDMY());   // lo que se ve en el campo; ya viene con hoy
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [fund, setFund] = useState<string>('');
  const [toFund, setToFund] = useState<string>('');
  const [between, setBetween] = useState<'funds' | 'accounts'>('funds');
  const [toAccount, setToAccount] = useState<string>('');
  const [cat, setCat] = useState<string>('');
  const [catAuto, setCatAuto] = useState(false);         // la eligió la app (se muestra el aviso)
  const [account, setAccount] = useState<string>('');
  const [counterpart, setCounterpart] = useState('');
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState<(FinPhoto & { kind: 'receipt' | 'bank_screen' })[]>([]);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [allCats, setAllCats] = useState(false);   // ver todas las categorías (si no, solo las más usadas)
  const [bankBal, setBankBal] = useState<{ balance: number; path: string } | null>(null);   // saldo leído de la captura del banco
  const [busy, setBusy] = useState(false);

  // Si la iglesia apagó "Ofrendas por persona", tampoco se anota quién dio cada ingreso.
  const trackDonors = !!church?.fin_track_donors && featureOn(church?.disabled_features, 'ofrendas_persona');

  useEffect(() => {
    Promise.all([finFunds(), finAccounts(), finCategories()]).then(([f, a, c]) => {
      setFunds(f.filter((x) => x.active));
      setAccounts(a.filter((x) => x.active));
      setCats(c);
      if (!params.id) {
        setFund(params.fund ?? f.find((x) => x.kind === 'general')?.id ?? f[0]?.id ?? '');
        setAccount(a.find((x) => x.kind === 'cash')?.id ?? a[0]?.id ?? '');
      }
    }).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
    finVendorHistory().then(setHistory).catch(() => undefined);
    finCategoryUsage().then(setUsage).catch(() => undefined);
    if (params.id) {
      finEntry(params.id).then((e) => {
        if (!e) return;
        setKind(e.kind); setDateText(isoToDMY(e.on_date)); setAmount(String(e.amount).replace('.', ',')); setCurrency(e.currency === 'USD' ? 'USD' : 'ARS');
        setFund(e.fund_id); setToFund(e.to_fund_id ?? ''); setCat(e.category_id ?? ''); setAccount(e.account_id ?? '');
        setToAccount(e.to_account_id ?? ''); if (e.kind === 'transfer' && e.to_fund_id === e.fund_id) setBetween('accounts');
        setCounterpart(e.counterpart ?? ''); setDesc(e.description ?? '');
        setLoaded(true);
      });
    }
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const date = parseDateAR(dateText);
  const outCats = useMemo(() => cats.filter((c) => c.direction === 'out')
    .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.name.localeCompare(b.name)), [cats, usage]);
  // Las 5 más usadas por la iglesia; la elegida siempre se ve aunque no esté entre ellas.
  const TOP = 5;
  const shownCats = allCats ? outCats : [...outCats.slice(0, TOP), ...outCats.slice(TOP).filter((c) => c.id === cat)];
  const month = (date ?? isoDate(new Date())).slice(0, 7);
  const fundObj = funds.find((f) => f.id === fund);
  const accObj = accounts.find((a) => a.id === account);
  const needsDetail = kind !== 'transfer' && fundObj?.kind === 'designated';

  // Al escribir el comercio, si ya se le pagó antes, se elige sola la misma categoría (se puede cambiar).
  const vendorChanged = (t: string) => {
    setCounterpart(t);
    if (kind !== 'expense' || (cat && !catAuto)) return;
    const c = categoryForVendor(t, history);
    if (c) { setCat(c); setCatAuto(true); }
  };

  const snapReceipt = async () => {
    if (!church) return;
    try {
      const p = await pickAndUploadReceipt(church.id, month, tx('Foto del recibo'));
      if (!p) return;
      setPhotos((x) => [...x, { ...p, kind: 'receipt' }]);
      if (/\.pdf$/i.test(p.path)) return;
      setReading(true); setReadNote(null);
      const r = await readReceipt(p.path, outCats.map((c) => c.name)).catch(() => null);
      setReading(false);
      if (!r) { setReadNote(tx('No pude leer el recibo. Escribí el monto.')); return; }
      const filled: string[] = [];
      if (r.total && !parseMoney(amount)) { setAmount(String(r.total).replace('.', ',')); filled.push(tx('el monto')); }
      if (r.currency === 'USD') setCurrency('USD');
      if (r.vendor && !counterpart) { setCounterpart(r.vendor); filled.push(tx('el comercio')); }
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date <= isoDate(new Date())) { setDateText(isoToDMY(r.date)); filled.push(tx('la fecha')); }
      if (!cat || catAuto) {
        const remembered = categoryForVendor(r.vendor, history);
        const guessed = remembered ?? outCats.find((c) => c.name.toLowerCase() === (r.category ?? '').toLowerCase())?.id ?? null;
        if (guessed) { setCat(guessed); setCatAuto(true); filled.push(tx('la categoría')); }
      }
      setReadNote(filled.length ? tx('Leí {replace} del recibo. Revisalo antes de guardar.', { replace: filled.join(', ').replace(/, ([^,]*)$/, ' y $1') }) : tx('No encontré el total en la foto. Escribí el monto.'));
    } catch (e) {
      setReading(false);
      Alert.alert(tx('No se pudo subir'), errorMessage(e));
    }
  };

  // Ingreso al banco: con la captura del saldo, lo que entró = saldo nuevo − (saldo de la vez anterior + lo que ya se cargó del banco desde entonces).
  const attachBank = async () => {
    if (!church) return;
    try {
      const p = await pickAndUploadReceipt(church.id, month, tx('Captura del banco'));
      if (!p) return;
      setPhotos((x) => [...x, { ...p, kind: 'bank_screen' }]);
      const bank = accounts.find((a) => a.kind === 'bank');
      if (!bank || /\.pdf$/i.test(p.path)) return;
      setAccount(bank.id);
      setReading(true); setReadNote(null);
      const bal = await readBankBalance(p.path).catch(() => null);
      if (bal === null) { setReading(false); setReadNote(tx('No pude leer el saldo en la captura. Escribí el monto que entró.')); return; }
      setBankBal({ balance: bal, path: p.path });
      const g = await bankIncomeGuess(bank.id, bal).catch(() => null);
      setReading(false);
      if (!g) { setReadNote(tx('Saldo leído: {fmtMoney}. Es la primera vez: guardo este saldo y la próxima vez calculo solo lo que entró. Ahora escribí el monto.', { fmtMoney: fmtMoney(bal) })); return; }
      const when = new Date(g.prev_at).toLocaleDateString(txLocale(), { day: 'numeric', month: 'long' });
      if (g.suggested > 0) {
        setAmount(String(g.suggested).replace('.', ','));
        setReadNote(tx('Saldo ahora {fmtMoney}. El {when} había {fmtMoney2}{v1}. Entraron {fmtMoney3}. Revisalo antes de guardar.', { fmtMoney: fmtMoney(bal), when, fmtMoney2: fmtMoney(g.prev_balance), v1: g.recorded_since ? tx(' y desde entonces se cargaron {fmtMoney} en el banco', { fmtMoney: fmtMoney(g.recorded_since) }) : '', fmtMoney3: fmtMoney(g.suggested) }));
      } else {
        setReadNote(tx('Saldo ahora {fmtMoney}. Comparado con el {when} ({fmtMoney2}{v1}) no entró plata nueva. Revisá si falta cargar algún gasto del banco.', { fmtMoney: fmtMoney(bal), when, fmtMoney2: fmtMoney(g.prev_balance), v1: g.recorded_since ? tx(' más lo cargado: {fmtMoney}', { fmtMoney: fmtMoney(g.recorded_since) }) : '' }));
      }
    } catch (e) { setReading(false); Alert.alert(tx('No se pudo subir'), errorMessage(e)); }
  };

  const createCat = async () => {
    if (!newCat?.trim()) return;
    try {
      const c = await addFinCategory(newCat.trim(), 'out');
      setCats((x) => [...x, c]); setCat(c.id); setCatAuto(false); setNewCat(null);
    } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); }
  };

  const save = async () => {
    const v = parseMoney(amount);
    if (!v) { Alert.alert(tx('Falta el monto'), tx('Escribí el monto, por ejemplo 15.000 o 15000,50.')); return; }
    if (!date) { Alert.alert(tx('La fecha no sirve'), tx('Escribila así: 22/11/2026.')); return; }
    if (date > isoDate(new Date())) { Alert.alert(tx('Fecha en el futuro'), tx('Revisá la fecha.')); return; }
    if (!fund) { Alert.alert(tx('Elegí el fondo')); return; }
    if (kind === 'expense' && !cat) { Alert.alert(tx('Elegí la categoría'), tx('¿En qué se gastó?')); return; }
    if (kind === 'transfer' && between === 'funds' && (!toFund || toFund === fund)) { Alert.alert(tx('Elegí a qué fondo pasa')); return; }
    if (kind === 'transfer' && between === 'accounts' && (!account || !toAccount || account === toAccount)) { Alert.alert(tx('Elegí de dónde sale y a dónde entra')); return; }
    if (needsDetail && !desc.trim()) { Alert.alert(tx('¿Para qué es?'), tx('En el fondo Designado, escribí para qué se dio o en qué se usó.')); return; }
    if (kind === 'expense' && !photos.length && !params.id) {
      const go = await new Promise<boolean>((resolve) => Alert.alert(tx('Sin recibo'), tx('¿Guardar el gasto sin la foto del recibo?'), [
        { text: tx('Sacar foto'), style: 'cancel', onPress: () => resolve(false) },
        { text: tx('Guardar igual'), onPress: () => resolve(true) },
      ]));
      if (!go) { snapReceipt(); return; }
    }
    setBusy(true);
    try {
      const id = await saveFinEntry({
        id: params.id, on_date: date, kind, fund_id: fund, to_fund_id: kind === 'transfer' ? (between === 'accounts' ? fund : toFund) : null, amount: v, currency,
        to_account_id: kind === 'transfer' && between === 'accounts' ? toAccount : null,
        category_id: kind === 'expense' ? cat || null : null,
        account_id: account || null, method: methodForAccount(accObj?.kind),
        counterpart: kind === 'expense' || trackDonors ? counterpart.trim() || null : null,
        description: kind === 'expense' || needsDetail || kind === 'transfer' ? desc.trim() || null : null,
      });
      for (const p of photos) await addFinAttachment({ entry_id: id, month: date.slice(0, 7), path: p.path, kind: p.kind, file_name: p.name });
      // El saldo que se leyó queda guardado para calcular el próximo ingreso.
      if (bankBal && accObj?.kind === 'bank') await saveBankSnapshot(accObj.id, bankBal.balance, id, bankBal.path).catch(() => undefined);
      router.back();
    } catch (e) {
      Alert.alert(tx('No se pudo guardar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (financeLevel < 2) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title={tx('Movimiento')} back /><Text style={{ padding: 24, color: colors.muted }}>{tx('No tenés permiso para cargar.')}</Text></View>;
  if (!loaded) return <Loading />;

  const pill = (on: boolean) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.greenSoft : colors.bg, justifyContent: 'center' as const });
  const pillText = (on: boolean) => ({ fontSize: 14, fontWeight: (on ? '800' : '600') as '800' | '600', color: on ? colors.greenText : colors.text });
  const Pills = ({ items, value, onPick }: { items: { id: string; name: string }[]; value: string; onPick: (id: string) => void }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((x) => <Pressable key={x.id} onPress={() => onPick(x.id)} style={pill(value === x.id)} accessibilityRole="button" accessibilityState={{ selected: value === x.id }}><Text style={pillText(value === x.id)}>{x.name}</Text></Pressable>)}
    </View>
  );
  // Efectivo o banco: las cuentas se muestran con ese nombre corto.
  const accItems = accounts.map((a) => ({ id: a.id, name: a.kind === 'bank' ? (accounts.filter((x) => x.kind === 'bank').length > 1 ? a.name : tx('Banco')) : (accounts.filter((x) => x.kind === 'cash').length > 1 ? a.name : tx('Efectivo')) }));
  const receiptPhotos = photos.filter((p) => p.kind === 'receipt');

  const photoRow = (list: typeof photos) => list.length ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {list.map((p) => (
        <View key={p.path}>
          <Thumb path={p.path} />
          <Pressable onPress={() => setPhotos((x) => x.filter((y) => y.path !== p.path))} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={tx('Quitar')}>
            <Feather name="x" size={14} color="#FFF" />
          </Pressable>
        </View>
      ))}
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={params.id ? tx('Corregir {TITLE}', { TITLE: TITLE[kind].toLowerCase() }) : TITLE[kind]} back />
      <Screen>
        {kind !== 'transfer' ? (
          <>
            <SectionTitle>{kind === 'income' ? tx('Entró en') : tx('Se pagó con')}</SectionTitle>
            <Pills items={accItems} value={account} onPick={setAccount} />
          </>
        ) : null}

        {kind === 'expense' ? (
          <Card style={{ gap: 10 }}>
            {receiptPhotos.length ? photoRow(receiptPhotos) : null}
            <Button title={receiptPhotos.length ? tx('Agregar otra foto') : tx('Sacar foto del recibo')} icon="camera" variant={receiptPhotos.length ? 'outline' : 'primary'} onPress={snapReceipt} disabled={reading} />
            {reading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={colors.green} />
                <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Leyendo el recibo…')}</Text>
              </View>
            ) : readNote ? <Text style={{ fontSize: 13, color: colors.greenText }}>{readNote}</Text> : (
              <Text style={{ fontSize: 12, color: colors.muted }}>{tx('La app lee el total, el comercio y la fecha, y elige la categoría.')}</Text>
            )}
          </Card>
        ) : null}

        {kind === 'income' && !params.id && accObj?.kind === 'bank' ? (
          <Card style={{ gap: 10 }}>
            {photoRow(photos.filter((p) => p.kind === 'bank_screen'))}
            <Button title={tx('Subí la captura del saldo del banco')} icon="smartphone" variant="outline" onPress={attachBank} disabled={reading} />
            {reading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={colors.green} />
                <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Leyendo el saldo…')}</Text>
              </View>
            ) : readNote ? <Text style={{ fontSize: 13, color: colors.greenText, lineHeight: 19 }}>{readNote}</Text> : (
              <Text style={{ fontSize: 12, color: colors.muted }}>{tx('La app lee el saldo y calcula cuánto entró desde la última vez.')}</Text>
            )}
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Field label={tx('Monto')} value={amount} onChangeText={setAmount} placeholder="15.000" keyboardType="decimal-pad" style={{ flex: 1 }} autoFocus={!params.id && kind !== 'expense'} />
          <Choice columns={2} options={[{ value: 'ARS', label: '$' }, { value: 'USD', label: tx('US$') }]} value={currency} onChange={setCurrency} style={{ width: 120 }} />
        </View>
        {parseMoney(amount) ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: -8 }}>{fmtMoney(parseMoney(amount), currency)}</Text> : null}

        <Field label={tx('Fecha')} value={dateText} onChangeText={setDateText} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" selectTextOnFocus />
        <Text style={{ fontSize: 12, color: date ? colors.muted : colors.red, marginTop: -8 }}>
          {date ? (date === isoDate(new Date()) ? tx('Hoy, ') : '') + new Date(`${date}T12:00:00`).toLocaleDateString(txLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : tx('Escribila así: 22/11/2026')}
        </Text>

        {kind === 'transfer' ? (
          <Choice columns={2} options={[{ value: 'funds', label: tx('De un fondo a otro') }, { value: 'accounts', label: tx('Banco ↔ efectivo') }]} value={between} onChange={setBetween} />
        ) : null}

        <SectionTitle>{kind === 'transfer' && between === 'funds' ? tx('Sale del fondo') : tx('Fondo')}</SectionTitle>
        <Pills items={funds} value={fund} onPick={setFund} />

        {kind === 'transfer' ? (
          between === 'funds' ? (
            <>
              <SectionTitle>{tx('Entra al fondo')}</SectionTitle>
              <Pills items={funds.filter((f) => f.id !== fund)} value={toFund} onPick={setToFund} />
            </>
          ) : (
            <>
              <SectionTitle>{tx('Sale de')}</SectionTitle>
              <Pills items={accItems} value={account} onPick={setAccount} />
              <SectionTitle>{tx('Entra a')}</SectionTitle>
              <Pills items={accItems.filter((a) => a.id !== account)} value={toAccount} onPick={setToAccount} />
            </>
          )
        ) : (
          <>
            {kind === 'expense' ? (
              <>
                <SectionTitle>{tx('Categoría')}</SectionTitle>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {shownCats.map((c) => <Pressable key={c.id} onPress={() => { setCat(c.id); setCatAuto(false); }} style={pill(cat === c.id)} accessibilityRole="button"><Text style={pillText(cat === c.id)}>{c.name}</Text></Pressable>)}
                </View>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: -4 }}>
                  {outCats.length > TOP ? (
                    <Pressable onPress={() => setAllCats((x) => !x)} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name={allCats ? 'chevron-up' : 'chevron-down'} size={16} color={colors.green} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.green }}>{allCats ? tx('Ver menos') : tx('Ver más ({v1})', { v1: outCats.length - TOP })}</Text>
                    </Pressable>
                  ) : null}
                  {financeLevel >= 3 && newCat === null ? (
                    <Pressable onPress={() => { setNewCat(''); setAllCats(true); }} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name="plus" size={16} color={colors.green} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.green }}>{tx('Agregar categoría')}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {catAuto && cat ? <Text style={{ fontSize: 12, color: colors.greenText, marginTop: -6 }}>{tx('Elegida por la app. Tocá otra si no es.')}</Text> : null}
                {newCat !== null ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <Field label={tx('Nueva categoría')} value={newCat} onChangeText={setNewCat} style={{ flex: 1 }} />
                    <Button title={tx('Crear')} small onPress={createCat} />
                  </View>
                ) : null}
              </>
            ) : null}

            {kind === 'expense' ? (
              <Field label={tx('A quién se pagó (opcional)')} value={counterpart} onChangeText={vendorChanged} placeholder={tx('Edenor, ferretería…')} />
            ) : trackDonors ? (
              <Field label={tx('Quién lo dio (opcional)')} value={counterpart} onChangeText={setCounterpart} />
            ) : null}
          </>
        )}

        {kind !== 'income' || needsDetail ? (
          <Field label={needsDetail ? tx('Para qué es (obligatorio en Designado)') : tx('Nota (opcional)')} value={desc} onChangeText={setDesc} multiline />
        ) : null}


        <Card style={{ padding: 12, backgroundColor: colors.bgSoft, borderColor: colors.bgSoft }}>
          <Text style={{ fontSize: 14, color: colors.text }}>
            {TITLE[kind]} {tx('de')} <Text style={{ fontWeight: '800' }}>{fmtMoney(parseMoney(amount) ?? 0, currency)}</Text>
            {kind === 'transfer' ? (between === 'accounts' ? tx(' en {name}', { name: fundObj?.name ?? '…' }) : tx(' de {name} a {name2}', { name: fundObj?.name ?? '…', name2: funds.find((f) => f.id === toFund)?.name ?? '…' })) : ` · ${fundObj?.name ?? '…'} · ${accItems.find((a) => a.id === account)?.name ?? ''}`}{date ? ` · ${fmtDateShort(date)}` : ''}
          </Text>
        </Card>
        <Button title={tx('Guardar')} onPress={save} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
