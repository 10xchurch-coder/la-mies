// Una rifa: cuántos participan, el botón de sacar al azar y los ganadores.
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, SectionTitle, Tag } from '@/components/ui';
import { deleteRaffle, drawRaffle, getRaffle, rafflePoolCount, raffleWinnerNames, raffleWinners, removeWinner, setWinnerClaimed } from '@/lib/api';
import { POOL_LABEL } from '@/lib/raffle';
import { fmtDateShort } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Raffle, RaffleWinner } from '@/types';
import { tx } from '@/lib/i18n';

export default function RifaPantalla() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const staff = can('cal.editar');
  const [r, setR] = useState<Raffle | null | undefined>(undefined);
  const [pool, setPool] = useState<number | null>(null);
  const [winners, setWinners] = useState<RaffleWinner[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);

  const load = useCallback(() => {
    getRaffle(id).then(setR).catch(() => setR(null));
    if (staff) {
      rafflePoolCount(id).then(setPool).catch(() => setPool(null));
      raffleWinners(id).then(setWinners).catch(() => undefined);
    } else raffleWinnerNames(id).then((l) => setNames(l.map((x) => x.name))).catch(() => undefined);
  }, [id, staff]);
  useFocusEffect(load);

  if (r === undefined) return <Loading />;
  if (!r) return <Empty icon="gift" title={tx('Este sorteo ya no está')} />;

  const draw = async () => {
    setBusy(true);
    try {
      const got = await drawRaffle(id, count);
      setFresh(got.map((g) => g.name));
      if (!got.length) Alert.alert(tx('No queda nadie'), tx('Ya salieron todos los que participan, o todavía no hay nadie en la lista.'));
      load();
    } catch (e) { Alert.alert(tx('No se pudo sacar'), errorMessage(e)); } finally { setBusy(false); }
  };
  const confirmRemove = (w: RaffleWinner) => Alert.alert(tx('¿Sacar a este ganador?'), tx('{name} vuelve a entrar en el sorteo y podés sacar otro.', { name: w.name }), [
    { text: tx('Cancelar'), style: 'cancel' }, { text: tx('Sacar'), style: 'destructive', onPress: () => removeWinner(w.id).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
  ]);
  const confirmDelete = () => Alert.alert(tx('¿Borrar el sorteo?'), tx('Se borran también sus ganadores.'), [
    { text: tx('Cancelar'), style: 'cancel' }, { text: tx('Borrar'), style: 'destructive', onPress: () => deleteRaffle(id).then(() => router.back()).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={r.title} subtitle={r.prize ? `🎁 ${r.prize}` : undefined} back />
      <Screen>
        <Card style={{ gap: 4 }}>
          <Text style={{ fontSize: 14, color: colors.text }}>{POOL_LABEL[r.pool]} · {fmtDateShort(r.occurs_on)}</Text>
          {staff ? <Text style={{ fontSize: 22, fontWeight: '900', color: colors.green }}>{pool === null ? '…' : `${pool} ${pool === 1 ? tx('participa') : tx('participan')}`}</Text> : null}
        </Card>

        {fresh.length ? (
          <Card style={{ backgroundColor: colors.greenSoft, borderColor: colors.greenSoft, alignItems: 'center', gap: 6, paddingVertical: 24 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: colors.greenText, letterSpacing: 1 }}>{fresh.length === 1 ? tx('GANÓ') : tx('GANARON')}</Text>
            {fresh.map((n) => <Text key={n} style={{ fontSize: 30, fontWeight: '900', color: colors.greenText, textAlign: 'center' }}>{n}</Text>)}
          </Card>
        ) : null}

        {staff ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }}>{tx('Cuántos ganadores')}</Text>
              <Button title="−" variant="outline" small onPress={() => setCount((c) => Math.max(1, c - 1))} />
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, minWidth: 28, textAlign: 'center' }}>{count}</Text>
              <Button title="+" variant="outline" small onPress={() => setCount((c) => Math.min(20, c + 1))} />
            </View>
            <Button title={tx('Sacar al azar')} icon="shuffle" onPress={draw} loading={busy} />
          </Card>
        ) : null}

        <SectionTitle>{tx('Ganadores')}</SectionTitle>
        {staff ? (
          !winners.length ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Todavía no salió nadie.')}</Text> : (
            <Card style={{ padding: 0 }}>
              {winners.map((w, i) => (
                <View key={w.id} style={{ gap: 6, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{w.name}</Text>
                    {w.claimed ? <Tag text={tx('Retiró el premio')} tone="green" /> : <Tag text={tx('Falta retirar')} tone="amber" />}
                  </View>
                  {w.phone ? <Text style={{ fontSize: 13, color: colors.muted }}>{w.phone}</Text> : <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Sin teléfono')}</Text>}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={w.claimed ? tx('Todavía no retiró') : tx('Ya retiró')} variant="outline" small style={{ flex: 1 }} onPress={() => setWinnerClaimed(w.id, !w.claimed).then(load).catch(() => undefined)} />
                    {w.phone ? <Button title={tx('WhatsApp')} variant="outline" small style={{ flex: 1 }} onPress={() => { const d = w.phone!.replace(/\D/g, ''); Linking.openURL(`https://wa.me/${d.startsWith('54') ? d : `549${d}`}?text=${encodeURIComponent(tx('¡Felicitaciones {name}! Ganaste en "{title}".', { name: w.name, title: r.title }))}`).catch(() => undefined); }} /> : null}
                    <Button title={tx('Sacar')} variant="ghost" small style={{ flex: 1 }} onPress={() => confirmRemove(w)} />
                  </View>
                </View>
              ))}
            </Card>
          )
        ) : !names.length ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Todavía no salió nadie.')}</Text> : (
          <Card style={{ gap: 6 }}>{names.map((n) => <Text key={n} style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>🎉 {n}</Text>)}</Card>
        )}

        {staff ? <Button title={tx('Borrar el sorteo')} icon="trash-2" variant="ghost" onPress={confirmDelete} /> : null}
      </Screen>
    </View>
  );
}
