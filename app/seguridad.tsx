// Seguridad de mi cuenta: cambiar la contraseña y la verificación en dos pasos (código de 6 números).
import React, { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Header, Screen } from '@/components/Screen';
import { PasswordField } from '@/components/PasswordField';
import { Button, Card, Field, SectionTitle, Tag } from '@/components/ui';
import { checkPassword, leakedCount, LEAKED_MSG } from '@/lib/password';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

type Factor = { id: string; friendly_name?: string | null; status: string; created_at: string };
type Enrolling = { id: string; secret: string; uri: string };

export default function Seguridad() {
  const { session, profile, isStaff } = useAuth();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [Qr, setQr] = useState<React.ComponentType<{ value: string; size: number }> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.totp ?? []) as Factor[]).filter((f) => f.status === 'verified'));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const startEnroll = async () => {
    setBusy(true);
    try {
      // Si quedó un intento a medias, se borra para empezar limpio.
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of (all?.totp ?? []) as Factor[]) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `La Mies ${new Date().getFullYear()}` });
      if (error) throw error;
      const mod = await import('react-native-qrcode-svg');
      setQr(() => mod.default as unknown as React.ComponentType<{ value: string; size: number }>);
      setEnrolling({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
      setCode('');
    } catch (e) {
      Alert.alert('No se pudo activar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!enrolling) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: code.replace(/\D/g, '') });
      if (error) throw error;
      setEnrolling(null);
      setCode('');
      await load();
      Alert.alert('Listo', 'La verificación en dos pasos quedó activada. Cada vez que entres, además de la contraseña te vamos a pedir el código de la app.');
    } catch (e) {
      Alert.alert('Código incorrecto', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.id }).catch(() => undefined);
    setEnrolling(null);
    setCode('');
  };

  const removeFactor = (f: Factor) =>
    Alert.alert('Desactivar', '¿Quitar la verificación en dos pasos? Tu cuenta queda protegida solo por la contraseña.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
          if (error) Alert.alert('No se pudo', errorMessage(error));
          await load();
        },
      },
    ]);

  const changePassword = async () => {
    const c = checkPassword(pw, [profile?.display_name ?? '', session?.user.email?.split('@')[0] ?? '']);
    if (!c.ok) {
      Alert.alert('Contraseña débil', c.problems.join('\n'));
      return;
    }
    if (await leakedCount(pw)) {
      Alert.alert('Contraseña filtrada', LEAKED_MSG);
      return;
    }
    if (pw !== pw2) {
      Alert.alert('No coinciden', 'Las dos contraseñas tienen que ser iguales.');
      return;
    }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) Alert.alert('No se pudo cambiar', errorMessage(error));
    else {
      setPw('');
      setPw2('');
      Alert.alert('Listo', 'Tu contraseña cambió. Si la app está abierta en otro teléfono, va a pedir entrar de nuevo.');
    }
  };

  const has2fa = factors.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Seguridad de mi cuenta" subtitle={session?.user.email ?? undefined} back />
      <Screen>
        <SectionTitle right={<Tag text={has2fa ? 'Activada' : 'Desactivada'} tone={has2fa ? 'green' : 'amber'} />}>Verificación en dos pasos</SectionTitle>
        {enrolling ? (
          <Card style={{ gap: 14 }}>
            <Text style={styles.p}>
              <Text style={{ fontWeight: '800' }}>1.</Text> Instalá una app de autenticación si no tenés: <Text style={{ fontWeight: '700' }}>Google Authenticator</Text> (gratis, en la tienda de apps).
            </Text>
            <Text style={styles.p}>
              <Text style={{ fontWeight: '800' }}>2.</Text> En esa app tocá <Text style={{ fontWeight: '700' }}>+</Text> y {Platform.OS === 'web' ? 'escaneá este código con la cámara' : 'elegí "Ingresar clave de configuración" y pegá la clave de abajo (o escaneá el código desde otra pantalla)'}.
            </Text>
            {Qr ? (
              <View style={{ alignItems: 'center', padding: 12, backgroundColor: '#FFF', borderRadius: 12, alignSelf: 'center' }}>
                <Qr value={enrolling.uri} size={190} />
              </View>
            ) : null}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Clave de configuración</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text selectable style={{ flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: 1, color: colors.text }}>{enrolling.secret.replace(/(.{4})/g, '$1 ').trim()}</Text>
                <Button title="Copiar" small variant="outline" icon="copy" onPress={() => Clipboard.setStringAsync(enrolling.secret)} />
              </View>
            </View>
            <Text style={styles.p}>
              <Text style={{ fontWeight: '800' }}>3.</Text> Escribí acá el código de 6 números que muestra la app.
            </Text>
            <Field label="Código" keyboardType="number-pad" autoComplete="one-time-code" value={code} onChangeText={setCode} maxLength={6} />
            <Button title="Activar" onPress={confirmEnroll} loading={busy} disabled={code.replace(/\D/g, '').length !== 6} />
            <Button title="Cancelar" variant="ghost" onPress={cancelEnroll} />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Feather name="shield" size={24} color={has2fa ? colors.green : colors.amberText} />
              <Text style={[styles.p, { flex: 1 }]}>
                {has2fa
                  ? 'Para entrar a tu cuenta hace falta la contraseña y el código de tu app de autenticación. Aunque alguien sepa tu contraseña, no puede entrar.'
                  : 'Agrega un segundo candado: además de la contraseña, un código de 6 números que cambia cada 30 segundos en tu teléfono.'}
                {isStaff && !has2fa ? ' Como ves los datos de toda la iglesia, te recomendamos activarla.' : ''}
              </Text>
            </View>
            {factors.map((f) => (
              <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Feather name="smartphone" size={18} color={colors.green} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{f.friendly_name || 'App de autenticación'}</Text>
                <Button title="Quitar" small variant="danger" onPress={() => removeFactor(f)} />
              </View>
            ))}
            {!has2fa ? <Button title="Activar verificación en dos pasos" icon="shield" onPress={startEnroll} loading={busy} /> : null}
          </Card>
        )}

        <SectionTitle>Cambiar contraseña</SectionTitle>
        <Card style={{ gap: 12 }}>
          <PasswordField label="Contraseña nueva" value={pw} onChangeText={setPw} personal={[profile?.display_name ?? '', session?.user.email?.split('@')[0] ?? '']} />
          <PasswordField label="Repetila" value={pw2} onChangeText={setPw2} isNew={false} />
          <Button title="Cambiar contraseña" variant="outline" onPress={changePassword} loading={pwBusy} disabled={!pw || !pw2} />
        </Card>

        <SectionTitle>Consejos</SectionTitle>
        <Card style={{ gap: 8 }}>
          <Text style={styles.p}>• Usá una contraseña que no uses en ningún otro lado.</Text>
          <Text style={styles.p}>• Nunca la compartas por WhatsApp ni se la digas a nadie, ni siquiera a alguien que diga ser de la iglesia o de La Mies.</Text>
          <Text style={styles.p}>• Si perdés el teléfono, cambiá la contraseña desde otro aparato y avisale al pastor para que cierre tu sesión.</Text>
        </Card>
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  p: { fontSize: 14, lineHeight: 20, color: colors.text },
}));
