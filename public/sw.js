// La Mies: guarda la app (la página y sus archivos) para que abra sin internet.
// Con internet siempre se usa lo más nuevo; lo guardado es solo el respaldo.
const CACHE = 'lamies-shell-v1';
const scope = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope)) return;

  // Abrir la app: primero internet; si no hay, la página guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.open(CACHE).then((c) => c.match(scope)).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Archivos con nombre único (no cambian nunca): si ya están guardados, se usan directo.
  const fixed = url.pathname.includes('/_expo/static/') || url.pathname.includes('/assets/');
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit && fixed) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        if (hit) return hit;
        throw e;
      }
    }),
  );
});
