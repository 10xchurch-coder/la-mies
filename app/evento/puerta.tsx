// La puerta de un evento grande: anotar rápido a los que llegan sin estar anotados y marcar a los que ya tienen su entrada.
// La credencial lleva el mismo código en el QR y en el chip: se lee cualquiera de los dos (si el chip falla, el QR sirve igual).
// También se marca la salida, para saber cuántos hay adentro ahora, y cada teléfono dice en qué entrada está.
// Pensado para el teléfono o la tablet de quien recibe a la gente: cada persona son pocos toques.
import { formatPhone, phoneProblem } from '@/lib/phone';
import { PhoneField, phoneInputValue } from '@/components/PhoneField';
import React, { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Segmented, Stat, Tag } from '@/components/ui';
import { TicketScanner, scannerAvailable } from '@/components/TicketScanner';
import { canDoor, doorSearch, getEvent } from '@/lib/api';
import { canPlan, doorLive, doorScan, doorWalkin, type DoorLive } from '@/lib/eventPlan';
import { cleanEntrance, scanFlash } from '@/lib/tags';
import { parseTicket, showCode } from '@/lib/ticket';
import { nfcBuilt, readChip } from '@/lib/nfc';
import { isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import type { ChurchEvent, DoorMatch } from '@/types';
import { tx } from '@/lib/i18n';

type Flash = { tone: 'green' | 'amber' | 'red'; text: string } | null;
const ENTRANCE_KEY = 'lamies.puerta.entrada';      // el nombre de la entrada queda guardado en este teléfono

export default function Puerta() {
  const { id, fecha } = useLocalSearchParams<{ id: string; fecha?: string }>();
  const router = useRouter();
  const [ev, setEv] = useState<ChurchEvent | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<DoorLive | null>(null);
  const [entrance, setEntrance] = useState('');
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [people, setPeople] = useState(1);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<DoorMatch[]>([]);
  const [scan, setScan] = useState(false);
  const [code, setCode] = useState('');
  const [nonce, setNonce] = useState(0);        // al anotar a alguien, el campo del nombre vuelve a empezar con el teclado listo
  const on = fecha ?? (ev ? isoDate(new Date(ev.starts_at)) : '');

  const refresh = useCallback((day: string) => { if (day) doorLive(id, day).then((l) => { if (l) setCounts(l); }).catch(() => undefined); }, [id]);
  useEffect(() => { AsyncStorage.getItem(ENTRANCE_KEY).then((v) => { if (v) setEntrance(v); }).catch(() => undefined); }, []);
  const saveEntrance = (v: string) => { setEntrance(v); AsyncStorage.setItem(ENTRANCE_KEY, cleanEntrance(v)).catch(() => undefined); };
  // Si hay otras puertas trabajando al mismo tiempo, los números se ponen al día solos.
  useEffect(() => { if (!on) return; const t = setInterval(() => refresh(on), 8000); return () => clearInterval(t); }, [on, refresh]);
  useFocusEffect(useCallback(() => {
    // Atienden la puerta los que toman asistencia, los que manejan el calendario y los organizadores de este evento.
    Promise.all([canDoor().catch(() => false), canPlan(id).catch(() => false)]).then(([a, b]) => setAllowed(a || b));
    getEvent(id).then((e) => { setEv(e); if (e) refresh(fecha ?? isoDate(new Date(e.starts_at))); }).catch(() => setEv(null));
  }, [id, fecha, refresh]));

  if (ev === undefined || allowed === null) return <Loading />;
  if (!ev) return <Empty icon="calendar" title={tx('Este evento ya no está')} />;
  if (!allowed) return <Empty icon="lock" title={tx('Sin permiso para la puerta')} text={tx('Pedile al pastor que te dé el permiso de tomar asistencia.')} />;

  const say = (f: Flash) => { setFlash(f); };

  const register = async () => {
    const n = name.trim();
    if (n.length < 2) { say({ tone: 'red', text: tx('Escribí el nombre') }); return; }
    const bad = phoneProblem(phone);
    if (bad) { say({ tone: 'red', text: bad }); return; }
    setBusy(true);
    try {
      const r = await doorWalkin(id, on, n, formatPhone(phone) || null, people, cleanEntrance(entrance));
      say(r.already ? { tone: 'amber', text: tx('{name} ya estaba anotado y ya había entrado', { name: r.name }) } : { tone: 'green', text: tx('✓ {name} anotado{v1}', { name: r.name, v1: people > 1 ? tx(' ({people} personas)', { people }) : '' }) });
      setName(''); setPhone(''); setPeople(1); refresh(on);
      setNonce((x) => x + 1);
    } catch (e) { say({ tone: 'red', text: errorMessage(e) }); } finally { setBusy(false); }
  };

  const checkIn = async (by: { code?: string; reg?: string }) => {
    try {
      const r = await doorScan(by, cleanEntrance(entrance), mode === 'out');
      if (r.event_id !== id) { say({ tone: 'amber', text: tx('Ojo: la entrada de {name} es de otro evento ({event_title})', { name: r.name, event_title: r.event_title ?? tx('sin nombre') }) }); return; }
      say(scanFlash(r.result, r.name, r.people));
      if (r.result === 'in' && r.occurs_on && r.occurs_on !== on) say({ tone: 'amber', text: tx('{name} entró, pero su entrada es del {occurs_on}', { name: r.name, occurs_on: r.occurs_on }) });
      refresh(on);
      if (q.trim().length >= 2) search(q);
    } catch (e) { say({ tone: 'red', text: errorMessage(e) }); }
  };

  const search = (t: string) => {
    setQ(t);
    if (t.trim().length < 2) { setMatches([]); return; }
    doorSearch(id, on, t).then(setMatches).catch(() => setMatches([]));
  };

  // Chip NFC: se apoya la credencial en el teléfono y entra, igual que con el QR.
  const chip = async () => {
    try {
      const text = await readChip();
      const c = parseTicket(text);
      if (!c) { say({ tone: 'red', text: text ? tx('Ese chip no es una entrada de La Mies') : tx('El chip está vacío: todavía no se le grabó la entrada') }); return; }
      checkIn({ code: c });
    } catch (e) {
      if ((e as Error).message !== 'cancelado') say({ tone: 'red', text: (e as Error).message });
    }
  };
  const onScanned = (text: string) => {
    const c = parseTicket(text);
    if (!c) { say({ tone: 'red', text: tx('Ese QR no es una entrada de La Mies') }); return; }
    checkIn({ code: c });
  };
  const byCode = () => {
    const c = parseTicket(code);
    if (!c) { Alert.alert(tx('Código no válido'), tx('Son 8 letras y números, por ejemplo 1A2B-3C4D.')); return; }
    setCode(''); checkIn({ code: c });
  };

  const bg = flash?.tone === 'green' ? colors.greenSoft : flash?.tone === 'amber' ? colors.amberSoft : '#FEE2E2';
  const fg = flash?.tone === 'green' ? colors.greenText : flash?.tone === 'amber' ? colors.amberText : colors.red;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Puerta')} subtitle={ev.title} back />
      <Screen>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={counts?.inside ?? '–'} label={tx('Adentro ahora')} tone="green" />
          <Stat value={counts?.checked_in ?? '–'} label={tx('Entraron')} tone="blue" />
          <Stat value={counts?.registered ?? '–'} label={tx('Anotados')} />
        </View>
        <Card style={{ gap: 10 }}>
          <Field label={tx('Nombre de esta entrada')} hint={tx('(opcional: Puerta principal, Estacionamiento…)')} value={entrance} onChangeText={saveEntrance} maxLength={40} autoCorrect={false} />
          <Segmented value={mode} onChange={setMode} options={[{ value: 'in', label: tx('Entrada##puerta') }, { value: 'out', label: tx('Salida##puerta') }]} />
          {mode === 'out' ? <Text style={{ fontSize: 13, color: colors.amberText, fontWeight: '700' }}>{tx('Estás marcando a los que SALEN. Así el contador sabe cuántos quedan adentro.')}</Text> : null}
          <Button title={tx('Ver el contador en vivo')} icon="monitor" variant="outline" small onPress={() => router.push({ pathname: '/evento/contador', params: { id, fecha: on } } as unknown as Href)} />
        </Card>
        {flash ? (
          <Card style={{ backgroundColor: bg, borderColor: bg }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: fg }}>{flash.text}</Text>
          </Card>
        ) : null}

        {mode === 'in' ? <>
        <SectionTitle>{tx('Persona nueva')}</SectionTitle>
        <Card style={{ gap: 10 }}>
          <Field key={`n${nonce}`} autoFocus={nonce > 0} label={tx('Nombre y apellido')} value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" />
          <PhoneField label={tx('Teléfono')} hint={tx('(para el sorteo y para avisarle)')} value={phone} onChangeText={setPhone} returnKeyType="done" onSubmitEditing={register} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }}>{tx('Cuántos entran')}</Text>
            <Button title="−" variant="outline" small onPress={() => setPeople((p) => Math.max(1, p - 1))} />
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, minWidth: 28, textAlign: 'center' }}>{people}</Text>
            <Button title="+" variant="outline" small onPress={() => setPeople((p) => Math.min(50, p + 1))} />
          </View>
          <Button title={tx('Anotar y dejar entrar')} icon="user-plus" onPress={register} loading={busy} />
        </Card>
        </> : null}

        <SectionTitle>{mode === 'out' ? tx('Sale alguien') : tx('Ya tiene su entrada o estaba anotado')}</SectionTitle>
        <Card style={{ gap: 10 }}>
          {nfcBuilt ? <Button title={tx('Leer el chip de la credencial')} icon="radio" variant="outline" onPress={chip} /> : null}
          {scannerAvailable ? (scan ? <TicketScanner onCode={onScanned} onClose={() => setScan(false)} /> : <Button title={tx('Leer el QR de la credencial')} icon="camera" onPress={() => setScan(true)} />) : null}
          {nfcBuilt ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('El chip y el QR de la credencial llevan el mismo código. Si el chip no lee, usá el QR o escribí el código.')}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Field label={tx('Código de la entrada')} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="1A2B-3C4D" style={{ flex: 1 }} onSubmitEditing={byCode} />
            <Button title={mode === 'out' ? tx('Sale') : tx('Entrar##puerta')} onPress={byCode} />
          </View>
          <Field label={tx('Buscar por nombre o teléfono')} value={q} onChangeText={search} autoCorrect={false} />
          {matches.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{m.name}{m.people > 1 ? ` (+${m.people - 1})` : ''}</Text>
                {m.phone ? <Text style={{ fontSize: 12, color: colors.muted }}>{m.phone}</Text> : null}
              </View>
              {mode === 'out'
                ? (m.checked_in ? <Button title={tx('Salió')} small variant="outline" onPress={() => checkIn({ reg: m.id })} /> : <Tag text={tx('No entró')} tone="gray" />)
                : (m.checked_in ? <Tag text={tx('Ya entró')} tone="green" /> : <Button title={tx('Entró')} small onPress={() => checkIn({ reg: m.id })} />)}
            </View>
          ))}
          {q.trim().length >= 2 && !matches.length ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('No hay nadie con ese nombre.{pl}', { pl: mode === 'in' ? tx(' Anotalo arriba como persona nueva.') : '' })}</Text> : null}
        </Card>
        {counts ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{tx('Se cuentan personas: una entrada para 3 suma 3.{v1}', { v1: counts.gone ? tx(' Ya salieron {gone}.', { gone: counts.gone }) : '' })}</Text> : null}
      </Screen>
    </View>
  );
}
