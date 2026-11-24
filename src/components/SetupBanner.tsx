// Aviso para el pastor de una iglesia nueva: le faltan los primeros pasos. Si no hace falta, no muestra nada.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import { useChurchExtras } from '@/lib/useChurchExtras';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export function SetupBanner() {
  const router = useRouter();
  const { can } = useAuth();
  const extras = useChurchExtras();
  if (!extras.setup_pending || !can('admin.iglesia')) return null;
  return (
    <Pressable onPress={() => router.push('/admin/alta' as Href)} accessibilityRole="button" accessibilityLabel="Seguir con los primeros pasos de la iglesia">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft }}>
        <Feather name="flag" size={22} color={colors.pinkText} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.pinkText }}>TU IGLESIA ES NUEVA EN LA APP</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Hacé los primeros pasos</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>Son 5 pasos cortos. Tocá acá para seguir.</Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.pinkText} />
      </Card>
    </Pressable>
  );
}
