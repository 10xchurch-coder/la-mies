import { Platform, useWindowDimensions } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { Loading } from '@/components/ui';
import { deskPrefOff } from '@/components/desk/DeskShell';
import { canUseDesk } from '@/lib/desk';

export default function Index() {
  const { loading, session, profile, perms } = useAuth();
  const { width } = useWindowDimensions();
  const outing = useOuting();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!profile?.church_id) return <Redirect href="/registro" />;
  // En la computadora, pastores, secretaría y administración abren en el escritorio (salvo que hayan elegido la vista de teléfono).
  if (Platform.OS === 'web' && width >= 1000 && !outing.active && canUseDesk(perms) && !deskPrefOff()) return <Redirect href={'/escritorio' as Href} />;
  // La app abre en Iglesia; si quedó una salida en curso, en el mapa para seguirla.
  return <Redirect href={outing.active ? '/(tabs)/mapa' : '/(tabs)/iglesia'} />;
}
