// Fotos de fondo para el versículo del día: paisajes de Unsplash (licencia libre, se pueden usar sin pagar).
// Cada día toca una distinta y no se repite en seis semanas. Las baja el teléfono directo de Unsplash.
const DAILY_PHOTOS = [
  'photo-1595024600400-2a49b9fce270', // campo de trigo con nubes
  'photo-1600721860729-d90ff446f6fa', // trigo al sol
  'photo-1646684662890-a5076aef9010', // espigas y cielo azul
  'photo-1530464684439-723262c0d16e', // campo al atardecer
  'photo-1678028204645-df95d07e2523', // sol poniéndose sobre el campo
  'photo-1540979388789-6cee28a1cdc9', // montaña sobre las nubes
  'photo-1542224566-6e85f2e6772f', // sierra al amanecer
  'photo-1595495745827-85bcc5c9a028', // atardecer en las sierras
  'photo-1594329852649-012d9528deda', // lago entre bosques
  'photo-1533387520709-752d83de3630', // montañas doradas
  'photo-1574726252024-83b799196f99', // niebla dorada
  'photo-1603976328262-4c1b46d7e6e8', // bosque con luz
  'photo-1567699631772-21be4f5ef2ce', // bosque con niebla
  'photo-1502143655672-dbd02dd6abb6', // sendero en la niebla
  'photo-1588001832198-c15cff59b078', // mar al atardecer
  'photo-1559494007-9f5847c49d94', // playa al atardecer
  'photo-1501436513145-30f24e19fcc8', // agua dorada
  'photo-1569879925512-85ee9bf5c538', // mar y nubes
  'photo-1765200135122-6e0e9e14da76', // valle con río
  'photo-1693825207937-b1fa40db8279', // lago y montañas
  'photo-1525824236856-8c0a31dfe3be', // cascada
  'photo-1523224949444-170258978eef', // cascada en el bosque
  'photo-1546882588-d9bd63f85a7e', // cascada y laguna
  'photo-1513002749550-c59d786b8e6c', // sobre las nubes
  'photo-1597571063304-81f081944ee8', // nubes y cielo azul
  'photo-1783180340813-1fb4efc59a76', // nubes blancas
  'photo-1560803262-95a9de00a057', // nubes rosadas
  'photo-1436891620584-47fd0e565afb', // noche estrellada sobre el lago
  'photo-1596003903067-bf5762ad5c19', // lago entre montañas verdes
  'photo-1786626900700-87b5d049eef0', // canoa en el lago
  'photo-1778510093540-0da0986f7d95', // montaña nevada reflejada
  'photo-1597060330071-69c1ac998254', // lago al amanecer
  'photo-1559778837-17df39486b2c', // lago y árboles
  'photo-1523437237164-d442d57cc3c9', // campo de amapolas
  'photo-1761990386038-31ff9e9bf70e', // flores en la montaña
  'photo-1568531629409-8f1f0232e30b', // flores silvestres
  'photo-1600340053706-32d1278206ef', // rayos de sol en el bosque
  'photo-1566231270035-0aaca1fd2bbf', // camino con sol
  'photo-1587290494402-1bdfbd34930f', // escalera en el bosque
  'photo-1653999558978-728ea16de7a4', // pastos y sol
  'photo-1653999277784-4e4f27507048', // atardecer en el pastizal
  'photo-1722760741183-18600b4bf66b', // cataratas con arcoíris
];

/** La foto que toca para una fecha (AAAA-MM-DD). */
export function dailyPhotoId(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const days = Math.floor(Date.UTC(y || 2026, (m || 1) - 1, d || 1) / 86400000);
  return DAILY_PHOTOS[((days % DAILY_PHOTOS.length) + DAILY_PHOTOS.length) % DAILY_PHOTOS.length];
}

/** Foto elegida a mano para un versículo: el fondo se guarda como "u:<id de Unsplash>". */
export function chosenPhotoId(background: string | null | undefined): string | null {
  return background && background.startsWith('u:') && background.length > 2 ? background.slice(2) : null;
}

/** Dirección de la foto, recortada al tamaño que se va a mostrar. */
export function photoUrl(id: string, width: number, height: number, quality = 75): string {
  const w = Math.min(1440, Math.max(200, Math.round(width)));
  const h = Math.min(2560, Math.max(200, Math.round(height)));
  return `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&crop=entropy&q=${quality}&auto=format`;
}

export const DAILY_PHOTO_COUNT = DAILY_PHOTOS.length;
