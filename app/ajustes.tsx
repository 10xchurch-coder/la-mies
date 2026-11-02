// Ajustes: perfil, cómo comparto, Face ID, ubicación, cuenta.
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Card, Choice, RowLink, SectionTitle, Toggle } from '@/components/ui';
import { biometricsAvailable } from '@/components/LockGate';
import { updateProfile } from '@/lib/api';
import { ROLE_LABEL, groupWord } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Ajustes() {
  const router = useRouter();
  const { profile, church, group, refreshProfile, signOut } = useAuth();
  const [bio, setBio] = useState<{ available: boolean; label: string }>({ available: true, label: 'Face ID' });

  useEffect(() => {
    biometricsAvailable().then(setBio);
  }, []);

  const set = async (patch: Parameters<typeof updateProfile>[0]) => {
    try {
      await updateProfile(patch);
      await refreshProfile();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Probá de nuevo');
    }
  };

  const roleLabel = ROLE_LABEL[profile?.role ?? 'member'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ajustes" back />
      <Screen>
        <View style={styles.profile}>
          <Avatar name={profile?.display_name ?? '?'} size={52} color={colors.green} textColor="#FFFFFF" />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 17, fontWeight: '800' }}>{profile?.display_name}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {roleLabel}{group ? ` · ${group.name}` : ''}{church ? ` · ${church.name}` : ''}
            </Text>
          </View>
        </View>

        <SectionTitle>Compartir mis contactos</SectionTitle>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '600' }}>Cuando marco una casa nueva, compartirla con</Text>
          <Choice
            options={[
              { value: 'group', label: group ? `Todo mi ${groupWord(church?.grouping).toLowerCase()}` : 'Toda la iglesia' },
              { value: 'me', label: 'Solo yo' },
              { value: 'ask', label: 'Preguntarme cada vez' },
            ]}
            value={profile?.share_default ?? 'group'}
            onChange={(v) => set({ share_default: v })}
          />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Podés cambiarlo para un contacto puntual al momento de guardarlo. Los administradores de la iglesia ven todos los contactos.</Text>
        </Card>

        <SectionTitle>Seguridad y ubicación</SectionTitle>
        <Card>
          <Toggle
            label={`Pedir ${bio.label} para abrir la app`}
            hint={bio.available ? 'También se pide si la app estuvo cerrada más de 2 minutos.' : 'Tu teléfono no tiene Face ID, huella ni código configurado.'}
            value={profile?.biometric_lock ?? true}
            onChange={(v) => set({ biometric_lock: v })}
          />
          <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Feather name="lock" size={22} color={colors.green} />
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
              Tu ubicación en vivo se comparte con el equipo <Text style={{ fontWeight: '700' }}>solo mientras una salida está activa</Text>. Al terminar, queda guardado el recorrido para el mapa de veredas, no dónde estás.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Feather name="truck" size={22} color={colors.green} />
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
              Si la app detecta velocidad de vehículo durante una salida, la corta sola en el último punto en que caminabas, para que no queden líneas por toda la ciudad.
            </Text>
          </View>
        </Card>

        <SectionTitle>Cuenta</SectionTitle>
        <Card style={{ padding: 0 }}>
          <RowLink title="Seguridad de mi cuenta" subtitle="Contraseña y verificación en dos pasos" icon="shield" onPress={() => router.push('/seguridad')} />
          <RowLink
            title="Cerrar sesión"
            icon="log-out"
            danger
            onPress={() => Alert.alert('Cerrar sesión', '¿Salir de la app en este teléfono?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Salir', style: 'destructive', onPress: () => signOut().then(() => router.replace('/login')) }])}
          />
        </Card>
        <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>La Mies · versión 0.4 · {church?.name ?? ''}</Text>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: colors.bgSoft },
});
