// La cinta de la demostración: siempre a la vista mientras se mira la iglesia de ejemplo.
// Dice que es un ejemplo, deja cambiar entre "ver como pastor" y "ver como miembro" y lleva a pedir La Mies.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter, useSegments, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';
import { DEMO_CONTACT_URL, DEMO_MESSAGE, DEMO_SIGNUP_ROUTE, demoViewOfSession, enterDemo, isDemoSession, leaveDemo, onDemoFlash, type DemoView } from '@/lib/demo';
import { tx } from '@/lib/i18n';

/** ¿Ya existe la página para empezar? Se mira al armar la app; si todavía no está, el botón abre un correo. */
function signupExists(): boolean {
  try {
    const ctx = (require as unknown as { context: (dir: string, deep: boolean, re: RegExp) => { keys: () => string[] } }).context('../../app', false, /^\.\/empezar\.tsx$/);
    return ctx.keys().length > 0;
  } catch {
    return false;
  }
}
const HAS_SIGNUP = signupExists();

export function DemoRibbon() {
  const { session } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [small, setSmall] = useState(false);
  const [busy, setBusy] = useState<DemoView | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onDemoFlash(() => {
      setFlash(true);
      setSmall(false);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setFlash(false), 4000);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);

  if (!isDemoSession(session)) return null;
  const view = demoViewOfSession(session);
  const first = (segments[0] ?? '') as string;
  // La pantalla de salida de la presentación (lo que va al proyector) queda limpia.
  if (first === 'presentar' && (segments[1] as string | undefined) === 'salida') return null;
  const lift = (first === '(tabs)' ? 86 : 10) + insets.bottom;
  const narrow = width < 520;

  const switchTo = async (v: DemoView) => {
    if (v === view || busy) return;
    setBusy(v);
    const r = await enterDemo(v);
    setBusy(null);
    if (r.ok) router.replace('/');
  };
  const want = () => {
    if (HAS_SIGNUP) router.push(DEMO_SIGNUP_ROUTE as Href);
    else Linking.openURL(DEMO_CONTACT_URL).catch(() => undefined);
  };
  const leave = async () => {
    await leaveDemo();
    router.replace('/login');
  };

  if (small) {
    return (
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.holder, { paddingBottom: lift, alignItems: 'flex-end', paddingRight: 10 }]}>
        <Pressable onPress={() => setSmall(false)} accessibilityRole="button" accessibilityLabel={tx('Mostrar la cinta de la demostración')} style={styles.pill}>
          <Feather name="eye" size={15} color="#FFF" />
          <Text style={styles.pillText}>{tx('Iglesia de ejemplo')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.holder, { paddingBottom: lift }]}>
      <View style={[styles.card, flash && styles.cardFlash, { maxWidth: narrow ? width - 16 : 640 }]} accessibilityRole="summary">
        <View style={styles.row}>
          <Feather name={flash ? 'lock' : 'eye'} size={16} color="#FFF" />
          <Text style={styles.title} numberOfLines={2}>{flash ? tx(DEMO_MESSAGE) : tx('Estás viendo una iglesia de ejemplo')}</Text>
          <Pressable onPress={() => setSmall(true)} accessibilityRole="button" accessibilityLabel={tx('Achicar')} hitSlop={10} style={styles.x}>
            <Feather name="chevron-down" size={18} color="#FFF" />
          </Pressable>
        </View>
        <View style={[styles.row, { flexWrap: 'wrap', rowGap: 6 }]}>
          <View style={styles.switch}>
            {(['pastor', 'miembro'] as DemoView[]).map((v) => (
              <Pressable key={v} onPress={() => switchTo(v)} accessibilityRole="button" accessibilityState={{ selected: view === v }}
                style={[styles.opt, view === v && styles.optOn]}>
                {busy === v ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <Text style={[styles.optText, view === v && styles.optTextOn]}>{v === 'pastor' ? tx('Ver como pastor') : tx('Ver como miembro')}</Text>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable onPress={want} accessibilityRole="link" style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
            <Text style={styles.ctaText}>{tx('Quiero La Mies para mi iglesia')}</Text>
          </Pressable>
          {Platform.OS === 'web' ? null : (
            <Pressable onPress={leave} accessibilityRole="button" hitSlop={8}><Text style={styles.leave}>{tx('Salir')}</Text></Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  holder: { justifyContent: 'flex-end', alignItems: 'center', zIndex: 9000 },
  card: {
    width: '100%', backgroundColor: '#1F3A5F', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginHorizontal: 8,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  cardFlash: { backgroundColor: '#B45309' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '800' },
  x: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  switch: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10, padding: 3, gap: 3 },
  opt: { minHeight: 34, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  optOn: { backgroundColor: '#FFF' },
  optText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  optTextOn: { color: '#1F3A5F' },
  cta: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2F8F5B', alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  ctaText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  leave: { color: '#FFF', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline', paddingHorizontal: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#1F3A5F',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  pillText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
});
