// Cambiar la contraseña después de abrir el link del correo "¿Olvidaste tu contraseña?".
// En la web, el link trae la sesión; acá solo se escribe la contraseña nueva.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { PasswordField } from '@/components/PasswordField';
import { Button } from '@/components/ui';
import { checkPassword } from '@/lib/password';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Recuperar() {
  const router = useRouter();
  const { session } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    const c = checkPassword(pw, [session?.user.email?.split('@')[0] ?? '']);
    if (!c.ok) {
      setMsg(c.problems[0]);
      return;
    }
    if (pw !== pw2) {
      setMsg('Las dos contraseñas no son iguales.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg(errorMessage(error));
    else {
      setMsg(null);
      router.replace('/');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Nueva contraseña" subtitle={session?.user.email ?? undefined} />
      <Screen style={{ gap: 16 }}>
        {!session ? (
          <>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              Este link ya venció o se abrió en otro navegador. Volvé a pedir uno desde "¿Olvidaste tu contraseña?" y abrilo en el mismo teléfono o computadora.
            </Text>
            <Button title="Ir a iniciar sesión" onPress={() => router.replace('/login')} />
          </>
        ) : (
          <>
            <PasswordField label="Contraseña nueva" value={pw} onChangeText={setPw} personal={[session.user.email?.split('@')[0] ?? '']} />
            <PasswordField label="Repetila" value={pw2} onChangeText={setPw2} isNew={false} />
            {msg ? <Text style={{ color: colors.red, fontSize: 13 }}>{msg}</Text> : null}
            <Button title="Guardar contraseña" onPress={save} loading={busy} disabled={!pw || !pw2} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
