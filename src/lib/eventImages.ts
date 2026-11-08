// Fotos automáticas de los eventos según el tema (fotos libres de Unsplash).
// Si el evento tiene una foto o flyer subido, se usa esa.
import { photoUrl } from './backgrounds';

export const EVENT_IMAGES: { key: string; label: string; id: string }[] = [
  { key: 'culto', label: 'Culto', id: 'photo-1438232992991-995b7058bbb3' },
  { key: 'santa_cena', label: 'Santa Cena', id: 'photo-1531627467965-e9c3dd19209c' },
  { key: 'bautismo', label: 'Bautismo', id: 'photo-1646063436480-80b8180877ca' },
  { key: 'futbol', label: 'Fútbol', id: 'photo-1575361204480-aadea25e6e68' },
  { key: 'asado', label: 'Asado', id: 'photo-1599487488170-d11ec9c172f0' },
  { key: 'comida', label: 'Comida', id: 'photo-1528605248644-14dd04022da1' },
  { key: 'feria', label: 'Feria', id: 'photo-1784897390386-ed76ed8f79d6' },
  { key: 'hombres', label: 'Hombres', id: 'photo-1759355642149-17dabf29a07b' },
  { key: 'mujeres', label: 'Mujeres', id: 'photo-1590650046871-92c887180603' },
  { key: 'jovenes', label: 'Jóvenes', id: 'photo-1511632765486-a01980e01a18' },
  { key: 'ninos', label: 'Niños', id: 'photo-1606092195730-5d7b9af1efc5' },
  { key: 'oracion', label: 'Oración', id: 'photo-1437603568260-1950d3ca6eab' },
  { key: 'estudio', label: 'Estudio bíblico', id: 'photo-1509021436665-8f07dbf5bf1d' },
  { key: 'musica', label: 'Música', id: 'photo-1525201548942-d8732f6617a0' },
  { key: 'evangelismo', label: 'Evangelismo', id: 'photo-1627927518258-b67557570840' },
  { key: 'conferencia', label: 'Conferencia', id: 'photo-1540575467063-178a50c2df87' },
  { key: 'campamento', label: 'Campamento', id: 'photo-1504280390367-361c6d9f38f4' },
  { key: 'aniversario', label: 'Aniversario', id: 'photo-1530103862676-de8c9debad1d' },
];

const RULES: [RegExp, string][] = [
  [/f[uú]tbol|partido/i, 'futbol'], [/santa cena|cena del se[nñ]or/i, 'santa_cena'], [/feria/i, 'feria'],
  [/bautismo/i, 'bautismo'], [/conferencia|congreso|fuegos/i, 'conferencia'], [/campamento|retiro/i, 'campamento'],
  [/asado|parrilla|pollo/i, 'asado'], [/hombres|varones|caballeros/i, 'hombres'], [/mujeres|damas|femenil/i, 'mujeres'],
  [/j[oó]venes|juventud|adolescentes/i, 'jovenes'], [/ni[nñ]os|infantil/i, 'ninos'], [/oraci[oó]n|vigilia|ayuno/i, 'oracion'],
  [/aniversario|cumple/i, 'aniversario'], [/evangeli|almas|salida/i, 'evangelismo'], [/m[uú]sica|ensayo|alabanza/i, 'musica'],
  [/estudio|clase|escuela|discipulado/i, 'estudio'], [/desayuno|almuerzo|cena|comida/i, 'comida'], [/culto|servicio|reuni[oó]n/i, 'culto'],
];

/** El tema que corresponde al nombre del evento. */
export function guessImageKey(title: string): string {
  return RULES.find(([re]) => re.test(title))?.[1] ?? 'culto';
}

/** Dirección de la foto automática. */
export function eventImageUrl(key: string | null | undefined, title: string, width: number, height: number): string {
  const k = key || guessImageKey(title);
  const id = (EVENT_IMAGES.find((x) => x.key === k) ?? EVENT_IMAGES[0]).id;
  return photoUrl(id, width, height);
}
