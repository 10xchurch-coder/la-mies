// Credenciales del evento, con QR y chip juntos: la credencial impresa siempre lleva el QR (nombre, tipo de entrada y código),
// y con un teléfono con lector se le graba el MISMO código en el chip NFC pegado a la credencial (o en una pulsera o tarjeta).
// En la puerta sirve cualquiera de los dos: si el chip falla, el QR sigue andando.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, Tag } from '@/components/ui';
import { markChip, planEvent, planRegs, type PlanEvent, type PlanReg } from '@/lib/eventPlan';
import { nfcBuilt, nfcState, writeChip } from '@/lib/nfc';
import { showCode, ticketPayload } from '@/lib/ticket';
import { fmtDay } from '@/lib/format';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Credenciales() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ev, setEv] = useState<PlanEvent | null>(null);
  const [rows, setRows] = useState<PlanReg[] | null>(null);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const [nfc, setNfc] = useState<'ok' | 'off' | 'none'>('none');
  const [written, setWritten] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { planEvent(id).then(setEv).catch(() => undefined); nfcState().then(setNfc); }, [id]);
  const fetchPage = useCallback((offset: number, text: string) => planRegs(id, text.trim(), offset).then((r) => {
    setRows((old) => (offset ? [...(old ?? []), ...r] : r));
    setMore(r.length === 50);
  }).catch(() => setRows((o) => o ?? [])), [id]);
  useEffect(() => { const t = setTimeout(() => fetchPage(0, q), q ? 350 : 0); return () => clearTimeout(t); }, [q, fetchPage]);

  const write = async (r: PlanReg) => {
    setBusy(r.id);
    try {
      // El chip lleva exactamente lo mismo que el QR impreso.
      await writeChip(ticketPayload(r.ticket_code));
      setWritten((w) => ({ ...w, [r.id]: true }));
      markChip(r.id).catch(() => undefined);      // queda anotado que ya tiene chip, para no grabar dos veces la misma
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'cancelado') Alert.alert(tx('Chip'), msg);
    } finally { setBusy(null); }
  };
  const print = () => (globalThis as { print?: () => void }).print?.();
  const web = Platform.OS === 'web';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View {...(web ? ({ dataSet: { noprint: '1' } } as object) : {})}>
        <Header title={tx('Credenciales')} subtitle={ev ? `${ev.title} · ${fmtDay(ev.starts_at)}` : undefined} back />
      </View>
      <Screen>
        {web ? React.createElement('style', null, '@media print { [data-noprint] { display: none !important; } [data-badge] { break-inside: avoid; } body { background: #fff !important; } }') : null}
        <View {...(web ? ({ dataSet: { noprint: '1' } } as object) : {})} style={{ gap: 12 }}>
          <Card style={{ gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('Credencial con QR y chip juntos')}</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              {tx('1. Imprimí: desde la computadora, tocá “Imprimir”. Sale una credencial por persona con su nombre, su tipo de entrada y su código QR.')}
            </Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              {tx('2. Grabá el chip: pegale un chip a la credencial y, con un teléfono que lea NFC, tocá “Grabar chip” y apoyalo. El chip guarda el mismo código que el QR.')}
            </Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              {tx('En la puerta se lee el chip o el QR, el que sea más rápido. Si un chip falla, el QR sirve igual.')}
            </Text>
            {!web ? (
              <Tag tone={nfc === 'ok' ? 'green' : 'amber'} text={nfc === 'ok' ? tx('Este teléfono puede grabar chips') : nfc === 'off' ? tx('Prendé el NFC en los ajustes del teléfono') : nfcBuilt ? tx('Este teléfono no tiene NFC') : tx('Para grabar chips hace falta la versión nueva de la app')} />
            ) : <Button title={tx('Imprimir las credenciales de esta lista')} icon="printer" onPress={print} />}
          </Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, backgroundColor: colors.bgSoft, paddingHorizontal: 12 }}>
            <Feather name="search" size={18} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar por nombre, celular o código')} placeholderTextColor={colors.muted} accessibilityLabel={tx('Buscar inscriptos')} autoCorrect={false} style={{ flex: 1, fontSize: 16, color: colors.text }} />
          </View>
        </View>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="credit-card" title={tx('No hay inscriptos para mostrar')} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {(rows ?? []).map((r) => (
            <View key={r.id} {...(web ? ({ dataSet: { badge: '1' } } as object) : {})}
              style={{ width: web ? 300 : '100%', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
              <View style={{ backgroundColor: colors.green, paddingVertical: 8, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFF' }} numberOfLines={1}>{ev?.title ?? ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                <QRCode value={ticketPayload(r.ticket_code)} size={84} backgroundColor="#FFF" color="#000" />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#17201A' }} numberOfLines={2}>{r.name}</Text>
                  {r.type_name ? <Text style={{ fontSize: 14, fontWeight: '800', color: '#6D4BC3' }}>{r.type_name.toUpperCase()}</Text> : null}
                  <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1.5, color: '#5F6B63' }}>{showCode(r.ticket_code)}{r.people > 1 ? tx(' · {people} personas', { people: r.people }) : ''}</Text>
                  {written[r.id] || r.chip_at ? <Text {...(web ? ({ dataSet: { noprint: '1' } } as object) : {})} style={{ fontSize: 12, fontWeight: '800', color: '#1E7A4C' }}>{tx('QR + chip ✓')}</Text> : null}
                </View>
              </View>
              {!web && nfc === 'ok' ? (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <Button title={written[r.id] || r.chip_at ? tx('Chip grabado ✓ (grabar otro)') : tx('Grabar chip')} icon="radio" variant={written[r.id] || r.chip_at ? 'outline' : 'primary'} small loading={busy === r.id} onPress={() => write(r)} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
        {more ? <View {...(web ? ({ dataSet: { noprint: '1' } } as object) : {})}><Button title={tx('Ver 50 más')} variant="outline" onPress={() => fetchPage(rows?.length ?? 0, q)} /></View> : null}
      </Screen>
    </View>
  );
}
