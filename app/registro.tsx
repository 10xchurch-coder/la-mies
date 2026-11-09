import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Field, Loading } from '@/components/ui';
import { supabase, errorMessage } from '@/lib/supabase';
import { checkPassword, leakedCount, LEAKED_MSG } from '@/lib/password';
import { PasswordField } from '@/components/PasswordField';
import { WEB_URL } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

export default function Registro() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const join = async (c = code, n = name, ph = phone) => {
    const { error } = await supabase.rpc('join_church', { p_code: c.trim(), p_display_name: n.trim(), p_phone: ph.trim() });
    if (error) throw error;
    await refreshProfile();
    router.replace('/');
  };

  // Al crear la cuenta se guardan el nombre, el celular y el código. Cuando la persona confirma el correo
  // y entra, se la une a su iglesia sola, sin volver a llenar nada. Si el código no sirve, ve el formulario ya lleno.
  const meta = (session?.user?.user_metadata ?? {}) as { display_name?: string; phone?: string; join_code?: string };
  const [autoJoining, setAutoJoining] = useState(!!(session && meta.join_code));
  const tried = useRef(false);
  useEffect(() => {
    if (!session || tried.current) return;
    tried.current = true;
    if (meta.display_name) setName(meta.display_name);
    if (meta.phone) setPhone(meta.phone);
    if (meta.join_code) setCode(meta.join_code);
    if (!meta.join_code || !meta.display_name) { setAutoJoining(false); return; }
    join(meta.join_code, meta.display_name, meta.phone ?? '').catch((e) => {
      setMsg(errorMessage(e));
      setAutoJoining(false);
    });
  }, [session]);

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
      if (await leakedCount(password)) throw new Error(LEAKED_MSG);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { display_name: name.trim(), phone: phone.trim(), join_code: code.trim().toUpperCase() },
          emailRedirectTo: `${WEB_URL}/login`,
        },
      });
      if (error) throw error;
      // Si el correo ya tenía cuenta, Supabase no avisa: devuelve un usuario sin identidades y no manda nada.
      if (!data.session && data.user && (data.user.identities?.length ?? 0) === 0) {
        setMsg('Ya hay una cuenta con ese correo. Volvé a Entrar; si no te acordás la contraseña, tocá "¿Olvidaste tu contraseña?".');
        return;
      }
      if (!data.session) {
        // Pantalla aparte que avisa del correo y después vuelve sola a Entrar.
        router.replace(`/registro-enviado?email=${encodeURIComponent(email.trim().toLowerCase())}` as Href);
        return;
      }
      await join();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (autoJoining) return <Loading />;

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
