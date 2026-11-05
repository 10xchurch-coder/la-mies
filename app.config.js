// Configuración de la app. Expo lee app.json y la pasa acá como "config"; agregamos lo que no debe
// estar en el código: la clave de Google Maps para Android viene de EAS (Environment variables).
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (mapsKey) {
    config.android = { ...config.android, config: { ...(config.android?.config ?? {}), googleMaps: { apiKey: mapsKey } } };
  }
  return config;
};
