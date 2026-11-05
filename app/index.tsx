import { Redirect } from 'expo-router';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { Loading } from '@/components/ui';

export default function Index() {
  const { loading, session, profile } = useAuth();
  const outing = useOuting();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!profile?.church_id) return <Redirect href="/registro" />;
  // La app abre en Iglesia; si quedó una salida en curso, en el mapa para seguirla.
  return <Redirect href={outing.active ? '/(tabs)/mapa' : '/(tabs)/iglesia'} />;
}
