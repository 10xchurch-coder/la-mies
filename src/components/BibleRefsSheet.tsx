// La hoja de "Referencias": los versículos relacionados con el que se tocó, con su texto en la versión que se está leyendo.
// Tocar uno lo abre. Los datos son de OpenBible.info (CC BY) y se cargan recién cuando se abre la hoja.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import type { BibleVersion } from '@/lib/bible';
import { useBibleReady } from '@/lib/bibleReady';
import { crossRefs, ensureRefs, numberingDiffers, refLabel, refText, type Ref } from '@/lib/bibleStudy';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

const STEP = 20;

export function BibleRefsSheet({ visible, onClose, version, book, chapter, verses, onOpen }: {
  visible: boolean; onClose: () => void; version: BibleVersion; book: number; chapter: number; verses: number[];
  onOpen: (r: Ref) => void;
}) {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(STEP);
  const key = verses.join(',');
  useEffect(() => { if (visible) setShown(STEP); }, [visible, key, book, chapter]);

  // Las referencias de este libro se piden recién cuando la hoja se abre.
  const [ready, setReady] = useState(-1);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    ensureRefs(book).then(() => { if (alive) setReady(book); });
    return () => { alive = false; };
  }, [visible, book]);
  const loading = visible && ready !== book;

  // Cada versículo tocado con sus referencias. No se calcula nada hasta que la hoja se abre.
  const groups = useMemo(() => {
    if (!visible || ready !== book) return [];
    return verses.map((v) => ({ verse: v, refs: crossRefs(book, chapter, v) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ready, key, book, chapter]);
  const total = groups.reduce((n, g) => n + g.refs.length, 0);
  // El texto de las que se ven, en la versión que se está leyendo (si esa versión se baja de a un libro, se piden esos libros).
  const visibleRefs = groups.flatMap((g) => g.refs).slice(0, shown);
  useBibleReady(visibleRefs.map((r) => [version.id, r.book]));
  let left = shown;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel={tx('Cerrar')} />
      <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '82%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{tx('Referencias')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{total ? tx('Otros versículos que hablan de lo mismo. Tocá uno para abrirlo.') : tx('Versículos que hablan de lo mismo')}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tx('Cerrar')} hitSlop={10}><Feather name="x" size={24} color={colors.muted} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 18, gap: 10, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
          {loading ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 24 }} /> : null}
          {!total && !loading ? <Text style={{ fontSize: 15, color: colors.text, paddingVertical: 16 }}>{tx('No hay referencias para {pl}.', { pl: verses.length > 1 ? tx('estos versículos') : tx('este versículo') })}</Text> : null}
          {total && version.id === 'rv1909' && numberingDiffers(book, chapter) ? (
            <Text style={{ fontSize: 12, color: colors.muted }}>{tx('En este capítulo los números de versículo no son iguales en todas las Biblias. Alguna referencia puede caer un versículo antes o después.')}</Text>
          ) : null}
          {groups.map((g) => {
            if (!g.refs.length || left <= 0) return null;
            const list = g.refs.slice(0, left);
            left -= list.length;
            return (
              <View key={g.verse} style={{ gap: 8 }}>
                {groups.length > 1 ? <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: 4 }}>{refLabel(version, { book, chapter, verse: g.verse, end: g.verse }).toUpperCase()}</Text> : null}
                {list.map((r, i) => {
                  const text = refText(version, r);
                  const label = refLabel(version, r);
                  return (
                    <Pressable key={`${g.verse}-${i}`} onPress={() => onOpen(r)} accessibilityRole="button" accessibilityLabel={`${label}. ${text}`}
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.blueText }}>{label}</Text>
                        <Feather name="chevron-right" size={18} color={colors.muted} />
                      </View>
                      <Text style={{ fontSize: 15, lineHeight: 21, color: text ? colors.text : colors.muted }} numberOfLines={5}>
                        {text || (version.load && !version.books[r.book]().length ? tx('Cargando…') : tx('En esta Biblia este versículo tiene otro número. Tocá para abrir el capítulo.'))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
          {total > shown ? <Button title={tx('Ver más ({v1})', { v1: total - shown })} variant="outline" icon="chevron-down" onPress={() => setShown(shown + STEP * 2)} /> : null}
          {total ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{tx('Referencias cruzadas: OpenBible.info, licencia CC BY.')}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
