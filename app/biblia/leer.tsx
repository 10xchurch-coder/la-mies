// La Biblia abierta en un lugar puntual (desde una búsqueda, una referencia, el plan de lectura o un enlace).
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { BibleReader } from '@/screens/bibliaLeer';
import { cleanPlace } from '@/lib/bible';
import { DEFAULT_PREFS } from '@/lib/bibleStore';

export default function LeerBiblia() {
  const params = useLocalSearchParams<{ libro?: string; cap?: string; v?: string; ver?: string }>();
  const place = cleanPlace(params.libro, params.cap) ?? { book: DEFAULT_PREFS.book, chapter: 1 };
  const verse = Number(params.ver);
  return <BibleReader key={`${place.book}-${place.chapter}-${params.v ?? ''}-${params.ver ?? ''}`} start={{ ...place, version: params.v, verse: verse >= 1 ? verse : undefined }} />;
}
