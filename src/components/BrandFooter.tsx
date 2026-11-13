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
    <View style={[styles.row, align === 'left' && { alignSelf: 'flex-start' }]}>
      {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <Text style={styles.app}>App La Mies · RV1960</Text>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 12, maxWidth: '100%' },
  logo: { width: 40, height: 44 },
  name: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  app: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: '600', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
}));
