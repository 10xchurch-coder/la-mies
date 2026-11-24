// Ajuste de inactivos: a los cuántos meses sin venir un miembro pasa solo a la lista de inactivos, o apagarlo.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, SectionTitle } from '@/components/ui';
import { inactivePreview, inactiveSweepNow, setInactiveMonths } from '@/lib/api';
import { MONTH_CHOICES, monthsLabel, parseMonths } from '@/lib/inactive';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function InactivosAjustes() {
  const { can, church, refreshProfile } = useAuth();
  const current = church?.inactive_months ?? null;
  const preset = current === null ? 'off' : (MONTH_CHOICES as readonly number[]).includes(current) ? String(current) : 'other';
  const [pick, setPick] = useState<string>(preset);
  const [other, setOther] = useState(preset === 'other' && current ? String(current) : '');
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const months = pick === 'off' ? null : pick === 'other' ? parseMonths(other) : Number(pick);
  useEffect(() => {
    setPreview(null);
    if (!months) return;
    const t = setTimeout(() => inactivePreview(months).then(setPreview).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [months]);

  if (!can('admin.permisos')) return <Empty icon="lock" title={tx('Solo el pastor o el administrador de la app')} />;

  const save = async () => {
    if (pick === 'other' && !months) { Alert.alert(tx('Cantidad no válida'), tx('Escribí una cantidad de meses entre 1 y 120.')); return; }
    setBusy(true);
    try {
      await setInactiveMonths(months);
      await refreshProfile();
      if (months && preview) {
        Alert.alert(tx('Guardado'), tx('{preview} {pl} a inactivos. ¿Moverlas ahora o esperar a la revisión automática (dentro de la próxima hora)?', { preview, pl: preview === 1 ? tx('persona pasa') : tx('personas pasan') }), [
          { text: tx('Esperar'), style: 'cancel', onPress: () => router.back() },
          { text: tx('Mover ahora'), onPress: async () => { try { const n = await inactiveSweepNow(); Alert.alert(tx('Listo'), tx('{n} {pl} a inactivos.', { n, pl: n === 1 ? tx('persona pasó') : tx('personas pasaron') })); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); } router.back(); } },
        ]);
      } else router.back();
    } catch (e) { Alert.alert(tx('No se pudo guardar'), errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Inactivos')} subtitle={tx('Sacar de miembros a los que no vienen')} back />
      <Screen>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
            {tx('Un miembro que no viene en este tiempo sale de la lista de miembros y pasa a')} <Text style={{ fontWeight: '800' }}>{tx('Inactivos')}</Text>{tx('. No se borra nada: queda con sus datos y su teléfono. Si vuelve y se le toma asistencia, vuelve solo a miembros.')}
          </Text>
          <SectionTitle>{tx('Pasa a inactivos después de')}</SectionTitle>
          <Choice
            options={[{ value: 'off', label: tx('Apagado') }, ...MONTH_CHOICES.map((m) => ({ value: String(m), label: monthsLabel(m) })), { value: 'other', label: tx('Otra cantidad') }]}
            value={pick} onChange={setPick} />
          {pick === 'other' ? <Field label={tx('Cantidad de meses')} value={other} onChangeText={setOther} keyboardType="number-pad" placeholder={tx('Ejemplo: 4')} /> : null}
          {months ? (
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {preview === null ? tx('Contando…') : preview === 0 ? tx('Hoy nadie lleva {monthsLabel} sin venir.', { monthsLabel: monthsLabel(months) }) : tx('Hoy {preview} {pl} {monthsLabel} o más sin venir.', { preview, pl: preview === 1 ? tx('miembro lleva') : tx('miembros llevan'), monthsLabel: monthsLabel(months) })}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            {tx('Cuenta el culto, las clases, el colectivo y la entrada de los chicos. El tiempo se empieza a contar desde que la iglesia toma asistencia en la app, así que nadie pasa solo antes de tiempo. No se mueve solo a quien tiene un cargo, ni a quien marques como “nunca moverlo solo” en su ficha.')}
          </Text>
          <Button title={tx('Guardar')} onPress={save} loading={busy} />
        </Card>
        <Button title={tx('Ver la lista de inactivos')} icon="user-x" variant="outline" onPress={() => router.push('/inactivos' as Href)} />
      </Screen>
    </View>
  );
}
