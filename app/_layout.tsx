import '@/lib/webAlert'; // en la web, los avisos y confirmaciones se muestran como ventanas
import '@/lib/locationTask'; // registra la tarea de GPS en segundo plano
import React, { useEffect } from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/store/auth';
import { OutingProvider } from '@/store/outing';
import { LockGate } from '@/components/LockGate';
import { Loading } from '@/components/ui';

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

function Gate() {
  const { loading, session, profile } = useAuth();
  useNotificationLinks();
  if (loading) return <Loading />;
  const lock = Platform.OS !== 'web' && !!session && (profile?.biometric_lock ?? true);
  return (
    <LockGate enabled={lock}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} />
    </LockGate>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <OutingProvider>
          <StatusBar style="dark" />
          <Gate />
        </OutingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
