// Antes mostraba un aviso violeta en el inicio; el pastor pidió sacarlo (queda el aviso del sistema en Android).
// Sigue manteniendo al día este teléfono: manda la posición con la app abierta y se apaga si se apagó en la base.
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useSegments, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { featureOn } from '@/lib/features';
import { isPaused } from '@/lib/famLoc';
import { refreshFamLoc, sharingNow, useFamLoc, watchWhileOpen } from '@/lib/famLocTask';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { fmtTime } from '@/lib/format';
import { tx } from '@/lib/i18n';

export function SharingBanner() {
  const { profile, church } = useAuth();
  const outing = useOuting();
  const segments = useSegments();
  const router = useRouter();
  const { me, mode } = useFamLoc();
  const on = featureOn(church?.disabled_features, 'ubicacion_familia');
  const userId = profile?.id;

  useEffect(() => { if (userId && on) refreshFamLoc().catch(() => undefined); }, [userId, on]);
  useRefreshOnResume(() => { if (userId && on) refreshFamLoc().catch(() => undefined); });

  // Con la app abierta se manda la posición desde acá (en las versiones sin segundo plano es la única manera).
  const sending = on && mode !== 'no' && sharingNow(me);
  useEffect(() => {
    if (!sending) return;
    let off: (() => void) | null = null;
    let alive = true;
    watchWhileOpen().then((stop) => { if (alive) off = stop; else stop(); });
    return () => { alive = false; off?.(); };
  }, [sending]);

  return null;
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 10, height: 40, borderRadius: 999, backgroundColor: '#6D4BC3',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 8 },
  text: { color: '#FFF', fontSize: 13, fontWeight: '800' },
});
