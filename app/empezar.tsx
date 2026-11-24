// Empezar: una iglesia nueva se anota sola. Un solo formulario: crea la cuenta del pastor y la iglesia, y lo lleva a los primeros pasos.
// Se abre sin haber entrado. La base decide todo (0084): una iglesia por cuenta, correo confirmado, y un máximo por día.
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Field, Loading } from '@/components/ui';
import { PasswordField } from '@/components/PasswordField';
import { logHelp } from '@/lib/centralData';
import { COUNTRIES, draftFromMeta, helpLinks, signupProblems, SIZES, timezoneForCountry, type SignupDraft, type SignupForm } from '@/lib/alta';
import { selfServeCreate } from '@/lib/altaData';
import { checkPassword, leakedCount, LEAKED_MSG } from '@/lib/password';
import { formatPhone } from '@/lib/phone';
import { WEB_URL } from '@/lib/share';
import { supabase, errorMessage } from '@/lib/supabase';
import { refreshChurchExtras } from '@/lib/useChurchExtras';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import { tx } from '@/lib/i18n';
import { useLang } from '@/lib/i18nStore';
import { LangSwitch } from '@/components/LangChoice';

const EMPTY: SignupForm = { church: '', city: '', province: '', country: 'AR', pastor: '', email: '', whatsapp: '', size: '' };
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, get label() { return c.label; } }));

export default function Empezar() {
  useLang(); // al cambiar de idioma esta pantalla se redibuja sola, sin perder lo escrito
  const router = useRouter();
  const { loading, session, profile, church, refreshProfile } = useAuth();
  const [f, setF] = useState<SignupForm>(EMPTY);
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof SignupForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const cleanDraft = (d: SignupDraft): SignupDraft => ({
    church: d.church.trim(), city: d.city.trim(), province: d.province.trim(), country: d.country, pastor: d.pastor.trim(),
    whatsapp: d.country === 'AR' ? formatPhone(d.whatsapp) : d.whatsapp.trim(), size: d.size,
  });

  const create = async (d: SignupDraft) => {
    await selfServeCreate(cleanDraft(d), timezoneForCountry(d.country));
    await refreshProfile();
    // Si la app todavía estaba leyendo el perfil de antes (sin iglesia), esa lectura vieja puede llegar última: se lee una vez más.
    await new Promise((r) => setTimeout(r, 400));
    await refreshProfile();
    refreshChurchExtras();
    router.replace('/admin/alta' as Href);
  };

  // Vuelve después de confirmar el correo: los datos quedaron guardados con la cuenta, así que la iglesia se crea sola.
  const saved = draftFromMeta(session?.user?.user_metadata);
  const hasChurch = !!profile?.church_id;
  const [auto, setAuto] = useState(false);
  const once = useRef(false);
  useEffect(() => {
    if (loading || !session || hasChurch || !saved || once.current) return;
    once.current = true;
    setAuto(true);
    setF({ ...saved, email: session.user.email ?? '' });
    create(saved).catch((e) => { setMsg(errorMessage(e)); setAuto(false); });
  }, [loading, session, hasChurch, saved]);

  const problems = signupProblems(session ? { ...f, email: session.user.email ?? 'a@b.co' } : f);
  const show = (k: keyof SignupForm) => (tried && problems[k] ? problems[k] : null);

  const submit = async () => {
    setTried(true);
    setMsg(null);
    if (Object.keys(problems).length) { setMsg(tx('Revisá lo que está marcado en rojo.')); return; }
    setBusy(true);
    try {
      if (session) { await create(f); return; }
      const check = checkPassword(password, [f.pastor, f.email.split('@')[0] ?? '']);
      if (!check.ok) throw new Error(check.problems[0]);
      if (await leakedCount(password)) throw new Error(tx(LEAKED_MSG));
      const email = f.email.trim().toLowerCase();
      const draft = cleanDraft(f);
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: draft.pastor, phone: draft.whatsapp, alta: draft }, emailRedirectTo: `${WEB_URL}/empezar` },
      });
      if (error) throw error;
      // Si el correo ya tenía cuenta, Supabase no avisa: devuelve un usuario sin identidades y no manda nada.
      if (!data.session && data.user && (data.user.identities?.length ?? 0) === 0) {
        setMsg(tx('Ya hay una cuenta con ese correo. Si es tuya, tocá "Ya tengo cuenta" acá abajo. Para anotar una iglesia nueva hace falta un correo que no tenga cuenta.'));
        return;
      }
      if (!data.session) {
        // Falta confirmar el correo: se le avisa, y cuando entre la iglesia se crea sola con lo que ya escribió.
        router.replace(`/registro-enviado?email=${encodeURIComponent(email)}` as Href);
        return;
      }
      // Ya entró (el correo no necesita confirmación): la iglesia la crea el aviso de arriba, que corre con la sesión nueva.
      setAuto(true);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading || auto) return <Loading />;

  const help = helpLinks({ church: f.church.trim() || null, step: tx('Anotar mi iglesia') });

  if (session && hasChurch) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Empezar con La Mies')} />
        <Screen>
          <Card style={{ gap: 10 }}>
            <Text style={styles.h2}>{tx('Tu cuenta ya es de {name}', { name: church?.name ?? tx('una iglesia') })}</Text>
            <Text style={styles.p}>{tx('Cada cuenta es de una sola iglesia. Para anotar otra iglesia hace falta una cuenta nueva, con otro correo.')}</Text>
            <Button title={tx('Ir a mi iglesia')} onPress={() => router.replace('/')} />
          </Card>
        </Screen>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={{ paddingTop: 36, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View style={styles.logo}><Feather name="feather" size={30} color="#FFFFFF" /></View>
          <Text style={styles.title}>{tx('Sumá tu iglesia a La Mies')}</Text>
          <Text style={[styles.p, { textAlign: 'center' }]}>
            {tx('Llenás esta hoja una sola vez. Después la app te lleva de la mano, paso a paso, hasta dejarla lista para tu iglesia.')}
          </Text>
        </View>
        {!session ? <LangSwitch /> : null}

        <Card style={{ gap: 12 }}>
          <Text style={styles.h2}>{tx('1. Tu iglesia')}</Text>
          <Field label={tx('Nombre de la iglesia')} value={f.church} onChangeText={set('church')} autoCapitalize="words" placeholder={tx('Iglesia Bautista Esperanza')} maxLength={120} />
          {show('church') ? <Text style={styles.bad}>{show('church')}</Text> : null}
          <Field label={tx('Ciudad')} value={f.city} onChangeText={set('city')} autoCapitalize="words" maxLength={80} />
          {show('city') ? <Text style={styles.bad}>{show('city')}</Text> : null}
          <Field label={tx('Provincia')} hint={tx('(o departamento, o estado)')} value={f.province} onChangeText={set('province')} autoCapitalize="words" maxLength={80} />
          <Text style={styles.label}>{tx('País')}</Text>
          <Choice options={COUNTRY_OPTIONS} value={f.country} onChange={set('country')} columns={3} />
          <Text style={styles.label}>{tx('¿Cuántos se reúnen, más o menos?')}</Text>
          <Choice options={SIZES} value={f.size || null} onChange={set('size')} />
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={styles.h2}>{tx('2. Vos, el pastor')}</Text>
          <Field label={tx('Tu nombre y apellido')} value={f.pastor} onChangeText={set('pastor')} autoCapitalize="words" autoComplete="name" maxLength={80} />
          {show('pastor') ? <Text style={styles.bad}>{show('pastor')}</Text> : null}
          <Field label={tx('Tu WhatsApp')} hint={tx('(con el código de área; es para que el equipo te pueda ayudar)')} value={f.whatsapp} onChangeText={set('whatsapp')} keyboardType="phone-pad" autoComplete="tel" placeholder={f.country === 'AR' ? '376 400-0000' : '+595 981 000000'} maxLength={40} />
          {show('whatsapp') ? <Text style={styles.bad}>{show('whatsapp')}</Text> : null}
          {!session ? (
            <>
              <Field label={tx('Tu correo')} hint={tx('(con este correo vas a entrar a la app)')} value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
              {show('email') ? <Text style={styles.bad}>{show('email')}</Text> : null}
              <PasswordField label={tx('Elegí una contraseña')} value={password} onChangeText={setPassword} personal={[f.pastor, f.email.split('@')[0] ?? '']} />
            </>
          ) : (
            <Text style={styles.p}>{tx('Vas a seguir con la cuenta de {email}.', { email: session.user.email })}</Text>
          )}
        </Card>

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        <Button title={tx('Crear mi iglesia en La Mies')} icon="check-circle" onPress={submit} loading={busy} disabled={!session && !password} />

        <Card style={{ gap: 6 }}>
          <Text style={styles.h3}>{tx('¿Qué pasa después?')}</Text>
          <Text style={styles.p}>{tx('1. Te mandamos un correo para confirmar que es tuyo.')}</Text>
          <Text style={styles.p}>{tx('2. Entrás, y la app te muestra 8 pasos cortos: reuniones, tu gente, tus líderes y el código para los hermanos.')}</Text>
          <Text style={styles.p}>{tx('3. Si tenés una lista de miembros en una planilla, la subís vos o nos la mandás y la cargamos nosotros. Si no tenés lista, no pasa nada.')}</Text>
          <Text style={styles.small}>{tx('Los datos de tu iglesia los ve solo tu iglesia. El equipo de La Mies ve tu nombre, tu correo y tu WhatsApp para poder ayudarte.')}</Text>
        </Card>

        <View style={{ alignItems: 'center', gap: 4 }}>
          {!session ? (
            <Pressable onPress={() => router.replace('/login')} accessibilityRole="button" style={styles.link}>
              <Text style={styles.linkText}>{tx('Ya tengo cuenta: entrar')}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => { logHelp({ step: tx('Anotar mi iglesia'), screen: '/empezar', church: f.church.trim() || null }); Linking.openURL(help.whatsapp ?? help.mailto).catch(() => undefined); }} accessibilityRole="button" style={styles.link}>
            <Text style={styles.linkText}>{tx('Necesito ayuda')}</Text>
          </Pressable>
          <Text style={styles.small}>{help.email}</Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  logo: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center' },
  h2: { fontSize: 17, fontWeight: '800', color: colors.text },
  h3: { fontSize: 15, fontWeight: '800', color: colors.text },
  p: { fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontSize: 12, color: colors.muted, lineHeight: 17, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: colors.label },
  bad: { fontSize: 12, color: colors.red, marginTop: -6 },
  msg: { color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 },
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  linkText: { color: colors.green, fontWeight: '700', fontSize: 14 },
}));
