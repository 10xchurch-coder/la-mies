// Si algo falla feo en la app, en vez de cerrarse sola muestra esta pantalla y manda el error
// a la base, así se puede arreglar sin tener el teléfono en la mano.
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { colors, themed } from '../theme';
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

/** En la web, cuando se publica una versión nueva, la pestaña que quedó abierta busca archivos que ya no existen.
 *  No es un error de verdad: alcanza con recargar la página para traer la versión nueva. */
export function isStaleBundleError(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /Loading module .* failed|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk .* failed/i.test(m);
}

function reloadForNewVersion(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    // Una sola vez cada 30 segundos, para no quedar recargando en bucle si de verdad falta un archivo.
    const last = Number(window.sessionStorage.getItem('la-mies-reload') ?? 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem('la-mies-reload', String(Date.now()));
  } catch {
    // sin sessionStorage igual recargamos
  }
  window.location.reload();
  return true;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isStaleBundleError(error) && reloadForNewVersion()) return;
    reportError(error, { componentStack: (info.componentStack ?? '').slice(0, 3000) });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    const stale = isStaleBundleError(e);
    if (stale && Platform.OS === 'web') {
      return (
        <View style={styles.wrap}>
          <Feather name="refresh-cw" size={36} color={colors.green} />
          <Text style={styles.title}>Hay una versión nueva</Text>
          <Text style={styles.text}>La app se actualizó mientras la tenías abierta. Tocá para cargar la versión nueva.</Text>
          <Button title="Actualizar" onPress={() => window.location.reload()} />
        </View>
      );
    }
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

const styles = themed(() => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  box: { maxHeight: 120, width: '100%', backgroundColor: colors.bgSoft, borderRadius: 10, padding: 10 },
  mono: { fontSize: 11, color: colors.muted, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  ver: { fontSize: 11, color: colors.muted },
}));
