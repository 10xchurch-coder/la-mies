// Entrada a "ver como miembro": prende la vista de miembro y lleva al inicio. Solo para quien da roles (pastor y administrador de la app).
import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Loading } from '@/components/ui';
import { useAuth } from '@/store/auth';

export default function MiembroVista() {
  const router = useRouter();
  const { realPerms, setViewAsMember, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (realPerms.includes('admin.permisos')) setViewAsMember(true);
    router.replace('/');
  }, [loading, realPerms, setViewAsMember, router]);
  return <Loading />;
}
