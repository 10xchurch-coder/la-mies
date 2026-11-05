// Agregar o editar una persona sin estar en la calle: una visita, un miembro, un alumno.
// Cualquiera puede agregar; solo la secretaría o el pastor marcan "miembro".
// Acá viven también los datos que no van en la ficha corta: miembro desde, discipulado,
// bautismo, quién hace el seguimiento y la cuenta en la app.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Choice, Field, Loading, SectionTitle, Tag, Toggle } from '@/components/ui';
import { addPerson, linkAccount, listGroups, listProfiles, searchPeople, updateContact } from '@/lib/api';
import { pickAndUploadPhoto } from '@/lib/files';
import { supabase, errorMessage } from '@/lib/supabase';
import { ageFrom, fmtDateAR, groupWord, isoDate, maskDateOrAge, parseAgeOrBirthdate, parseDateAR } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Contact, Group, PersonStatus, Profile } from '@/types';

type Kid = { id?: string; name: string; when: string };
type Suggestion = { id: string; name: string; status: string; photo_path: string | null };

/** Lo que se muestra en el campo: la fecha si la hay, si no la edad. */
const whenText = (birthdate: string | null, age: number | null) => (birthdate ? fmtDateAR(birthdate) : age != null ? String(age) : '');

export default function NuevaPersona() {
  const router = useRouter();
  const { id, status: initialStatus } = useLocalSearchParams<{ id?: string; status?: string }>();
  const { church, isStaff, isLeader } = useAuth();
  const [loaded, setLoaded] = useState(!id);
  const [orig, setOrig] = useState<Contact | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [when, setWhen] = useState(''); // edad o fecha de nacimiento
  const [sex, setSex] = useState<'m' | 'f' | null>(null);
  const [marital, setMarital] = useState<Contact['marital']>(null);
  const [spouseName, setSpouseName] = useState('');
  const [spouseId, setSpouseId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [dni, setDni] = useState('');
  const [baptized, setBaptized] = useState(false);
  const [baptizedHere, setBaptizedHere] = useState(true);
  const [baptizedOn, setBaptizedOn] = useState('');
  const [memberSince, setMemberSince] = useState('');
  const [discipleshipSince, setDiscipleshipSince] = useState('');
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [linkedProfile, setLinkedProfile] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string>('none');
  const [status, setStatus] = useState<PersonStatus>(
    initialStatus === 'member' && isStaff ? 'member' : initialStatus === 'contact' ? 'contact' : 'visitor',
  );
  const [kids, setKids] = useState<Kid[]>([]);
  const [picker, setPicker] = useState<null | 'followup' | 'link'>(null);
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listGroups().then(setGroups).catch(() => undefined);
    if (isLeader) listProfiles().then(setPeople).catch(() => undefined);
    if (!id) return;
    (async () => {
      const [{ data: c }, { data: ch }] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', id).maybeSingle(),
        supabase.from('contact_children').select('*').eq('contact_id', id).order('age', { ascending: false }),
      ]);
      const x = c as Contact | null;
      if (x) {
        setOrig(x);
        setPhoto(x.photo_path);
        setName(x.name);
        setPhone(x.phone ?? '');
        setWhen(whenText(x.birthdate, x.age));
        setSex(x.sex);
        setMarital(x.marital);
        setSpouseId(x.spouse_id);
        setAddress(x.address ?? x.address_hint ?? '');
        setEmail(x.email ?? '');
        setDni(x.dni ?? '');
        setBaptized(!!x.baptized || !!x.baptized_on);
        setBaptizedHere(x.baptized_here ?? true);
        setBaptizedOn(fmtDateAR(x.baptized_on));
        setMemberSince(fmtDateAR(x.member_since));
        setDiscipleshipSince(fmtDateAR(x.discipleship_since));
        setFollowUp(x.follow_up_user_id);
        setLinkedProfile(x.profile_id);
        setGroupId(x.group_id ?? 'none');
        setStatus(x.status);
        if (x.spouse_id) {
          const { data: sp } = await supabase.from('contacts').select('name').eq('id', x.spouse_id).maybeSingle();
          setSpouseName((sp as { name: string } | null)?.name ?? x.spouse_name ?? '');
        } else {
          setSpouseName(x.spouse_name ?? '');
        }
      }
      setKids(((ch ?? []) as { id: string; name: string; age: number | null; birthdate: string | null }[]).map((k) => ({ id: k.id, name: k.name, when: whenText(k.birthdate, k.age) })));
      setLoaded(true);
    })();
  }, [id, isLeader]);

  const choosePhoto = async () => {
    if (!church) return;
    try {
      const p = await pickAndUploadPhoto(church.id);
      if (p) setPhoto(p);
    } catch (e) {
      Alert.alert('No se pudo subir la foto', errorMessage(e));
    }
  };

  /** Al escribir el nombre del cónyuge, sugerir fichas ya cargadas. */
  const onSpouseText = (t: string) => {
    setSpouseName(t);
    setSpouseId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (t.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchPeople(t.trim()).then((r) => setSuggestions(r.filter((p) => p.id !== id).slice(0, 6))).catch(() => setSuggestions([]));
    }, 250);
  };

  const pickSpouse = (p: Suggestion) => {
    setSpouseId(p.id);
    setSpouseName(p.name);
    setSuggestions([]);
  };

  const hasSpouse = marital === 'married' || marital === 'partner';
  const isContact = status === 'contact';
  const parsedWhen = parseAgeOrBirthdate(when);
  const whenHint = parsedWhen.birthdate ? `(${ageFrom(parsedWhen.birthdate)} años)` : isContact ? '(o la fecha)' : '(o la edad)';

  const save = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Falta el nombre');
      return;
    }
    if (baptized && baptizedHere && baptizedOn.trim() && !parseDateAR(baptizedOn)) {
      Alert.alert('Fecha del bautismo', 'Escribila como día/mes/año, por ejemplo 15/03/2024.');
      return;
    }
    for (const label of [['Miembro desde', memberSince], ['Discipulado desde', discipleshipSince]] as const) {
      if (label[1].trim() && !parseDateAR(label[1])) {
        Alert.alert(label[0], 'Escribila como día/mes/año, por ejemplo 15/03/2024.');
        return;
      }
    }
    setBusy(true);
    try {
      const patch: Partial<Contact> = {
        name: name.trim(),
        phone: phone.trim() || null,
        age: parsedWhen.age,
        birthdate: parsedWhen.birthdate,
        sex,
        marital,
        spouse_id: hasSpouse ? spouseId : null,
        spouse_name: hasSpouse && !spouseId ? spouseName.trim() || null : null,
        address: address.trim() || null,
        email: email.trim().toLowerCase() || null,
        dni: dni.replace(/\D/g, '') || null,
        baptized,
        baptized_here: baptized ? baptizedHere : true,
        baptized_on: baptized && baptizedHere ? (parseDateAR(baptizedOn) ?? orig?.baptized_on ?? isoDate(new Date())) : null,
        group_id: groupId === 'none' ? null : groupId,
        photo_path: photo,
      };
      if (isLeader) {
        patch.discipleship_since = parseDateAR(discipleshipSince);
        patch.follow_up_user_id = followUp;
      }
      if (isStaff) {
        patch.status = status;
        if (status === 'member') patch.member_since = parseDateAR(memberSince) ?? orig?.member_since ?? isoDate(new Date());
        else patch.member_since = null;
      } else if (!orig) {
        patch.status = status === 'member' ? 'visitor' : status;
      }
      let contactId = id;
      if (orig && id) {
        await updateContact(id, patch);
      } else {
        const created = await addPerson({ ...patch, name: patch.name as string, interest: 'some' });
        contactId = created.id;
      }
      if (contactId && isStaff && linkedProfile && linkedProfile !== orig?.profile_id) {
        await linkAccount(contactId, linkedProfile);
      }
      // Hijos: se reemplaza la lista completa.
      if (contactId) {
        const keep = kids.filter((k) => k.name.trim());
        if (orig) await supabase.from('contact_children').delete().eq('contact_id', contactId);
        if (keep.length) {
          const { error } = await supabase.from('contact_children').insert(keep.map((k) => {
            const w = parseAgeOrBirthdate(k.when);
            return { contact_id: contactId, name: k.name.trim(), age: w.age, birthdate: w.birthdate };
          }));
          if (error) throw error;
        }
      }
      if (orig) router.back();
      else router.replace({ pathname: '/contacto/[id]', params: { id: contactId as string } });
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Loading />;
  const gw = groupWord(church?.grouping);
  const label = (t: string) => <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{t}</Text>;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={orig ? 'Editar persona' : 'Agregar persona'} subtitle={orig ? orig.name : 'Una visita, un miembro o un alumno'} back />
      <Screen>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Face name={name || '?'} path={photo} size={96} editable onPress={choosePhoto} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Tocá para sacar o elegir una foto y encuadrarla</Text>
        </View>

        <View style={{ gap: 6 }}>
          {label('¿Quién es?')}
          <Choice
            columns={3}
            options={[
              { value: 'contact', label: 'Contacto' },
              { value: 'visitor', label: 'Visita' },
              ...(isStaff ? [{ value: 'member' as const, label: 'Miembro' }] : []),
            ]}
            value={status}
            onChange={setStatus}
          />
          {!isStaff ? <Text style={{ fontSize: 12, color: colors.muted }}>Para marcar a alguien como miembro, pedíselo a la secretaría o al pastor.</Text> : null}
        </View>

        <Field label="Nombre y apellido" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Celular" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="Ej: 376 455-1234" />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field
            label={isContact ? 'Edad' : 'Fecha de nacimiento'}
            hint={whenHint}
            keyboardType="number-pad"
            value={when}
            onChangeText={(t) => setWhen(maskDateOrAge(t))}
            placeholder={isContact ? 'Ej: 34' : 'DD/MM/AAAA'}
            style={{ flex: 1.3 }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            {label('Sexo')}
            <Choice columns={2} options={[{ value: 'm', label: 'Hombre' }, { value: 'f', label: 'Mujer' }]} value={sex} onChange={setSex} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          {label('Estado civil')}
          <Choice
            columns={3}
            options={[
              { value: 'single', label: 'Soltero/a' }, { value: 'married', label: 'Casado/a' }, { value: 'partner', label: 'En pareja' },
              { value: 'widowed', label: 'Viudo/a' }, { value: 'separated', label: 'Separado/a' }, { value: 'divorced', label: 'Divorciado/a' },
            ]}
            value={marital}
            onChange={(v) => setMarital(v as Contact['marital'])}
          />
        </View>
        {hasSpouse ? (
          <View style={{ gap: 6 }}>
            <Field
              label={marital === 'married' ? 'Cónyuge' : 'Pareja'}
              hint={spouseId ? '(ficha vinculada)' : '(escribí el nombre; si ya está cargado, elegilo)'}
              value={spouseName}
              onChangeText={onSpouseText}
              autoCapitalize="words"
            />
            {spouseId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tag text="Vinculado: los hijos se ven en las dos fichas" tone="green" />
                <Pressable onPress={() => { setSpouseId(null); setSpouseName(''); }} accessibilityLabel="Quitar vínculo"><Text style={{ color: colors.red, fontWeight: '700', fontSize: 12 }}>Quitar</Text></Pressable>
              </View>
            ) : null}
            {suggestions.length ? (
              <Card style={{ padding: 0 }}>
                {suggestions.map((p, i) => (
                  <Pressable key={p.id} onPress={() => pickSpouse(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Face name={p.name} path={p.photo_path} size={32} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{p.name}</Text>
                    <Feather name="link" size={16} color={colors.green} />
                  </Pressable>
                ))}
              </Card>
            ) : null}
          </View>
        ) : null}
        <Field label="Dirección" hint="(calle y número, barrio)" value={address} onChangeText={setAddress} />
        <Field label="Correo" hint="(opcional)" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Field label="DNI" hint="(opcional)" keyboardType="number-pad" value={dni} onChangeText={(t) => setDni(t.replace(/\D/g, ''))} maxLength={10} />

        {groups.length ? (
          <View style={{ gap: 6 }}>
            {label(gw)}
            <Choice options={[{ value: 'none', label: `Sin ${gw.toLowerCase()}` }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} value={groupId} onChange={setGroupId} />
          </View>
        ) : null}

        <SectionTitle>Hijos</SectionTitle>
        <Card style={{ gap: 10 }}>
          {kids.map((k, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <Field label="Nombre" value={k.name} onChangeText={(t) => setKids(kids.map((x, j) => (j === i ? { ...x, name: t } : x)))} style={{ flex: 1 }} />
              <Field label="Nacimiento o edad" keyboardType="number-pad" placeholder="DD/MM/AAAA" value={k.when} onChangeText={(t) => setKids(kids.map((x, j) => (j === i ? { ...x, when: maskDateOrAge(t) } : x)))} style={{ width: 128 }} />
              <Pressable onPress={() => setKids(kids.filter((_, j) => j !== i))} accessibilityLabel="Quitar" style={{ height: 50, width: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="trash-2" size={20} color={colors.red} />
              </Pressable>
            </View>
          ))}
          <Button title="Agregar hijo" icon="plus" variant="outline" small onPress={() => setKids([...kids, { name: '', when: '' }])} />
          {spouseId ? <Text style={{ fontSize: 12, color: colors.muted }}>Los hijos cargados en la ficha del cónyuge también aparecen acá sin volver a escribirlos.</Text> : null}
        </Card>

        <SectionTitle>Su camino en la iglesia</SectionTitle>
        <Card style={{ gap: 4 }}>
          <Toggle
            label="Bautizado"
            hint="Bautismo después de poner la fe en Cristo. El bautismo de bebé o anterior a creer no cuenta."
            value={baptized}
            onChange={setBaptized}
          />
          {baptized ? (
            <View style={{ gap: 10, paddingBottom: 6 }}>
              <Choice
                columns={2}
                options={[{ value: 'here', label: 'En esta iglesia' }, { value: 'before', label: 'Antes de llegar' }]}
                value={baptizedHere ? 'here' : 'before'}
                onChange={(v) => setBaptizedHere(v === 'here')}
              />
              {baptizedHere ? (
                <Field label="Fecha del bautismo" hint="(DD/MM/AAAA)" keyboardType="number-pad" placeholder="DD/MM/AAAA" value={baptizedOn} onChangeText={(t) => setBaptizedOn(maskDateOrAge(t))} />
              ) : (
                <Text style={{ fontSize: 12, color: colors.muted }}>En la ficha va a decir "Bautizado: Sí", sin fecha.</Text>
              )}
            </View>
          ) : null}
          {isLeader ? (
            <View style={{ gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              {isStaff && status === 'member' ? (
                <Field label="Miembro desde" hint="(DD/MM/AAAA; vacío = hoy)" keyboardType="number-pad" placeholder="DD/MM/AAAA" value={memberSince} onChangeText={(t) => setMemberSince(maskDateOrAge(t))} />
              ) : null}
              <Field label="Discipulado desde" hint="(DD/MM/AAAA; vacío = todavía no)" keyboardType="number-pad" placeholder="DD/MM/AAAA" value={discipleshipSince} onChangeText={(t) => setDiscipleshipSince(maskDateOrAge(t))} />
              <View style={{ gap: 6 }}>
                {label('Seguimiento')}
                <Pressable onPress={() => setPicker('followup')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input }}>
                  <Feather name="user-check" size={18} color={colors.green} />
                  <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{people.find((p) => p.id === followUp)?.display_name ?? 'Sin asignar'}</Text>
                  <Feather name="chevron-down" size={18} color={colors.muted} />
                </Pressable>
              </View>
              {isStaff ? (
                <View style={{ gap: 6 }}>
                  {label('Cuenta en la app')}
                  <Pressable onPress={() => setPicker('link')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input }}>
                    <Feather name="smartphone" size={18} color={colors.green} />
                    <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{people.find((p) => p.id === linkedProfile)?.display_name ?? 'No usa la app'}</Text>
                    <Feather name="chevron-down" size={18} color={colors.muted} />
                  </Pressable>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Vincular la cuenta hace que esta persona vea su propia ficha y reciba los avisos de sus clases y ministerios.</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>

        <Button title={orig ? 'Guardar cambios' : 'Guardar persona'} onPress={save} loading={busy} />
      </Screen>

      <PickerModal
        visible={picker === 'followup'}
        title="¿Quién hace el seguimiento?"
        items={people.map((p) => ({ id: p.id, title: p.display_name }))}
        allowNone
        onClose={() => setPicker(null)}
        onPick={(pid) => { setPicker(null); setFollowUp(pid); }}
      />
      <PickerModal
        visible={picker === 'link'}
        title="¿Cuál es su cuenta en la app?"
        items={people.map((p) => ({ id: p.id, title: p.display_name, subtitle: p.phone ?? undefined }))}
        onClose={() => setPicker(null)}
        onPick={(pid) => { setPicker(null); if (pid) setLinkedProfile(pid); }}
      />
    </KeyboardAvoidingView>
  );
}
