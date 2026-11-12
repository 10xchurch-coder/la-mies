// Agregar o editar un evento del calendario, con todos sus datos: foto, costo, transporte,
// qué llevar, programa, contacto e inscripción.
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Field, Loading, Segmented, SectionTitle, Toggle } from '@/components/ui';
import { EventImage } from '@/components/EventImage';
import { getEvent, saveEvent } from '@/lib/api';
import { EVENT_IMAGES, guessImageKey } from '@/lib/eventImages';
import { pickAndUploadPhoto } from '@/lib/files';
import { addDays, dayName, fmtDateAR, isoDate, parseDateAR } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchEvent } from '@/types';

const TZ_OFFSET = '-03:00';
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function EditarEvento() {
  const router = useRouter();
  const { id, tipo } = useLocalSearchParams<{ id?: string; tipo?: string }>();
  const { church, can } = useAuth();
  const [loaded, setLoaded] = useState(!id);
  const [kind, setKind] = useState<'special' | 'week'>(tipo === 'week' ? 'week' : 'special');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dow, setDow] = useState(5);
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [desc, setDesc] = useState('');
  const [yearly, setYearly] = useState(false);
  const [cost, setCost] = useState('');
  const [transport, setTransport] = useState('');
  const [bring, setBring] = useState('');
  const [program, setProgram] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [reg, setReg] = useState(false);
  const [regPrice, setRegPrice] = useState('');
  const [regCap, setRegCap] = useState('');
  const [regDeadline, setRegDeadline] = useState('');
  const [askRide, setAskRide] = useState(false);
  const [askLodging, setAskLodging] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getEvent(id).then((ev) => {
      if (ev) {
        const s = new Date(ev.starts_at);
        setKind(ev.weekly ? 'week' : 'special');
        setTitle(ev.title);
        setDate(fmtDateAR(isoDate(s)));
        setEndDate(ev.ends_at && isoDate(new Date(ev.ends_at)) !== isoDate(s) ? fmtDateAR(isoDate(new Date(ev.ends_at))) : '');
        setDow(s.getDay());
        setTime(ev.all_day ? '' : hhmm(s));
        setPlace(ev.place ?? '');
        setDesc(ev.description ?? '');
        setYearly(!!ev.yearly);
        setCost(ev.cost ?? '');
        setTransport(ev.transport ?? '');
        setBring(ev.bring ?? '');
        setProgram(ev.program ?? '');
        setContactName(ev.contact_name ?? '');
        setContactPhone(ev.contact_phone ?? '');
        setPhoto(ev.photo_path ?? null);
        setImageKey(ev.image_key ?? null);
        setReg(!!ev.registration);
        setRegPrice(ev.reg_price != null ? String(ev.reg_price) : '');
        setRegCap(ev.reg_capacity != null ? String(ev.reg_capacity) : '');
        setRegDeadline(ev.reg_deadline ? fmtDateAR(ev.reg_deadline) : '');
        setAskRide(!!ev.reg_ask_ride);
        setAskLodging(!!ev.reg_ask_lodging);
      }
      setLoaded(true);
    });
  }, [id]);

  if (!can('cal.editar')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Calendario" back />
        <Text style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>No tenés permiso para editar el calendario.</Text>
      </View>
    );
  }
  if (!loaded) return <Loading />;

  const autoKey = imageKey ?? guessImageKey(title);

  const choosePhoto = async () => {
    if (!church) return;
    try {
      const p = await pickAndUploadPhoto(church.id, { free: true, width: 1200 });
      if (p) setPhoto(p);
    } catch (e) {
      Alert.alert('No se pudo subir la foto', errorMessage(e));
    }
  };

  const save = async () => {
    const weekly = kind === 'week';
    const t = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim().padStart(5, '0') : null;
    let d: string | null;
    if (weekly) {
      const today = new Date();
      d = isoDate(addDays(today, (dow - today.getDay() + 7) % 7));
      if (!t) { Alert.alert('Falta la hora', 'Poné la hora, por ejemplo 17:00.'); return; }
    } else {
      d = parseDateAR(date);
    }
    if (!title.trim() || !d) {
      Alert.alert('Faltan datos', weekly ? 'Poné el nombre.' : 'Poné el nombre y la fecha (por ejemplo 20/12/2026).');
      return;
    }
    const end = !weekly && endDate.trim() ? parseDateAR(endDate) : null;
    if (endDate.trim() && !end) { Alert.alert('Fecha de fin', 'Escribila como día/mes/año.'); return; }
    const deadline = regDeadline.trim() ? parseDateAR(regDeadline) : null;
    const num = (x: string) => { const n = Number(x.replace(/\./g, '').replace(',', '.')); return x.trim() && Number.isFinite(n) ? n : null; };
    setBusy(true);
    try {
      const newId = await saveEvent({
        id: id || undefined,
        title: title.trim(), starts_at: `${d}T${t ?? '00:00'}:00${TZ_OFFSET}`, ends_at: end ? `${end}T23:59:00${TZ_OFFSET}` : null,
        all_day: !t, place: place.trim() || null, description: desc.trim() || null, weekly, yearly: !weekly && yearly,
        cost: cost.trim() || null, transport: transport.trim() || null, bring: bring.trim() || null, program: program.trim() || null,
        contact_name: contactName.trim() || null, contact_phone: contactPhone.trim() || null,
        photo_path: photo, image_key: imageKey ?? guessImageKey(title),
        registration: !weekly && reg, reg_price: reg ? num(regPrice) : null, reg_capacity: reg ? num(regCap) : null,
        reg_deadline: reg ? deadline : null, reg_ask_ride: reg && askRide, reg_ask_lodging: reg && askLodging,
      });
      if (id) router.back();
      else router.replace({ pathname: '/evento/[id]', params: { id: newId, fecha: d } });
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={id ? 'Editar evento' : 'Agregar al calendario'} back />
      <Screen>
        <Segmented options={[{ value: 'special', label: 'Fecha especial' }, { value: 'week', label: 'Cada semana' }]} value={kind} onChange={setKind} />
        <Field label="Nombre" value={title} onChangeText={setTitle} placeholder={kind === 'week' ? 'Evangelismo personal' : 'Reunión de hombres en Candelaria'} />
        {kind === 'week' ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Día</Text>
            <Choice columns={4} options={WEEK_ORDER.map((x) => ({ value: String(x), label: dayName(x).slice(0, 3) }))} value={String(dow)} onChange={(v) => setDow(Number(v))} />
            <Field label="Hora" value={time} onChangeText={setTime} placeholder="17:00" keyboardType="numbers-and-punctuation" />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field label="Fecha" value={date} onChangeText={setDate} placeholder="20/12/2026" style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
              <Field label="Hora" hint="(opcional)" value={time} onChangeText={setTime} placeholder="19:30" style={{ width: 110 }} keyboardType="numbers-and-punctuation" />
            </View>
            <Field label="Hasta" hint="(si dura varios días)" value={endDate} onChangeText={setEndDate} placeholder="22/12/2026" keyboardType="numbers-and-punctuation" />
            <Toggle label="Se repite todos los años" hint="Aniversario, Día del Niño…" value={yearly} onChange={setYearly} />
          </>
        )}
        <Field label="Lugar" hint="(se abre en el mapa)" value={place} onChangeText={setPlace} placeholder="Iglesia · Av. Cabo de Hornos 3960" />

        <SectionTitle>Foto</SectionTitle>
        <EventImage ev={{ title, photo_path: photo, image_key: autoKey }} width="100%" height={160} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={photo ? 'Cambiar foto o flyer' : 'Subir foto o flyer'} icon="image" variant="outline" small onPress={choosePhoto} style={{ flex: 1 }} />
          {photo ? <Button title="Usar la automática" variant="ghost" small onPress={() => setPhoto(null)} style={{ flex: 1 }} /> : null}
        </View>
        {!photo ? (
          <>
            <Text style={{ fontSize: 12, color: colors.muted }}>Si no subís una, va una foto según el tema. Elegí otro tema si no corresponde:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {EVENT_IMAGES.map((x) => (
                <Pressable key={x.key} onPress={() => setImageKey(x.key)} accessibilityRole="button" accessibilityLabel={x.label} style={{ alignItems: 'center', gap: 4 }}>
                  <EventImage ev={{ title: x.label, photo_path: null, image_key: x.key }} width={72} height={54} radius={10}
                    style={{ borderWidth: 2.5, borderColor: autoKey === x.key ? colors.green : 'transparent' }} />
                  <Text style={{ fontSize: 11, fontWeight: autoKey === x.key ? '800' : '500', color: autoKey === x.key ? colors.greenText : colors.muted }}>{x.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionTitle>Detalles</SectionTitle>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: -8 }}>Todo es opcional. Completá solo lo que sirva para este evento.</Text>
        <Field label="De qué se trata" value={desc} onChangeText={setDesc} multiline placeholder="Una tarde para los hombres de la iglesia y sus amigos…" />
        <Field label="Programa" hint="(una cosa por línea)" value={program} onChangeText={setProgram} multiline placeholder={'Fútbol\nPollo a la parrilla\nDesafío bíblico'} />
        <Field label="Costo" value={cost} onChangeText={setCost} placeholder="$5.000 por persona · Gratis" />
        <Field label="Transporte" value={transport} onChangeText={setTransport} multiline placeholder="Sale una combi de la iglesia a las 14:00. Avisá si lo necesitás." />
        <Field label="Qué llevar" value={bring} onChangeText={setBring} multiline placeholder="Ropa deportiva, agua, Biblia" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field label="Contacto" value={contactName} onChangeText={setContactName} placeholder="Nombre" style={{ flex: 1 }} />
          <Field label="Teléfono" value={contactPhone} onChangeText={setContactPhone} placeholder="3764…" keyboardType="phone-pad" style={{ flex: 1 }} />
        </View>

        {kind === 'special' ? (
          <>
            <SectionTitle>Inscripción</SectionTitle>
            <Card style={{ gap: 10 }}>
              <Toggle label="Pedir que se inscriban" hint="Para conferencias, campamentos o salidas: ves quién va, quién pagó y quién necesita transporte o alojamiento." value={reg} onChange={setReg} />
              {reg ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Field label="Precio por persona" hint="(opcional)" value={regPrice} onChangeText={setRegPrice} keyboardType="numeric" placeholder="15000" style={{ flex: 1 }} />
                    <Field label="Lugares" hint="(opcional)" value={regCap} onChangeText={setRegCap} keyboardType="number-pad" placeholder="40" style={{ width: 110 }} />
                  </View>
                  <Field label="Inscribirse hasta" hint="(opcional)" value={regDeadline} onChangeText={setRegDeadline} placeholder="15/12/2026" keyboardType="numbers-and-punctuation" />
                  <Toggle label="Preguntar si necesita transporte" value={askRide} onChange={setAskRide} />
                  <Toggle label="Preguntar si necesita alojamiento" value={askLodging} onChange={setAskLodging} />
                </>
              ) : null}
            </Card>
          </>
        ) : null}

        <Button title="Guardar" icon="check" onPress={save} loading={busy} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Feather name="info" size={13} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Las fotos automáticas son de Unsplash, de uso libre.</Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
