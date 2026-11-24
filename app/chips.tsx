// Chips de la iglesia: darle a cada persona su chip (tarjeta, llavero o pulsera) para marcar la asistencia sola al llegar.
// El chip guarda una clave al azar, no el nombre ni el número de la persona. Si se pierde, se da de baja y deja de servir.
// Sin lector de chips (o en la computadora) se puede hacer una tarjeta con QR, que funciona igual en la entrada.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Card, Choice, Empty, Field, Loading, SectionTitle, Tag } from '@/components/ui';
import { searchPeople } from '@/lib/api';
import { newPersonChip, personChips, revokePersonChip, type PersonChip } from '@/lib/chips';
import { nfcBuilt, nfcState, writeChip } from '@/lib/nfc';
import { personPayload } from '@/lib/tags';
import { fmtRelativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

type Person = { id: string; name: string; photo_path: string | null };
const KINDS = ['Tarjeta', 'Llavero', 'Pulsera'] as const;

export default function Chips() {
  const { persona, nombre } = useLocalSearchParams<{ persona?: string; nombre?: string }>();
  const [rows, setRows] = useState<PersonChip[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [nfc, setNfc] = useState<'ok' | 'off' | 'none'>('none');
  const [who, setWho] = useState<Person | null>(persona ? { id: persona, name: nombre ?? 'Esta persona', photo_path: null } : null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Tarjeta');
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<{ name: string; token: string } | null>(null);     // la tarjeta con QR recién hecha
  const web = Platform.OS === 'web';

  const load = useCallback(() => { personChips().then(setRows).catch((e) => { setRows([]); if (/permiso/i.test(errorMessage(e))) setDenied(true); }); }, []);
  useFocusEffect(load);
  useEffect(() => { nfcState().then(setNfc); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => searchPeople(q.trim()).then((r) => setFound(r.slice(0, 6))).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  /** Crea la clave y la graba en el chip. Si no se pudo grabar, la clave se da de baja para que no quede suelta. */
  const give = async (mode: 'chip' | 'qr') => {
    if (!who) return;
    setBusy(true);
    try {
      const k = await newPersonChip(who.id, mode === 'qr' ? 'Tarjeta con QR' : kind);
      if (mode === 'chip') {
        try { await writeChip(personPayload(k.token)); }
        catch (e) {
          await revokePersonChip(k.id).catch(() => undefined);
          if ((e as Error).message !== 'cancelado') Alert.alert('Chip', (e as Error).message);
          return;
        }
        Alert.alert('Chip grabado', `${k.name} ya puede apoyar su ${kind.toLowerCase()} al llegar a la reunión.`);
        setWho(null); setQ('');
      } else {
        setCard({ name: k.name, token: k.token });
      }
      load();
    } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } finally { setBusy(false); }
  };
  const revoke = (c: PersonChip) => Alert.alert('Dar de baja', `¿Dar de baja ${c.label ? `(${c.label.toLowerCase()}) ` : ''}el chip de ${c.name}? Deja de servir para siempre.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Dar de baja', style: 'destructive', onPress: () => revokePersonChip(c.id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
  ]);
  const print = () => (globalThis as { print?: () => void }).print?.();
  const hide = web ? ({ dataSet: { noprint: '1' } } as object) : {};

  if (rows === null) return <Loading />;
  if (denied) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Chips de la iglesia" back /><Empty icon="lock" title="Sin permiso" text="Los chips los dan los que toman asistencia." /></View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View {...hide}><Header title="Chips de la iglesia" subtitle={`${rows.length} en uso`} back /></View>
      <Screen>
        {web ? React.createElement('style', null, '@media print { [data-noprint] { display: none !important; } [data-badge] { break-inside: avoid; } body { background: #fff !important; } }') : null}
        <View {...hide} style={{ gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Cada persona puede tener su chip. Al llegar lo apoya en el teléfono de la entrada y queda presente. El chip no guarda su nombre: guarda una clave que solo entiende la app de tu iglesia.</Text>
          <SectionTitle>Dar un chip</SectionTitle>
          {who ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Face name={who.name} path={who.photo_path} size={44} />
                <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text }}>{who.name}</Text>
                <Text onPress={() => { setWho(null); setCard(null); }} accessibilityRole="button" style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>Cambiar</Text>
              </View>
              {!web && nfc === 'ok' ? (
                <>
                  <Choice columns={3} options={KINDS.map((k) => ({ value: k, label: k }))} value={kind} onChange={setKind} />
                  <Button title={`Grabar ${kind === 'Tarjeta' ? 'la tarjeta' : kind === 'Llavero' ? 'el llavero' : 'la pulsera'}`} icon="radio" loading={busy} onPress={() => give('chip')} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>Tocá el botón y apoyá el chip en la parte de arriba del teléfono. Si el chip ya tenía algo, se pisa.</Text>
                </>
              ) : (
                <Tag tone="amber" text={web ? 'Los chips se graban desde un teléfono con NFC' : nfc === 'off' ? 'Prendé el NFC en los ajustes del teléfono' : nfcBuilt ? 'Este teléfono no tiene NFC' : 'Para grabar chips hace falta la versión nueva de la app'} />
              )}
              <Button title="Hacer una tarjeta con QR" icon="grid" variant="outline" loading={busy && (web || nfc !== 'ok')} onPress={() => give('qr')} />
            </Card>
          ) : (
            <>
              <Field label="¿Para quién es?" value={q} onChangeText={setQ} placeholder="Buscar por nombre" autoCapitalize="words" autoCorrect={false} />
              {found.length ? (
                <Card style={{ padding: 0 }}>
                  {found.map((p, i) => (
                    <Pressable key={p.id} onPress={() => { setWho(p); setFound([]); setCard(null); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                      <Face name={p.name} path={p.photo_path} size={32} />
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{p.name}</Text>
                    </Pressable>
                  ))}
                </Card>
              ) : null}
            </>
          )}
        </View>

        {card ? (
          <>
            <View {...(web ? ({ dataSet: { badge: '1' } } as object) : {})} style={{ alignSelf: 'center', width: 300, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
              <View style={{ backgroundColor: colors.green, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ fontSize: 13, fontWeight: '800', color: '#FFF' }}>Mi tarjeta de la iglesia</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                <QRCode value={personPayload(card.token)} size={96} backgroundColor="#FFF" color="#000" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#17201A' }} numberOfLines={3}>{card.name}</Text>
                  <Text style={{ fontSize: 12, color: '#5F6B63' }}>Mostrá este código al llegar.</Text>
                </View>
              </View>
            </View>
            <View {...hide} style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, color: colors.amberText, fontWeight: '700', textAlign: 'center' }}>Este código se muestra una sola vez. {web ? 'Imprimilo ahora.' : 'Sacale una captura ahora o abrí esta pantalla en la computadora para imprimirlo.'}</Text>
              {web ? <Button title="Imprimir la tarjeta" icon="printer" onPress={print} /> : null}
            </View>
          </>
        ) : null}

        <View {...hide} style={{ gap: 12 }}>
          <SectionTitle>Chips en uso</SectionTitle>
          {!rows.length ? <Text style={{ fontSize: 14, color: colors.muted }}>Todavía nadie tiene chip.</Text> : (
            <Card style={{ padding: 0 }}>
              {rows.map((c, i) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Face name={c.name} path={c.photo_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{c.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{c.label ?? 'Chip'} · {c.last_used_at ? `lo usó ${fmtRelativeDay(c.last_used_at).toLowerCase()}` : 'todavía no lo usó'}</Text>
                  </View>
                  <Text onPress={() => revoke(c)} accessibilityRole="button" accessibilityLabel={`Dar de baja el chip de ${c.name}`} style={{ fontSize: 13, fontWeight: '700', color: colors.redText }}>Dar de baja</Text>
                </View>
              ))}
            </Card>
          )}
        </View>
      </Screen>
    </View>
  );
}
