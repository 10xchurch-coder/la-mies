// Acerca de los textos: cada Biblia y cada ayuda de estudio que trae la app, de dónde sale y con qué permiso se usa.
import React from 'react';
import { Text, View } from 'react-native';
import { Header, Screen } from '@/components/Screen';
import { Card, SectionTitle, Tag } from '@/components/ui';
import { BIBLE_NOT_INCLUDED, BIBLE_SOURCES } from '@/lib/bibleSources';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function TextosBiblia() {
  const line = (label: string, text: string) => (
    <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}><Text style={{ fontWeight: '800', color: colors.text }}>{label} </Text>{text}</Text>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Acerca de los textos')} subtitle={tx('De dónde sale cada cosa')} back />
      <Screen>
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
          {tx('Todo lo que trae la Biblia de la app es libre: se puede leer, copiar y compartir sin pagar ni pedir permiso. Acá está la lista, con su fuente.')}
        </Text>
        {BIBLE_SOURCES.map((s) => (
          <Card key={s.title} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{s.title}</Text>
              <Tag text={s.licence} tone={s.licence.startsWith('Dominio') ? 'green' : 'blue'} />
            </View>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{s.what}</Text>
            {line(tx('Permiso:'), s.detail)}
            {line(tx('Fuente:'), s.source)}
            {s.credit ? line(tx('Reconocimiento:'), s.credit) : null}
          </Card>
        ))}
        <SectionTitle>{tx('Lo que todavía no está')}</SectionTitle>
        {BIBLE_NOT_INCLUDED.map((s) => (
          <Card key={s.title} style={{ gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.title}</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{s.why}</Text>
          </Card>
        ))}
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>
          {tx('Los textos se pasaron tal cual a la app, sin cambiar palabras. Si ves un error, avisale a tu iglesia.')}
        </Text>
      </Screen>
    </View>
  );
}
