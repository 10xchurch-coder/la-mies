import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

function icon(name: IconName) {
  return ({ color }: { color: import('react-native').ColorValue }) => <Feather name={name} size={24} color={color as string} />;
}

// La pestaña Iglesia se destaca: un círculo verde un poco más grande y levantado sobre la barra.
function churchIcon({ focused }: { focused: boolean }) {
  return (
    <View style={{ width: 54, height: 54, borderRadius: 27, marginTop: -18, backgroundColor: focused ? colors.green : colors.greenDark,
      alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.bg,
      shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
      <Feather name="home" size={24} color="#FFFFFF" />
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
      <Tabs.Screen name="iglesia" options={{ title: 'Iglesia', tabBarIcon: churchIcon, tabBarLabelStyle: { fontSize: 11, fontWeight: '900', color: colors.green } }} />
      <Tabs.Screen name="predicas" options={{ title: 'Prédicas', tabBarIcon: icon('play-circle') }} />
      <Tabs.Screen name="yo" options={{ title: 'Yo', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
