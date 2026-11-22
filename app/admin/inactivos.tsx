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

  if (!can('admin.permisos')) return <Empty icon="lock" title="Solo el pastor o el administrador de la app" />;

  const save = async () => {
    if (pick === 'other' && !months) { Alert.alert('Cantidad no válida', 'Escribí una cantidad de meses entre 1 y 120.'); return; }
    setBusy(true);
    try {
      await setInactiveMonths(months);
      await refreshProfile();
      if (months && preview) {
        Alert.alert('Guardado', `${preview} ${preview === 1 ? 'persona pasa' : 'personas pasan'} a inactivos. ¿Moverlas ahora o esperar a la revisión automática (dentro de la próxima hora)?`, [
          { text: 'Esperar', style: 'cancel', onPress: () => router.back() },
          { text: 'Mover ahora', onPress: async () => { try { const n = await inactiveSweepNow(); Alert.alert('Listo', `${n} ${n === 1 ? 'persona pasó' : 'personas pasaron'} a inactivos.`); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } router.back(); } },
        ]);
      } else router.back();
    } catch (e) { Alert.alert('No se pudo guardar', errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Inactivos" subtitle="Sacar de miembros a los que no vienen" back />
      <Screen>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
            Un miembro que no viene en este tiempo sale de la lista de miembros y pasa a <Text style={{ fontWeight: '800' }}>Inactivos</Text>. No se borra nada: queda con sus datos y su teléfono. Si vuelve y se le toma asistencia, vuelve solo a miembros.
          </Text>
          <SectionTitle>Pasa a inactivos después de</SectionTitle>
          <Choice
            options={[{ value: 'off', label: 'Apagado' }, ...MONTH_CHOICES.map((m) => ({ value: String(m), label: monthsLabel(m) })), { value: 'other', label: 'Otra cantidad' }]}
            value={pick} onChange={setPick} />
          {pick === 'other' ? <Field label="Cantidad de meses" value={other} onChangeText={setOther} keyboardType="number-pad" placeholder="Ejemplo: 4" /> : null}
          {months ? (
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {preview === null ? 'Contando…' : preview === 0 ? `Hoy nadie lleva ${monthsLabel(months)} sin venir.` : `Hoy ${preview} ${preview === 1 ? 'miembro lleva' : 'miembros llevan'} ${monthsLabel(months)} o más sin venir.`}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            Cuenta el culto, las clases, el colectivo y la entrada de los chicos. El tiempo se empieza a contar desde que la iglesia toma asistencia en la app, así que nadie pasa solo antes de tiempo. No se mueve solo a quien tiene un cargo, ni a quien marques como “nunca moverlo solo” en su ficha.
          </Text>
          <Button title="Guardar" onPress={save} loading={busy} />
        </Card>
        <Button title="Ver la lista de inactivos" icon="user-x" variant="outline" onPress={() => router.push('/inactivos' as Href)} />
      </Screen>
    </View>
  );
}
