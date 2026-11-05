// Configuración de la app. Toma app.json y agrega lo que no debe estar en el código:
// la clave de Google Maps para Android viene de una variable de entorno (EAS → Environment variables).
const base = require('./app.json');

module.exports = () => {
  const expo = { ...base.expo };
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (mapsKey) {
    expo.android = { ...expo.android, config: { ...(expo.android?.config ?? {}), googleMaps: { apiKey: mapsKey } } };
  }
  return { expo };
};
