// Denunciar una publicación y bloquear personas (normas de Apple para contenido de usuarios).
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showActions } from '@/components/ActionSheet';
import { supabase, errorMessage } from './supabase';
import { tx } from './i18n';

export type ReportKind = 'comment' | 'prayer' | 'ministry_message' | 'announcement' | 'church_chat' | 'outing_chat';

const REASONS = ['Ofensivo o irrespetuoso', 'Contenido inapropiado', 'Información privada de otra persona', 'Spam o engaño', 'Otro motivo'];

async function report(kind: ReportKind, targetId: string, authorId: string | null, excerpt: string, reason: string) {
  const { data: u } = await supabase.auth.getUser();
  const church = (await supabase.from('profiles').select('church_id').eq('id', u.user?.id ?? '').maybeSingle()).data?.church_id;
  const { error } = await supabase.from('content_reports').insert({ church_id: church, kind, target_id: targetId, author_id: authorId, excerpt: excerpt.slice(0, 300), reason });
  if (error) throw error;
}

// Lo que denuncié deja de verse en mi teléfono al instante (el pastor decide después si lo borra para todos).
const HIDDEN_KEY = 'lamies.denunciado';
let hidden = new Set<string>();
const subs = new Set<() => void>();
AsyncStorage.getItem(HIDDEN_KEY).then((v) => { if (v) { hidden = new Set(JSON.parse(v) as string[]); subs.forEach((f) => f()); } }).catch(() => undefined);
function hide(id: string) {
  hidden = new Set([...hidden, id].slice(-500));
  AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])).catch(() => undefined);
  subs.forEach((f) => f());
}
/** Para las listas: devuelve una función que dice si esa publicación la escondí al denunciarla. */
export function useHidden(): (id: string) => boolean {
  const set = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => hidden, () => hidden);
  return (id: string) => set.has(id);
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').insert({ blocked_id: userId });
  if (error && error.code !== '23505') throw error;
}
export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').delete().eq('blocked_id', userId);
  if (error) throw error;
}
export async function blockedPeople(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from('user_blocks').select('blocked_id, profiles:blocked_id(display_name)');
  return ((data ?? []) as unknown as { blocked_id: string; profiles: { display_name: string } | null }[]).map((r) => ({ id: r.blocked_id, name: r.profiles?.display_name ?? tx('Alguien') }));
}

/** Menú "⋯" de una publicación ajena: denunciar y/o bloquear al autor. onChange recarga la lista. */
export function moderate(opts: { kind: ReportKind; targetId: string; authorId: string | null; authorName?: string | null; excerpt: string; onChange?: () => void }) {
  const doReport = () =>
    showActions(tx('¿Por qué la denunciás?'), tx('Le llega al pastor y a la secretaría. Quien la publicó no sabe quién la denunció.'), REASONS.map((r) => ({
      text: tx(r),
      onPress: () => report(opts.kind, opts.targetId, opts.authorId, opts.excerpt, r)
        .then(() => { hide(opts.targetId); opts.onChange?.(); Alert.alert(tx('Gracias'), tx('Ya no vas a ver esa publicación. La denuncia le llegó al pastor, que la revisa dentro de las 24 horas.')); })
        .catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))),
    })));
  const doBlock = () =>
    Alert.alert(tx('Bloquear a {authorName}', { authorName: opts.authorName ?? tx('esta persona') }), tx('Ya no vas a ver sus comentarios, mensajes del chat, pedidos de oración ni mensajes de ministerio. Lo podés deshacer en Ajustes.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Bloquear'), style: 'destructive', onPress: () => blockUser(opts.authorId as string).then(() => opts.onChange?.()).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
    ]);
  showActions(tx('Opciones'), undefined, [
    { text: tx('Denunciar esta publicación'), icon: 'flag', onPress: doReport },
    ...(opts.authorId ? [{ text: tx('Bloquear a {authorName}', { authorName: opts.authorName ?? tx('esta persona') }), icon: 'slash' as const, destructive: true, onPress: doBlock }] : []),
    { text: tx('Cancelar'), icon: 'x' as const },
  ]);
}
