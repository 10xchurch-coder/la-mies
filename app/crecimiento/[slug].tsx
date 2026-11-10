// Un artículo de Crecimiento.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Article } from '@/components/Article';
import { Header, Screen } from '@/components/Screen';
import { Button, Loading } from '@/components/ui';
import { StudyNotes } from '@/components/StudyNotes';
import { shareText } from '@/lib/share';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function CrecimientoArticulo() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [a, setA] = useState<{ title: string; section: string; body: string } | null | undefined>(undefined);
  useEffect(() => {
    supabase.from('growth_articles').select('title, section, body').eq('slug', slug).limit(1).maybeSingle().then(({ data }) => setA(data ?? null));
  }, [slug]);
  if (a === undefined) return <Loading />;
  if (!a) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Crecimiento" back /><Text style={{ padding: 24, color: colors.muted }}>No se encontró.</Text></View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={a.title} subtitle={a.section} back />
      <Screen>
        <Article body={a.body} />
        <StudyNotes kind="article" refId={String(slug)} title={a.title} />
        <Button title="Compartir" icon="share-2" variant="outline" onPress={() => shareText(`${a.title}\n\n${a.body.replace(/\*\*/g, '').replace(/^#+ /gm, '').replace(/^> /gm, '')}`, a.title)} />
      </Screen>
    </View>
  );
}
