// El estado de ofrendas de un año: total por fondo, la lista y el botón para imprimirlo.
// Lo usan Finanzas (para cualquier persona) y "Mis ofrendas" (cada uno lo suyo).
import React, { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { Button, Card, Empty, SectionTitle } from '@/components/ui';
import { fmtDateShort, fmtMoney } from '@/lib/format';
import { methodLabel, statementHtml, type Statement } from '@/lib/giving';
import { printHtml } from '@/lib/givingData';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { tx, txLocale } from '@/lib/i18n';

export function GivingStatementView({ statement, person, church, motto, city }: { statement: Statement; person: string; church: string; motto?: string | null; city?: string | null }) {
  const [busy, setBusy] = useState(false);
  const print = async () => {
    setBusy(true);
    try {
      const html = statementHtml({ church, motto, city, person, statement, printedOn: new Date().toLocaleDateString(txLocale()) });
      await printHtml(tx('Ofrendas {year} {person}', { year: statement.year, person }), html);
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!statement.count) return <Empty icon="inbox" title={tx('Sin ofrendas anotadas en {year}', { year: statement.year })} />;
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 6, backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.pinkText }}>{person} · {statement.year}</Text>
        {statement.totals.map((t) => (
          <Text key={t.currency} style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{fmtMoney(t.total, t.currency)}</Text>
        ))}
        <Text style={{ fontSize: 13, color: colors.text }}>{statement.count} {statement.count === 1 ? tx('ofrenda anotada') : tx('ofrendas anotadas')}</Text>
      </Card>
      <Button title={Platform.OS === 'web' ? tx('Imprimir o guardar como PDF') : tx('Compartir la hoja para imprimir')} icon="printer" variant="outline" onPress={print} loading={busy} />
      <SectionTitle>{tx('Total por fondo')}</SectionTitle>
      <Card style={{ padding: 0 }}>
        {statement.byFund.map((f, i) => (
          <View key={`${f.fund}|${f.currency}`} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{f.fund}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{f.count} {f.count === 1 ? tx('vez') : tx('veces')}</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{fmtMoney(f.total, f.currency)}</Text>
          </View>
        ))}
      </Card>
      <SectionTitle>{tx('Detalle')}</SectionTitle>
      <Card style={{ padding: 0 }}>
        {statement.lines.map((l, i) => (
          <View key={`${l.on_date}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{fmtDateShort(l.on_date)} · {l.fund}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{methodLabel(l.method)}{l.note ? ` · ${l.note}` : ''}</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{fmtMoney(l.amount, l.currency)}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}
