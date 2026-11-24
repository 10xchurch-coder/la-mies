// Banco de pruebas del Modo presentación (NO va en la app). Arma las pantallas de verdad (operador, salida,
// escenario y control) con datos de mentira, sin entrar a la app ni tocar la base, para probarlas con Playwright.
//   node scripts/presentar-harness/build.mjs [carpeta de salida]     (por defecto /tmp/presentar-harness)
//   python3 scripts/presentar-harness/run.py                         (arma, sirve y prueba)
// Lo que se reemplaza: la sesión, la base (api/supabase), los archivos, el audio, la navegación y los íconos.
// Todo lo demás es el código real: app/presentar/*, src/lib/present*.ts, src/components/PresentSlide.tsx, ui, Screen.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(process.argv[2] ?? '/tmp/presentar-harness');
const stub = (f) => resolve(here, 'stubs', f);

const STUBS = {
  '@/lib/supabase': stub('supabase.ts'),
  '@/lib/api': stub('api.ts'),
  '@/lib/files': stub('files.ts'),
  '@/store/auth': stub('auth.ts'),
  '@/components/BrandFooter': stub('brand.ts'),
  'expo-router': stub('router.tsx'),
  'expo-audio': stub('audio.ts'),
  'expo-status-bar': stub('statusbar.tsx'),
  '@expo/vector-icons': stub('icons.tsx'),
  'react-native-safe-area-context': stub('safearea.tsx'),
  'expo-keep-awake': stub('keepawake.ts'),
};

const plugin = {
  name: 'lamies-harness',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (STUBS[a.path]) return { path: STUBS[a.path] };
      // Dentro de src/ algunos archivos se importan con camino relativo ("./supabase", "./api").
      if (a.importer.startsWith(resolve(root, 'src/lib')) && (a.path === './supabase' || a.path === './api' || a.path === './files')) {
        return { path: STUBS[`@/lib/${a.path.slice(2)}`] };
      }
      if (a.path === 'react-native') return b.resolve('react-native-web', { resolveDir: root, kind: a.kind });
      if (a.path.startsWith('@/')) return b.resolve(`./src/${a.path.slice(2)}`, { resolveDir: root, kind: a.kind });
      return undefined;
    });
  },
};

const pages = { operador: 'presentar', salida: 'presentar/salida', escenario: 'presentar/escenario', control: 'presentar/control', nativo: 'nativo' };
mkdirSync(out, { recursive: true });
await build({
  entryPoints: Object.fromEntries(Object.keys(pages).map((p) => [p, resolve(here, `entry-${p}.tsx`)])),
  outdir: resolve(out, 'js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  sourcemap: 'inline',
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  define: { 'process.env.NODE_ENV': '"development"', 'process.env.EXPO_OS': '"web"', 'process.env.EXPO_BASE_URL': '""', __DEV__: 'true', global: 'window' },
  loader: { '.png': 'dataurl', '.ttf': 'dataurl', '.js': 'jsx' },
  plugins: [plugin],
  absWorkingDir: root,
  logLevel: 'warning',
});
for (const [name, path] of Object.entries(pages)) {
  const dir = resolve(out, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>
<style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style></head><body><div id="root"></div><script src="/js/${name}.js"></script></body></html>`);
}
console.log(`Banco de pruebas armado en ${out}`);
