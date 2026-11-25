// De dónde sale cada texto y cada ayuda de la Biblia que trae la app, y con qué permiso se usa.
// Se muestra en "Acerca de los textos". Si se suma un texto nuevo, se anota acá (hay una prueba que lo revisa).

import { tx } from './i18n';
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
    get title() { return tx('Reina-Valera 1909'); },
    get what() { return tx('La Biblia en español que trae la app.'); },
    licence: 'Dominio público',
    get detail() { return tx('Texto de 1909. Ya no tiene derechos de autor: se puede copiar, compartir e imprimir libremente.'); },
    source: 'Proyecto scrollmapper/bible_databases en GitHub (texto “SpaRV”, marcado “Public Domain”).',
  },
  {
    version: 'rvg',
    get title() { return tx('Reina Valera Gómez'); },
    get what() { return tx('La Biblia en español revisada por el Dr. Humberto Gómez.'); },
    get licence() { return tx('Usada con permiso'); },
    get detail() { return tx('Tiene dueño. Está en la app con permiso de su editor. No se cambió ninguna palabra del texto.'); },
    get source() { return tx('Archivo de Word con el texto completo, entregado por el editor (noviembre de 2026).'); },
  },
  {
    version: 'kjv',
    get title() { return tx('King James Version'); },
    get what() { return tx('La Biblia en inglés (texto de 1769), para quien lee en inglés.'); },
    licence: 'Dominio público',
    get detail() { return tx('La fuente dice: “This work is in the Public Domain”. Solo en el Reino Unido la Corona guarda el derecho de imprimirla; fuera de ahí es de dominio público.'); },
    source: 'eBible.org, archivo eng-kjv.osis.xml del proyecto seven1m/open-bibles en GitHub (marcado “Public Domain”). No se incluyen los libros apócrifos.',
  },
  {
    get title() { return tx('Referencias cruzadas'); },
    get what() { return tx('Los versículos relacionados que aparecen al tocar “Referencias”. Son unas 340.000.'); },
    licence: 'CC BY (Creative Commons Atribución)',
    get detail() { return tx('Se pueden usar y compartir si se dice de dónde vienen. Están ordenadas por los votos de la fuente. Nacen del Treasury of Scripture Knowledge (dominio público) y de otros aportes.'); },
    source: 'OpenBible.info, www.openbible.info/labs/cross-references (archivo del 4 de noviembre de 2024, copia en scrollmapper/bible_databases).',
    credit: 'Referencias cruzadas: OpenBible.info, licencia CC BY.',
  },
  {
    get title() { return tx('Palabras originales (hebreo y griego, con números de Strong)'); },
    get what() { return tx('Lo que aparece al tocar “Palabras originales”: cada palabra del versículo en hebreo o griego, su número de Strong y qué quiere decir. Las explicaciones están en inglés.'); },
    licence: 'CC BY 4.0 (Creative Commons Atribución)',
    get detail() { return tx('Cada archivo de la fuente dice: “Data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0)”. Se pueden usar y compartir si se dice de dónde vienen y qué se cambió. Acá solo se cambió el formato: al hebreo se le quitaron los acentos de canto y a todo la puntuación; no se cambió ninguna palabra ni número. Del griego se usan las palabras del texto tradicional (el de la Reina-Valera y la King James). La explicación larga está solo para el griego (léxico de Abbott-Smith, de dominio público, adaptado por Tyndale House). La del hebreo no se incluye: la fuente avisa que esa parte es de Online Bible y necesita un permiso aparte. Tampoco se incluyen las traducciones palabra por palabra ni la gramática, que vienen de otros proyectos.'); },
    source: 'STEPBible-Data, STEPBible.github.io/STEPBible-Data (archivos TAHOT, TAGNT, TBESH y TBESG; copia del 2 de noviembre de 2026).',
    credit: 'Palabras originales: STEP Bible (www.STEPBible.org), con datos de Tyndale House, Cambridge. Licencia CC BY 4.0. Fuente: STEPBible.github.io/STEPBible-Data',
  },
];

/** Textos que NO están en la app porque tienen dueño y hace falta permiso. */
export const BIBLE_NOT_INCLUDED: { title: string; why: string }[] = [
  { get title() { return tx('Reina-Valera 1960'); }, get why() { return tx('Tiene derechos de autor (Sociedades Bíblicas Unidas). Para ponerla en la app hay que pedir permiso por escrito.'); } },
];
