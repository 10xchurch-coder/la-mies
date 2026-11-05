// Encabezado y contenedor de pantalla.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed } from '../theme';
import { CONTENT_MAX_WIDTH } from '../lib/layout';

export function Header({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerInner}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
      </View>
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
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 13, fontWeight: '500', color: colors.muted },
}));
