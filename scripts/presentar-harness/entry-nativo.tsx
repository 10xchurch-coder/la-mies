// Las mismas piezas como las ve una tablet o un teléfono: se hace creer a la app que NO está en la web
// (Platform.OS = 'android'), así se prueban los caminos del aparato: sin BroadcastChannel ni localStorage,
// operador y pantalla de salida en la misma ventana, toques para pasar y el cartel del video.
import { Platform } from 'react-native';
(Platform as { OS: string }).OS = 'android';
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
const React = require('react') as typeof import('react');
const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
const { View } = require('react-native') as typeof import('react-native');
const Presentar = (require('../../app/presentar/index') as { default: React.ComponentType }).default;
const Salida = (require('../../app/presentar/salida') as { default: React.ComponentType }).default;
const Escenario = (require('../../app/presentar/escenario') as { default: React.ComponentType }).default;

function App() {
  // En el aparato, "Abrir pantalla de salida" navega: acá se muestra arriba del operador, que sigue abierto abajo.
  const [top, setTop] = React.useState<string | null>(null);
  React.useEffect(() => {
    const id = setInterval(() => {
      const nav = (window as unknown as { __nav?: string[] }).__nav ?? [];
      const last = nav[nav.length - 1] ?? null;
      setTop(last === '/presentar/salida' || last === '/presentar/escenario' ? last : null);
    }, 100);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, display: top ? 'none' : 'flex' }}><Presentar /></View>
      {top ? <View testID="arriba" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>{top === '/presentar/salida' ? <Salida /> : <Escenario />}</View> : null}
    </View>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
