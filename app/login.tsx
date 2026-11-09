import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Button, Field } from '@/components/ui';
import { supabase, errorMessage, supabaseConfigured } from '@/lib/supabase';
import { WEB_URL } from '@/lib/share';
import { colors, themed } from '@/theme';

export default function Login() {
  const router = useRouter();
  // Viene de "Crear cuenta": el correo ya queda escrito.
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof emailParam === 'string' ? emailParam : '');
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
      // El error más común: alguien nuevo escribe su correo acá sin haber creado la cuenta.
      const bad = /invalid login credentials|invalid_credentials/i.test(e.message ?? '');
      setError(bad ? 'Correo o contraseña incorrectos. Si es tu primera vez, todavía no tenés cuenta: tocá "Crear mi cuenta" acá abajo.' : errorMessage(e));
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

  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const reset = async () => {
    if (resetState !== 'idle') return;
    if (!email.trim()) {
      setError('Escribí tu correo y volvé a tocar "¿Olvidaste tu contraseña?"');
      return;
    }
    // Aviso inmediato, antes de esperar al servidor, para que nadie toque dos veces.
    setResetState('sending');
    setError('Enviando el correo…');
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${WEB_URL}/recuperar` });
    if (e) {
      setResetState('idle');
      setError(errorMessage(e));
    } else {
      setResetState('sent');
      setError(`Listo: te mandamos un correo a ${email.trim().toLowerCase()}. Abrí el link que trae (mirá también en spam).`);
    }
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
        <Pressable onPress={reset} disabled={resetState !== 'idle'} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: resetState === 'idle' ? colors.green : colors.muted, fontWeight: '600' }}>
            {resetState === 'sending' ? 'Enviando…' : resetState === 'sent' ? 'Correo enviado ✓' : '¿Olvidaste tu contraseña?'}
          </Text>
        </Pressable>
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>¿Es tu primera vez?</Text>
          <Button title="Crear mi cuenta" icon="user-plus" variant="outline" onPress={() => router.push(email ? { pathname: '/registro', params: { email } } : '/registro')} />
          <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>Necesitás el código de tu iglesia.</Text>
        </View>
        <View style={{ alignItems: 'center', gap: 4, marginTop: 24 }}>
          <Text style={styles.verse}>Entonces dijo a sus discípulos: A la verdad la mies es mucha, mas los obreros pocos</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.green }}>Mateo 9:37</Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  logo: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5, color: colors.text, marginTop: 8 },
  subtitle: { fontSize: 14, fontWeight: '500', color: colors.muted },
  error: { color: colors.red, fontSize: 13, textAlign: 'center' },
  warn: { color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, textAlign: 'center' },
  verse: { fontSize: 13, fontStyle: 'italic', color: colors.muted, textAlign: 'center', lineHeight: 19 },
}));
