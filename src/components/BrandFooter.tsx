// El pie de las tarjetas que se comparten: el logo de la iglesia con su nombre al lado y, abajo y más chiquito, "App La Mies".
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { signedUrl } from '../lib/files';
import { useAuth } from '../store/auth';
import { themed } from '../theme';

/** Dirección del logo (el de la iglesia puede ser un enlace o un archivo guardado). */
export function useChurchLogo(): string | null {
  const { church } = useAuth();
  const logoPath = church?.logo_path ?? null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logoPath) setUrl(null);
    else if (/^https?:/.test(logoPath)) setUrl(logoPath);
    else signedUrl('materials', logoPath).then(setUrl).catch(() => setUrl(null));
  }, [logoPath]);
  return url;
}

export function BrandFooter({ align = 'center' }: { align?: 'center' | 'left' }) {
  const { church } = useAuth();
  const name = church?.name ?? 'La Mies';
  const logo = useChurchLogo();
  return (
    <View style={[styles.wrap, align === 'left' && { alignItems: 'flex-start' }]}>
      <View style={styles.row}>
        {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="cover" cachePolicy="memory-disk" /> : null}
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
      </View>
      <Text style={styles.app}>App La Mies</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  logo: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.9)' },
  name: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  app: { color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
}));
