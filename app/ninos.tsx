// Entrada y retiro de los chicos (guardería y clases).
// Al dejarlo se hacen dos etiquetas con el mismo código: una para el chico y otra para el adulto que lo trae.
// Para retirarlo, las dos tienen que coincidir: se elige al chico (o se lee su etiqueta) y se lee la etiqueta del adulto
// (QR o chip) o se escribe su código. Si no coinciden, el chico no queda marcado como retirado.
// Al registrar la entrada también se le toma la asistencia.
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Card, Choice, Field, Loading, SectionTitle } from '@/components/ui';
import { TicketScanner, scannerAvailable } from '@/components/TicketScanner';
import { checkinsToday, childPickupAdults, searchPeople, type CheckinRow, type PickupAdult } from '@/lib/api';
import { roleLabel } from '@/lib/families';
import { checkInChildTags, childTags, pickupChild, type ChildTags } from '@/lib/chips';
import { nfcBuilt, nfcState, readChip, writeChip } from '@/lib/nfc';
import { adultProof, childPayload, parseTag, pickupCheck, pickupPayload } from '@/lib/tags';
import { fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

const ROOMS = ['Guardería (0 a 2)', 'Niños (2 a 6)', 'Clase de niños (6 a 12)'];
/** El chico que se está por retirar: su entrada de la lista, o la clave de su etiqueta si se leyó. */
type Picking = { child: string; name: string | null; code: string | null };
type Result = { tone: 'green' | 'red'; title: string; text?: string; siblings?: { checkin_id: string; name: string }[]; proof?: string } | null;

export default function Ninos() {
  const [rows, setRows] = useState<CheckinRow[] | null>(null);
  const [room, setRoom] = useState(ROOMS[0]);
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState<{ id: string; name: string; photo_path: string | null }[]>([]);
  const [brought, setBrought] = useState('');
  const [tags, setTags] = useState<ChildTags | null>(null);          // las etiquetas del último chico que entró (o las que se pidieron de nuevo)
  const [nfc, setNfc] = useState<'ok' | 'off' | 'none'>('none');
  const [wrote, setWrote] = useState<{ child?: boolean; adult?: boolean }>({});
  const [picking, setPicking] = useState<Picking | null>(null);
  const [outCode, setOutCode] = useState('');
  const [scan, setScan] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const web = Platform.OS === 'web';

  // Los grandes de la familia de cada chico que pueden retirarlo (se cargan en la ficha, en "Familia").
  const [pickup, setPickup] = useState<Record<string, PickupAdult[]>>({});
  const load = useCallback(() => {
    checkinsToday().then((list) => {
      setRows(list);
      childPickupAdults(list.filter((r) => !r.out_at).map((r) => r.child_id)).then((adults) => {
        const by: Record<string, PickupAdult[]> = {};
        for (const x of adults) (by[x.child_id] ??= []).push(x);
        setPickup(by);
      }).catch(() => undefined);
    }).catch((e) => { setRows([]); Alert.alert('No se pudo', errorMessage(e)); });
  }, []);
  useFocusEffect(useCallback(() => { load(); nfcState().then(setNfc); }, [load]));

  const onQ = (v: string) => {
    setQ(v);
    if (t.current) clearTimeout(t.current);
    if (v.trim().length < 2) { setSugg([]); return; }
    t.current = setTimeout(() => searchPeople(v.trim()).then((r) => setSugg(r.slice(0, 6))).catch(() => setSugg([])), 250);
  };

  const checkIn = async (p: { id: string; name: string }) => {
    try {
      setTags(await checkInChildTags(p.id, room, brought.trim() || null));
      setWrote({});
      setQ(''); setSugg([]);
      load();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
  };
  const again = (r: CheckinRow) => childTags(r.id).then((x) => { setTags(x); setWrote({}); }).catch((e) => Alert.alert('No se pudo', errorMessage(e)));
  const write = async (which: 'child' | 'adult') => {
    if (!tags) return;
    try {
      await writeChip(which === 'child' ? childPayload(tags.child_tag) : pickupPayload(tags.pickup_tag));
      setWrote((w) => ({ ...w, [which]: true }));
    } catch (e) { if ((e as Error).message !== 'cancelado') Alert.alert('Chip', (e as Error).message); }
  };

  // ---------- Retiro ----------
  const startPickup = (p: Picking) => { setPicking(p); setResult(null); setOutCode(''); };
  /** Compara lo que trae el adulto con el chico elegido. La que decide es la base; acá solo se evita preguntar por un código que ya se ve que no es. */
  const verify = async (adultText: string) => {
    if (!picking) return;
    const proof = adultProof(adultText);
    const who = picking.name ?? 'este chico';
    if (!proof) {
      setResult({ tone: 'red', title: parseTag(adultText)?.kind === 'nino' ? 'Esa es la etiqueta del chico' : 'Eso no sirve para retirar', text: 'Hace falta la etiqueta del adulto o su código de 4 números.' });
      return;
    }
    if (picking.code && pickupCheck({ code: picking.code }, adultText) === 'no') {
      setResult({ tone: 'red', title: 'NO coincide', text: `Ese código no es el de ${who}. No lo entregues. Revisá el número o llamá a un responsable.` });
      return;
    }
    setBusy(true);
    try {
      const r = await pickupChild(picking.child, proof);
      if (!r.matched) setResult({ tone: 'red', title: 'NO coincide', text: `Esa etiqueta no es la de ${r.name}. No lo entregues. Llamá a un responsable.` });
      else { setResult({ tone: 'green', title: `Coincide: podés entregar a ${r.name}`, siblings: r.siblings ?? [], proof }); setPicking(null); setScan(false); }
      setOutCode('');
      load();
    } catch (e) { setResult({ tone: 'red', title: 'No se pudo', text: errorMessage(e) }); } finally { setBusy(false); }
  };
  /** Un hermano con la misma etiqueta del adulto: se entrega con la misma prueba, sin leerla de nuevo. */
  const alsoSibling = async (s: { checkin_id: string; name: string }, proof: string) => {
    try {
      const r = await pickupChild(s.checkin_id, proof);
      if (r.matched) setResult({ tone: 'green', title: `Coincide: podés entregar a ${r.name}`, siblings: r.siblings ?? [], proof });
      else setResult({ tone: 'red', title: 'NO coincide', text: `No lo entregues a ${r.name}.` });
      load();
    } catch (e) { setResult({ tone: 'red', title: 'No se pudo', text: errorMessage(e) }); }
  };
  /** Llega una etiqueta leída (QR o chip): si es de un chico, se elige a ese chico; si es de un adulto, se compara. */
  const onTag = (text: string | null) => {
    const p = parseTag(text);
    if (p?.kind === 'nino') { startPickup({ child: p.value, name: null, code: null }); return; }
    if (p?.kind === 'retiro') {
      if (!picking) { setResult({ tone: 'red', title: 'Primero elegí al chico', text: 'Tocá “Retirar” en su nombre o leé la etiqueta del chico. Después leé la del adulto.' }); return; }
      verify(text ?? ''); return;
    }
    setResult({ tone: 'red', title: text ? 'Esa etiqueta no es de un chico ni de un adulto' : 'El chip está vacío', text: 'Usá el código de 4 números.' });
  };
  const chip = async () => {
    try { onTag(await readChip('Acercá la etiqueta a la parte de arriba del teléfono')); }
    catch (e) { if ((e as Error).message !== 'cancelado') Alert.alert('Chip', (e as Error).message); }
  };
  const byCode = () => {
    if (!/^\d{4}$/.test(outCode.trim())) { Alert.alert('El código tiene 4 números'); return; }
    verify(outCode.trim());
  };

  const inside = (rows ?? []).filter((r) => !r.out_at);
  const hide = web ? ({ dataSet: { noprint: '1' } } as object) : {};
  const label = (kind: 'child' | 'adult') => tags ? (
    <View {...(web ? ({ dataSet: { badge: '1' } } as object) : {})} style={{ width: 250, borderRadius: 12, borderWidth: 1, borderColor: '#C9D0CB', backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
      <View style={{ backgroundColor: kind === 'child' ? '#1F6B45' : '#17201A', paddingVertical: 5, paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>{kind === 'child' ? 'CHICO' : 'PARA RETIRAR · ADULTO'}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
        <QRCode value={kind === 'child' ? childPayload(tags.child_tag) : pickupPayload(tags.pickup_tag)} size={70} backgroundColor="#FFF" color="#000" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '900', color: '#17201A' }} numberOfLines={2}>{tags.name}</Text>
          {kind === 'child' ? <Text style={{ fontSize: 11, color: '#5F6B63' }} numberOfLines={1}>{tags.room}</Text> : <Text style={{ fontSize: 11, color: '#5F6B63' }}>Sin esta etiqueta no se entrega.</Text>}
          <Text style={{ fontSize: 24, fontWeight: '900', letterSpacing: 4, color: '#17201A' }}>{tags.code}</Text>
        </View>
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View {...hide}><Header title="Entrada de los chicos" subtitle={rows ? `${inside.length} adentro ahora` : undefined} back /></View>
      <Screen>
        {web ? React.createElement('style', null, '@media print { [data-noprint] { display: none !important; } [data-badge] { break-inside: avoid; margin-bottom: 8px; } body { background: #fff !important; } }') : null}
        <View {...hide} style={{ gap: 16 }}>
          <SectionTitle>Entrada</SectionTitle>
          <Choice columns={1} options={ROOMS.map((r) => ({ value: r, label: r }))} value={room} onChange={setRoom} />
          <Field label="Quién lo trae" hint="(opcional)" value={brought} onChangeText={setBrought} placeholder="Su mamá, su abuela…" />
          <Field label="Nombre del chico" value={q} onChangeText={onQ} placeholder="Buscar" autoCapitalize="words" />
          {sugg.length ? (
            <Card style={{ padding: 0 }}>
              {sugg.map((p, i) => (
                <Pressable key={p.id} onPress={() => checkIn(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Face name={p.name} path={p.photo_path} size={32} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{p.name}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green }}>Entra</Text>
                </Pressable>
              ))}
            </Card>
          ) : q.trim().length >= 2 ? <Text style={{ fontSize: 12, color: colors.muted }}>Si no aparece, cargalo como hijo en la ficha de su papá o mamá (se le crea la ficha sola).</Text> : null}
        </View>

        {tags ? (
          <>
            <View {...hide}>
              <Card style={{ alignItems: 'center', gap: 4, backgroundColor: colors.greenSoft, borderColor: colors.green }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.greenText }}>{tags.name} · código para retirarlo</Text>
                <Text style={{ fontSize: 48, fontWeight: '900', color: colors.green, letterSpacing: 8 }}>{tags.code}</Text>
                <Text style={{ fontSize: 12, color: colors.greenText, textAlign: 'center' }}>Una etiqueta va con el chico y la otra se la lleva el adulto. Las dos tienen el mismo código. Los hermanos que llegan juntos comparten la etiqueta del adulto.</Text>
              </Card>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {label('child')}
              {label('adult')}
            </View>
            <View {...hide} style={{ gap: 8 }}>
              {web ? <Button title="Imprimir las dos etiquetas" icon="printer" onPress={() => (globalThis as { print?: () => void }).print?.()} /> : (
                <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Para imprimirlas, abrí esta pantalla en la computadora. Sin impresora: el adulto le saca una foto a su etiqueta o anota el código.</Text>
              )}
              {!web && nfc === 'ok' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={wrote.child ? 'Chip del chico ✓' : 'Grabar chip del chico'} icon="radio" variant="outline" small style={{ flex: 1 }} onPress={() => write('child')} />
                  <Button title={wrote.adult ? 'Chip del adulto ✓' : 'Grabar chip del adulto'} icon="radio" variant="outline" small style={{ flex: 1 }} onPress={() => write('adult')} />
                </View>
              ) : null}
              <Button title="Listo" variant="ghost" small onPress={() => setTags(null)} />
            </View>
          </>
        ) : null}

        <View {...hide} style={{ gap: 16 }}>
          <SectionTitle>Retiro</SectionTitle>
          {result ? (
            <Card style={{ gap: 8, backgroundColor: result.tone === 'green' ? colors.greenSoft : '#FEE2E2', borderColor: result.tone === 'green' ? colors.green : colors.red }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: result.tone === 'green' ? colors.greenText : colors.red }}>{result.tone === 'green' ? '✓ ' : '✕ '}{result.title}</Text>
              {result.text ? <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{result.text}</Text> : null}
              {result.proof && result.siblings?.length ? (
                <>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Con la misma etiqueta también están adentro:</Text>
                  {result.siblings.map((s) => <Button key={s.checkin_id} title={`Entregar también a ${s.name}`} variant="outline" small onPress={() => alsoSibling(s, result.proof as string)} />)}
                </>
              ) : null}
            </Card>
          ) : null}
          {picking ? (
            <Card style={{ gap: 10, borderColor: colors.amber }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Retiro de {picking.name ?? 'el chico de la etiqueta leída'}</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>Ahora pedile al adulto su etiqueta o su código. Tienen que coincidir.</Text>
              {scannerAvailable ? (scan ? <TicketScanner onCode={(x) => onTag(x)} onClose={() => setScan(false)} /> : <Button title="Leer el QR del adulto" icon="camera" onPress={() => setScan(true)} />) : null}
              {nfcBuilt ? <Button title="Leer el chip del adulto" icon="radio" variant="outline" onPress={chip} /> : null}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput value={outCode} onChangeText={(v) => setOutCode(v.replace(/\D/g, '').slice(0, 4))} placeholder="Código" placeholderTextColor={colors.muted} keyboardType="number-pad" accessibilityLabel="Código del adulto" onSubmitEditing={byCode}
                  style={{ flex: 1, height: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.input, paddingHorizontal: 16, fontSize: 24, fontWeight: '800', letterSpacing: 6, color: colors.text }} />
                <Button title="Comparar" icon="check" onPress={byCode} loading={busy} />
              </View>
              <Button title="Cancelar" variant="ghost" small onPress={() => { setPicking(null); setScan(false); }} />
            </Card>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Tocá “Retirar” en el nombre del chico{scannerAvailable || nfcBuilt ? ', o leé su etiqueta' : ''}. Después se pide la etiqueta o el código del adulto.</Text>
              {scannerAvailable || nfcBuilt ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {scannerAvailable ? (scan ? <View style={{ flex: 1 }}><TicketScanner onCode={(x) => onTag(x)} onClose={() => setScan(false)} /></View> : <Button title="Leer QR del chico" icon="camera" variant="outline" small style={{ flex: 1 }} onPress={() => setScan(true)} />) : null}
                  {nfcBuilt && !scan ? <Button title="Leer chip del chico" icon="radio" variant="outline" small style={{ flex: 1 }} onPress={chip} /> : null}
                </View>
              ) : null}
            </>
          )}

          <SectionTitle>Hoy</SectionTitle>
          {rows === null ? <Loading /> : (
            <Card style={{ padding: 0 }}>
              {rows.map((r, i) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: r.out_at ? 0.55 : 1 }}>
                  <Face name={r.name} path={r.photo_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.name}{r.age != null ? ` (${r.age})` : ''}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{r.room} · entró {fmtTime(r.in_at)}{r.brought_by ? ` · lo trajo ${r.brought_by}` : ''}{r.out_at ? ` · salió ${fmtTime(r.out_at)}` : ''}</Text>
                    {!r.out_at && pickup[r.child_id]?.length ? (
                      <Text style={{ fontSize: 12, color: colors.greenText, fontWeight: '700' }}>Puede retirar: {pickup[r.child_id].map((x) => `${x.name} (${roleLabel(x.role).toLowerCase()})`).join(', ')}</Text>
                    ) : null}
                    {!r.out_at ? <Text onPress={() => again(r)} accessibilityRole="button" style={{ fontSize: 12, fontWeight: '700', color: colors.blueText, paddingTop: 2 }}>Ver sus etiquetas</Text> : null}
                  </View>
                  {r.out_at ? <Feather name="check" size={18} color={colors.green} /> : (
                    // El código no se muestra en la lista: lo tiene que traer el adulto.
                    <Button title="Retirar" small variant="outline" onPress={() => startPickup({ child: r.id, name: r.name, code: r.code })} />
                  )}
                </View>
              ))}
              {!rows.length ? <Text style={{ padding: 12, color: colors.muted }}>Todavía no entró ningún chico hoy.</Text> : null}
            </Card>
          )}
        </View>
      </Screen>
    </View>
  );
}
