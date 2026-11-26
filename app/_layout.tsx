import '@/lib/webAlert'; // en la web, los avisos y confirmaciones se muestran como ventanas
import { installDemo, wasDemoHere } from '@/lib/demo'; // la iglesia de ejemplo (demostración)
import { DemoRibbon } from '@/components/DemoRibbon';
import '@/lib/locationTask'; // registra la tarea de GPS en segundo plano
import '@/lib/busTask'; // y la del colectivo en vivo
import '@/lib/chatLive'; // y la de la ubicación en tiempo real de los chats
import '@/lib/famLocTask'; // y la de la ubicación en familia
import React, { useEffect, useState, useRef } from 'react';
import { ActionSheetHost } from '@/components/ActionSheet';
import { RulesGate } from '@/components/RulesGate';
import { Stack, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { featureInfo, featureOfPath, pathOn } from '@/lib/features';
import { setChurchBible } from '@/lib/bible';
import { setDailyVerseWritten } from '@/lib/dailyVerse';
import { useChurchSync } from '@/lib/useChurchSync';
import { FeatureOff } from '@/components/FeatureOff';
import { Platform, StyleSheet, View } from 'react-native';
import { pingCentral } from '@/lib/centralData';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/store/auth';
import { OutingProvider } from '@/store/outing';
import { LockGate } from '@/components/LockGate';
import { SuspendedScreen, useChurchSuspended } from '@/components/SuspendedGate';
import { OutingBanner } from '@/components/OutingBanner';
import { SharingBanner } from '@/components/SharingBanner';
import { MemberViewBanner } from '@/components/MemberViewBanner';
import { PhotoCropperHost } from '@/components/PhotoCropper';
import { loadDeskPref } from '@/components/desk/DeskShell';
import { rememberLockRequired, useLockOptIn, useLockRequiredCache } from '@/lib/lockPref';
import { needsAppLock } from '@/lib/perms';
import { Loading } from '@/components/ui';
import { APP_VERSION, ErrorBoundary, reportError } from '@/components/ErrorScreen';
import { loadThemeMode } from '@/lib/themeStore';
import { loadLang, useLang } from '@/lib/i18nStore';
import { loadTabs } from '@/lib/tabsPref';
import { loadMenu } from '@/lib/menuPref';
import { useOtaUpdates } from '@/lib/otaUpdates';
import { startOfflineSync } from '@/lib/offline';
import { startNetSync } from '@/lib/netFetch';
import { registerWebShell } from '@/lib/webShell';
import { OfflineBadge } from '@/components/OfflineBadge';
import { HideOnOutput } from '@/components/PresentChrome';
import { colors, useThemeMode } from '@/theme';
import { tx } from '@/lib/i18n';

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
// 'e' = la página pública de un evento: se abre sin cuenta. 'visita' = la tarjeta de visita del QR de la puerta.
// 'empezar' = una iglesia nueva se anota sola. 'demo' = la puerta de la iglesia de ejemplo: entra sola con una cuenta que no puede guardar nada.
const PUBLIC = new Set(['login', 'registro', 'registro-enviado', 'recuperar', 'e', 'visita', 'empezar', 'demo', 'verso']);
installDemo();

/** Sin sesión no se ve nada de la iglesia: siempre a Entrar. Con sesión pero sin iglesia: a unirse.
 *  (Antes, abrir un link directo, por ejemplo al devocional, mostraba la pantalla sin sesión y fallaban los botones.) */
function useAuthGuard() {
  const { loading, session, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const first = (segments[0] ?? '') as string;
  useEffect(() => {
    if (loading) return;
    // El que estaba mirando la demostración y se quedó sin sesión vuelve a entrar solo, sin pasar por Entrar.
    if (!session && !PUBLIC.has(first)) router.replace(wasDemoHere() ? '/demo' : '/login');
    else if (session && profile && !profile.church_id && !PUBLIC.has(first)) router.replace('/registro');
  }, [loading, session, profile, first, router]);
}

/**
 * Si la dirección es de una función que la iglesia apagó (un aviso viejo, un enlace guardado, un favorito),
 * en vez de la pantalla se ve "Tu iglesia no usa esta parte". Devuelve la función apagada, o null si se puede abrir.
 */
function useFeatureGuard() {
  const { church, session } = useAuth();
  const pathname = usePathname();
  const disabled = church?.disabled_features;
  if (!session || !church || !disabled?.length || pathOn(disabled, pathname)) return null;
  return featureOfPath(pathname);
}

function Gate() {
  const { loading, session, realPerms: perms, church, can, profile } = useAuth();
  const router = useRouter();
  // La Biblia que permite la iglesia: se deja lista antes de dibujar cualquier pantalla.
  setChurchBible(church?.bible ?? null);
  setDailyVerseWritten(church?.daily_verse_written);
  useChurchSync();
  // Para La Mies Central: contar cuántos usan la app, con qué versión e idioma (nunca qué hace cada uno).
  useEffect(() => { if (session && profile?.church_id) pingCentral(session.user.id, APP_VERSION); }, [session, profile?.church_id]);
  const optIn = useLockOptIn();
  const cachedRequired = useLockRequiredCache();
  const required = perms.length ? needsAppLock(perms) : !!cachedRequired;
  useEffect(() => { if (perms.length) rememberLockRequired(needsAppLock(perms)); }, [perms]);
  useNotificationLinks();
  useAuthGuard();
  const offKey = useFeatureGuard();
  const suspended = useChurchSuspended();
  if (loading || optIn === null || cachedRequired === null) return <Loading />;
  if (session && suspended) return <SuspendedScreen />;
  // Solo se pide Face ID / huella a quien maneja finanzas o administración, o al que lo activó.
  const lock = Platform.OS !== 'web' && !!session && (required || optIn);
  return (
    <LockGate enabled={lock}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      {session ? <HideOnOutput><OutingBanner /><SharingBanner /><MemberViewBanner /></HideOnOutput> : null}
      {session ? <DemoRibbon /> : null}
      {offKey ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 50 }]}>
          <FeatureOff name={featureInfo(offKey).label} canManage={can('admin.permisos')}
            onHome={() => router.replace('/')} onManage={() => router.replace('/admin/funciones' as Href)} />
        </View>
      ) : null}
      <PhotoCropperHost />
    </LockGate>
  );
}

/**
 * La clave hace que toda la app se vuelva a dibujar con los colores nuevos al cambiar de modo, y con los textos nuevos al cambiar de idioma.
 * Sin sesión (Entrar, Crear cuenta, Empezar) el cambio de idioma NO vuelve a armar la app, porque se borraría lo que la persona ya escribió:
 * esas pantallas se redibujan solas con useLang().
 */
function Keyed({ mode }: { mode: string }) {
  const lang = useLang();
  const { session } = useAuth();
  const keyLang = useRef(lang);
  if (session) keyLang.current = lang;
  const k = `${mode}-${keyLang.current}`;
  return (
    <>
      <Gate key={k} />
      <ActionSheetHost key={`sheet-${k}`} />
      <RulesGate key={`rules-${k}`} />
    </>
  );
}

export default function RootLayout() {
  const [themeReady, setThemeReady] = useState(false);
  const mode = useThemeMode();
  useOtaUpdates();
  useEffect(() => startOfflineSync(), []);
  useEffect(() => startNetSync(), []);
  useEffect(() => { if (Platform.OS === 'web') registerWebShell(); }, []);
  useEffect(() => {
    Promise.all([loadThemeMode(), loadTabs(), loadMenu(), loadDeskPref(), loadLang()]).finally(() => setThemeReady(true));
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
            <Keyed mode={mode} />
            <HideOnOutput><OfflineBadge /></HideOnOutput>
          </ErrorBoundary>
        </OutingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
