// Asistencia a un momento del programa (taller, sesión, plenaria): se lee la misma credencial de la puerta (QR o chip)
// y queda anotado quién estuvo en cada uno. Sin elegir un momento, muestra la lista con cuántos fueron a cada uno.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Stat } from '@/components/ui';
import { TicketScanner, scannerAvailable } from '@/components/TicketScanner';
import { planEvent, sessionCounts, sessionPeople, sessionScan, sessions as loadSessions, type PlanEvent, type Session, type SessionCount, type SessionPerson } from '@/lib/eventPlan';
import { nfcBuilt, readChip } from '@/lib/nfc';
import { parseTicket } from '@/lib/ticket';
import { fmtDay, fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

type Flash = { tone: 'green' | 'amber' | 'red'; text: string } | null;

export default function Sesion() {
  const { id, s } = useLocalSearchParams<{ id: string; s?: string }>();
  const router = useRouter();
  const [ev, setEv] = useState<PlanEvent | null | undefined>(undefined);
  const [list, setList] = useState<Session[] | null>(null);
  const [counts, setCounts] = useState<SessionCount[]>([]);
  const [people, setPeople] = useState<SessionPerson[]>([]);
  const [flash, setFlash] = useState<Flash>(null);
  const [scan, setScan] = useState(false);
  const [code, setCode] = useState('');

  const refresh = useCallback(() => {
    sessionCounts(id).then(setCounts).catch(() => undefined);
    if (s) sessionPeople(s).then(setPeople).catch(() => undefined);
  }, [id, s]);
  useFocusEffect(useCallback(() => {
    planEvent(id).then(setEv).catch(() => setEv(null));
    loadSessions(id).then(setList).catch(() => setList([]));
    refresh();
  }, [id, refresh]));

  if (ev === undefined || list === null) return <Loading />;
  if (!ev) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Asistencia al programa" back /><Empty icon="calendar" title="Este evento ya no está" /></View>;
  const countOf = (sid: string) => counts.find((c) => c.session_id === sid);
  const current = s ? list.find((x) => x.id === s) : undefined;

  // ---------- La lista de momentos ----------
  if (!current) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Asistencia al programa" subtitle={ev.title} back />
        <Screen>
          <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Elegí el taller o el momento. Después leé la credencial de cada persona que entra (el QR o el chip) y queda anotada.</Text>
          {!list.length ? <Empty icon="clock" title="El programa está vacío" text="Primero cargá los momentos en Planificar → Programa." /> : null}
          {list.map((x) => {
            const c = countOf(x.id);
            return (
              <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Tomar asistencia de ${x.title}`} onPress={() => router.push({ pathname: '/evento/sesion', params: { id, s: x.id } } as unknown as Href)}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{x.title}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{fmtDay(x.starts_at)} · {fmtTime(x.starts_at)}{x.place ? ` · ${x.place}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'center', minWidth: 54 }}>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: colors.greenText }}>{c?.people ?? 0}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>fueron</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.gray} />
                </Card>
              </Pressable>
            );
          })}
        </Screen>
      </View>
    );
  }

  // ---------- Leer credenciales en un momento ----------
  const mark = async (c: string) => {
    try {
      const r = await sessionScan(current.id, { code: c });
      const many = r.people > 1 ? ` (${r.people} personas)` : '';
      setFlash(r.result === 'ok' ? { tone: 'green', text: `✓ ${r.name}${many}` } : { tone: 'amber', text: `${r.name} ya estaba anotado acá` });
      refresh();
    } catch (e) { setFlash({ tone: 'red', text: errorMessage(e) }); }
  };
  const onText = (text: string | null, from: 'chip' | 'qr') => {
    const c = parseTicket(text);
    if (!c) { setFlash({ tone: 'red', text: from === 'chip' ? (text ? 'Ese chip no es una entrada de La Mies' : 'El chip está vacío. Probá con el QR de la credencial.') : 'Ese QR no es una entrada de La Mies' }); return; }
    mark(c);
  };
  const chip = async () => {
    try { onText(await readChip(), 'chip'); }
    catch (e) { if ((e as Error).message !== 'cancelado') setFlash({ tone: 'red', text: (e as Error).message }); }
  };
  const byCode = () => {
    const c = parseTicket(code);
    if (!c) { Alert.alert('Código no válido', 'Son 8 letras y números, por ejemplo 1A2B-3C4D.'); return; }
    setCode(''); mark(c);
  };
  const c = countOf(current.id);
  const bg = flash?.tone === 'green' ? colors.greenSoft : flash?.tone === 'amber' ? colors.amberSoft : '#FEE2E2';
  const fg = flash?.tone === 'green' ? colors.greenText : flash?.tone === 'amber' ? colors.amberText : colors.red;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={current.title} subtitle={`${fmtDay(current.starts_at)} · ${fmtTime(current.starts_at)}${current.place ? ` · ${current.place}` : ''}`} back />
      <Screen>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={c?.people ?? 0} label="Personas acá" tone="green" />
          <Stat value={c?.registrations ?? 0} label="Credenciales leídas" />
        </View>
        {flash ? <Card style={{ backgroundColor: bg, borderColor: bg }}><Text style={{ fontSize: 17, fontWeight: '800', color: fg }}>{flash.text}</Text></Card> : null}
        <Card style={{ gap: 10 }}>
          {nfcBuilt ? <Button title="Leer el chip de la credencial" icon="radio" variant="outline" onPress={chip} /> : null}
          {scannerAvailable ? (scan ? <TicketScanner onCode={(t) => onText(t, 'qr')} onClose={() => setScan(false)} /> : <Button title="Leer el QR de la credencial" icon="camera" onPress={() => setScan(true)} />) : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Código de la entrada" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="1A2B-3C4D" style={{ flex: 1 }} onSubmitEditing={byCode} />
            <Button title="Anotar" onPress={byCode} />
          </View>
        </Card>
        <SectionTitle>Los que estuvieron</SectionTitle>
        {!people.length ? <Text style={{ fontSize: 14, color: colors.muted }}>Todavía no se leyó ninguna credencial en este momento.</Text> : (
          <Card style={{ padding: 0 }}>
            {people.map((p, i) => (
              <View key={p.registration_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text }}>{p.name}{p.people > 1 ? ` (+${p.people - 1})` : ''}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{fmtTime(p.scanned_at)}</Text>
              </View>
            ))}
          </Card>
        )}
      </Screen>
    </View>
  );
}
