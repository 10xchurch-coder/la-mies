// Funciones de la iglesia: el pastor o el administrador de la app prende o apaga cada parte de la app.
// Lo apagado se esconde para todos (menú, barra de abajo, escritorio) y no se puede abrir. No se borra nada.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, SectionTitle, Toggle } from '@/components/ui';
import { setFeature } from '@/lib/api';
import { FEATURES, FEATURE_GROUPS, cleanDisabled, featureOn, type FeatureKey } from '@/lib/features';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Funciones() {
  const { church, can, refreshProfile } = useAuth();
  const [off, setOff] = useState<FeatureKey[]>(() => cleanDisabled(church?.disabled_features));
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setOff(cleanDisabled(church?.disabled_features)); }, [church?.disabled_features]);

  const change = async (key: FeatureKey, enabled: boolean) => {
    const before = off;
    setOff(enabled ? off.filter((k) => k !== key) : [...off, key]);
    setBusy(key);
    try {
      setOff(cleanDisabled(await setFeature(key, enabled)));
      await refreshProfile();
    } catch (e) {
      setOff(before);
      Alert.alert(tx('No se pudo cambiar'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const allOn = async () => {
    setBusy('todo');
    try {
      for (const k of off) await setFeature(k, true);
      setOff([]);
      await refreshProfile();
    } catch (e) {
      Alert.alert(tx('No se pudo cambiar'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Funciones de la iglesia')} subtitle={tx('Prendé solo lo que tu iglesia usa')} back />
      <Screen>
        {!can('admin.permisos') ? <Empty icon="lock" title={tx('Solo el pastor o el administrador de la app')} /> : (
          <>
            <Card style={{ backgroundColor: colors.greenSoft, borderColor: colors.greenSoft, gap: 6 }}>
              <Text style={{ fontSize: 14, color: colors.greenText, lineHeight: 20 }}>
                {tx('Cada iglesia es distinta. Lo que apagues deja de verse para todos: no aparece en el menú ni en la barra de abajo, y nadie lo puede abrir.')}
              </Text>
              <Text style={{ fontSize: 14, color: colors.greenText, lineHeight: 20 }}>
                {tx('No se borra nada. Si lo volvés a prender, todo está como estaba.')}
              </Text>
            </Card>
            {off.length ? (
              <Button title={busy === 'todo' ? tx('Prendiendo…') : tx('Prender todo ({n} apagada{pl})', { n: off.length, pl: off.length > 1 ? 's' : '' })} icon="refresh-cw" variant="outline" small onPress={allOn} disabled={!!busy} />
            ) : null}
            {FEATURE_GROUPS.map((g) => (
              <View key={g} style={{ gap: 8 }}>
                <SectionTitle>{tx(g)}</SectionTitle>
                {FEATURES.filter((f) => f.group === g).map((f) => (
                  <Card key={f.key} style={{ padding: 12 }}>
                    <Toggle label={f.label} hint={f.hint} value={featureOn(off, f.key)} onChange={(v) => change(f.key, v)} disabled={!!busy} />
                  </Card>
                ))}
              </View>
            ))}
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              {tx('Las personas, las cuentas, los roles y los ajustes siempre están. Los avisos automáticos de afuera de la app (por ejemplo el informe del lunes) no cambian con esto.')}
            </Text>
          </>
        )}
      </Screen>
    </View>
  );
}
