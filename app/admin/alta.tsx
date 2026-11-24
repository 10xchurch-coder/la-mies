// Primeros pasos de una iglesia nueva: una lista de 8 pasos a la que el pastor vuelve hasta terminar.
// Cada paso dice para qué sirve, tiene un botón que lo hace y un estado (hecho, falta, lo salteo).
// Lo que la app puede saber sola (hay gente cargada, hay líderes, ya se tomó asistencia) se marca solo.
// Usa lo mismo que las pantallas de siempre (Reuniones, Clases, Funciones). Todo se puede cambiar después.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Tag, Toggle } from '@/components/ui';
import { useChurchLogo } from '@/components/BrandFooter';
import {
  helpLinks, joinMessage, NO_FACTS, presetChanges, presetOff, PRESETS, progress, STATE_LABEL, STEPS, stepState, STORE_LINKS,
  type Facts, type PresetKey, type SavedSteps, type Step, type StepKey, type StepState,
} from '@/lib/alta';
import { altaState, setStep } from '@/lib/altaData';
import { listAllServices, listClasses, setFeature } from '@/lib/api';
import { CLASS_IDEAS, cleanTime, missingIdeas, SERVICE_IDEAS, type ClassIdea, type ServiceIdea } from '@/lib/churchSetup';
import { saveSetup } from '@/lib/churchSetupData';
import { FEATURES, FEATURE_GROUPS, cleanDisabled, featureOn, type FeatureKey } from '@/lib/features';
import { uploadPicked } from '@/lib/files';
import { dayName } from '@/lib/format';
import { churchExtras } from '@/lib/givingData';
import { shareText, WEB_URL } from '@/lib/share';
import { supabase, errorMessage } from '@/lib/supabase';
import { refreshChurchExtras } from '@/lib/useChurchExtras';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchService, ClassRow } from '@/types';
import { tx } from '@/lib/i18n';

const fail = (e: unknown) => Alert.alert(tx('No se pudo'), errorMessage(e));
const TONE: Record<StepState, 'green' | 'amber' | 'gray'> = { done: 'green', todo: 'amber', skipped: 'gray' };

export default function Alta() {
  const router = useRouter();
  const { church, can, refreshProfile } = useAuth();
  const logo = useChurchLogo();
  const [saved, setSaved] = useState<SavedSteps | null>(null);
  const [facts, setFacts] = useState<Facts>(NO_FACTS);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState<StepKey | null>(null);
  const [busy, setBusy] = useState(false);
  // Paso 1
  const [name, setName] = useState(church?.name ?? '');
  const [city, setCity] = useState(church?.city ?? '');
  const [motto, setMotto] = useState('');
  // Paso 2
  const [services, setServices] = useState<ChurchService[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<ClassRow[]>([]);
  // Paso 3
  const [off, setOff] = useState<FeatureKey[]>(() => cleanDisabled(church?.disabled_features));
  const [preset, setPreset] = useState<PresetKey | null>(null);
  // Pasos 4 y 6
  const [noList, setNoList] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  const allowed = can('admin.iglesia');

  const load = useCallback(() => {
    if (!allowed) return;
    altaState().then((s) => {
      setFacts(s.facts);
      setSaved(s.steps ?? {});
      // La primera vez se abre sola la primera cosa que falta.
      setOpen((o) => o ?? progress(s.steps, s.facts).next);
    }).catch(() => setSaved((s) => s ?? {}));
    churchExtras().then((x) => { setPending(x.setup_pending); setMotto((m) => m || (x.motto ?? '')); }).catch(() => undefined);
  }, [allowed]);
  useFocusEffect(load);

  useEffect(() => {
    if (!allowed) return;
    supabase.rpc('church_join_code').then(({ data }) => setJoinCode(typeof data === 'string' ? data : null));
  }, [allowed]);
  useEffect(() => { setOff(cleanDisabled(church?.disabled_features)); }, [church?.disabled_features]);

  const loadLists = useCallback(() => {
    listAllServices().then((s) => { setServices(s); setTimes(Object.fromEntries(s.map((x) => [x.id, x.time]))); }).catch(() => undefined);
    listClasses().then(setClasses).catch(() => undefined);
  }, []);
  useEffect(() => { if (allowed) loadLists(); }, [allowed, loadLists]);

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Primeros pasos')} back />
        <Empty icon="lock" title={tx('Solo el pastor o el administrador de la app')} />
      </View>
    );
  }
  if (saved === null || !church) return <Loading />;

  const prog = progress(saved, facts);

  /** Marca un paso y abre el que sigue. */
  const mark = async (key: StepKey, state: StepState, next = true) => {
    try {
      const steps = await setStep(key, state);
      setSaved(steps ?? {});
      refreshChurchExtras();
      if (next) setOpen(state === 'todo' ? key : progress(steps, facts).next);
    } catch (e) {
      fail(e);
    }
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  // ---------- Paso 1: tu iglesia ----------
  const saveChurch = () => run(async () => {
    if (name.trim().length < 3) throw new Error(tx('Escribí el nombre de la iglesia.'));
    const { error } = await supabase.from('churches').update({ name: name.trim(), city: city.trim() || null }).eq('id', church.id);
    if (error) throw error;
    await saveSetup({ motto: motto.trim() });
    await refreshProfile();
    await mark('iglesia', 'done');
  });
  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert(tx('Sin permiso'), tx('Activá el permiso de fotos en los ajustes del teléfono.')); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
      const a = res.canceled ? null : res.assets?.[0];
      if (!a) return;
      setBusy(true);
      const mime = a.mimeType ?? 'image/png';
      const path = await uploadPicked('materials', church.id, { uri: a.uri, name: `logo.${mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'}`, size: a.fileSize ?? null, mimeType: mime });
      const { error } = await supabase.from('churches').update({ logo_path: path }).eq('id', church.id);
      if (error) throw error;
      await refreshProfile();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Paso 2: reuniones y clases ----------
  const addService = async (i: ServiceIdea) => {
    const { error } = await supabase.from('church_services').insert({ name: i.name, dow: i.dow, time: i.time, main: i.main, sort_order: (services.length + 1) * 10 });
    if (error) fail(error);
    loadLists();
  };
  const patchService = async (id: string, p: Partial<ChurchService>) => {
    const { error } = await supabase.from('church_services').update(p).eq('id', id);
    if (error) fail(error);
    loadLists();
  };
  const saveTime = (s: ChurchService) => {
    const t = cleanTime(times[s.id] ?? '');
    if (!t) { Alert.alert(tx('Hora inválida'), tx('Escribila así: 19:30')); setTimes({ ...times, [s.id]: s.time }); return; }
    if (t !== s.time) patchService(s.id, { time: t });
  };
  const addClasses = async (ideas: ClassIdea[]) => {
    if (!ideas.length) return;
    const base = classes.length;
    const { error } = await supabase.from('classes').insert(ideas.map((c, i) => ({ name: c.name, age_min: c.age_min, age_max: c.age_max, sort_order: (base + i + 1) * 10 })));
    if (error) fail(error);
    loadLists();
  };

  // ---------- Paso 3: funciones ----------
  const change = async (key: FeatureKey, enabled: boolean) => {
    const before = off;
    setOff(enabled ? off.filter((k) => k !== key) : [...off, key]);
    try {
      setOff(cleanDisabled(await setFeature(key, enabled)));
      await refreshProfile();
    } catch (e) {
      setOff(before); fail(e);
    }
  };
  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    if (key === 'elijo') return;
    run(async () => {
      let last: string[] = off;
      for (const c of presetChanges(off, presetOff(key))) last = await setFeature(c.key, c.enabled);
      setOff(cleanDisabled(last));
      await refreshProfile();
      await mark('funciones', 'done');
    });
  };

  // ---------- Paso 6: el código ----------
  const message = joinCode ? joinMessage({ church: church.name, code: joinCode, webUrl: WEB_URL }) : '';
  const sendWhatsApp = () => {
    if (!joinCode) return;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => { shareText(message, tx('Código de la iglesia')).catch(() => undefined); });
    mark('codigo', 'done', false);
  };
  const copyMessage = () => {
    Clipboard.setStringAsync(message).then(() => Alert.alert(tx('Copiado'), tx('Pegalo en el grupo de WhatsApp de la iglesia.')));
    mark('codigo', 'done', false);
  };

  const finish = () => run(async () => {
    await saveSetup({ done: true });
    refreshChurchExtras();
    router.replace('/' as Href);
  });

  const askHelp = (s: Step) => {
    const h = helpLinks({ church: church.name, step: s.title });
    const openMail = () => { Linking.openURL(h.mailto).catch(() => Alert.alert(tx('Escribinos'), h.email)); };
    if (!h.whatsapp) {
      Alert.alert(tx('Te ayudamos'), tx('Escribile a {email} y contanos en qué paso estás. Te respondemos lo antes posible.', { email: h.email }), [
        { text: tx('Cerrar'), style: 'cancel' },
        { text: tx('Escribir el correo'), onPress: openMail },
      ]);
      return;
    }
    Alert.alert(tx('Te ayudamos'), tx('Escribinos y contanos en qué paso estás.'), [
      { text: tx('Cerrar'), style: 'cancel' },
      { text: tx('Por correo'), onPress: openMail },
      { text: tx('Por WhatsApp'), onPress: () => { Linking.openURL(h.whatsapp as string).catch(() => undefined); } },
    ]);
  };

  const serviceIdeas = missingIdeas(SERVICE_IDEAS, services);
  const classIdeas = missingIdeas(CLASS_IDEAS, classes);
  const p = { fontSize: 14, color: colors.text, lineHeight: 20 } as const;
  const small = { fontSize: 12, color: colors.muted, lineHeight: 17 } as const;

  const body = (key: StepKey): React.ReactNode => {
    if (key === 'iglesia') {
      return (
        <>
          <Field label={tx('Nombre de la iglesia')} value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label={tx('Ciudad')} value={city} onChangeText={setCity} autoCapitalize="words" />
          <Field label={tx('Lema')} hint={tx('(opcional: una frase corta de tu iglesia)')} value={motto} onChangeText={setMotto} maxLength={200} placeholder={tx('Una iglesia para toda la familia')} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {logo ? <Image source={{ uri: logo }} style={{ width: 64, height: 64 }} contentFit="contain" /> : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Button title={logo ? tx('Cambiar el logo') : tx('Elegir el logo')} icon="image" variant="outline" small onPress={pickLogo} loading={busy} />
              <Text style={small}>{tx('Opcional. Mejor una imagen cuadrada con fondo transparente (PNG).')}</Text>
            </View>
          </View>
          <Button title={tx('Guardar y seguir')} icon="check" onPress={saveChurch} loading={busy} />
        </>
      );
    }
    if (key === 'reuniones') {
      return (
        <>
          <Text style={p}>{tx('Ya cargamos dos reuniones para empezar. Cambiá la hora, apagá la que no tengan o sumá otra.')}</Text>
          {services.map((s) => (
            <View key={s.id} style={{ gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, opacity: s.active ? 1 : 0.55 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{s.name} · {dayName(s.dow)}</Text>
              <Field label={tx('Hora')} value={times[s.id] ?? s.time} onChangeText={(t) => setTimes({ ...times, [s.id]: t })} onBlur={() => saveTime(s)} placeholder="19:30" keyboardType="numbers-and-punctuation" />
              <Toggle label={tx('La tenemos')} value={s.active} onChange={(v) => patchService(s.id, { active: v })} />
              <Toggle label={tx('Es un culto principal')} hint={tx('Los cultos principales cuentan para la fidelidad. Jóvenes u oración, mejor no.')} value={s.main} onChange={(v) => patchService(s.id, { main: v })} />
            </View>
          ))}
          {serviceIdeas.length ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>{tx('Agregar con un toque')}</Text> : null}
          {serviceIdeas.map((i) => <Button key={i.name} title={`${i.name} · ${dayName(i.dow)} ${i.time}`} icon="plus" variant="outline" small onPress={() => addService(i)} />)}
          <Button title={tx('Agregar otra reunión')} variant="ghost" small onPress={() => router.push('/admin/reuniones' as Href)} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>{tx('Clases de los chicos (si tienen)')}</Text>
          {classes.length ? <Text style={p}>{classes.map((c) => c.name).join(' · ')}</Text> : <Text style={small}>{tx('Todavía no hay clases. Si tu iglesia no tiene, dejalo así.')}</Text>}
          {classIdeas.length > 1 ? <Button title={tx('Agregar las {n} clases de los chicos', { n: classIdeas.length })} icon="plus-circle" variant="outline" small onPress={() => addClasses(classIdeas)} /> : null}
          <Button title={tx('Listo, así están bien')} icon="check" onPress={() => mark('reuniones', 'done')} />
        </>
      );
    }
    if (key === 'funciones') {
      return (
        <>
          <Text style={p}>{tx('Elegí un modelo. Lo apagado no aparece en el menú. No se borra nada y se puede prender después.')}</Text>
          {PRESETS.map((x) => (
            <Pressable key={x.key} onPress={() => applyPreset(x.key)} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: preset === x.key }}
              style={{ gap: 4, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: preset === x.key ? colors.green : colors.border, backgroundColor: preset === x.key ? colors.greenSoft : colors.bg }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{x.label}</Text>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{x.hint}</Text>
            </Pressable>
          ))}
          {preset === 'elijo' ? (
            <>
              {FEATURE_GROUPS.map((g) => (
                <View key={g} style={{ gap: 6 }}>
                  <SectionTitle>{tx(g)}</SectionTitle>
                  {FEATURES.filter((f) => f.group === g).map((f) => (
                    <Toggle key={f.key} label={f.label} hint={f.hint} value={featureOn(off, f.key)} onChange={(v) => change(f.key, v)} disabled={busy} />
                  ))}
                </View>
              ))}
              <Button title={tx('Listo, así está bien')} icon="check" onPress={() => mark('funciones', 'done')} />
            </>
          ) : null}
          <Text style={small}>{tx('Ahora hay {v1} partes prendidas de {n}. Se cambia cuando quieras en Funciones de la iglesia.', { v1: FEATURES.length - off.length, n: FEATURES.length })}</Text>
        </>
      );
    }
    if (key === 'personas') {
      return (
        <>
          <Text style={p}>
            {tx('{v1}Si tenés una lista (en Excel, en una hoja de Google o copiada de donde sea), la app la lee y te muestra todo antes de cargar nada.', { v1: facts.people ? tx('Ya hay {people} {pl}. ', { people: facts.people, pl: facts.people === 1 ? tx('persona cargada') : tx('personas cargadas') }) : '' })}
          </Text>
          <Button title={tx('Tengo una lista: subirla')} icon="upload" onPress={() => router.push('/admin/importar' as Href)} />
          <Button title={tx('Que la cargue el equipo de La Mies')} icon="life-buoy" variant="outline" onPress={() => router.push('/admin/importar-ayuda' as Href)} />
          <Button title={tx('Todavía no tengo lista')} variant="ghost" onPress={() => setNoList(true)} />
          {noList ? (
            <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.amberSoft }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('No pasa nada: la mayoría de las iglesias empieza sin lista')}</Text>
              <Text style={p}>{tx('1. Compartí el código de la iglesia (es el paso 6). Cada hermano crea su cuenta con ese código y aparece solo en la lista.')}</Text>
              <Text style={p}>{tx('2. A los que no usan teléfono los cargás a mano: en Personas, tocá el botón de agregar. Con el nombre alcanza.')}</Text>
              <Text style={p}>{tx('3. Cuando tengas una lista, volvés acá y la subís. Los que ya estén no se repiten.')}</Text>
              <Button title={tx('Agregar una persona a mano')} icon="user-plus" variant="outline" small onPress={() => router.push('/persona/nueva' as Href)} />
              <Button title={tx('Entendido: sigo sin lista')} icon="check" small onPress={() => mark('personas', 'skipped')} />
            </View>
          ) : null}
        </>
      );
    }
    if (key === 'lideres') {
      return (
        <>
          <Text style={p}>
            {tx('Primero cada líder tiene que crear su cuenta con el código de la iglesia. Después entrás a Roles y permisos, tocás su nombre y elegís qué es: secretaría, tesorero, maestro, capitán de ruta.')}
          </Text>
          <Text style={small}>{facts.accounts <= 1 ? tx('Todavía no hay otras cuentas en tu iglesia: compartí el código (paso 6) y volvé.') : tx('Hay {accounts} cuentas en tu iglesia.', { accounts: facts.accounts })}</Text>
          <Button title={tx('Abrir Roles y permisos')} icon="key" onPress={() => router.push('/admin/roles' as Href)} />
          <Button title={tx('Listo, ya nombré a mis líderes')} icon="check" variant="outline" onPress={() => mark('lideres', 'done')} />
        </>
      );
    }
    if (key === 'codigo') {
      return (
        <>
          <Text selectable style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, textAlign: 'center', color: colors.pink }}>{joinCode ?? '…'}</Text>
          <Text style={p}>{tx('Este código ya está hecho. Mandalo al grupo de la iglesia o imprimí el cartel y pegalo en la entrada.')}</Text>
          <Button title={tx('Mandar por WhatsApp')} icon="send" onPress={sendWhatsApp} disabled={!joinCode} />
          <Button title={tx('Copiar el mensaje')} icon="copy" variant="outline" onPress={copyMessage} disabled={!joinCode} />
          <Button title={tx('Imprimir el cartel con el código QR')} icon="printer" variant="outline" onPress={() => { mark('codigo', 'done', false); router.push('/admin/cartel' as Href); }} disabled={!joinCode} />
          {message ? <Text selectable style={[small, { padding: 10, borderRadius: 10, backgroundColor: colors.bgSoft }]}>{message}</Text> : null}
        </>
      );
    }
    if (key === 'instalar') {
      return (
        <>
          <Text style={p}>{tx('La app se usa de tres maneras. Con cualquiera de las tres se entra con el mismo correo y la misma contraseña.')}</Text>
          <Text style={p}>{tx('• En la computadora o en cualquier teléfono, sin instalar nada: {WEB_URL}', { WEB_URL })}</Text>
          <Text style={p}>{tx('• En iPhone: {ios}', { ios: STORE_LINKS.ios || tx('buscá "La Mies" en el App Store.') })}</Text>
          <Text style={p}>{tx('• En Android: {android}', { android: STORE_LINKS.android || tx('buscá "La Mies" en Google Play.') })}</Text>
          <Button title={tx('Ver el cartel para instalar (con QR)')} icon="smartphone" onPress={() => router.push('/admin/cartel?modo=instalar' as Href)} />
          <Button title={tx('Listo, ya la están instalando')} icon="check" variant="outline" onPress={() => mark('instalar', 'done')} />
        </>
      );
    }
    return (
      <>
        <Text style={p}>
          {tx('El domingo, abrí Asistencia, elegí la reunión y tocá a cada uno que vino. Si viene alguien nuevo, lo agregás ahí mismo. Con eso la app ya te muestra quién faltó y a quién visitar.')}
        </Text>
        {featureOn(off, 'asistencia')
          ? <Button title={tx('Abrir Asistencia')} icon="check-square" onPress={() => router.push('/asistencia' as Href)} />
          : <Text style={small}>{tx('La asistencia está apagada en tu iglesia. Prendela en el paso 3 si la querés usar.')}</Text>}
        <Text style={small}>{tx('Este paso se marca solo cuando tomes la primera asistencia.')}</Text>
      </>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Primeros pasos')} subtitle={prog.finished ? tx('Todo listo') : tx('Vas {label}', { label: prog.label })} back />
      <Screen>
        <Card style={{ gap: 8, backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
            {prog.finished ? tx('¡Tu iglesia ya está en marcha!') : tx('Vas {label}', { label: prog.label })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {STEPS.map((s) => {
              const st = stepState(s.key, saved, facts);
              return <View key={s.key} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: st === 'done' ? colors.green : st === 'skipped' ? colors.muted : colors.bg }} />;
            })}
          </View>
          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
            {prog.finished
              ? tx('Podés volver a esta lista cuando quieras desde el menú. Nada es definitivo: todo se puede cambiar después.')
              : tx('Hacelos en el orden que quieras y a tu ritmo: la app se acuerda por dónde vas. Nada es definitivo.')}
          </Text>
          {prog.finished && pending ? <Button title={tx('Terminar y sacar el aviso del inicio')} icon="check" onPress={finish} loading={busy} /> : null}
        </Card>

        {STEPS.map((s, i) => {
          const st = stepState(s.key, saved, facts);
          const isOpen = open === s.key;
          return (
            <Card key={s.key} style={{ gap: 10, padding: 0, overflow: 'hidden' }}>
              <Pressable onPress={() => setOpen(isOpen ? null : s.key)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={tx('Paso {v1}: {title}. {STATE_LABEL}', { v1: i + 1, title: s.title, STATE_LABEL: STATE_LABEL[st] })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: st === 'done' ? colors.green : colors.bgSoft, borderWidth: st === 'done' ? 0 : 1, borderColor: colors.border }}>
                  {st === 'done' ? <Feather name="check" size={18} color="#FFFFFF" /> : <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.title}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{s.why}</Text>
                </View>
                <Tag text={STATE_LABEL[st]} tone={TONE[st]} />
              </Pressable>
              {isOpen ? (
                <View style={{ gap: 10, paddingHorizontal: 14, paddingBottom: 14 }}>
                  {body(s.key)}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' }}>
                    {s.canSkip && st === 'todo' ? <Button title={tx('Lo salteo por ahora')} variant="ghost" small onPress={() => mark(s.key, 'skipped')} /> : null}
                    {st !== 'todo' && saved?.[s.key] ? <Button title={tx('Marcar que falta')} variant="ghost" small onPress={() => mark(s.key, 'todo')} /> : null}
                    <Button title={tx('Necesito ayuda')} icon="help-circle" variant="ghost" small onPress={() => askHelp(s)} />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}
      </Screen>
    </View>
  );
}
