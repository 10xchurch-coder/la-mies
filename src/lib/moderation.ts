// Denunciar una publicación y bloquear personas (normas de Apple para contenido de usuarios).
import { Alert } from 'react-native';
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
        .then(() => Alert.alert(tx('Gracias'), tx('La denuncia le llegó al pastor. La va a revisar pronto.')))
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
