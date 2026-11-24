// La puerta de la demostración: se abre desde la página de La Mies o desde un enlace de WhatsApp.
// Entra sola a la iglesia de ejemplo (sin escribir nada) y lleva al inicio de la app.
//   /demo               → se ve como el pastor
//   /demo?ver=miembro   → se ve como un hermano de la iglesia
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui';
import { DEMO_CONTACT_URL, demoViewFromParam, demoViewOfSession, enterDemo, isDemoSession } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function Demo() {
  const { ver } = useLocalSearchParams<{ ver?: string }>();
  const view = demoViewFromParam(ver);
  const { loading, session, church } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'entering' | 'error' | 'off' | 'own-account'>('idle');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  const enter = useCallback(async () => {
    setState('entering');
    const r = await enterDemo(view);
    if (r.ok) return; // al cambiar la sesión, el efecto de abajo lleva al inicio
    setMessage(r.message);
    setState(r.off ? 'off' : 'error');
  }, [view]);

  useEffect(() => {
    if (loading) return;
    // Ya está adentro de la demostración con la vista pedida: al inicio.
    if (isDemoSession(session) && demoViewOfSession(session) === view) {
      if (church) router.replace('/');
      return;
    }
    if (started.current) return;
    // Alguien con su cuenta de verdad abierta en este navegador: se le pregunta antes de cerrarla.
    if (session && !isDemoSession(session)) { setState('own-account'); return; }
    started.current = true;
    enter();
  }, [loading, session, church, view, enter, router]);

  const leaveOwnAndEnter = async () => {
    started.current = true;
    setState('entering');
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    enter();
  };

  return (
    <View style={styles.page}>
      <View style={styles.box}>
        <View style={styles.badge}><Feather name="eye" size={26} color="#FFF" /></View>
        <Text style={styles.title}>La Mies · iglesia de ejemplo</Text>
        {state === 'own-account' ? (
          <>
            <Text style={styles.text}>En este navegador ya entraste con tu cuenta. Para mirar la iglesia de ejemplo hay que salir de tu cuenta acá (después volvés a entrar con tu correo).</Text>
            <Button title="Ver la iglesia de ejemplo" icon="eye" onPress={leaveOwnAndEnter} />
            <Button title="Volver a mi iglesia" variant="outline" onPress={() => router.replace('/')} />
          </>
        ) : state === 'error' || state === 'off' ? (
          <>
            <Text style={styles.text}>{message}</Text>
            {state === 'error' ? <Button title="Probar de nuevo" icon="refresh-cw" onPress={() => { started.current = true; enter(); }} /> : null}
            <Button title="Quiero La Mies para mi iglesia" variant="outline" icon="mail" onPress={() => Linking.openURL(DEMO_CONTACT_URL).catch(() => undefined)} />
          </>
        ) : (
          <>
            <Text style={styles.text}>Estamos abriendo una iglesia inventada para que mires todo. Nada de lo que toques se guarda.</Text>
            <ActivityIndicator size="large" color={colors.green} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 420, gap: 16, alignItems: 'stretch' },
  badge: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#1F3A5F', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  text: { fontSize: 16, lineHeight: 23, color: colors.muted, textAlign: 'center' },
});
