import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Button, Field } from '@/components/ui';
import { supabase, errorMessage, supabaseConfigured } from '@/lib/supabase';
import { colors } from '@/theme';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (e) setError(errorMessage(e));
    else router.replace('/');
  };

  const reset = async () => {
    if (!email.trim()) {
      setError('Escribí tu correo y volvé a tocar "¿Olvidaste tu contraseña?"');
      return;
    }
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    setError(e ? errorMessage(e) : 'Te mandamos un correo para cambiar la contraseña.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={{ paddingTop: 72, paddingHorizontal: 24, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={styles.logo}>
            <Feather name="feather" size={38} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>La Mies</Text>
          <Text style={styles.subtitle}>Evangelismo casa por casa</Text>
        </View>
        {!supabaseConfigured ? (
          <Text style={styles.warn}>Falta configurar la conexión (archivo .env). Mirá el README.</Text>
        ) : null}
        <Field label="Correo" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} />
        <Field label="Contraseña" secureTextEntry autoComplete="password" textContentType="password" value={password} onChangeText={setPassword} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Entrar" onPress={signIn} loading={busy} disabled={!email || !password} />
        <Pressable onPress={reset} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.green, fontWeight: '600' }}>¿Olvidaste tu contraseña?</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/registro')} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            ¿Primera vez? <Text style={{ color: colors.green, fontWeight: '700' }}>Creá tu cuenta con el código de tu iglesia</Text>
          </Text>
        </Pressable>
        <View style={{ alignItems: 'center', gap: 4, marginTop: 24 }}>
          <Text style={styles.verse}>Entonces dijo a sus discípulos: A la verdad la mies es mucha, mas los obreros pocos</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.green }}>Mateo 9:37</Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5, color: colors.text, marginTop: 8 },
  subtitle: { fontSize: 14, fontWeight: '500', color: colors.muted },
  error: { color: colors.red, fontSize: 13, textAlign: 'center' },
  warn: { color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, textAlign: 'center' },
  verse: { fontSize: 13, fontStyle: 'italic', color: colors.muted, textAlign: 'center', lineHeight: 19 },
});
