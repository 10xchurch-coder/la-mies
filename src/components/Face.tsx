// La cara de una persona: su foto si tiene, si no la inicial.
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { cachedSignedUrl, signedUrl } from '../lib/files';
import { colors } from '../theme';

export function Face({
  name, path, size = 44, ring, onPress, editable,
}: {
  name: string;
  path?: string | null;
  size?: number;
  ring?: string;
  onPress?: () => void;
  editable?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(cachedSignedUrl('photos', path));
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    signedUrl('photos', path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);

  const inner = (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.greenSoft,
          alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 3 : 0, borderColor: ring,
        }}
      >
        {url ? (
          <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" transition={150} recyclingKey={path ?? undefined} />
        ) : (
          <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: colors.greenText }}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
        )}
      </View>
      {editable ? (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: size * 0.34, height: size * 0.34, borderRadius: size, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' }}>
          <Feather name="camera" size={size * 0.17} color="#FFF" />
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={editable ? 'Cambiar foto' : name}>
      {inner}
    </Pressable>
  );
}
