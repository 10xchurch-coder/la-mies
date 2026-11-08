// Foto de un evento: la que subieron, o una automática según el tema.
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { cachedSignedUrl, signedUrl } from '@/lib/files';
import { eventImageUrl } from '@/lib/eventImages';
import { colors } from '@/theme';
import type { ChurchEvent } from '@/types';

export function EventImage({ ev, width, height, radius = 12, style, children }: { ev: Pick<ChurchEvent, 'title' | 'photo_path' | 'image_key'>; width: number | '100%'; height: number; radius?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const [own, setOwn] = useState<string | null>(() => cachedSignedUrl('photos', ev.photo_path));
  useEffect(() => {
    let alive = true;
    if (ev.photo_path) signedUrl('photos', ev.photo_path).then((u) => alive && setOwn(u));
    else setOwn(null);
    return () => { alive = false; };
  }, [ev.photo_path]);
  const uri = own ?? eventImageUrl(ev.image_key, ev.title, typeof width === 'number' ? width * 2 : 1200, height * 2);
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.greenSoft }, style]}>
      <Image source={{ uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
      {children}
    </View>
  );
}
