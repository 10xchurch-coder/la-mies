// La hoja del año de una persona: total por fondo y la lista, para imprimir. Solo con permiso de finanzas.
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Empty, Loading } from '@/components/ui';
import { GivingStatementView } from '@/components/GivingStatementView';
import { buildStatement, type GivingRow } from '@/lib/giving';
import { churchExtras, givingFunds, listGiving, type GivingFund } from '@/lib/givingData';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function OfrendaEstado() {
  const { persona, anio } = useLocalSearchParams<{ persona?: string; anio?: string }>();
  const { financeLevel, church } = useAuth();
  const [year, setYear] = useState(() => Number(anio) || new Date().getFullYear());
  const [rows, setRows] = useState<GivingRow[] | null>(null);
  const [funds, setFunds] = useState<GivingFund[]>([]);
  const [motto, setMotto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (financeLevel < 1 || !persona) return;
    setRows(null);
    Promise.all([listGiving(year, persona), givingFunds(), churchExtras()])
      .then(([r, f, x]) => { setRows(r); setFunds(f); setMotto(x.motto); if (r[0]?.person_name) setName(r[0].person_name); })
      .catch((e) => { setError(errorMessage(e)); setRows([]); });
  }, [year, persona, financeLevel]);

  const statement = useMemo(() => {
    const fundName = new Map(funds.map((f) => [f.id, f.name]));
    return buildStatement((rows ?? []).filter((r) => !r.voided_at).map((r) => ({
      on_date: r.on_date, amount: r.amount, currency: r.currency, method: r.method, fund: fundName.get(r.fund_id) ?? tx('Fondo'), note: r.note,
    })), year);
  }, [rows, funds, year]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Ofrendas del año')} subtitle={name || undefined} back />
      <Screen>
        {financeLevel < 1 ? <Empty icon="lock" title={tx('Solo para quien lleva las finanzas')} /> : !persona ? <Empty title={tx('Falta elegir a la persona')} /> : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Button title={tx('Anterior')} icon="chevron-left" variant="outline" small onPress={() => setYear(year - 1)} style={{ flex: 1 }} />
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, minWidth: 64, textAlign: 'center' }}>{year}</Text>
              <Button title={tx('Siguiente')} variant="outline" small disabled={year >= new Date().getFullYear()} onPress={() => setYear(year + 1)} style={{ flex: 1 }} />
            </View>
            {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
            {rows === null ? <Loading /> : (
              <GivingStatementView statement={statement} person={name || tx('Persona')} church={church?.name ?? tx('Iglesia')} motto={motto} city={church?.city} />
            )}
          </>
        )}
      </Screen>
    </View>
  );
}
