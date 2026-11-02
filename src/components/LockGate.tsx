// Face ID / huella / código del teléfono para abrir la app.
// Se pide al abrir y cada vez que la app vuelve del fondo después de un rato.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';
import { Button } from './ui';

const RELOCK_AFTER_MS = 2 * 60 * 1000;

export async function biometricsAvailable(): Promise<{ available: boolean; label: string }> {
  try {
    const hw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    return { available: hw && enrolled, label: face ? 'Face ID' : 'huella o código' };
  } catch {
    return { available: false, label: 'código' };
  }
}

export function LockGate({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [locked, setLocked] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  const authenticate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { available } = await biometricsAvailable();
      if (!available) {
        // Sin Face ID ni código configurado no hay con qué bloquear.
        setLocked(false);
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloqueá La Mies',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar el código del teléfono',
        disableDeviceFallback: false,
      });
      if (res.success) setLocked(false);
      else setError('No se pudo verificar. Probá de nuevo.');
    } catch {
      setError('No se pudo verificar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    setLocked(true);
    authenticate();
  }, [enabled, authenticate]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (backgroundAt.current === null) backgroundAt.current = Date.now();
      } else if (state === 'active') {
        const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
        backgroundAt.current = null;
        if (away > RELOCK_AFTER_MS) {
          setLocked(true);
          authenticate();
        }
      }
    });
    return () => sub.remove();
  }, [enabled, authenticate]);

  if (!locked) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Feather name="lock" size={34} color="#FFFFFF" />
      </View>
      <Text style={styles.title}>La Mies</Text>
      <Text style={styles.text}>Desbloqueá con Face ID, huella o el código del teléfono</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Desbloquear" onPress={authenticate} loading={busy} style={{ alignSelf: 'stretch', marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  error: { fontSize: 13, color: colors.red, textAlign: 'center' },
});
