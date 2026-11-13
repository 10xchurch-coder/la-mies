// Escritorio: la versión para computadora de pastores, secretaría y administración.
// Solo entra quien tiene permisos de liderazgo; el resto vuelve a la app de siempre.
import React from 'react';
import { Redirect, Slot } from 'expo-router';
import { DeskShell } from '@/components/desk/DeskShell';
import { Loading } from '@/components/ui';
import { canUseDesk } from '@/lib/desk';
import { useAuth } from '@/store/auth';

export default function DeskLayout() {
  const { loading, session, profile, perms } = useAuth();
  if (loading || (session && !profile)) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!canUseDesk(perms)) return <Redirect href="/(tabs)/iglesia" />;
  return (
    <DeskShell>
      <Slot />
    </DeskShell>
  );
}
