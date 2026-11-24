// Entrada con chip: un teléfono o una tablet queda en la entrada y cada hermano apoya su chip o su tarjeta.
// Queda presente en la reunión elegida. La asistencia se guarda igual que en la pantalla de Asistencia (misma función en la base):
// valen los mismos permisos y, si la reunión está marcada como "no hubo", no deja marcar.
// Si un chip falla, o el teléfono no lee chips, se puede leer el QR de la tarjeta o buscar el nombre.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { DateChips } from '@/components/Picker';
import { Button, Card, Empty, Field, Loading, SectionTitle } from '@/components/ui';
import { TicketScanner, scannerAvailable } from '@/components/TicketScanner';
import { listCancellations, listServices, searchPeople, setAttendance } from '@/lib/api';
import { chipAttendance } from '@/lib/chips';
import { cancelChip, nfcBuilt, nfcState, readChip } from '@/lib/nfc';
import { parsePerson } from '@/lib/tags';
import { fmtDateShort, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import type { ChurchService } from '@/types';

type Flash = { tone: 'green' | 'amber' | 'red'; title: string; text?: string; name?: string; photo?: string | null } | null;
type Found = { id: string; name: string; photo_path: string | null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AsistenciaChip() {
  const { servicio, fecha } = useLocalSearchParams<{ servicio?: string; fecha?: string }>();
  const router = useRouter();
  const [services, setServices] = useState<ChurchService[] | null>(null);
  const [service, setService] = useState<ChurchService | null>(null);
  const date = fecha ?? isoDate(new Date());
  const [off, setOff] = useState(false);                 // la reunión está marcada como "no hubo"
  const [nfc, setNfc] = useState<'ok' | 'off' | 'none'>('none');
  const [reading, setReading] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [scan, setScan] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const running = useRef(false);
  const last = useRef<{ token: string; at: number } | null>(null);
  const svc = useRef<ChurchService | null>(null);
  svc.current = service;

  useEffect(() => {
    nfcState().then(setNfc);
    listServices().then((s) => {
      setServices(s);
      const today = new Date(`${date}T12:00:00`).getDay();
      setService(s.find((x) => x.id === servicio) ?? s.find((x) => x.dow === today && x.main) ?? s.find((x) => x.dow === today) ?? s[0] ?? null);
    }).catch(() => setServices([]));
  }, [servicio, date]);
  useEffect(() => {
    if (!service) return;
    listCancellations(date, date).then((c) => setOff(c.some((x) => x.service_id === service.id && x.on_date === date))).catch(() => setOff(false));
  }, [service, date]);

  const welcome = (r: { name: string; photo_path: string | null; already: boolean }) => {
    setFlash(r.already
      ? { tone: 'amber', title: `${r.name}, ya estabas anotado`, text: 'Tu asistencia ya estaba guardada. ¡Pasá!', name: r.name, photo: r.photo_path }
      : { tone: 'green', title: `¡Bienvenido, ${r.name}!`, text: 'Quedaste presente.', name: r.name, photo: r.photo_path });
    if (!r.already) { setCount((n) => n + 1); setRecent((l) => [r.name, ...l.filter((x) => x !== r.name)].slice(0, 8)); }
  };

  /** Llega el texto de un chip o de un QR: si es la tarjeta de una persona, queda presente. */
  const onText = useCallback(async (text: string | null, from: 'chip' | 'qr') => {
    const s = svc.current;
    if (!s) return;
    const token = parsePerson(text);
    if (!token) {
      setFlash({ tone: 'red', title: from === 'chip' ? (text ? 'Ese chip no es una tarjeta de persona' : 'El chip está vacío') : 'Ese QR no es una tarjeta de persona', text: 'Pedí ayuda en la entrada o buscá tu nombre abajo.' });
      return;
    }
    // El mismo chip dos veces seguidas (lo dejó apoyado): no se pregunta de nuevo.
    if (last.current && last.current.token === token && Date.now() - last.current.at < 4000) return;
    last.current = { token, at: Date.now() };
    try { welcome(await chipAttendance(token, date, s.id)); }
    catch (e) { setFlash({ tone: 'red', title: 'No se pudo anotar', text: errorMessage(e) }); }
  }, [date]);

  /** Lee chips sin parar, uno atrás del otro, hasta que se toca "Dejar de leer" o se sale de la pantalla. */
  const start = useCallback(async () => {
    if (running.current || !nfcBuilt) return;
    running.current = true; setReading(true);
    let fails = 0;
    while (running.current) {
      try {
        const text = await readChip('Apoyá tu chip o tu tarjeta');
        if (!running.current) break;
        fails = 0;
        await onText(text, 'chip');
      } catch (e) {
        if (!running.current || (e as Error).message === 'cancelado') break;      // en iPhone, cerrar el cartel del lector frena la lectura
        fails += 1;
        setFlash({ tone: 'red', title: 'No se pudo leer el chip', text: 'Apoyalo otra vez y no lo muevas. Si no anda, buscá tu nombre abajo.' });
        if (fails >= 3) break;                                                    // algo anda mal con el lector: no insistir sin parar
      }
      await sleep(1300);                                                          // deja ver el cartel antes del próximo chip
    }
    running.current = false; setReading(false);
  }, [onText]);
  const stop = useCallback(() => { running.current = false; cancelChip(); setReading(false); }, []);
  useEffect(() => stop, [stop]);                                                  // al salir de la pantalla se suelta el lector

  // Buscar por nombre (para el que se olvidó el chip o cuando el chip falla).
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => searchPeople(q.trim()).then((r) => setFound(r.slice(0, 6))).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const byName = async (p: Found) => {
    if (!service) return;
    try {
      await setAttendance(p.id, date, service.id, true);
      setQ(''); setFound([]);
      welcome({ name: p.name, photo_path: p.photo_path, already: false });
    } catch (e) { setFlash({ tone: 'red', title: 'No se pudo anotar', text: errorMessage(e) }); }
  };

  // El cartel se borra solo, así el próximo ve la pantalla lista.
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 6000); return () => clearTimeout(t); }, [flash]);

  if (services === null) return <Loading />;
  const bg = flash?.tone === 'green' ? colors.greenSoft : flash?.tone === 'amber' ? colors.amberSoft : '#FEE2E2';
  const fg = flash?.tone === 'green' ? colors.greenText : flash?.tone === 'amber' ? colors.amberText : colors.red;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Entrada con chip" subtitle={service ? `${service.name} · ${date === isoDate(new Date()) ? 'Hoy' : fmtDateShort(date)}` : undefined} back />
      <Screen>
        {!services.length || !service ? <Empty icon="calendar" title="No hay reuniones cargadas" text="Primero cargá las reuniones de la iglesia." /> : off ? (
          <Card style={{ gap: 8, alignItems: 'center', padding: 20, backgroundColor: colors.amberSoft, borderColor: colors.amber }}>
            <Feather name="slash" size={28} color={colors.amberText} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Esta reunión está marcada como “no hubo”</Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>No se puede tomar asistencia. Si sí hubo reunión, cambialo en la pantalla de Asistencia.</Text>
          </Card>
        ) : (
          <>
            {services.length > 1 && !reading ? <DateChips dates={services.map((s) => s.id)} value={service.id} onChange={(sid) => setService(services.find((s) => s.id === sid) ?? null)} format={(sid) => services.find((s) => s.id === sid)?.name ?? ''} /> : null}

            <View accessibilityLiveRegion="assertive" style={{ alignItems: 'center', gap: 10, padding: 22, borderRadius: 24, minHeight: 210, justifyContent: 'center', backgroundColor: flash ? bg : colors.bgSoft }}>
              {flash ? (
                <>
                  {flash.name ? <Face name={flash.name} path={flash.photo ?? null} size={84} /> : <Feather name="alert-circle" size={44} color={fg} />}
                  <Text style={{ fontSize: 26, fontWeight: '900', color: fg, textAlign: 'center' }}>{flash.title}</Text>
                  {flash.text ? <Text style={{ fontSize: 16, color: fg, textAlign: 'center' }}>{flash.text}</Text> : null}
                </>
              ) : (
                <>
                  <Feather name="radio" size={48} color={colors.muted} />
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{reading ? 'Apoyá tu chip o tu tarjeta en el teléfono' : 'Tocá “Empezar” para leer los chips'}</Text>
                </>
              )}
            </View>

            {nfcBuilt && nfc === 'ok' ? (
              reading ? <Button title="Dejar de leer chips" icon="pause" variant="outline" onPress={stop} /> : <Button title="Empezar a leer chips" icon="radio" onPress={start} />
            ) : (
              <Text style={{ fontSize: 14, color: colors.amberText, fontWeight: '700', textAlign: 'center' }}>
                {nfc === 'off' ? 'Prendé el NFC en los ajustes del teléfono para leer chips.' : nfcBuilt ? 'Este teléfono no lee chips.' : 'Para leer chips hace falta la app nueva en un teléfono con NFC.'} Podés leer el QR de la tarjeta o buscar el nombre.
              </Text>
            )}
            {scannerAvailable ? (scan ? <TicketScanner onCode={(t) => { onText(t, 'qr'); }} onClose={() => setScan(false)} /> : <Button title="Leer el QR de la tarjeta" icon="camera" variant="outline" onPress={() => setScan(true)} />) : null}

            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.greenText, textAlign: 'center' }}>{count} {count === 1 ? 'persona entró' : 'personas entraron'} por acá</Text>
            {recent.length ? <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Los últimos: {recent.join(' · ')}</Text> : null}

            <SectionTitle>¿No tenés el chip?</SectionTitle>
            <Field label="Buscá tu nombre" value={q} onChangeText={setQ} autoCapitalize="words" autoCorrect={false} placeholder="Nombre y apellido" />
            {found.length ? (
              <Card style={{ padding: 0 }}>
                {found.map((p, i) => (
                  <Pressable key={p.id} onPress={() => byName(p)} accessibilityRole="button" accessibilityLabel={`Marcar presente a ${p.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Face name={p.name} path={p.photo_path} size={36} />
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{p.name}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green }}>Soy yo</Text>
                  </Pressable>
                ))}
              </Card>
            ) : q.trim().length >= 2 ? <Text style={{ fontSize: 13, color: colors.muted }}>No aparece nadie con ese nombre. Avisá en la entrada.</Text> : null}

            <Button title="Chips de la iglesia: darle un chip a alguien" icon="credit-card" variant="ghost" small onPress={() => { stop(); router.push('/chips' as Href); }} />
          </>
        )}
      </Screen>
    </View>
  );
}
