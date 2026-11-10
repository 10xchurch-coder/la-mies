import '@/lib/webAlert'; // en la web, los avisos y confirmaciones se muestran como ventanas
import '@/lib/locationTask'; // registra la tarea de GPS en segundo plano
import '@/lib/busTask'; // y la del colectivo en vivo
import React, { useEffect, useState } from 'react';
import { ActionSheetHost } from '@/components/ActionSheet';
import { RulesGate } from '@/components/RulesGate';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/store/auth';
import { OutingProvider } from '@/store/outing';
import { LockGate } from '@/components/LockGate';
import { OutingBanner } from '@/components/OutingBanner';
import { rememberLockRequired, useLockOptIn, useLockRequiredCache } from '@/lib/lockPref';
import { needsAppLock } from '@/lib/perms';
import { Loading } from '@/components/ui';
import { ErrorBoundary, reportError } from '@/components/ErrorScreen';
import { loadThemeMode } from '@/lib/themeStore';
import { loadTabs } from '@/lib/tabsPref';
import { loadMenu } from '@/lib/menuPref';
import { useOtaUpdates } from '@/lib/otaUpdates';
import { startOfflineSync } from '@/lib/offline';
import { colors, useThemeMode } from '@/theme';

// Errores que no pasan por la pantalla (promesas, tareas de fondo): quedan anotados en la base.
const RNErrorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
if (RNErrorUtils) {
  const previous = RNErrorUtils.getGlobalHandler();
  RNErrorUtils.setGlobalHandler((e, fatal) => {
    reportError(e, { fatal: !!fatal, where: 'global' });
    previous?.(e, fatal);
  });
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Al tocar un aviso del teléfono, abrir la pantalla que corresponde. */
function useNotificationLinks() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const link = r?.notification.request.content.data?.link;
      if (typeof link === 'string' && link.startsWith('/')) setTimeout(() => router.push(link as Href), 300);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}

// Pantallas que se pueden ver sin haber entrado.
const PUBLIC = new Set(['login', 'registro', 'registro-enviado', 'recuperar']);

/** Sin sesión no se ve nada de la iglesia: siempre a Entrar. Con sesión pero sin iglesia: a unirse.
 *  (Antes, abrir un link directo, por ejemplo al devocional, mostraba la pantalla sin sesión y fallaban los botones.) */
function useAuthGuard() {
  const { loading, session, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const first = (segments[0] ?? '') as string;
  useEffect(() => {
    if (loading) return;
    if (!session && !PUBLIC.has(first)) router.replace('/login');
    else if (session && profile && !profile.church_id && !PUBLIC.has(first)) router.replace('/registro');
  }, [loading, session, profile, first, router]);
}

function Gate() {
  const { loading, session, perms } = useAuth();
  const optIn = useLockOptIn();
  const cachedRequired = useLockRequiredCache();
  const required = perms.length ? needsAppLock(perms) : !!cachedRequired;
  useEffect(() => { if (perms.length) rememberLockRequired(needsAppLock(perms)); }, [perms]);
  useNotificationLinks();
  useAuthGuard();
  if (loading || optIn === null || cachedRequired === null) return <Loading />;
  // Solo se pide Face ID / huella a quien maneja finanzas o administración, o al que lo activó.
  const lock = Platform.OS !== 'web' && !!session && (required || optIn);
  return (
    <LockGate enabled={lock}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      {session ? <OutingBanner /> : null}
    </LockGate>
  );
}

export default function RootLayout() {
  const [themeReady, setThemeReady] = useState(false);
  const mode = useThemeMode();
  useOtaUpdates();
  useEffect(() => startOfflineSync(), []);
  useEffect(() => {
    Promise.all([loadThemeMode(), loadTabs(), loadMenu()]).finally(() => setThemeReady(true));
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = colors.bg;
      document.body.style.colorScheme = mode;
    }
  }, [mode]);
  if (!themeReady) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <OutingProvider>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <ErrorBoundary>
            {/* La clave hace que toda la app se vuelva a dibujar con los colores nuevos al cambiar de modo. */}
            <Gate key={mode} />
            <ActionSheetHost key={`sheet-${mode}`} />
            <RulesGate key={`rules-${mode}`} />
          </ErrorBoundary>
        </OutingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
