// Después de crear la cuenta: una pantalla limpia que avisa que mandamos el correo para confirmar,
// y a los pocos segundos vuelve sola a Entrar (con el correo ya escrito).
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed } from '@/theme';

const SECONDS = 6;

export default function RegistroEnviado() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [left, setLeft] = useState(SECONDS);

  const goLogin = () => router.replace({ pathname: '/login', params: email ? { email } : {} });

  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) goLogin();
  }, [left]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.center}>
        <View style={styles.icon}><Feather name="mail" size={40} color={colors.green} /></View>
        <Text style={styles.title}>Te mandamos un correo</Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}
        <Text style={styles.text}>
          Abrilo y tocá el enlace para validar tu correo. Después entrá con tu correo y tu contraseña: ya vas a quedar unido a tu iglesia.
        </Text>
        <Text style={styles.small}>Si no lo ves, mirá en Spam o Promociones.</Text>
      </View>
      <Pressable onPress={goLogin} accessibilityRole="button" style={styles.btn}>
        <Text style={styles.btnText}>Ir a Entrar{left > 0 ? ` (${left})` : ''}</Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 28, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, maxWidth: 440, width: '100%', alignSelf: 'center' },
  icon: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center' },
  email: { fontSize: 17, fontWeight: '800', color: colors.green, textAlign: 'center' },
  text: { fontSize: 16, lineHeight: 23, color: colors.text, textAlign: 'center' },
  small: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  btn: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  btnText: { fontSize: 15, fontWeight: '700', color: colors.green },
}));
