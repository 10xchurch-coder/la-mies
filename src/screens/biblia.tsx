// La Biblia (botón de la barra de abajo): abre directo para leer, donde la persona se quedó.
// Los libros, la versión, buscar y los ajustes están arriba, dentro de la misma pantalla.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSegments } from 'expo-router';
import { BibleReader } from './bibliaLeer';
import { loadBiblePrefs, type BiblePrefs } from '@/lib/bibleStore';
import { colors } from '@/theme';

export default function Biblia() {
  const [prefs, setPrefs] = useState<BiblePrefs | null>(null);
  const inTabs = (useSegments() as string[])[0] === '(tabs)';
  useEffect(() => { loadBiblePrefs().then(setPrefs); }, []);
  if (!prefs) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <BibleReader start={{ book: prefs.book, chapter: prefs.chapter, version: prefs.version }} embedded={inTabs} />;
}
