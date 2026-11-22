// La puerta de un evento grande: anotar rápido a los que llegan sin estar anotados y marcar a los que ya tienen su entrada (QR o nombre).
// Pensado para el teléfono o la tablet de quien recibe a la gente: cada persona son pocos toques.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Stat, Tag } from '@/components/ui';
import { TicketScanner, scannerAvailable } from '@/components/TicketScanner';
import { canDoor, doorCheckIn, doorCounts, doorRegister, doorSearch, getEvent } from '@/lib/api';
import { parseTicket, showCode } from '@/lib/ticket';
import { isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import type { ChurchEvent, DoorCounts, DoorMatch } from '@/types';

type Flash = { tone: 'green' | 'amber' | 'red'; text: string } | null;

export default function Puerta() {
  const { id, fecha } = useLocalSearchParams<{ id: string; fecha?: string }>();
  const [ev, setEv] = useState<ChurchEvent | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<DoorCounts | null>(null);
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

  const refresh = useCallback((day: string) => { if (day) doorCounts(id, day).then(setCounts).catch(() => undefined); }, [id]);
  useFocusEffect(useCallback(() => {
    canDoor().then(setAllowed).catch(() => setAllowed(false));
    getEvent(id).then((e) => { setEv(e); if (e) refresh(fecha ?? isoDate(new Date(e.starts_at))); }).catch(() => setEv(null));
  }, [id, fecha, refresh]));

  if (ev === undefined || allowed === null) return <Loading />;
  if (!ev) return <Empty icon="calendar" title="Este evento ya no está" />;
  if (!allowed) return <Empty icon="lock" title="Sin permiso para la puerta" text="Pedile al pastor que te dé el permiso de tomar asistencia." />;

  const say = (f: Flash) => { setFlash(f); };

  const register = async () => {
    const n = name.trim();
    if (n.length < 2) { say({ tone: 'red', text: 'Escribí el nombre' }); return; }
    setBusy(true);
    try {
      const r = await doorRegister(id, on, n, phone.trim() || null, people);
      say(r.already ? { tone: 'amber', text: `${r.name} ya estaba anotado y ya había entrado` } : { tone: 'green', text: `✓ ${r.name} anotado${people > 1 ? ` (${people} personas)` : ''}` });
      setName(''); setPhone(''); setPeople(1); refresh(on);
      setNonce((x) => x + 1);
    } catch (e) { say({ tone: 'red', text: errorMessage(e) }); } finally { setBusy(false); }
  };

  const checkIn = async (by: { code?: string; reg?: string }) => {
    try {
      const r = await doorCheckIn(by);
      say(r.already ? { tone: 'amber', text: `${r.name}: esta entrada ya se usó` } : { tone: 'green', text: `✓ Entró ${r.name}${r.people && r.people > 1 ? ` (${r.people} personas)` : ''}` });
      if (r.occurs_on && r.occurs_on !== on) say({ tone: 'amber', text: `${r.name} entró, pero su entrada es del ${r.occurs_on}` });
      refresh(on);
      if (q.trim().length >= 2) search(q);
    } catch (e) { say({ tone: 'red', text: errorMessage(e) }); }
  };

  const search = (t: string) => {
    setQ(t);
    if (t.trim().length < 2) { setMatches([]); return; }
    doorSearch(id, on, t).then(setMatches).catch(() => setMatches([]));
  };

  const onScanned = (text: string) => {
    const c = parseTicket(text);
    if (!c) { say({ tone: 'red', text: 'Ese QR no es una entrada de La Mies' }); return; }
    checkIn({ code: c });
  };
  const byCode = () => {
    const c = parseTicket(code);
    if (!c) { Alert.alert('Código no válido', 'Son 8 letras y números, por ejemplo 1A2B-3C4D.'); return; }
    setCode(''); checkIn({ code: c });
  };

  const bg = flash?.tone === 'green' ? colors.greenSoft : flash?.tone === 'amber' ? colors.amberSoft : '#FEE2E2';
  const fg = flash?.tone === 'green' ? colors.greenText : flash?.tone === 'amber' ? colors.amberText : colors.red;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Puerta" subtitle={ev.title} back />
      <Screen>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={counts?.checked_in ?? '–'} label="Entraron" tone="green" />
          <Stat value={counts?.registered ?? '–'} label="Anotados antes" />
          <Stat value={counts?.walk_ins ?? '–'} label="Nuevos hoy" tone="blue" />
        </View>
        {flash ? (
          <Card style={{ backgroundColor: bg, borderColor: bg }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: fg }}>{flash.text}</Text>
          </Card>
        ) : null}

        <SectionTitle>Persona nueva</SectionTitle>
        <Card style={{ gap: 10 }}>
          <Field key={`n${nonce}`} autoFocus={nonce > 0} label="Nombre y apellido" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" />
          <Field label="Teléfono" hint="(para el sorteo y para avisarle)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" returnKeyType="done" onSubmitEditing={register} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }}>Cuántos entran</Text>
            <Button title="−" variant="outline" small onPress={() => setPeople((p) => Math.max(1, p - 1))} />
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, minWidth: 28, textAlign: 'center' }}>{people}</Text>
            <Button title="+" variant="outline" small onPress={() => setPeople((p) => Math.min(50, p + 1))} />
          </View>
          <Button title="Anotar y dejar entrar" icon="user-plus" onPress={register} loading={busy} />
        </Card>

        <SectionTitle>Ya tiene su entrada o estaba anotado</SectionTitle>
        <Card style={{ gap: 10 }}>
          {scannerAvailable ? (scan ? <TicketScanner onCode={onScanned} onClose={() => setScan(false)} /> : <Button title="Leer el QR de la entrada" icon="camera" onPress={() => setScan(true)} />) : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Código de la entrada" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="1A2B-3C4D" style={{ flex: 1 }} onSubmitEditing={byCode} />
            <Button title="Entrar" onPress={byCode} />
          </View>
          <Field label="Buscar por nombre o teléfono" value={q} onChangeText={search} autoCorrect={false} />
          {matches.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{m.name}{m.people > 1 ? ` (+${m.people - 1})` : ''}</Text>
                {m.phone ? <Text style={{ fontSize: 12, color: colors.muted }}>{m.phone}</Text> : null}
              </View>
              {m.checked_in ? <Tag text="Ya entró" tone="green" /> : <Button title="Entró" small onPress={() => checkIn({ reg: m.id })} />}
            </View>
          ))}
          {q.trim().length >= 2 && !matches.length ? <Text style={{ fontSize: 13, color: colors.muted }}>No hay nadie con ese nombre. Anotalo arriba como persona nueva.</Text> : null}
        </Card>
        {counts ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{counts.people_in} personas adentro en total</Text> : null}
      </Screen>
    </View>
  );
}
