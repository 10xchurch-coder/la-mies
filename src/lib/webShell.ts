// En la web y en la app de escritorio: guarda la app misma (no los datos) para que abra sin internet.
// Los datos los guarda netFetch.ts.
const CACHE = 'lamies-shell-v1';

export function registerWebShell(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('caches' in window)) return;
  if (typeof __DEV__ !== 'undefined' && __DEV__) return;
  const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
  const scope = `${base}/`;
  navigator.serviceWorker.register(`${scope}sw.js`, { scope }).then(async () => {
    // Lo que ya se cargó en esta visita (la página y sus archivos) queda guardado desde ahora.
    const here = window.location.origin;
    const loaded = performance.getEntriesByType('resource').map((e) => e.name)
      .concat(Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src))
      .filter((u) => u.startsWith(`${here}${scope}`) && !u.endsWith('/sw.js'));
    const urls = [...new Set(loaded)];
    const cache = await caches.open(CACHE);
    await cache.add(new Request(scope, { cache: 'reload' })).catch(() => undefined);
    const add = (u: string) => cache.match(u).then((hit) => (hit ? undefined : cache.add(u).catch(() => undefined)));
    await Promise.all(urls.map(add));

    // El programa viene partido en muchos archivos (uno por pantalla) que se bajan recién al abrir cada pantalla.
    // Sus nombres están dentro de los archivos principales: se bajan todos ahora, de a poco, para que
    // cualquier pantalla abra sin internet aunque nunca se haya abierto antes.
    const all = new Set(urls);
    const mains = urls.filter((u) => /\/_expo\/static\/js\/web\/(entry|__common)-/.test(u));
    const names = /["'](\/[^"'\s]*?\/(?:_expo\/static|assets)\/[^"'\s]+?\.(?:js|css|ttf|otf|woff2?|png|jpe?g|svg))["']/g;
    for (const main of mains) {
      const text = await (await cache.match(main))?.text().catch(() => '') ?? '';
      for (const m of text.matchAll(names)) if (m[1].startsWith(scope)) all.add(here + m[1]);
    }
    const rest = [...all].filter((u) => !urls.includes(u));
    for (let i = 0; i < rest.length; i += 4) await Promise.all(rest.slice(i, i + 4).map(add));

    // Las versiones viejas del programa ya no hacen falta.
    if (mains.length && all.size > 20) {
      for (const req of await cache.keys()) if (req.url.includes('/_expo/static/js/') && !all.has(req.url)) await cache.delete(req);
    }
  }).catch(() => undefined);
}
