import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSIONS } from '../src/lib/bible';
import { autoNext, autoOf, cleanItems, cleanLive, itemSlides, newItem, stageOf, type Slide } from '../src/lib/present';
import { announcementCards, dayWords, matchSong, planToItems, whenWords } from '../src/lib/presentExtras';
import { cleanItems as cleanPlanItems } from '../src/lib/servicePlan';
import { ALL_PERMS, canPresent, rolePerms } from '../src/lib/perms';
import { deskNavFor } from '../src/lib/desk';

const rv = VERSIONS[0];
// Martes 24 de noviembre de 2026, 10 de la mañana (hora del aparato).
const now = new Date(2026, 10, 24, 10, 0, 0);
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const all = { days: 7, ahead: 14, anns: true, events: true, weekly: false };
const ev = (title: string, starts_at: string, extra: Partial<{ ends_at: string | null; all_day: boolean; place: string | null; weekly: boolean; yearly: boolean }> = {}) =>
  ({ title, starts_at, ends_at: null, all_day: false, place: null, weekly: false, yearly: false, ...extra });

test('dayWords y whenWords', () => {
  assert.equal(dayWords(new Date(2026, 10, 24, 20), now), 'Hoy');
  assert.equal(dayWords(new Date(2026, 10, 25, 9), now), 'Mañana');
  assert.equal(dayWords(new Date(2026, 10, 28, 19), now), 'Sábado 28 de noviembre');
  assert.equal(whenWords(new Date(2026, 10, 28, 19, 30), null, false, now), 'Sábado 28 de noviembre · 19:30 h');
  assert.equal(whenWords(new Date(2026, 10, 28), null, true, now), 'Sábado 28 de noviembre');
  assert.equal(whenWords(new Date(2026, 10, 28, 9), new Date(2026, 11, 2, 18), false, now), 'Del 28 de noviembre al 2 de diciembre');
});

test('anuncios: solo los de toda la iglesia y de los últimos días, el más nuevo primero', () => {
  const cards = announcementCards([
    { title: 'Viejo', body: 'x', audience: 'all', created_at: at(2026, 11, 10, 9) },
    { title: 'Ensayo', body: 'Jueves a las 20', audience: 'all', created_at: at(2026, 11, 20, 9) },
    { title: 'Solo líderes', body: 'reunión', audience: 'leaders', created_at: at(2026, 11, 23, 9) },
    { title: 'Ofrenda especial', body: 'El domingo', audience: 'all', created_at: at(2026, 11, 23, 12) },
    { title: 'De un grupo', body: 'x', audience: 'group', created_at: at(2026, 11, 23, 12) },
  ], [], all, now);
  assert.deepEqual(cards, [{ title: 'Ofrenda especial', body: 'El domingo' }, { title: 'Ensayo', body: 'Jueves a las 20' }]);
  assert.deepEqual(announcementCards([{ title: 'Ensayo', body: 'x', audience: 'all', created_at: at(2026, 11, 20) }], [], { ...all, anns: false }, now), []);
  // Los textos largos se cortan para que entren en la pantalla.
  const long = announcementCards([{ title: 'T', body: 'palabra '.repeat(200), audience: 'all', created_at: at(2026, 11, 23) }], [], all, now)[0];
  assert.ok(long.body.length <= 420 && long.body.endsWith('…'));
});

test('eventos: los que vienen, por fecha, con día, hora y lugar', () => {
  const events = [
    ev('Campamento', at(2026, 12, 4, 8), { ends_at: at(2026, 12, 6, 18), place: 'Quinta del río' }),
    ev('Cena de matrimonios', at(2026, 11, 28, 21), { place: 'Salón' }),
    ev('Ya pasó', at(2026, 11, 20, 19)),
    ev('Muy lejos', at(2027, 1, 20, 19)),
    ev('Hoy a la noche', at(2026, 11, 24, 20)),
    ev('Hoy temprano', at(2026, 11, 24, 6)),
    ev('Reunión de jóvenes', at(2026, 11, 7, 19), { weekly: true }),
    ev('Aniversario', at(2020, 11, 29, 10), { yearly: true, all_day: true }),
  ];
  const cards = announcementCards([], events, all, now);
  assert.deepEqual(cards, [
    { title: 'Hoy a la noche', body: 'Hoy · 20:00 h' },
    { title: 'Cena de matrimonios', body: 'Sábado 28 de noviembre · 21:00 h\nSalón' },
    { title: 'Aniversario', body: 'Domingo 29 de noviembre' },
    { title: 'Campamento', body: 'Del 4 de diciembre al 6 de diciembre\nQuinta del río' },
  ]);
  // Con las reuniones de todas las semanas: la próxima vez que toca (el 7 fue sábado).
  const weekly = announcementCards([], events, { ...all, weekly: true }, now);
  assert.ok(weekly.some((c) => c.title === 'Reunión de jóvenes' && c.body === 'Sábado 28 de noviembre · 19:00 h'));
  assert.deepEqual(announcementCards([], events, { ...all, events: false }, now), []);
  // Un evento de varios días que ya empezó sigue saliendo hasta que termina.
  const going = announcementCards([], [ev('Conferencia', at(2026, 11, 22, 9), { ends_at: at(2026, 11, 25, 22) })], all, now);
  assert.equal(going.length, 1);
});

test('la parte "Anuncios de la app": diapositivas, avance solo y vuelta al principio', () => {
  const it = { ...newItem('announcements'), cards: [{ title: 'A', body: 'uno' }, { title: 'B', body: 'dos' }], secs: 8 };
  assert.deepEqual(itemSlides(it, rv), [{ kind: 'notice', title: 'A', body: 'uno' }, { kind: 'notice', title: 'B', body: 'dos' }]);
  assert.deepEqual(autoOf(it), { ms: 8000, loop: true });
  assert.equal(autoOf({ ...newItem('song') }), null);
  const song = cleanItems([{ id: 's', type: 'song', title: 'T', lyrics: 'x', auto: true, secs: 10, speed: 2 }])[0];
  assert.deepEqual(autoOf(song), { ms: 5000, loop: false });
  assert.equal(autoOf(newItem('text')), null);
  // Los anuncios vuelven a empezar; la canción se queda en la última.
  assert.equal(autoNext(3, 0, true), 1);
  assert.equal(autoNext(3, 2, true), 0);
  assert.equal(autoNext(3, 2, false), null);
  assert.equal(autoNext(1, 0, true), null);
  assert.equal(autoNext(0, -1, true), null);
});

test('cleanItems entiende las partes nuevas y acomoda sus números', () => {
  const items = cleanItems([
    { id: 'a', type: 'announcements', title: 'Anuncios', secs: 1, days: 500, ahead: 0, cards: [{ title: 'Hola', body: 'x' }, { title: '', body: '' }, 'roto'], loadedAt: 5 },
    { id: 'p', type: 'sermon', title: 'Prédica', outline: 'Título\nJuan 3:16', perSlide: 9 },
  ]);
  const a = items[0];
  assert.ok(a.type === 'announcements' && a.secs === 2 && a.days === 60 && a.ahead === 1 && a.anns && a.events && !a.weekly && a.cards.length === 1 && a.loadedAt === 5);
  assert.ok(items[1].type === 'sermon' && items[1].perSlide === 4 && items[1].version === 'rv1909');
});

test('vista de escenario: qué sigue', () => {
  const t = (text: string, label: string | null = null): Slide => ({ kind: 'text', text, label, footer: null });
  const parts = [
    { title: 'Canción uno', slides: [t('a'), t('b', 'Coro')], loop: false },
    { title: 'Música', slides: [], loop: false },
    { title: 'Anuncios', slides: [{ kind: 'notice', title: 'Cena', body: 'Sábado' } as Slide, { kind: 'notice', title: 'Campamento', body: '' } as Slide], loop: true },
    { title: 'Juan 3:16', slides: [{ kind: 'text', text: 'Porque de tal manera', label: null, footer: 'Juan 3:16 (RV1909)' } as Slide], loop: false },
  ];
  assert.deepEqual(stageOf(parts, { item: 0, slide: 0 }), { next: 'b', nextLabel: 'Coro', item: 'Canción uno', n: 1, total: 2 });
  // Al final de una parte, sigue la primera de la próxima que tenga diapositivas, y se avisa cuál es.
  assert.deepEqual(stageOf(parts, { item: 0, slide: 1 }), { next: 'Cena\nSábado', nextLabel: 'Sigue: Anuncios', item: 'Canción uno', n: 2, total: 2 });
  // Los anuncios dan vueltas: después del último viene el primero.
  assert.equal(stageOf(parts, { item: 2, slide: 1 })!.next, 'Cena\nSábado');
  assert.deepEqual(stageOf(parts, { item: 3, slide: 0 }), { next: null, nextLabel: null, item: 'Juan 3:16', n: 1, total: 1 });
  assert.equal(stageOf(parts, { item: 1, slide: 0 }), null);
  assert.equal(stageOf(parts, { item: 9, slide: 0 }), null);
});

test('cleanLive deja pasar lo de la vista de escenario, revisado', () => {
  const base = { v: 1, mode: 'slide', slide: { kind: 'text', text: 'Hola', label: null, footer: null }, stamp: 'a', at: 100 };
  assert.equal(cleanLive(base)!.stage, undefined);
  const s = cleanLive({ ...base, stage: { next: 'x'.repeat(5000), nextLabel: 7, item: 'Canción', n: 2.4, total: 3 } })!.stage!;
  assert.equal(s.next!.length, 1200);
  assert.deepEqual([s.nextLabel, s.item, s.n, s.total], [null, 'Canción', 2, 3]);
  assert.deepEqual(cleanLive({ v: 1, mode: 'black', slide: null, stamp: 'b', at: 1, stage: { next: null, item: 'X', n: 1, total: 1 } })!.stage, { next: null, nextLabel: null, item: 'X', n: 1, total: 1 });
});

test('orden del culto: canciones del Cancionero, lecturas y lo demás', () => {
  const songs = [
    { id: 's1', title: 'Sublime gracia', lyrics: 'Sublime gracia del Señor\nque a un infeliz salvó' },
    { id: 's2', title: 'Cuán grande es Él', lyrics: 'Señor mi Dios' },
    { id: 's3', title: 'Santo', lyrics: 'Santo, santo' },
    { id: 's4', title: 'Santo, santo, santo', lyrics: 'Santo, santo, santo' },
  ];
  assert.equal(matchSong({ title: 'otra cosa', songId: 's2' }, songs)!.id, 's2');
  assert.equal(matchSong({ title: 'SUBLIME GRACIA', songId: null }, songs)!.id, 's1');
  assert.equal(matchSong({ title: 'cuan grande es el', songId: 'borrada' }, songs)!.id, 's2');
  assert.equal(matchSong({ title: 'Cuán grande es Él (2 estrofas)', songId: null }, songs)!.id, 's2');
  assert.equal(matchSong({ title: 'Santo', songId: null }, songs)!.id, 's3');
  assert.equal(matchSong({ title: 'No existe', songId: null }, songs), null);
  assert.equal(matchSong({ title: '', songId: null }, songs), null);

  // Tal como lo guarda la pantalla del orden del culto (servicePlan.ts).
  const plan = cleanPlanItems([
    { id: '1', type: 'prayer', title: 'Oración', whoName: 'Hermano Ejemplo' },
    { id: '2', type: 'song', title: 'Otro nombre', songId: 's1' },
    { id: '3', type: 'song', title: 'cuan grande es el' },
    { id: '4', type: 'song', title: 'Una que no está' },
    { id: '5', type: 'song' },
    { id: '6', type: 'notices' },
    { id: '7', type: 'offering' },
    { id: '8', type: 'reading', title: 'Lectura bíblica', ref: 'Salmos 23', whoName: 'Hermana Ejemplo' },
    { id: '9', type: 'reading', ref: 'Jn 3:16-18' },
    { id: '10', type: 'reading', title: 'Lectura a elección' },
    { id: '11', type: 'sermon', title: 'Cántaros vacíos', note: '2 Reyes 4:1-7' },
    { id: '12', type: 'sermon', title: 'Sin citas', note: 'traer el cántaro de ejemplo' },
    { id: '13', type: 'other', title: 'Despedida' },
    { id: '14', type: 'algo raro' },
  ]);
  const items = planToItems(plan, songs);
  assert.deepEqual(items.map((i) => i.type), ['notice', 'song', 'song', 'song', 'song', 'announcements', 'notice', 'passage', 'passage', 'notice', 'sermon', 'sermon', 'notice', 'notice']);
  assert.ok(items[0].type === 'notice' && items[0].title === 'Oración' && items[0].body === 'Hermano Ejemplo');
  assert.ok(items[1].type === 'song' && items[1].songId === 's1' && items[1].title === 'Sublime gracia' && items[1].lyrics.startsWith('Sublime'));
  assert.ok(items[2].type === 'song' && items[2].songId === 's2');
  assert.ok(items[3].type === 'song' && items[3].songId === null && items[3].title === 'Una que no está' && items[3].lyrics === '');
  assert.ok(items[4].type === 'song' && items[4].songId === null && items[4].title === 'Canción');
  assert.ok(items[6].type === 'notice' && items[6].title === 'Ofrenda' && items[6].body === '');
  assert.ok(items[7].type === 'passage' && items[7].ref === 'Salmos 23' && itemSlides(items[7], rv).length === 6);
  assert.ok(items[8].type === 'passage' && items[8].ref === 'Juan 3:16-18' && itemSlides(items[8], rv).length === 3);
  assert.ok(items[9].type === 'notice' && items[9].title === 'Lectura a elección');
  assert.ok(items[10].type === 'sermon' && itemSlides(items[10], rv).length === 8);
  // La nota de la prédica sin citas no va a la pantalla.
  assert.ok(items[11].type === 'sermon' && items[11].outline === 'Sin citas');
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.deepEqual(planToItems([], songs), []);
});

test('permiso del Modo presentación: el pastor siempre, los demás solo si se lo dan', () => {
  assert.ok(ALL_PERMS.includes('presentar.usar'));
  // Con su rol lo traen solo el pastor y el administrador de la app.
  for (const r of ['admin', 'app_admin']) assert.ok(rolePerms(r).includes('presentar.usar'), r);
  for (const r of ['assistant_pastor', 'secretary', 'deacon', 'captain', 'evangelism', 'member']) assert.ok(!rolePerms(r).includes('presentar.usar'), r);
  assert.equal(canPresent([], { role: 'member' }), false);
  assert.equal(canPresent(['personas.ver_todas', 'inf.panel'], { role: 'captain', extra_roles: ['deacon'] }), false);
  assert.equal(canPresent(['presentar.usar'], { role: 'member' }), true);
  // El pastor entra aunque la base todavía no conozca el permiso nuevo.
  assert.equal(canPresent([], { role: 'admin' }), true);
  assert.equal(canPresent([], { role: 'member', extra_roles: ['app_admin'] }), true);
  assert.equal(canPresent([], null), false);
  // En el menú de la computadora aparece solo con el permiso.
  const has = (perms: string[]) => deskNavFor(perms).some((g) => g.items.some((i) => i.key === 'presentar'));
  assert.equal(has(['personas.ver_todas', 'inf.panel']), false);
  assert.equal(has(['presentar.usar']), true);
});
