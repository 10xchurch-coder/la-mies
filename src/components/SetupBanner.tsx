// Aviso para el pastor de una iglesia nueva: le faltan los primeros pasos. Si no hace falta, no muestra nada.
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import { progress, type Progress } from '@/lib/alta';
import { altaState } from '@/lib/altaData';
import { useChurchExtras } from '@/lib/useChurchExtras';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export function SetupBanner() {
  const router = useRouter();
  const { can } = useAuth();
  const extras = useChurchExtras();
  const show = extras.setup_pending && can('admin.iglesia');
  // Cuántos pasos lleva hechos (se vuelve a leer cuando cambia algo de los primeros pasos).
  const [prog, setProg] = useState<Progress | null>(null);
  useEffect(() => {
    if (!show) return;
    let live = true;
    altaState().then((s) => { if (live) setProg(progress(s.steps, s.facts)); }).catch(() => undefined);
    return () => { live = false; };
  }, [show, extras]);
  if (!show) return null;
  return (
    <Pressable onPress={() => router.push('/admin/alta' as Href)} accessibilityRole="button" accessibilityLabel={tx('Seguir con los primeros pasos de la iglesia')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft }}>
        <Feather name="flag" size={22} color={colors.pinkText} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.pinkText }}>{tx('TU IGLESIA ES NUEVA EN LA APP')}</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{prog ? (prog.finished ? tx('Primeros pasos: ¡todo listo!') : tx('Primeros pasos: vas {label}', { label: prog.label })) : tx('Hacé los primeros pasos')}</Text>
          {prog ? (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden', marginVertical: 4 }}>
              <View style={{ height: 6, width: `${Math.round((prog.resolved / prog.total) * 100)}%`, backgroundColor: colors.pink }} />
            </View>
          ) : null}
          <Text style={{ fontSize: 13, color: colors.muted }}>{prog?.finished ? tx('Tocá acá para terminar y sacar este aviso.') : tx('Son pasos cortos. Tocá acá para seguir.')}</Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.pinkText} />
      </Card>
    </Pressable>
  );
}
