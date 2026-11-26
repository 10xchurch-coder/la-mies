// Un versículo compartido desde La Mies. La Mies es un sistema cerrado: cada iglesia tiene sus cuentas.
//  · Si ya entraste con tu cuenta: te lleva directo a ese versículo.
//  · Si no: una página corta que lo explica, con un botón para abrirlo en la app (si la tenés) y otro para entrar.
// Dirección: /verso?libro=42&cap=3&ver=16&v=rvg
import React, { useEffect } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui';
import { bookName, cleanPlace, versionOf } from '@/lib/bible';
import { STORE_LINKS } from '@/lib/alta';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Verso() {
  const p = useLocalSearchParams<{ libro?: string; cap?: string; ver?: string; v?: string }>();
  const { loading, session, profile } = useAuth();
  const router = useRouter();
  const place = cleanPlace(Number(p.libro), Number(p.cap));
  const verse = Number(p.ver) >= 1 ? Number(p.ver) : undefined;
  const version = versionOf(p.v ?? '');
  const member = !!session && !!profile?.church_id;

  useEffect(() => {
    if (loading || !member || !place) return;
    router.replace({ pathname: '/biblia/leer', params: { libro: String(place.book), cap: String(place.chapter), ...(verse ? { ver: String(verse) } : {}), ...(p.v ? { v: p.v } : {}) } } as never);
  }, [loading, member, place, verse, p.v, router]);

  if (loading || member) return <View style={styles.page} />;

  const ref = place ? `${bookName(place.book)} ${place.chapter}${verse ? `:${verse}` : ''}${p.v ? ` · ${version.short}` : ''}` : '';
  const appLink = place ? `lamies://biblia/leer?libro=${place.book}&cap=${place.chapter}${verse ? `&ver=${verse}` : ''}${p.v ? `&v=${p.v}` : ''}` : 'lamies://';
  const store = Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;

  return (
    <View style={styles.page}>
      <View style={styles.box}>
        <View style={styles.badge}><Feather name="book-open" size={26} color="#FFF" /></View>
        <Text style={styles.title}>{tx('Te compartieron un versículo')}</Text>
        {ref ? <Text style={styles.ref}>{ref}</Text> : null}
        <Text style={styles.text}>{tx('Esto es de La Mies, la app de una iglesia. Para seguir leyendo la Biblia ahí hace falta tener tu cuenta con tu iglesia.')}</Text>
        <Button title={tx('Abrir en la app de La Mies')} icon="smartphone" onPress={() => { Linking.openURL(appLink).catch(() => undefined); }} />
        <Button title={tx('Ya tengo cuenta: entrar')} icon="log-in" variant="outline" onPress={() => router.replace('/login')} />
        {store ? <Button title={tx('Descargar la app')} icon="download" variant="ghost" onPress={() => { Linking.openURL(store).catch(() => undefined); }} /> : null}
        <Text style={styles.small}>{tx('¿Todavía no tenés cuenta? Pedile a tu pastor o a tu iglesia que te dé acceso a La Mies.')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 420, gap: 14, alignItems: 'stretch' },
  badge: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#1F3A5F', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  ref: { fontSize: 18, fontWeight: '800', color: colors.blueText, textAlign: 'center' },
  text: { fontSize: 16, lineHeight: 23, color: colors.muted, textAlign: 'center' },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center', marginTop: 4 },
});
