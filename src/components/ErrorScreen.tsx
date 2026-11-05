// Si algo falla feo en la app, en vez de cerrarse sola muestra esta pantalla y manda el error
// a la base, así se puede arreglar sin tener el teléfono en la mano.
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';
import { Button } from './ui';
import { supabase } from '../lib/supabase';

export const APP_VERSION = `${Constants.expoConfig?.version ?? '?'} (${Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '?'})`;

export async function reportError(err: unknown, info?: Record<string, unknown>): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    await supabase.rpc('log_app_error', {
      p_message: e.message,
      p_stack: (e.stack ?? '').slice(0, 8000),
      p_info: info ?? null,
      p_platform: Platform.OS,
      p_version: APP_VERSION,
    });
  } catch {
    // sin conexión no se puede avisar; no pasa nada
  }
}

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, { componentStack: (info.componentStack ?? '').slice(0, 3000) });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <View style={styles.wrap}>
        <Feather name="alert-triangle" size={40} color={colors.amberText} />
        <Text style={styles.title}>Algo salió mal</Text>
        <Text style={styles.text}>La app tuvo un error. Ya quedó anotado para que lo arreglemos. Tocá "Reintentar"; si vuelve a pasar, cerrá la app y abrila de nuevo.</Text>
        <Button title="Reintentar" onPress={() => this.setState({ error: null })} />
        <ScrollView style={styles.box}>
          <Text selectable style={styles.mono}>{e.message}</Text>
        </ScrollView>
        <Text style={styles.ver}>La Mies {APP_VERSION}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  box: { maxHeight: 120, width: '100%', backgroundColor: colors.bgSoft, borderRadius: 10, padding: 10 },
  mono: { fontSize: 11, color: colors.muted, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  ver: { fontSize: 11, color: colors.muted },
});
