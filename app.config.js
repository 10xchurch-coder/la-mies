// Configuración de la app. Expo lee app.json y la pasa acá como "config"; agregamos lo que no debe
// estar en el código: la clave de Google Maps para Android viene de EAS (Environment variables).
//
// Ojo: Expo quita "android.config" de la configuración que la app puede leer mientras corre
// (Constants.expoConfig), aunque la clave sí queda en la app de Android. Por eso, además de la
// clave, dejamos en "extra" una marca (sin la clave) para que la app sepa que el mapa está activo.
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (mapsKey) {
    config.android = { ...config.android, config: { ...(config.android?.config ?? {}), googleMaps: { apiKey: mapsKey } } };
  }
  config.extra = { ...(config.extra ?? {}), googleMapsAndroid: !!mapsKey };
  return config;
};
