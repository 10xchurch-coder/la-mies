// Listas, canciones, anuncios y eventos de mentira. La lista se guarda en localStorage para ver qué se guardó.
const KEY = 'harness-set';
const w = window as unknown as { __saves?: number; __failSaves?: number };
const today = new Date();
const day = (n: number, h = 19, m = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n, h, m).toISOString();

const LONG = Array.from({ length: 8 }, (_, i) => `Esta es una línea bastante larga de la estrofa número ${i + 1} de la canción`).join('\n');
export const FIXTURE = [
  { id: 'cuenta', type: 'countdown', title: 'Cuenta regresiva', minutes: 2, message: 'Ya empezamos' },
  { id: 'cancion', type: 'song', title: 'Canción de prueba', songId: 's1', lyrics: 'Primera estrofa\nsegunda línea\n\n[Coro]\nAleluya\nAleluya\n\nEstrofa final\ncon su línea', auto: false, secs: 2, speed: 1, audio: { path: 'c1/pista.mp3', name: 'pista.mp3' } },
  { id: 'musica', type: 'music', title: 'Música de fondo', media: { path: 'c1/fondo.mp3', name: 'fondo.mp3' } },
  { id: 'pasaje', type: 'passage', title: '', ref: 'Juan 3:16-18', version: 'rv1909', perSlide: 1 },
  { id: 'foto', type: 'image', title: 'Foto', media: { path: 'c1/foto.png', name: 'foto.png' } },
  { id: 'video', type: 'video', title: 'Video', media: { path: 'c1/video.mp4', name: 'video.mp4' } },
  { id: 'texto', type: 'text', title: 'Texto', body: 'Bienvenidos\n\nGracias por venir' },
  { id: 'aviso', type: 'notice', title: 'Reunión de jóvenes', body: 'Sábado a las 19 en la iglesia' },
  { id: 'mayus', type: 'song', title: 'Canción en mayúsculas', songId: 's3', lyrics: 'CUÁN GRANDE ES ÉL, MI DIOS Y SALVADOR\nMI CORAZÓN ENTONA LA CANCIÓN\nCUÁN GRANDE ES ÉL, CUÁN GRANDE ES ÉL\nMI CORAZÓN ENTONA LA CANCIÓN\nWWWWW MMMMM WWWWW MMMMM WWWWW MMMMM', auto: false, secs: 15, speed: 1, audio: null },
  { id: 'palabras', type: 'text', title: 'Texto apretado', body: 'Supercalifragilisticoespialidoso-otorrinolaringologicamente-electroencefalografista\n\n' + 'Un párrafo largo sin saltos de línea que tiene que cortarse solo en varios renglones para entrar en la pantalla sin salirse por abajo ni por los costados. '.repeat(3) },
  { id: 'renglones', type: 'song', title: 'Canción de renglones medianos', songId: null, lyrics: 'Sublime gracia del Señor\nque a un infeliz salvó\nfui ciego mas hoy miro yo\nperdido y Él me halló', auto: false, secs: 15, speed: 1, audio: null },
  { id: 'larga', type: 'song', title: 'Canción larga', songId: 's2', lyrics: LONG, auto: false, secs: 15, speed: 1, audio: null },
];
export const getPresentSet = async (id: string) => {
  const raw = localStorage.getItem(KEY);
  const saved = raw ? JSON.parse(raw) : null;
  return { id, name: saved?.name ?? 'Culto de prueba', items: saved?.items ?? FIXTURE, updated_at: new Date().toISOString() };
};
export const listPresentSets = async () => [{ id: 'set1', name: 'Culto de prueba', updated_at: new Date().toISOString() }];
export const createPresentSet = async () => 'set1';
export const deletePresentSet = async () => undefined;
export const savePresentSet = async (_id: string, name: string, items: unknown[]) => {
  if ((w.__failSaves ?? 0) > 0) { w.__failSaves!--; throw new Error('sin conexión'); }
  w.__saves = (w.__saves ?? 0) + 1;
  localStorage.setItem(KEY, JSON.stringify({ name, items }));
};
export const listSongs = async () => [
  { id: 's1', title: 'Canción de prueba', author: null, lyrics: 'Primera estrofa\n\n[Coro]\nAleluya', spotify_url: null, youtube_url: null, song_key: null, position: 0, created_at: '' },
  { id: 's2', title: 'Sublime gracia', author: null, lyrics: 'Sublime gracia del Señor\nque a un infeliz salvó\n\nFui ciego mas hoy miro yo\nperdido y Él me halló', spotify_url: null, youtube_url: null, song_key: null, position: 1, created_at: '' },
];
export const listAnnouncements = async () => [
  { id: 'a1', church_id: 'c1', author_id: null, title: 'Ensayo del coro', body: 'Jueves a las 20 en el templo.', audience: 'all', ministry_id: null, group_id: null, sent_to: 10, created_at: day(-1, 9) },
  { id: 'a2', church_id: 'c1', author_id: null, title: 'Solo para líderes', body: 'No tiene que salir en el proyector.', audience: 'leaders', ministry_id: null, group_id: null, sent_to: 3, created_at: day(-1, 10) },
  { id: 'a3', church_id: 'c1', author_id: null, title: 'Anuncio viejo', body: 'De hace un mes.', audience: 'all', ministry_id: null, group_id: null, sent_to: 10, created_at: day(-30, 10) },
];
export const listEvents = async () => [
  { id: 'e1', church_id: 'c1', title: 'Cena de matrimonios', starts_at: day(4, 21), ends_at: null, all_day: false, place: 'Salón de la iglesia', description: null, weekly: false, source_id: null },
  { id: 'e2', church_id: 'c1', title: 'Evento lejano', starts_at: day(80, 21), ends_at: null, all_day: false, place: null, description: null, weekly: false, source_id: null },
];
