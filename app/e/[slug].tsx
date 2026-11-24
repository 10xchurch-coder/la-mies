// La página pública de un evento: se abre con un enlace, sin la app y sin cuenta.
// Muestra el evento, el programa y los oradores; deja inscribirse y guarda la entrada (con su QR);
// y, si corresponde, el en vivo y las grabaciones.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { PhoneField } from '@/components/PhoneField';
import { publicEvent, publicRegister, type PublicEvent } from '@/lib/eventPlan';
import { fmtMoney, youtubeId } from '@/lib/format';
import { phoneProblem } from '@/lib/phone';
import { errorMessage } from '@/lib/supabase';
import { showCode, ticketPayload } from '@/lib/ticket';
import { tx, txLocale } from '@/lib/i18n';
import { publicPartOn } from '@/lib/funcionesData';
import { FeatureOff } from '@/components/FeatureOff';

// Colores propios y fijos (claros): la página la ve gente de afuera, con o sin modo oscuro.
const C = { bg: '#F6F7F5', card: '#FFFFFF', text: '#17201A', muted: '#5F6B63', line: '#E3E7E2', green: '#1F6B45', greenSoft: '#E3F1E8', violet: '#6D4BC3', violetSoft: '#E9E2F8', amber: '#B26A00', amberSoft: '#FCEFD6', blue: '#2563A8', blueSoft: '#E1ECF8', red: '#B3261E' };
const KEY = (slug: string) => `lamies.evento.${slug}`;
const store = {
  get: (slug: string) => { try { return globalThis.localStorage?.getItem(KEY(slug)) ?? null; } catch { return null; } },
  set: (slug: string, t: string) => { try { globalThis.localStorage?.setItem(KEY(slug), t); } catch { /* sin almacenamiento */ } },
};

export default function EventoPublico() {
  const { slug, t } = useLocalSearchParams<{ slug: string; t?: string }>();
  const router = useRouter();
  const [data, setData] = useState<PublicEvent | null | undefined>(undefined);
  // La iglesia puede apagar los eventos: entonces la página pública avisa en vez de mostrar el evento.
  const [partOff, setPartOff] = useState(false);
  useEffect(() => { if (slug) publicPartOn('evento', slug).then((on) => setPartOff(!on)); }, [slug]);
  const [token, setToken] = useState<string | null>(t ?? null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', people: 1, type: null as string | null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback((tok: string | null) => {
    publicEvent(slug, tok).then((d) => { setData(d); if (d?.ticket) store.set(slug, d.ticket.token); }).catch(() => setData((o) => o ?? null));
  }, [slug]);
  useEffect(() => {
    const tok = t ?? store.get(slug);
    setToken(tok);
    load(tok);
  }, [slug, t, load]);
  // Mientras está abierta se refresca cada minuto: avisos nuevos, lugares que quedan, si ya está pago.
  useEffect(() => { const i = setInterval(() => load(token), 60000); return () => clearInterval(i); }, [load, token]);

  if (data === undefined) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.green} size="large" /></View>;
  if (partOff) return <FeatureOff publicPage name="Eventos" />;
  if (!data) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30, backgroundColor: C.bg }}>
      <Feather name="calendar" size={40} color={C.muted} />
      <Text style={{ fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' }}>{tx('Este evento no está disponible')}</Text>
      <Text style={{ fontSize: 15, color: C.muted, textAlign: 'center' }}>{tx('Puede que el enlace esté mal copiado o que la iglesia lo haya cerrado.')}</Text>
    </View>
  );

  const { church, event: e, types, speakers, sessions, updates, stream, ticket } = data;
  // Solo se abre un enlace de pago que empiece con https:// (la base también lo exige).
  const payUrl = ticket?.pay_url && /^https:\/\/\S+$/i.test(ticket.pay_url) ? ticket.pay_url : null;
  const tz = church.tz;
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(txLocale(), { timeZone: tz, ...o }).format(new Date(iso));
  const dayLong = (iso: string) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hour = (iso: string) => fmt(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = e.ends_at ? dayLong(e.starts_at) === dayLong(e.ends_at) : true;
  const when = e.all_day ? dayLong(e.starts_at) : `${dayLong(e.starts_at)} · ${hour(e.starts_at)} h${e.ends_at && sameDay ? ` a ${hour(e.ends_at)} h` : ''}`;
  const chosen = types.find((x) => x.id === form.type) ?? null;
  const unit = types.length ? Number(chosen?.price ?? 0) : Number(e.price ?? 0);
  const soldOut = types.length ? types.every((x) => x.left === 0) : e.left === 0;

  const submit = async () => {
    setErr(null);
    if (form.name.trim().length < 2) return setErr(tx('Escribí tu nombre y apellido.'));
    const bad = phoneProblem(form.phone, true);
    if (bad) return setErr(bad);
    if (types.length && !form.type) return setErr(tx('Elegí el tipo de entrada.'));
    setBusy(true);
    try {
      const r = await publicRegister(slug, { name: form.name.trim(), phone: form.phone, email: form.email.trim(), people: form.people, type: form.type });
      store.set(slug, r.token);
      setToken(r.token);
      if (Platform.OS === 'web') router.setParams({ t: r.token });
      load(r.token);
    } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };

  const Box = ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
    <View style={{ backgroundColor: tone ?? C.card, borderRadius: 18, padding: 16, gap: 10, borderWidth: tone ? 0 : 1, borderColor: C.line }}>{children}</View>
  );
  const H = ({ icon, children }: { icon: React.ComponentProps<typeof Feather>['name']; children: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Feather name={icon} size={18} color={C.green} />
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '800', color: C.text }}>{children}</Text>
    </View>
  );
  const P = ({ children }: { children: string }) => <Text style={{ fontSize: 15, lineHeight: 22, color: C.text }}>{children}</Text>;
  const Info = ({ icon, label, text }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; text: string | null }) => (text ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Feather name={icon} size={17} color={C.muted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: C.text }}>{text}</Text>
      </View>
    </View>
  ) : null);
  const yt = youtubeId(stream?.url);
  let lastDay = '';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignSelf: 'stretch', backgroundColor: C.green, paddingTop: 34, paddingBottom: 28, paddingHorizontal: 20, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 680, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {church.logo ? <Image source={{ uri: church.logo }} style={{ width: 34, height: 34 }} contentFit="contain" /> : null}
            <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>{church.name}</Text>
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36, fontWeight: '900', color: '#FFFFFF' }}>{e.title}</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF', textTransform: 'capitalize' }}>{when}</Text>
          {e.place ? <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)' }}>📍 {e.place}</Text> : null}
        </View>
      </View>

      <View style={{ width: '100%', maxWidth: 680, padding: 16, gap: 14 }}>
        {updates.length ? (
          <Box tone={C.amberSoft}>
            <H icon="bell">{tx('Avisos')}</H>
            {updates.slice(0, 3).map((u, i) => (
              <View key={i} style={{ gap: 2 }}>
                <Text style={{ fontSize: 15, lineHeight: 21, color: C.text }}>{u.body}</Text>
                <Text style={{ fontSize: 12, color: C.muted }}>{fmt(u.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
              </View>
            ))}
          </Box>
        ) : null}

        {ticket ? (
          <Box>
            <H icon="tag">{tx('Tu entrada')}</H>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ padding: 12, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: C.line }}>
                <QRCode value={ticketPayload(ticket.code)} size={200} backgroundColor="#FFF" color="#000" />
              </View>
              <Text style={{ fontSize: 24, fontWeight: '900', letterSpacing: 3, color: C.text }}>{showCode(ticket.code)}</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{ticket.name}{ticket.people > 1 ? ` (+${ticket.people - 1})` : ''}</Text>
              {ticket.type ? <Text style={{ fontSize: 14, fontWeight: '700', color: C.violet }}>{ticket.type}</Text> : null}
              <Text style={{ fontSize: 14, fontWeight: '800', color: ticket.checked_in ? C.green : C.blue }}>{ticket.checked_in ? tx('Ya entraste') : tx('Mostrá este código en la puerta')}</Text>
            </View>
            {Number(ticket.to_pay) > 0 ? (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: ticket.paid ? C.greenSoft : C.amberSoft, gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{ticket.paid ? tx('Entrada paga ✓') : tx('Falta pagar {fmtMoney}', { fmtMoney: fmtMoney(Math.max(Number(ticket.to_pay) - Number(ticket.paid_amount), 0)) })}</Text>
                {!ticket.paid && e.pay_info ? <Text selectable style={{ fontSize: 14, lineHeight: 20, color: C.text }}>{e.pay_info}</Text> : null}
                {/* Botón "Pagar": abre el enlace de pago que pegó la iglesia (por ejemplo, de Mercado Pago). La app no cobra.
                    El pago lo confirma una persona del equipo con "Marcar que pagó".
                    ACÁ SE ENCHUFA LA CONFIRMACIÓN AUTOMÁTICA más adelante: cuando la iglesia tenga sus credenciales de Mercado Pago,
                    este botón pasa a pedir un cobro propio de esta entrada (con ticket.token como referencia) a una función del servidor,
                    y el aviso de pago (webhook) marca la entrada como paga sola. Ver la nota en supabase/migrations/0076. */}
                {!ticket.paid && payUrl ? (
                  <>
                    <Pressable onPress={() => Linking.openURL(payUrl)} accessibilityRole="link" accessibilityLabel={tx('Pagar la entrada')}
                      style={{ height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, marginTop: 6 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF' }}>{tx('Pagar')}</Text>
                    </Pressable>
                    <Text style={{ fontSize: 13, lineHeight: 18, color: C.text }}>{tx('Se abre la página de pago. Cuando la iglesia vea tu pago, acá va a decir “Entrada paga”. Puede tardar un rato. Guardá el comprobante.')}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
            <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>{tx('Guardá esta página o sacale una captura. Con este mismo enlace volvés a ver tu entrada.')}</Text>
          </Box>
        ) : e.registration ? (
          <Box>
            <H icon="edit-3">{tx('Inscribite')}</H>
            {soldOut ? <P>{tx('Ya no quedan lugares.')}</P> : (
              <>
                {types.length ? (
                  <View style={{ gap: 8 }}>
                    {types.map((x) => {
                      const on = form.type === x.id, out = x.left === 0;
                      return (
                        <Pressable key={x.id} disabled={out} onPress={() => setForm({ ...form, type: x.id })} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: out }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: on ? C.green : C.line, backgroundColor: on ? C.greenSoft : C.card, opacity: out ? 0.5 : 1 }}>
                          <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? C.green : C.muted} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{x.name}</Text>
                            {x.description ? <Text style={{ fontSize: 13, color: C.muted }}>{x.description}</Text> : null}
                            {out ? <Text style={{ fontSize: 12, fontWeight: '700', color: C.red }}>{tx('Agotada')}</Text> : x.left !== null && x.left <= 20 ? <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber }}>{tx('Quedan {left}', { left: x.left })}</Text> : null}
                          </View>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{Number(x.price) > 0 ? fmtMoney(x.price) : tx('Gratis')}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : e.left !== null && e.left <= 20 ? <Text style={{ fontSize: 13, fontWeight: '700', color: C.amber }}>{tx('Quedan {left} lugares', { left: e.left })}</Text> : null}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted }}>{tx('Nombre y apellido')}</Text>
                  <TextInput value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoComplete="name" maxLength={120} accessibilityLabel={tx('Nombre y apellido')}
                    style={{ height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, fontSize: 16, color: C.text, backgroundColor: C.card }} />
                </View>
                <PhoneField label={tx('Celular')} value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} required />
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted }}>{tx('Correo')} <Text style={{ fontWeight: '500' }}>{tx('(opcional)')}</Text></Text>
                  <TextInput value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" maxLength={200} accessibilityLabel={tx('Correo')}
                    style={{ height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, fontSize: 16, color: C.text, backgroundColor: C.card }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text }}>{tx('¿Cuántos van?')}</Text>
                  <Pressable onPress={() => setForm({ ...form, people: Math.max(1, form.people - 1) })} accessibilityRole="button" accessibilityLabel={tx('Uno menos')} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><Feather name="minus" size={20} color={C.text} /></Pressable>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, minWidth: 24, textAlign: 'center' }}>{form.people}</Text>
                  <Pressable onPress={() => setForm({ ...form, people: Math.min(10, form.people + 1) })} accessibilityRole="button" accessibilityLabel={tx('Uno más')} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><Feather name="plus" size={20} color={C.text} /></Pressable>
                </View>
                {unit > 0 ? <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{tx('Total: {fmtMoney}', { fmtMoney: fmtMoney(unit * form.people) })}</Text> : null}
                {err ? <Text accessibilityRole="alert" style={{ fontSize: 14, fontWeight: '700', color: C.red }}>{err}</Text> : null}
                <Pressable onPress={submit} disabled={busy} accessibilityRole="button" style={{ height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, opacity: busy ? 0.6 : 1 }}>
                  {busy ? <ActivityIndicator color="#FFF" /> : <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF' }}>{tx('Inscribirme')}</Text>}
                </Pressable>
                <Text style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{tx('Tu nombre y tu celular los ven solo los organizadores del evento.')}</Text>
              </>
            )}
          </Box>
        ) : null}

        {e.has_stream || e.has_recordings ? (
          <Box>
            <H icon="video">{tx('En vivo y grabaciones')}</H>
            {!stream ? (
              <P>{e.stream_access === 'paid' ? tx('Lo ven quienes tienen su entrada paga, entrando con el enlace de su entrada.') : tx('Lo ven quienes se inscribieron, entrando con el enlace de su entrada.')}</P>
            ) : (
              <>
                {stream.url ? (Platform.OS === 'web' && yt ? (
                  <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
                    {React.createElement('iframe', { src: `https://www.youtube.com/embed/${yt}`, title: tx('Transmisión en vivo'), allow: 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen', allowFullScreen: true, style: { width: '100%', height: '100%', border: 0 } })}
                  </View>
                ) : (
                  <Pressable onPress={() => Linking.openURL(stream.url as string)} accessibilityRole="link" style={{ height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violet }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF' }}>{tx('Ver la transmisión')}</Text>
                  </Pressable>
                )) : null}
                {stream.recordings.map((r, i) => (
                  <Pressable key={i} onPress={() => Linking.openURL(r.url)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.violetSoft }}>
                    <Feather name="play-circle" size={22} color={C.violet} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text }}>{r.title}</Text>
                    <Feather name="external-link" size={16} color={C.violet} />
                  </Pressable>
                ))}
              </>
            )}
          </Box>
        ) : null}

        {e.description || e.cost || e.bring || e.transport ? (
          <Box>
            <H icon="info">{tx('Sobre el evento')}</H>
            {e.description ? <P>{e.description}</P> : null}
            <Info icon="dollar-sign" label={tx('Costo')} text={e.cost} />
            <Info icon="briefcase" label={tx('Qué llevar')} text={e.bring} />
            <Info icon="truck" label={tx('Cómo llegar')} text={e.transport} />
          </Box>
        ) : null}

        {sessions.length ? (
          <Box>
            <H icon="clock">{tx('Programa')}</H>
            {sessions.map((x) => {
              const d = dayLong(x.starts_at);
              const head = d !== lastDay && (lastDay !== '' || !sameDay || sessions.some((y) => dayLong(y.starts_at) !== d));
              lastDay = d;
              const who = speakers.find((p) => p.id === x.speaker_id);
              return (
                <View key={x.id} style={{ gap: 8 }}>
                  {head ? <Text style={{ fontSize: 13, fontWeight: '800', color: C.blue, textTransform: 'capitalize', marginTop: 4 }}>{d}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ width: 54 }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: C.blue }}>{hour(x.starts_at)}</Text>
                      {x.ends_at ? <Text style={{ fontSize: 12, color: C.muted }}>a {hour(x.ends_at)}</Text> : null}
                    </View>
                    <View style={{ flex: 1, gap: 2, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{x.title}</Text>
                      {who ? <Text style={{ fontSize: 13, fontWeight: '700', color: C.violet }}>{who.name}</Text> : null}
                      {x.place ? <Text style={{ fontSize: 13, color: C.muted }}>{x.place}</Text> : null}
                      {x.description ? <Text style={{ fontSize: 13, lineHeight: 19, color: C.text }}>{x.description}</Text> : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </Box>
        ) : e.program ? <Box><H icon="clock">{tx('Programa')}</H><P>{e.program}</P></Box> : null}

        {speakers.length ? (
          <Box>
            <H icon="mic">{tx('Oradores')}</H>
            {speakers.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetSoft }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: C.violet }}>{p.name.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{p.name}</Text>
                  {p.role ? <Text style={{ fontSize: 13, fontWeight: '700', color: C.violet }}>{p.role}</Text> : null}
                  {p.bio ? <Text style={{ fontSize: 14, lineHeight: 20, color: C.text }}>{p.bio}</Text> : null}
                </View>
              </View>
            ))}
          </Box>
        ) : null}

        {e.faq ? <Box><H icon="help-circle">{tx('Preguntas frecuentes')}</H><P>{e.faq}</P></Box> : null}

        {e.contact_name || e.contact_phone ? (
          <Box>
            <H icon="phone">{tx('¿Dudas?')}</H>
            <P>{[e.contact_name, e.contact_phone].filter(Boolean).join(' · ')}</P>
            {e.contact_phone ? (
              <Pressable onPress={() => Linking.openURL(`https://wa.me/${e.contact_phone?.replace(/\D/g, '')}`)} accessibilityRole="link" style={{ height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.greenSoft }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.green }}>{tx('Escribir por WhatsApp')}</Text>
              </Pressable>
            ) : null}
          </Box>
        ) : null}

        <Text style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 6 }}>{tx('{name} · hecho con La Mies', { name: church.name })}</Text>
      </View>
    </ScrollView>
  );
}
