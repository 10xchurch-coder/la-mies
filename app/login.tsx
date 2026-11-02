import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Button, Field } from '@/components/ui';
import { supabase, errorMessage, supabaseConfigured } from '@/lib/supabase';
import { WEB_URL } from '@/lib/share';
import { colors } from '@/theme';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Verificación en dos pasos: si la cuenta la tiene, después de la contraseña se pide el código.
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const finish = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
      const { data: f } = await supabase.auth.mfa.listFactors();
      const totp = f?.totp?.find((x) => x.status === 'verified') ?? f?.totp?.[0];
      if (totp) {
        setFactorId(totp.id);
        return;
      }
    }
    router.replace('/');
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (e) {
      setBusy(false);
      setError(errorMessage(e));
      return;
    }
    await finish();
    setBusy(false);
  };

  const verify = async () => {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, '') });
    setBusy(false);
    if (e) setError(errorMessage(e));
    else router.replace('/');
  };

  const cancelMfa = async () => {
    await supabase.auth.signOut();
    setFactorId(null);
    setCode('');
  };

  const reset = async () => {
    if (!email.trim()) {
      setError('Escribí tu correo y volvé a tocar "¿Olvidaste tu contraseña?"');
      return;
    }
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${WEB_URL}/recuperar` });
    setError(e ? errorMessage(e) : 'Te mandamos un correo para cambiar la contraseña. Abrí el link que trae.');
  };

  if (factorId) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen style={{ paddingTop: 72, paddingHorizontal: 24, gap: 18 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={styles.logo}>
              <Feather name="shield" size={38} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Un paso más</Text>
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>Abrí tu app de autenticación (Google Authenticator u otra) y escribí el código de 6 números.</Text>
          </View>
          <Field label="Código" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" value={code} onChangeText={setCode} maxLength={6} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Verificar" onPress={verify} loading={busy} disabled={code.replace(/\D/g, '').length !== 6} />
          <Pressable onPress={cancelMfa} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Cancelar</Text>
          </Pressable>
          <Text style={[styles.verse, { fontStyle: 'normal' }]}>¿Perdiste el teléfono con la app de autenticación? Pedile al pastor que te quite la verificación en dos pasos.</Text>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

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
