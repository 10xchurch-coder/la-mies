// El marco del escritorio: menú fijo a la izquierda y el contenido a la derecha, pensado para computadora.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChurchLogo } from '@/components/BrandFooter';
import { deskNavFor, norm, type DeskItem } from '@/lib/desk';
import { useDeskFlags } from '@/lib/centralData';
import { useLayout } from '@/lib/layout';
import { rolesLabel } from '@/lib/perms';
import { useAuth } from '@/store/auth';
import { colors, themed, toneOf } from '@/theme';
import { tx } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Feather>['name'];

const PREF = 'lamies.escritorio';
let nativeOff = false;
/** En el iPad la preferencia se guarda en el aparato; se lee una vez al abrir la app. */
export async function loadDeskPref(): Promise<void> {
  if (Platform.OS === 'web') return;
  try { nativeOff = (await AsyncStorage.getItem(PREF)) === 'off'; } catch { /* sin almacenamiento: queda el escritorio */ }
}
/** ¿Prefiere la vista de teléfono aunque esté en la computadora o en el iPad? (se recuerda en este aparato) */
export function deskPrefOff(): boolean {
  if (Platform.OS !== 'web') return nativeOff;
  try { return globalThis.localStorage?.getItem(PREF) === 'off'; } catch { return false; }
}
export function setDeskPref(on: boolean): void {
  if (Platform.OS !== 'web') { nativeOff = !on; AsyncStorage.setItem(PREF, on ? 'on' : 'off').catch(() => undefined); return; }
  try { globalThis.localStorage?.setItem(PREF, on ? 'on' : 'off'); } catch { /* sin almacenamiento: no pasa nada */ }
}
/** ¿Esta pantalla es de computadora o de iPad? (el escritorio entra; en un teléfono no) */
export function deskFits(width: number, height: number): boolean {
  return Platform.OS === 'web' ? width >= 1000 : Math.min(width, height) >= 700;
}
// Con el dedo hace falta más lugar para tocar que con el mouse.
const TOUCH = Platform.OS !== 'web';

const SIDE = 252;

export function DeskShell({ children }: { children: React.ReactNode }) {
  const { church, profile, perms, signOut } = useAuth();
  const { width } = useLayout();
  const router = useRouter();
  const path = usePathname();
  const logo = useChurchLogo();
  const insets = useSafeAreaInsets();
  const narrow = width < 900;
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  const [find, setFind] = useState('');
  const q = norm(find.trim());
  // Con algo escrito en el buscador quedan solo las secciones que coinciden.
  const flags = useDeskFlags();
  const nav = deskNavFor(perms, church?.disabled_features, flags)
    .map((g) => ({ ...g, items: q ? g.items.filter((i) => norm(`${i.label} ${g.title}`).includes(q)) : g.items }))
    .filter((g) => g.items.length > 0);
  const isHere = (i: DeskItem) => (i.to === '/escritorio' || i.to === '/central' ? path === i.to : path === i.to || path.startsWith(`${i.to}/`));

  const side = (
    <View style={[styles.side, narrow && styles.sideFloating, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left }]}>
      <View style={styles.brand}>
        {logo ? <Image source={{ uri: logo }} style={{ width: 34, height: 34 }} contentFit="contain" /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.brandName} numberOfLines={2}>{church?.name ?? tx('Iglesia')}</Text>
          <Text style={styles.brandSub}>{tx('Escritorio · La Mies')}</Text>
        </View>
      </View>
      <View style={styles.find}>
        <Feather name="search" size={15} color={colors.muted} />
        <TextInput value={find} onChangeText={setFind} placeholder={tx('Buscar una sección…')} placeholderTextColor={colors.muted} accessibilityLabel={tx('Buscar una sección')} autoCorrect={false}
          style={{ flex: 1, height: '100%', fontSize: 13, color: colors.text, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
        {find ? <Pressable onPress={() => setFind('')} hitSlop={8} accessibilityLabel={tx('Borrar la búsqueda')}><Feather name="x" size={15} color={colors.muted} /></Pressable> : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 10, gap: 14 }} keyboardShouldPersistTaps="handled">
        {nav.length ? null : <Text style={{ fontSize: 13, color: colors.muted, padding: 10 }}>{tx('No hay ninguna sección con ese nombre.')}</Text>}
        {nav.map((g) => {
          const c = toneOf(g.tone);
          return (
            <View key={g.title} style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingBottom: 3 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.solid }} />
                <Text style={[styles.groupTitle, { color: c.text }]}>{g.title}</Text>
              </View>
              {g.items.map((i) => {
                const here = isHere(i);
                const inside = i.to.startsWith('/escritorio') || i.to.startsWith('/central');
                return (
                  <Pressable key={i.key} accessibilityRole="link" accessibilityLabel={i.label} onPress={() => router.push(i.to as Href)}
                    style={(s) => [styles.item, (s as { hovered?: boolean }).hovered && !here && { backgroundColor: colors.bgSoft }, here && { backgroundColor: c.soft }]}>
                    <View style={[styles.itemIcon, { backgroundColor: here ? c.solid : c.soft }]}>
                      <Feather name={i.icon as IconName} size={14} color={here ? '#FFFFFF' : c.solid} />
                    </View>
                    <Text style={[styles.itemText, here && { color: c.text, fontWeight: '800' }]} numberOfLines={1}>{i.label}</Text>
                    {!inside ? <Feather name="chevron-right" size={14} color={colors.gray} /> : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.foot}>
        <Text style={styles.footName} numberOfLines={1}>{profile?.display_name ?? ''}</Text>
        <Text style={styles.footRole} numberOfLines={1}>{rolesLabel(profile)}</Text>
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => { setDeskPref(false); router.replace('/(tabs)/iglesia'); }} style={styles.footLink}>
            <Feather name="smartphone" size={14} color={colors.muted} />
            <Text style={styles.footLinkText}>{tx('Vista de teléfono')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => signOut()} style={styles.footLink}>
            <Feather name="log-out" size={14} color={colors.muted} />
            <Text style={styles.footLinkText}>{tx('Salir')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {narrow ? null : side}
      <View style={{ flex: 1, minWidth: 0, paddingTop: narrow ? 0 : insets.top, paddingRight: insets.right }}>
        {narrow ? (
          <View style={[styles.narrowBar, { height: 50 + insets.top, paddingTop: insets.top }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={tx('Menú')} onPress={() => setOpen((v) => !v)} style={{ padding: 10 }}>
              <Feather name={open ? 'x' : 'menu'} size={22} color={colors.text} />
            </Pressable>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{church?.name ?? tx('Escritorio')}</Text>
          </View>
        ) : null}
        {children}
      </View>
      {narrow && open ? (
        <>
          <Pressable accessibilityLabel={tx('Cerrar menú')} onPress={() => setOpen(false)} style={styles.scrim} />
          {side}
        </>
      ) : null}
    </View>
  );
}

/** Una página del escritorio: título arriba, acciones a la derecha y el contenido con su propio desplazamiento. */
export function DeskPage({ title, subtitle, actions, children, scroll = true }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; scroll?: boolean }) {
  const head = (
    <View style={styles.pageHead}>
      <View style={{ flex: 1, minWidth: 200 }}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</View> : null}
    </View>
  );
  if (!scroll) return <View style={styles.page}>{head}<View style={{ flex: 1, minHeight: 0, paddingHorizontal: 28, paddingBottom: 20 }}>{children}</View></View>;
  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 40 }}>
      {head}
      <View style={{ paddingHorizontal: 28, gap: 18 }}>{children}</View>
    </ScrollView>
  );
}

/** Tarjeta con título y, si hace falta, un enlace "Ver todo". */
export function Panel({ title, hint, action, onAction, children, style }: { title: string; hint?: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.panelHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>{title}</Text>
          {hint ? <Text style={styles.panelHint}>{hint}</Text> : null}
        </View>
        {action && onAction ? (
          <Pressable accessibilityRole="link" onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>{action}</Text>
            <Feather name="chevron-right" size={15} color={colors.green} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Botón chico de las barras de acciones. */
export function DeskButton({ label, icon, onPress, primary, disabled }: { label: string; icon?: IconName; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={(s) => [styles.btn, primary && { backgroundColor: colors.green, borderColor: colors.green }, (s as { hovered?: boolean }).hovered && { opacity: 0.85 }, disabled && { opacity: 0.4 }]}>
      {icon ? <Feather name={icon} size={15} color={primary ? '#FFFFFF' : colors.text} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '700', color: primary ? '#FFFFFF' : colors.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bgPage },
  side: { width: SIDE, backgroundColor: colors.bg, borderRightWidth: 1, borderRightColor: colors.border },
  sideFloating: { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 20 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 12 },
  brandName: { fontSize: 14, fontWeight: '800', color: colors.text, lineHeight: 17 },
  brandSub: { fontSize: 11, fontWeight: '600', color: colors.muted, marginTop: 1 },
  groupTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, height: TOUCH ? 44 : 36, paddingHorizontal: 8, borderRadius: 9 },
  itemIcon: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  find: { flexDirection: 'row', alignItems: 'center', gap: 8, height: TOUCH ? 42 : 36, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bgPage },
  itemText: { flex: 1, fontSize: TOUCH ? 15 : 14, fontWeight: '600', color: colors.text },
  foot: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border },
  footName: { fontSize: 13, fontWeight: '800', color: colors.text },
  footRole: { fontSize: 12, color: colors.muted },
  footLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  footLinkText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  narrowBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, height: 50, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  page: { flex: 1, backgroundColor: colors.bgPage },
  pageHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18 },
  pageTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  pageSub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  panel: { backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  panelHint: { fontSize: 12, color: colors.muted, marginTop: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: TOUCH ? 44 : 36, paddingHorizontal: TOUCH ? 14 : 12, borderRadius: 9, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg },
}));
