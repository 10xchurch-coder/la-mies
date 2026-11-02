import { Redirect } from 'expo-router';
import { useAuth } from '@/store/auth';
import { Loading } from '@/components/ui';

export default function Index() {
  const { loading, session, profile } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!profile?.church_id) return <Redirect href="/registro" />;
  return <Redirect href="/(tabs)/mapa" />;
}
