// Para elegir el idioma de la app: la tarjeta de Ajustes (LangChoice) y el botoncito de Entrar y Crear cuenta (LangSwitch).
// Al tocar, toda la app se vuelve a dibujar en ese idioma (ver app/_layout.tsx). Queda guardado en el teléfono.
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, Choice, SectionTitle } from '@/components/ui';
import { LANGS, tx, type Lang } from '@/lib/i18n';
import { saveLang, useLang } from '@/lib/i18nStore';
import { colors } from '@/theme';

function useChangeLang() {
  const [busy, setBusy] = useState(false);
  const change = async (next: Lang) => {
    if (busy) return;
    setBusy(true);
    const ok = await saveLang(next);
    setBusy(false);
    // Solo puede fallar en la web sin conexión: la lista de textos de ese idioma se baja en ese momento.
    if (!ok) Alert.alert(tx('No se pudo cambiar el idioma'), tx('Revisá tu conexión y probá de nuevo.'));
  };
  return change;
}

/** La tarjeta de Ajustes. El título va en los dos idiomas para que cualquiera lo encuentre. */
export function LangChoice() {
  const lang = useLang();
  const change = useChangeLang();
  return (
    <>
      <SectionTitle>Idioma / Language</SectionTitle>{/* i18n-skip */}
      <Card style={{ gap: 10 }}>
        <Choice options={LANGS.map((l) => ({ value: l.id, label: l.name }))} value={lang} onChange={change} columns={2} />
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          {tx('La app cambia de idioma en el momento. Los devocionales, los avisos que llegan al teléfono y lo que escribe cada persona quedan como fueron escritos.')}
        </Text>
      </Card>
    </>
  );
}

/** Botón chico para las pantallas de entrar y crear cuenta: muestra el otro idioma, con su nombre en ese idioma. */
export function LangSwitch() {
  const lang = useLang();
  const change = useChangeLang();
  const other = LANGS.find((l) => l.id !== lang) ?? LANGS[0];
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable onPress={() => change(other.id)} accessibilityRole="button" accessibilityLabel={other.name} hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12 }}>
        <Feather name="globe" size={16} color={colors.muted} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted }}>{other.name}</Text>
      </Pressable>
    </View>
  );
}
