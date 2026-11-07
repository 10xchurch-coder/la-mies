// Normas de la comunidad: cada persona las acepta una vez (al entrar por primera vez después de esta versión).
import React, { useState } from 'react';
import { Linking, Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export const RULES = [
  'Tratá a todos con respeto y amor. Nada ofensivo, burlas, insultos ni contenido sexual o violento.',
  'No publiques datos privados de otras personas (teléfono, dirección, problemas personales) sin su permiso.',
  'Los pedidos de oración son para orar, no para comentar ni contar a otros.',
  'Si ves algo que no corresponde, denuncialo (menú "Denunciar o bloquear"). El pastor lo revisa dentro de las 24 horas y lo borra si no cumple estas normas.',
  'Podés bloquear a cualquier persona: dejás de ver lo que publica.',
  'Quien no cumpla las normas puede perder el acceso a la app.',
];

export function RulesGate() {
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const need = !!profile?.church_id && !(profile as { rules_accepted_at?: string | null }).rules_accepted_at;
  if (!need) return null;
  const accept = async () => {
    setBusy(true);
    await supabase.rpc('accept_community_rules');
    await refreshProfile();
    setBusy(false);
  };
  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 18, maxHeight: '85%', maxWidth: 560, width: '100%', alignSelf: 'center', marginBottom: insets.bottom }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 }}>Normas de la comunidad</Text>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
            {RULES.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ fontSize: 15, color: colors.green, fontWeight: '800' }}>{i + 1}.</Text>
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: colors.text }}>{r}</Text>
              </View>
            ))}
            <Text onPress={() => Linking.openURL('https://10xchurch-coder.github.io/la-mies/privacidad.html#normas')} style={{ fontSize: 13, color: colors.green, fontWeight: '700' }}>Leer las normas y la política de privacidad completas</Text>
          </ScrollView>
          <Button title="Acepto las normas" onPress={accept} loading={busy} />
        </View>
      </View>
    </Modal>
  );
}
