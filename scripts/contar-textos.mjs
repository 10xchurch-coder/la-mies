// Cuenta los textos que ve la gente (en castellano) dentro de app/ y src/, para estimar cuánto trabajo es agregar inglés.
// Uso: node scripts/contar-textos.mjs
// Lee cada archivo con el compilador de TypeScript y mira: textos entre comillas, plantillas y texto suelto dentro de las pantallas (JSX).
// "Texto para la gente" = tiene letras y parece una frase o una palabra en castellano (no una ruta, un color, una clave ni un nombre de columna).
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) files.push(full);
  }
};
walk(join(root, 'app')); walk(join(root, 'src'));

// Atributos de JSX cuyo valor nunca es texto para leer.
const TECH_ATTR = new Set(['name', 'icon', 'variant', 'tone', 'style', 'key', 'keyboardType', 'autoCapitalize', 'autoComplete', 'behavior', 'contentFit', 'resizeMode',
  'accessibilityRole', 'cachePolicy', 'returnKeyType', 'textContentType', 'pointerEvents', 'mode', 'type', 'href', 'to', 'kind', 'size', 'align', 'testID', 'color']);
const SPANISH = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/;

function isHuman(text) {
  const s = text.trim();
  if (s.length < 2 || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(s)) return false;
  if (SPANISH.test(s)) return true;
  if (/^[#/.@]/.test(s) || /^https?:/.test(s) || /^[a-z0-9_.:-]+$/.test(s) || /^[A-Z0-9_]+$/.test(s)) return false; // rutas, claves, colores, constantes
  if (/^[a-z]+[A-Z]/.test(s) && !/\s/.test(s)) return false; // camelCase
  if (/^(select|insert|update|id,|\*)/i.test(s) && /[,(]/.test(s)) return false; // columnas de la base
  if (/\s/.test(s)) return /[a-záéíóúñ]{3}/.test(s); // una frase
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}[.:!?…]?$/.test(s); // una palabra con mayúscula: "Guardar"
}

const total = { literals: 0, human: 0, words: 0 };
const perFile = [];
const unique = new Set();
for (const file of files) {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let literals = 0; let human = 0; let words = 0;
  const take = (text) => {
    literals++;
    if (!isHuman(text)) return;
    human++; unique.add(text.trim());
    words += text.trim().split(/\s+/).length;
  };
  const visit = (n) => {
    const p = n.parent;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const skip = (p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p)))
        || (p && ts.isPropertyAssignment(p) && p.name === n)
        || (p && ts.isJsxAttribute(p) && TECH_ATTR.has(p.name.getText()))
        || (p && ts.isCallExpression(p) && /^(require|import)$/.test(p.expression.getText()));
      if (!skip) take(n.text);
    } else if (ts.isTemplateExpression(n)) {
      take([n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' … '));
    } else if (ts.isJsxText(n)) {
      if (n.text.trim()) take(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  total.literals += literals; total.human += human; total.words += words;
  if (human) perFile.push({ file: relative(root, file), human, words });
}

const area = (prefix) => perFile.filter((f) => f.file.startsWith(prefix)).reduce((a, f) => ({ human: a.human + f.human, words: a.words + f.words, files: a.files + 1 }), { human: 0, words: 0, files: 0 });
const line = (label, a) => console.log(`${label.padEnd(46)} ${String(a.human).padStart(6)} textos  ${String(a.words).padStart(7)} palabras  ${String(a.files).padStart(4)} archivos`);
console.log(`Archivos revisados (app/ y src/): ${files.length}`);
console.log(`Textos entre comillas, plantillas y texto de pantalla: ${total.literals}`);
console.log(`De esos, textos para la gente (en castellano):         ${total.human}  (${unique.size} distintos, ${total.words} palabras)`);
console.log('');
line('app/ (pantallas)', area('app/'));
line('src/components (piezas de pantalla)', area('src/components'));
line('src/lib (mensajes, etiquetas, textos largos)', area('src/lib'));
line('src/ (todo)', area('src/'));
console.log('');
console.log('Por dónde empezar:');
line('  Menú del teléfono: app/(tabs)', area('app/(tabs)'));
const first = ['app/login.tsx', 'app/registro.tsx', 'app/registro-enviado.tsx', 'app/recuperar.tsx', 'app/ajustes.tsx', 'app/dar.tsx', 'app/oracion.tsx', 'app/eventos.tsx', 'app/predicas.tsx', 'app/chat.tsx', 'app/directorio.tsx', 'app/anuncios.tsx', 'app/cumples.tsx', 'app/mis-ofrendas.tsx', 'src/lib/desk.ts', 'src/lib/features.ts', 'src/components/ui.tsx'];
line('  Entrar, crear cuenta y pantallas del miembro', perFile.filter((f) => first.includes(f.file) || f.file.startsWith('app/devocional') || f.file.startsWith('app/evento')).reduce((a, f) => ({ human: a.human + f.human, words: a.words + f.words, files: a.files + 1 }), { human: 0, words: 0, files: 0 }));
console.log('');
console.log('Los 15 archivos con más textos:');
for (const f of perFile.sort((a, b) => b.human - a.human).slice(0, 15)) console.log(`  ${String(f.human).padStart(5)}  ${f.file}`);
