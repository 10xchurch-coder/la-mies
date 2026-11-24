// Funciones de la iglesia: el pastor o el administrador de la app prende o apaga cada parte de la app.
// Lo apagado se esconde para todos (menú, barra de abajo, escritorio, avisos) y no se puede abrir. No se borra nada.
// Cada cambio se guarda al instante y les llega solo a todos los hermanos (ver lib/useChurchSync).
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, SectionTitle } from '@/components/ui';
import { FeatureSwitches } from '@/components/FeatureSwitches';
import { BibleChurchSettings } from '@/components/BibleChurchSettings';
import { setFeature } from '@/lib/api';
import { VERSIONS, getChurchBible } from '@/lib/bible';
import { allowedOf, churchDefault } from '@/lib/bibleChurch';
import { CORE_PARTS, FEATURES, cleanDisabled, countOn, type FeatureKey } from '@/lib/features';
import { setBible, setFeatures } from '@/lib/funcionesData';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Funciones() {
  const router = useRouter();
  const { church, can, refreshProfile } = useAuth();
  const [off, setOff] = useState<FeatureKey[]>(() => cleanDisabled(church?.disabled_features));
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setOff(cleanDisabled(church?.disabled_features)); }, [church?.disabled_features]);
  // La Biblia de la iglesia (ya quedó cargada al entrar; cambia cuando se recarga la iglesia).
  const cfg = getChurchBible();
  const [bible, setBibleState] = useState(() => ({ versions: allowedOf(VERSIONS, cfg).map((v) => v.id as string), def: churchDefault(VERSIONS, cfg).id as string }));
  useEffect(() => {
    const c = getChurchBible();
    setBibleState({ versions: allowedOf(VERSIONS, c).map((v) => v.id as string), def: churchDefault(VERSIONS, c).id as string });
  }, [church?.bible]);

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
      setOff(cleanDisabled(await setFeatures([])));
      await refreshProfile();
    } catch (e) {
      Alert.alert(tx('No se pudo cambiar'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const changeBible = async (versions: string[], def: string) => {
    const before = bible;
    setBibleState({ versions, def });
    setBusy('biblia');
    try {
      await setBible(versions, def);
      await refreshProfile();
    } catch (e) {
      setBibleState(before);
      Alert.alert(tx('No se pudo cambiar'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const on = countOn(off);
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
              <Text style={{ fontSize: 14, color: colors.greenText, lineHeight: 20 }}>
                {tx('Cada cambio se guarda solo y les llega a todos los hermanos en un par de minutos, sin instalar nada.')}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>{tx('Ahora hay {on} de {n} prendidas.', { on, n: FEATURES.length })}</Text>
            </Card>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Feather name="eye" size={20} color={colors.pink} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('Ver la app como queda')}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Mirá el menú igual que lo ve un hermano, con lo que prendiste y apagaste.')}</Text>
              </View>
              <Button title={tx('Ver')} small variant="outline" onPress={() => router.push('/miembro-vista' as Href)} />
            </Card>
            {off.length ? (
              <Button title={busy === 'todo' ? tx('Prendiendo…') : tx('Prender todo ({n} apagada{pl})', { n: off.length, pl: off.length > 1 ? 's' : '' })} icon="refresh-cw" variant="outline" small onPress={allOn} disabled={!!busy} />
            ) : null}
            <FeatureSwitches off={off} onChange={change} disabled={!!busy} search showHides
              after={(k) => (k === 'biblia' ? <BibleChurchSettings versions={bible.versions} def={bible.def} onChange={changeBible} disabled={!!busy} /> : null)} />
            <View style={{ gap: 8 }}>
              <SectionTitle>{tx('Siempre encendido')}</SectionTitle>
              <Card style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Esto no se puede apagar, porque sin esto la app no funciona.')}</Text>
                {CORE_PARTS.map((c) => (
                  <View key={c.label} style={{ flexDirection: 'row', gap: 10 }}>
                    <Feather name="lock" size={15} color={colors.muted} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{c.label}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{c.why}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}
