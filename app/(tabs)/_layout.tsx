import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

function icon(name: IconName) {
  return ({ color }: { color: import('react-native').ColorValue }) => <Feather name={name} size={24} color={color as string} />;
}

// La pestaña Iglesia se destaca: mismo tamaño que las demás, con un fondo verde suave detrás del ícono.
function churchIcon({ focused }: { focused: boolean }) {
  return (
    <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
      backgroundColor: focused ? colors.green : colors.greenSoft }}>
      <Feather name="home" size={22} color={focused ? '#FFFFFF' : colors.green} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.bg, height: 84, paddingTop: 6 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="mapa" options={{ title: 'Mapa', tabBarIcon: icon('map') }} />
      <Tabs.Screen name="personas" options={{ title: 'Personas', tabBarIcon: icon('users') }} />
      <Tabs.Screen name="iglesia" options={{ title: 'Iglesia', tabBarIcon: churchIcon, tabBarLabelStyle: { fontSize: 11, fontWeight: '900', color: colors.green }, tabBarIconStyle: { width: 52 } }} />
      <Tabs.Screen name="predicas" options={{ title: 'Prédicas', tabBarIcon: icon('play-circle') }} />
      <Tabs.Screen name="yo" options={{ title: 'Yo', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
