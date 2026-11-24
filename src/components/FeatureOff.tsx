// "Tu iglesia no usa esta parte": lo que se ve al abrir (por un enlace, un aviso viejo o un favorito) una pantalla
// de una función que la iglesia apagó. No es un error: se explica y se ofrece volver.
import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors } from '@/theme';

export function FeatureOff({ name, canManage, onHome, onManage, publicPage }: {
  /** El nombre de la función apagada, si se sabe ("Ofrendas por persona"). */
  name?: string | null;
  /** Es el pastor o el administrador: se le ofrece ir a prenderla. */
  canManage?: boolean;
  onHome?: () => void;
  onManage?: () => void;
  /** Página pública (sin cuenta): se habla de "esta iglesia" y no hay botones de la app. */
  publicPage?: boolean;
}) {
  return (
    <View accessibilityRole="alert" testID="funcion-apagada" style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <View style={{ width: '100%', maxWidth: 420, alignItems: 'center', gap: 14 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="toggle-left" size={32} color={colors.muted} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
          {publicPage ? 'Esta iglesia no usa esta parte' : 'Tu iglesia no usa esta parte'}
        </Text>
        <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 }}>
          {name ? `“${name}” está apagado. ` : ''}
          {publicPage
            ? 'Si tenés una duda, hablá con alguien de la iglesia.'
            : canManage
              ? 'No se borró nada. Si la querés usar, la prendés en Funciones de la iglesia y todo vuelve como estaba.'
              : 'No se borró nada. Si te parece que hace falta, hablá con tu pastor.'}
        </Text>
        {onHome ? <Button title="Volver al inicio" icon="home" onPress={onHome} style={{ alignSelf: 'stretch' }} /> : null}
        {canManage && onManage ? <Button title="Abrir Funciones de la iglesia" icon="toggle-right" variant="outline" onPress={onManage} style={{ alignSelf: 'stretch' }} /> : null}
      </View>
    </View>
  );
}
