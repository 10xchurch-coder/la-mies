// La Mies Central: el panel del equipo de La Mies (la iglesia que hospeda la app) para ver todas las iglesias de la red.
// Solo entran el dueño de la red y las personas de su iglesia a las que él les dio acceso. Para todos los demás
// esta parte de la app no existe: los manda al menú de siempre. Igual, cada dato lo vuelve a decidir la base.
import React from 'react';
import { Redirect, Slot } from 'expo-router';
import { DeskShell } from '@/components/desk/DeskShell';
import { Loading } from '@/components/ui';
import { useCentralRole } from '@/lib/centralData';
import { useAuth } from '@/store/auth';

export default function CentralLayout() {
  const { loading, session, profile } = useAuth();
  const role = useCentralRole();
  if (loading || (session && !profile)) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (role === undefined) return <Loading />;
  if (!role) return <Redirect href="/(tabs)/iglesia" />;
  return (
    <DeskShell>
      <Slot />
    </DeskShell>
  );
}
