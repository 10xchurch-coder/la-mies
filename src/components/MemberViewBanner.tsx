// Mientras el pastor mira la app como un miembro, este botón flotante siempre está a mano para volver a su vista.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors } from '@/theme';

export function MemberViewBanner() {
  const { viewAsMember, setViewAsMember } = useAuth();
  const outing = useOuting();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (!viewAsMember) return null;
  const onTabs = ((segments[0] ?? '') as string) === '(tabs)';
  const lift = (onTabs ? 92 : 16 + insets.bottom) + (outing.active ? 52 : 0);
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: lift }]}>
      <Pressable onPress={() => { setViewAsMember(false); router.replace('/'); }} accessibilityRole="button" accessibilityLabel="Volver a mi vista"
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.9 }]}>
        <Feather name="eye" size={18} color="#FFF" />
        <Text style={styles.text}>Mirando como miembro</Text>
        <Text style={styles.back}>Volver a mi vista</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 22,
    backgroundColor: colors.amber, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  text: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  back: { color: '#FFF', fontSize: 13, fontWeight: '900', textDecorationLine: 'underline' },
});
