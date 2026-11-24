// Copia de todos los datos de la iglesia: un botón, solo para el pastor o el administrador de la app.
// Baja un ZIP con una planilla (CSV) por cada cosa: personas, asistencia, seguimiento, eventos, oración, clases, familias y finanzas.
// Se lee con los permisos de quien la pide: nunca sale nada de otra iglesia.
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, SectionTitle } from '@/components/ui';
import { backupPlan } from '@/lib/backup';
import { runBackup, type BackupProgress, type BackupSummary } from '@/lib/backupData';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Copia() {
  const { can, church, profile, financeLevel, viewAsMember } = useAuth();
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [done, setDone] = useState<BackupSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const finance = financeLevel >= 1;
  const plan = backupPlan(finance);

  const start = async () => {
    if (!church || !profile) return;
    setBusy(true); setDone(null);
    try {
      setDone(await runBackup({ churchId: church.id, churchName: church.name, who: profile.display_name, finance, onProgress: setProgress }));
    } catch (e) {
      Alert.alert(tx('No se pudo hacer la copia'), errorMessage(e));
    } finally {
      setBusy(false); setProgress(null);
    }
  };
  const ask = () => Alert.alert(tx('Bajar todos los datos'), tx('El archivo trae teléfonos, domicilios y datos privados de los hermanos. Guardalo en un lugar seguro.'), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Bajar la copia'), onPress: start },
  ]);

  const pct = progress ? Math.round((progress.index / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Copia de todos los datos')} subtitle={tx('Todo lo de tu iglesia, en un archivo')} back />
      <Screen>
        {!can('admin.permisos') || viewAsMember ? <Empty icon="lock" title={tx('Solo el pastor o el administrador de la app')} /> : (
          <>
            <Card style={{ backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft, gap: 6 }}>
              <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
                {tx('Los datos son de tu iglesia. Con este botón bajás una copia de todo, en planillas que se abren con Excel.')}
              </Text>
              <Text style={{ fontSize: 14, color: colors.pinkText, lineHeight: 20, fontWeight: '700' }}>
                {tx('Guardala en un lugar seguro: trae datos privados de los hermanos.')}
              </Text>
            </Card>

            <Button title={busy ? tx('Bajando…') : tx('Bajar la copia')} icon="download" onPress={ask} loading={busy} disabled={!church} />

            {progress ? (
              <Card style={{ gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{progress.title}</Text>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.bgSoft, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: 10, backgroundColor: colors.pink }} />
                </View>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {tx('Paso {min} de {total}{v1}. No cierres esta pantalla.', { min: Math.min(progress.index + 1, progress.total), total: progress.total, v1: progress.rows ? tx(' · {rows} filas', { rows: progress.rows }) : '' })}
                </Text>
              </Card>
            ) : null}

            {done ? (
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="check-circle" size={20} color={colors.green} />
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{tx('Listo: {rows} filas', { rows: done.rows })}</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                  {done.zipped ? tx('Se bajó el archivo {fileName}. Adentro hay un LEEME que explica cada planilla.', { fileName: done.fileName }) : tx('No se pudo armar un solo archivo, así que se bajaron las planillas de a una.')}
                </Text>
                {done.results.map((r) => (
                  <View key={r.file} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: r.error ? colors.red : colors.text }}>{r.title}</Text>
                    <Text style={{ fontSize: 13, color: r.error ? colors.red : colors.muted, fontWeight: '700' }}>{r.error ? tx('no se pudo') : r.rows}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <SectionTitle>{tx('Qué trae')}</SectionTitle>
            <Card style={{ gap: 4 }}>
              {plan.map((t) => <Text key={t.table} style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>• {t.title}</Text>)}
            </Card>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              {tx('{pl}Trae lo que vos podés ver en la app (por ejemplo, no salen los pedidos de oración privados de otros). No trae fotos ni archivos, solo los datos. Queda anotado en el historial quién bajó la copia y cuándo.', { pl: finance ? tx('Trae las finanzas porque tenés permiso de finanzas. ') : tx('No trae las finanzas: no tenés permiso de finanzas. ') })}
            </Text>
          </>
        )}
      </Screen>
    </View>
  );
}
