// De dónde sale cada texto y cada ayuda de la Biblia que trae la app, y con qué permiso se usa.
// Se muestra en "Acerca de los textos". Si se suma un texto nuevo, se anota acá (hay una prueba que lo revisa).

export type BibleSource = {
  /** Si es una versión de la Biblia, su id en VERSIONS. */
  version?: string;
  title: string;
  /** Qué es, en palabras simples. */
  what: string;
  /** El permiso, corto: "Dominio público", "CC BY 4.0". */
  licence: string;
  /** Lo que dice la fuente sobre el permiso, o lo que hay que saber. */
  detail: string;
  /** De dónde se tomó. */
  source: string;
  /** Texto de reconocimiento que la licencia pide mostrar. */
  credit?: string;
};

export const BIBLE_SOURCES: BibleSource[] = [
  {
    version: 'rv1909',
    title: 'Reina-Valera 1909',
    what: 'La Biblia en español que trae la app.',
    licence: 'Dominio público',
    detail: 'Texto de 1909. Ya no tiene derechos de autor: se puede copiar, compartir e imprimir libremente.',
    source: 'Proyecto scrollmapper/bible_databases en GitHub (texto “SpaRV”, marcado “Public Domain”).',
  },
  {
    version: 'kjv',
    title: 'King James Version',
    what: 'La Biblia en inglés (texto de 1769), para quien lee en inglés.',
    licence: 'Dominio público',
    detail: 'La fuente dice: “This work is in the Public Domain”. Solo en el Reino Unido la Corona guarda el derecho de imprimirla; fuera de ahí es de dominio público.',
    source: 'eBible.org, archivo eng-kjv.osis.xml del proyecto seven1m/open-bibles en GitHub (marcado “Public Domain”). No se incluyen los libros apócrifos.',
  },
  {
    title: 'Referencias cruzadas',
    what: 'Los versículos relacionados que aparecen al tocar “Referencias”. Son unas 340.000.',
    licence: 'CC BY (Creative Commons Atribución)',
    detail: 'Se pueden usar y compartir si se dice de dónde vienen. Están ordenadas por los votos de la fuente. Nacen del Treasury of Scripture Knowledge (dominio público) y de otros aportes.',
    source: 'OpenBible.info, www.openbible.info/labs/cross-references (archivo del 4 de noviembre de 2024, copia en scrollmapper/bible_databases).',
    credit: 'Referencias cruzadas: OpenBible.info, licencia CC BY.',
  },
];

/** Textos que NO están en la app porque tienen dueño y hace falta permiso. */
export const BIBLE_NOT_INCLUDED: { title: string; why: string }[] = [
  { title: 'Reina-Valera 1960', why: 'Tiene derechos de autor (Sociedades Bíblicas Unidas). Para ponerla en la app hay que pedir permiso por escrito.' },
];
