// La barra de abajo. Cada uno elige en Ajustes qué 5 pestañas ve y en qué orden.
// Las demás pantallas siguen existiendo (se abren desde Iglesia), pero no ocupan lugar en la barra.
import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ALL_TABS, tabInfo, useTabs, type TabKey } from '@/lib/tabsPref';
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

// Si la barra se cambia y se vuelve a armar, se queda en Iglesia.
export const unstable_settings = { initialRouteName: 'iglesia' };

export default function TabsLayout() {
  const shown = useTabs();
  // El orden de las pestañas es el orden en que se declaran: primero las elegidas, después las ocultas.
  const order: TabKey[] = [...shown, ...ALL_TABS.filter((k) => !shown.includes(k))];
  return (
    <Tabs
      key={shown.join()} // al cambiar el orden en Ajustes, la barra se vuelve a armar
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.bg, height: 84, paddingTop: 6 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {order.map((k) => {
        const t = tabInfo(k);
        const visible = shown.includes(k);
        return k === 'iglesia' ? (
          <Tabs.Screen key={k} name={k} options={{ title: t.title, tabBarIcon: churchIcon, href: visible ? undefined : null,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '900', color: colors.green }, tabBarIconStyle: { width: 52 } }} />
        ) : (
          <Tabs.Screen key={k} name={k} options={{ title: t.title, tabBarIcon: icon(t.icon), href: visible ? undefined : null }} />
        );
      })}
    </Tabs>
  );
}
