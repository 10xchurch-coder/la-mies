import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

function icon(name: IconName) {
  return ({ color }: { color: import('react-native').ColorValue }) => <Feather name={name} size={24} color={color as string} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { borderTopColor: colors.border, height: 84, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="mapa" options={{ title: 'Mapa', tabBarIcon: icon('map') }} />
      <Tabs.Screen name="personas" options={{ title: 'Personas', tabBarIcon: icon('users') }} />
      <Tabs.Screen name="iglesia" options={{ title: 'Iglesia', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="predicas" options={{ title: 'Prédicas', tabBarIcon: icon('play-circle') }} />
      <Tabs.Screen name="yo" options={{ title: 'Yo', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
