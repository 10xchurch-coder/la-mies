import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Field } from '@/components/ui';
import { supabase, errorMessage } from '@/lib/supabase';
import { checkPassword } from '@/lib/password';
import { PasswordField } from '@/components/PasswordField';
import { WEB_URL } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

export default function Registro() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const join = async () => {
    const { error } = await supabase.rpc('join_church', { p_code: code.trim(), p_display_name: name.trim(), p_phone: phone.trim() });
    if (error) throw error;
    await refreshProfile();
    router.replace('/');
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (session) {
        await join();
        return;
      }
      const check = checkPassword(password, [name, email.split('@')[0] ?? '']);
      if (!check.ok) throw new Error(check.problems[0]);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { display_name: name.trim() }, emailRedirectTo: `${WEB_URL}/login` },
      });
      if (error) throw error;
      if (!data.session) {
        setMsg('Te mandamos un correo para confirmar la cuenta. Cuando lo confirmes, entrá y poné el código de tu iglesia.');
        return;
      }
      await join();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={session ? 'Unirme a mi iglesia' : 'Crear cuenta'} back={!session} subtitle="Pedile el código al administrador de tu iglesia" />
      <Screen style={{ gap: 16 }}>
        <Field label="Tu nombre" hint="(como te conocen en la iglesia)" value={name} onChangeText={setName} autoCapitalize="words" />
        {!session ? (
          <>
            <Field label="Correo" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
            <PasswordField label="Contraseña" value={password} onChangeText={setPassword} personal={[name, email.split('@')[0] ?? '']} />
          </>
        ) : null}
        <Field label="Tu celular" hint="(así te encontramos si la iglesia ya te tiene cargado)" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} placeholder="Ej: 376 455-1234" />
        <Field label="Código de la iglesia" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} placeholder="Ej: VICTORIA-2026" />
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        <Button title={session ? 'Unirme' : 'Crear cuenta'} onPress={submit} loading={busy} disabled={!name.trim() || !code.trim() || (!session && (!email || !password))} />
        <Text style={styles.note}>
          Tus datos y los contactos que marques los ve solo tu iglesia. Los administradores de la iglesia ven todo; vos elegís con quién más compartir cada contacto.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  msg: { color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 },
  note: { fontSize: 12, color: colors.muted, lineHeight: 17, textAlign: 'center' },
}));
