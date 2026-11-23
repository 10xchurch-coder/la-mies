// Encabezado y contenedor de pantalla.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { tabKeyOfRoute, useTabs } from '../lib/tabsPref';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed, toneOf } from '../theme';
import { areaOf } from '../lib/areas';
import { CONTENT_MAX_WIDTH } from '../lib/layout';

export function Header({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const tabs = useTabs();
  // Si esta pantalla está en la barra de abajo, no lleva flecha para volver.
  const here = segments[0] === '(tabs)' ? tabKeyOfRoute(segments[1] ?? '') : null;
  if (here && tabs.includes(here)) back = false;
  const tone = toneOf(areaOf(segments));
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerInner}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/iglesia'))} style={[styles.back, { backgroundColor: tone.soft }]}>
          <Feather name="arrow-left" size={22} color={tone.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
      </View>
      {/* La raya de color del área: se sabe de un vistazo en qué parte de la app se está. */}
      <View style={[styles.headerInner, { marginTop: 8 }]}><View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: tone.solid }} /></View>
    </View>
  );
}

export function Screen({ children, style, scroll = true, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; scroll?: boolean; padded?: boolean }) {
  const insets = useSafeAreaInsets();
  if (!scroll) return <View style={[styles.screen, style]}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24, gap: 16 }, padded && { paddingHorizontal: 16 }, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.bg },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  back: { width: 40, height: 40, borderRadius: 20, marginRight: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 13, fontWeight: '500', color: colors.muted },
}));
