// Avisos al teléfono: registra el "token" de este teléfono para que la base pueda mandar avisos
// (recordatorios de turno y de clase, anuncios del líder, reporte de ausencias).
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === 'web') return; // los avisos en la web se ven en Yo → Avisos
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos de la iglesia',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // se completa al hacer el primer build con EAS
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (token) await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch {
    // En Expo Go o sin señal no hay token: los avisos igual aparecen dentro de la app.
  }
}
