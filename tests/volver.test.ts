import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// En iPhone no hay botón de "atrás" del sistema: si una pantalla no trae la flecha, la persona queda encerrada
// (pasó con Prédicas). Toda pantalla que usa <Header> tiene que pedir la flecha con `back`; el Header la esconde
// solo cuando la pantalla está en la barra de abajo. Las únicas sin flecha son las de esta lista, a propósito.
const SIN_FLECHA = new Set([
  'app/(tabs)/yo.tsx',   // pestaña fija de la barra de abajo
  'app/empezar.tsx',     // alta de una iglesia nueva: sale con "Ya tengo cuenta: entrar"
  'app/recuperar.tsx',   // contraseña nueva desde el correo: sale al guardar o con "Ir a iniciar sesión"
]);

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

// Devuelve cada etiqueta <Header ...> completa (hasta su '>' de cierre, saltando lo que va entre llaves).
function headers(src: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  for (let i = src.indexOf('<Header'); i !== -1; i = src.indexOf('<Header', i + 1)) {
    if (/[\w.]/.test(src[i + 7] ?? '')) continue; // <HeaderAlgo>, no es el nuestro
    let depth = 0, j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && src[j - 1] !== '=') break;
    }
    out.push({ tag: src.slice(i, j + 1), line: src.slice(0, i).split('\n').length });
  }
  return out;
}

// Saca lo que hay entre llaves para mirar solo los nombres de las propiedades.
function props(tag: string): string {
  let t = tag;
  for (let k = 0; k < 8; k++) t = t.replace(/\{[^{}]*\}/g, '{}');
  return t;
}

test('toda pantalla con encabezado trae la flecha para volver', () => {
  const faltan: string[] = [];
  let vistos = 0;
  for (const f of [...archivos('app'), ...archivos('src/screens')]) {
    const ruta = f.split('\\').join('/');
    for (const h of headers(readFileSync(f, 'utf8'))) {
      vistos++;
      if (!/\sback(\s|=|\/|>)/.test(props(h.tag)) && !SIN_FLECHA.has(ruta)) faltan.push(`${ruta}:${h.line}`);
    }
  }
  assert.ok(vistos > 150, `se esperaban muchos encabezados y se leyeron ${vistos}`);
  assert.deepEqual(faltan, [], 'pantallas sin flecha para volver (agregar `back` al <Header>)');
});

test('Prédicas trae la flecha para volver', () => {
  const h = headers(readFileSync('src/screens/predicas.tsx', 'utf8'));
  assert.equal(h.length, 1);
  assert.match(props(h[0].tag), /\sback(\s|=|\/|>)/);
});
