// Mis ofrendas: cada hermano ve lo que la tesorería anotó a su nombre, y nada de los demás.
// Solo funciona si la iglesia lo prendió (Finanzas → Ofrendas por persona).
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Card, Choice, Empty, Loading } from '@/components/ui';
import { GivingStatementView } from '@/components/GivingStatementView';
import { buildStatement, yearsOf, type StatementLine } from '@/lib/giving';
import { churchExtras, myGiving } from '@/lib/givingData';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function MisOfrendas() {
  const { profile, church } = useAuth();
  const [lines, setLines] = useState<StatementLine[] | null>(null);
  const [off, setOff] = useState(false);
  const [motto, setMotto] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  useFocusEffect(useCallback(() => {
    churchExtras().then((x) => {
      setMotto(x.motto);
      if (!x.my_giving_on) { setOff(true); setLines([]); return; }
      setOff(false);
      myGiving().then(setLines).catch(() => { setOff(true); setLines([]); });
    }).catch(() => { setOff(true); setLines([]); });
  }, []));

  const years = useMemo(() => yearsOf((lines ?? []).map((l) => l.on_date)), [lines]);
  const statement = useMemo(() => buildStatement(lines ?? [], Number(year)), [lines, year]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mis ofrendas" subtitle="Lo que la tesorería anotó a tu nombre" back />
      <Screen>
        {lines === null ? <Loading /> : off ? (
          <Empty icon="lock" title="Tu iglesia no tiene esto prendido" text="Si querés saber lo que diste, hablá con el tesorero o con el pastor." />
        ) : (
          <>
            <Card style={{ backgroundColor: colors.bgSoft, gap: 4 }}>
              <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
                Esto lo ves solo vos. Los demás hermanos y los líderes no lo ven. Si falta algo o hay un error, avisale al tesorero.
              </Text>
            </Card>
            {years.length > 1 ? <Choice options={years.map((y) => ({ value: String(y), label: String(y) }))} value={year} onChange={setYear} /> : null}
            <GivingStatementView statement={statement} person={profile?.display_name ?? 'Yo'} church={church?.name ?? 'Iglesia'} motto={motto} city={church?.city} />
          </>
        )}
      </Screen>
    </View>
  );
}
