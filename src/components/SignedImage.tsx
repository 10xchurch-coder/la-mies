// Una imagen guardada en un depósito privado: pide el link firmado y la muestra.
import React, { useEffect, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { cachedSignedUrl, signedUrl, type Bucket } from '@/lib/files';
import { colors } from '@/theme';

export function SignedImage({ bucket, path, style, fit = 'cover', onPress, label }: {
  bucket: Bucket; path: string | null | undefined; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain'; onPress?: () => void; label?: string;
}) {
  const [url, setUrl] = useState<string | null>(() => cachedSignedUrl(bucket, path));
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    signedUrl(bucket, path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [bucket, path]);
  const inner = (
    <View style={[{ backgroundColor: colors.greenSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit={fit} transition={150} cachePolicy="memory-disk" /> : <Feather name="image" size={24} color={colors.green} />}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={label ?? 'Ver foto'}>{inner}</Pressable> : inner;
}
