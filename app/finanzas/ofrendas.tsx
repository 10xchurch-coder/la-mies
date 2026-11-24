// Ofrendas por persona: quién dio, cuánto y a qué fondo. Solo lo ve quien tiene permiso de finanzas.
// Es un registro aparte: NO cambia el saldo de los fondos (el ingreso del culto se sigue cargando en Finanzas).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, SectionTitle, Toggle } from '@/components/ui';
import { fmtDateAR, fmtDateShort, fmtMoney, isoDate, maskDateAR, parseDateAR, parseMoney } from '@/lib/format';
import { givingProblem, methodLabel, METHODS, totalsByPerson, yearsOf, type GivingMethod, type GivingRow } from '@/lib/giving';
import { addGiving, churchExtras, givingFunds, listGiving, searchGivingPeople, setMyGiving, voidGiving, type GivingFund, type GivingPerson } from '@/lib/givingData';
import { errorMessage } from '@/lib/supabase';
import { refreshChurchExtras } from '@/lib/useChurchExtras';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Ofrendas() {
  const router = useRouter();
  const { financeLevel, can, profile } = useAuth();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<GivingRow[] | null>(null);
  const [funds, setFunds] = useState<GivingFund[]>([]);
  const [myOn, setMyOn] = useState(false);
  // Formulario
  const [q, setQ] = useState('');
  const [found, setFound] = useState<GivingPerson[]>([]);
  const [person, setPerson] = useState<GivingPerson | null>(null);
  const [fundId, setFundId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(fmtDateAR(isoDate(new Date())));
  const [method, setMethod] = useState<GivingMethod>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    if (financeLevel < 1) return;
    listGiving(year).then(setRows).catch((e) => { Alert.alert(tx('No se pudo'), errorMessage(e)); setRows([]); });
    givingFunds().then((f) => { setFunds(f); setFundId((cur) => cur ?? f.find((x) => x.active)?.id ?? null); }).catch(() => undefined);
    churchExtras().then((x) => setMyOn(x.my_giving_on)).catch(() => undefined);
  }, [year, financeLevel]);
  useFocusEffect(load);

  // Buscar a la persona mientras se escribe.
  useEffect(() => {
    if (person || q.trim().length < 2) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => { searchGivingPeople(q.trim()).then((r) => { if (live) setFound(r); }).catch(() => undefined); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, person]);

  const fundName = useMemo(() => new Map(funds.map((f) => [f.id, f.name])), [funds]);
  const people = useMemo(() => totalsByPerson(rows ?? []), [rows]);
  const years = useMemo(() => yearsOf([`${year}-01-01`]), [year]);

  if (financeLevel < 1) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Ofrendas por persona')} back />
        <Empty icon="lock" title={tx('Solo para quien lleva las finanzas')} text={tx('El pastor, el tesorero y quienes tienen un rol de finanzas ven esta parte.')} />
      </View>
    );
  }

  const save = async () => {
    const iso = parseDateAR(date);
    const value = parseMoney(amount);
    const problem = givingProblem({ contactId: person?.id ?? null, fundId, amount: value, date: iso });
    if (problem) { Alert.alert(tx('Falta algo'), problem); return; }
    setBusy(true);
    try {
      await addGiving({ contact_id: person!.id, fund_id: fundId!, on_date: iso!, amount: value!, method, note: note.trim() || null });
      setPerson(null); setQ(''); setAmount(''); setNote('');
      if (Number(iso!.slice(0, 4)) !== year) setYear(Number(iso!.slice(0, 4))); else load();
    } catch (e) {
      Alert.alert(tx('No se pudo guardar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doVoid = async (id: string) => {
    if (!reason.trim()) { Alert.alert(tx('Poné el motivo'), tx('Por ejemplo: "se cargó dos veces".')); return; }
    try {
      await voidGiving(id, reason.trim());
      setVoiding(null); setReason('');
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo anular'), errorMessage(e));
    }
  };
  const canVoid = (r: GivingRow) => !r.voided_at && (financeLevel >= 3
    || (financeLevel === 2 && r.created_by === profile?.id && Date.now() - new Date(r.created_at).getTime() < 7 * 86400000));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Ofrendas por persona')} subtitle={tx('Quién dio, cuánto y a qué fondo')} back />
      <Screen>
        <Card style={{ backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft, gap: 4 }}>
          <Text style={{ fontSize: 14, color: colors.pinkText, lineHeight: 20, fontWeight: '700' }}>{tx('Esto lo ve solo quien lleva las finanzas.')}</Text>
          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
            {tx('Los líderes y los demás hermanos no lo ven. Acá se anota quién dio. El saldo de los fondos no cambia: el ingreso se sigue cargando en Finanzas.')}
          </Text>
        </Card>

        {financeLevel >= 2 ? (
          <>
            <SectionTitle>{tx('Anotar una ofrenda')}</SectionTitle>
            <Card style={{ gap: 10 }}>
              {person ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="user" size={18} color={colors.pink} />
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{person.name}</Text>
                  <Button title={tx('Cambiar')} variant="ghost" small onPress={() => { setPerson(null); setQ(''); }} />
                </View>
              ) : (
                <>
                  <Field label={tx('Persona')} hint={tx('(escribí el nombre y tocala)')} value={q} onChangeText={setQ} autoCapitalize="words" autoCorrect={false} placeholder={tx('Buscar…')} />
                  {found.map((p) => (
                    <Pressable key={p.id} onPress={() => { setPerson(p); setFound([]); }} accessibilityRole="button"
                      style={{ paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.bgSoft }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{p.name}</Text>
                    </Pressable>
                  ))}
                  {q.trim().length >= 2 && !found.length ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Si no aparece, primero cargá a la persona en Hermanos.')}</Text> : null}
                </>
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>{tx('Fondo')}</Text>
              <Choice options={funds.filter((f) => f.active).map((f) => ({ value: f.id, label: f.name }))} value={fundId} onChange={setFundId} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label={tx('Monto')} value={amount} onChangeText={setAmount} placeholder="0" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
                <Field label={tx('Fecha')} value={date} onChangeText={(t) => setDate(maskDateAR(t, date))} placeholder="05/11/2026" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
              </View>
              {parseMoney(amount) ? <Text style={{ fontSize: 12, color: colors.muted }}>{fmtMoney(parseMoney(amount), funds.find((f) => f.id === fundId)?.currency)}</Text> : null}
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>{tx('Cómo dio')}</Text>
              <Choice options={METHODS} value={method} onChange={setMethod} />
              <Field label={tx('Nota (opcional)')} hint={myOn ? tx('(la persona la ve en "Mis ofrendas")') : undefined} value={note} onChangeText={setNote} maxLength={300} placeholder={tx('Ej: diezmo de octubre')} />
              <Button title={tx('Guardar ofrenda')} icon="check" onPress={save} loading={busy} />
            </Card>
          </>
        ) : null}

        <SectionTitle>{tx('Año')}</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Button title={tx('Anterior')} icon="chevron-left" variant="outline" small onPress={() => { setRows(null); setYear(year - 1); }} style={{ flex: 1 }} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, minWidth: 64, textAlign: 'center' }}>{year}</Text>
          <Button title={tx('Siguiente')} variant="outline" small disabled={year >= years[0] && year >= thisYear} onPress={() => { setRows(null); setYear(year + 1); }} style={{ flex: 1 }} />
        </View>

        {rows === null ? <Loading /> : !rows.length ? <Empty icon="inbox" title={tx('Sin ofrendas anotadas en {year}', { year })} /> : (
          <>
            <SectionTitle>{tx('Por persona')}</SectionTitle>
            <Card style={{ padding: 0 }}>
              {people.map((p, i) => (
                <Pressable key={p.key} disabled={!p.contact_id} accessibilityRole="button"
                  onPress={() => router.push(`/finanzas/ofrenda-estado?persona=${p.contact_id}&anio=${year}` as Href)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{tx('{n} {pl} · tocá para ver la hoja del año', { n: p.count, pl: p.count === 1 ? tx('ofrenda') : tx('ofrendas') })}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{fmtMoney(p.total, p.currency)}</Text>
                  {p.contact_id ? <Feather name="chevron-right" size={18} color={colors.muted} /> : null}
                </Pressable>
              ))}
            </Card>

            <SectionTitle>{tx('Todas las de {year}', { year })}</SectionTitle>
            {rows.map((r) => (
              <Card key={r.id} style={{ gap: 6, padding: 12, opacity: r.voided_at ? 0.55 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.person_name || tx('Sin nombre')}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {fmtDateShort(r.on_date)} · {fundName.get(r.fund_id) ?? tx('Fondo')} · {methodLabel(r.method)}{r.note ? ` · ${r.note}` : ''}
                    </Text>
                    {r.voided_at ? <Text style={{ fontSize: 12, color: colors.red, fontWeight: '700' }}>{tx('ANULADA ·')} {r.void_reason}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, textDecorationLine: r.voided_at ? 'line-through' : 'none' }}>{fmtMoney(r.amount, r.currency)}</Text>
                </View>
                {canVoid(r) ? (
                  voiding === r.id ? (
                    <View style={{ gap: 8 }}>
                      <Field label={tx('Motivo de la anulación')} value={reason} onChangeText={setReason} placeholder={tx('Se cargó dos veces')} />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button title={tx('Cancelar')} variant="ghost" small onPress={() => { setVoiding(null); setReason(''); }} style={{ flex: 1 }} />
                        <Button title={tx('Anular')} variant="danger" small onPress={() => doVoid(r.id)} style={{ flex: 1 }} />
                      </View>
                    </View>
                  ) : <Button title={tx('Anular')} variant="ghost" small onPress={() => { setVoiding(r.id); setReason(''); }} style={{ alignSelf: 'flex-start' }} />
                ) : null}
              </Card>
            ))}
          </>
        )}

        {financeLevel >= 3 || can('admin.permisos') ? (
          <>
            <SectionTitle>{tx('Mis ofrendas')}</SectionTitle>
            <Card style={{ padding: 12 }}>
              <Toggle label={tx('Cada hermano ve sus propias ofrendas')} value={myOn}
                hint={tx('Prendido: en el menú de cada uno aparece “Mis ofrendas”, con lo suyo y nada más. Apagado: nadie ve nada.')}
                onChange={(v) => { setMyOn(v); setMyGiving(v).then(refreshChurchExtras).catch((e) => { setMyOn(!v); Alert.alert(tx('No se pudo'), errorMessage(e)); }); }} />
            </Card>
          </>
        ) : null}
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          {tx('Nada se borra: si una ofrenda se anotó mal, se anula con el motivo y queda tachada.')}
        </Text>
      </Screen>
    </View>
  );
}
