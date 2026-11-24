// Motor compartido de scripts/i18n-codemod.mjs y scripts/i18n-extract.mjs.
// Lee app/ y src/ con el compilador de TypeScript (con tipos) y decide, texto por texto, si es algo que ve la gente.
// Los que sí, los envuelve en tx('texto en castellano'). Explicado en docs/INGLES.md.
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG = JSON.parse(readFileSync(join(ROOT, 'scripts', 'i18n-config.json'), 'utf8'));

const FN = 'tx';
const FN_LIST = 'txList';
const FN_LOCALE = 'txLocale';
const OURS = new Set([FN, FN_LIST, FN_LOCALE, 't']);

// ---------- Listas de nombres ----------
// Atributos de pantalla que nunca son texto para leer.
const TECH_ATTR = new Set(['name', 'icon', 'variant', 'tone', 'style', 'key', 'keyboardType', 'autoCapitalize', 'autoComplete', 'behavior', 'contentFit', 'resizeMode',
  'accessibilityRole', 'cachePolicy', 'returnKeyType', 'textContentType', 'pointerEvents', 'mode', 'type', 'href', 'to', 'kind', 'size', 'align', 'testID', 'color',
  'id', 'nativeID', 'source', 'src', 'uri', 'className', 'value', 'allow', 'sandbox', 'rel', 'target', 'role', 'fontFamily', 'accept', 'inputMode', 'enterKeyHint', 'importantForAutofill', 'dataDetectorType']);
// Atributos y propiedades que siempre son texto para leer.
const VISIBLE = new Set(['title', 'label', 'placeholder', 'text', 'subtitle', 'message', 'hint', 'description', 'accessibilityLabel', 'accessibilityHint', 'action', 'empty',
  'noneLabel', 'confirmText', 'cancelText', 'confirmLabel', 'cancelLabel', 'headerTitle', 'tabBarLabel', 'emptyText', 'helper', 'help', 'caption', 'heading', 'sub', 'body',
  'promptMessage', 'fallbackLabel', 'notificationTitle', 'notificationBody', 'dialogTitle', 'aria-label', 'unit', 'extra', 'detail', 'why', 'what', 'note', 'problem', 'short', 'long', 'titulo', 'texto', 'ayuda', 'etiqueta']);
// Propiedades de objetos que son claves, valores de la base o cosas técnicas.
const TECH_PROP = new Set(['key', 'id', 'value', 'kind', 'type', 'icon', 'color', 'tone', 'route', 'href', 'path', 'pathname', 'screen', 'column', 'field', 'table', 'event', 'channel',
  'filter', 'fontFamily', 'fontWeight', 'testID', 'mime', 'mimeType', 'ext', 'format', 'locale', 'lang', 'language', 'slug', 'code', 'perm', 'feature', 'segment', 'schema', 'url', 'uri',
  'redirectTo', 'emailRedirectTo', 'attribution', 'allow', 'border', 'data', 'fileName', 'filename', 'verse', 'ref', 'reference', 'versiculo', 'cita', 'book', 'ios', 'android', 'web', 'default',
  'method', 'encoding', 'contentType', 'cacheControl', 'credit', 'source', 'licence', 'license', 'style', 'variant', 'status', 'role', 'backgroundColor', 'textAlign', 'rotate', 'transform', 'display_name', 'utf8', 'bucket', 'storage', 'match', 'col', 'cols', 'Authorization', 'headers', 'apikey']);
// Llamadas cuyos argumentos nunca son texto para la gente.
const TECH_CALL = new Set(['require', 'fetch', 'RegExp', 'openURL', 'canOpenURL', 'log', 'warn', 'error', 'info', 'debug', 'getItem', 'setItem', 'removeItem', 'getItemAsync', 'setItemAsync',
  'startsWith', 'endsWith', 'includes', 'indexOf', 'lastIndexOf', 'split', 'replace', 'replaceAll', 'match', 'test', 'localeCompare', 'padStart', 'padEnd', 'has', 'get', 'delete',
  'addEventListener', 'removeEventListener', 'createElement', 'setAttribute', 'getAttribute', 'querySelector', 'querySelectorAll', 'getElementById', 'select', 'from', 'rpc', 'eq', 'neq',
  'or', 'in', 'is', 'not', 'order', 'on', 'like', 'ilike', 'contains', 'channel', 'reportError', 'push', 'navigate', 'setParams', 'postMessage', 'open', 'defineTask', 'isTaskRegisteredAsync',
  'useLocalSearchParams', 'Symbol', 'getContext', 'toDataURL', 'toBlob', 'append', 'setProperty', 'getPropertyValue', 'loadAsync', 'isLoaded', 'useFonts', 'Set', 'Map', 'encodeURI', 'decodeURIComponent',
  'dynamicImport', 'import', 'insertRule', 'matchMedia', 'registerTaskAsync', 'startLocationUpdatesAsync', 'downloadText', 'downloadBytes', 'downloadView', 'shareCardBlob', 'atob', 'btoa']);
// push/replace sí pueden llevar texto (out.push('frase'), text.replace(...)): se miran aparte.
const ROUTER_ONLY = new Set(['push', 'replace', 'navigate']);
// Llamadas que siempre muestran lo que reciben.
const VISIBLE_CALL = new Set(['alert', 'confirm', 'showActions', 'toast', 'say', 'notify', 'setError', 'setErr', 'setMsg', 'setMessage', 'setNote', 'confirmDelete', 'prompt']);
// Lo que se llama enseguida al cargar el archivo (no más tarde): lo de adentro cuenta como "fuera de función".
const EAGER_METHODS = new Set(['map', 'filter', 'reduce', 'forEach', 'flatMap', 'sort', 'find', 'some', 'every', 'fromEntries', 'entries', 'concat', 'from']);
const COMPARE_CALLS = new Set(['startsWith', 'endsWith', 'includes', 'indexOf', 'has']);
const PREFIX_CALLS = new Set(['startsWith', 'includes', 'indexOf', 'endsWith']);

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']; // solo la lista entera: 'mar' suelto también es martes
const CALENDAR = new Set([...DAYS, ...MONTHS, ...DAYS.map(cap), ...MONTHS.map(cap)]);
const WORDS = new Set([...CONFIG.words, ...CALENDAR]);
function cap(s) { return s[0].toUpperCase() + s.slice(1); }

// ---------- ¿Es un texto para la gente? ----------
const SPANISH = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/;
const LOWER_WORD = /^[a-záéíóúñü]+$/;
const LETTERS = /[A-Za-zÁÉÍÓÚÑáéíóúñü]{2}/;
const BIBLE_REF = /^[1-3]? ?[A-ZÁÉÍÓÚ][a-záéíóúñ]+ \d+(:\d+([-–,]\s?\d+)*)?$/;

/** Cosas que nunca son un texto: direcciones, columnas, estilos, nombres de archivo. */
function techy(s, shown = false) {
  if (/^\*\s*,/.test(s)) return true; // columnas de la base
  if (/^[#/.@]/.test(s) && !/\s/.test(s)) return true;
  if (/^(https?|file|mailto|tel|geo|package|data|blob|lamies|exp):/.test(s) || s.includes('://')) return true;
  if (/^[a-z0-9_]+(\([^)]*\))?(\s*,\s*[a-z0-9_:!.*() ]+)+$/.test(s)) return true; // columnas de la base
  if (/^[a-z_]+=(eq|in|neq|gt|lt)\./.test(s) || /\.(eq|in|is)\./.test(s)) return true; // filtros de la base
  if (/^[a-z-]+(;\s?[a-z-]+)+;?$/.test(s)) return true; // permisos de un iframe
  if (/\b(sans-serif|serif|monospace)\b/.test(s) || /^\d+px\b/.test(s) || /^[a-z-]+\([^)]*\)$/.test(s)) return true; // estilos
  if (/&[a-z]+;/.test(s)) return true;
  if (/<\/?[a-z][a-z0-9]*[\s>]/i.test(s)) return true; // HTML (hojas para imprimir): se revisa a mano
  if (/^[a-z-]+:[^;]+;[a-z-]+:/.test(s) || /\{\s*[a-z-]+:[^}]+\}/.test(s)) return true; // estilos de la web
  if (/^\{\w+\}[/?]/.test(s)) return true;
  if (!shown && BIBLE_REF.test(s)) return true; // "Romanos 6:4" suelto puede ser un dato; donde seguro se muestra sí se traduce
  if (!/\s/.test(s) && /\.(csv|png|jpe?g|zip|pdf|txt|json|xlsx|webp|mp3|m4a)$/i.test(s)) return true;
  return false;
}

/** Regla exigente, para lugares donde podría ser una clave o un valor. */
export function isHuman(text) {
  const s = text.trim();
  if (s.length < 2 || !LETTERS.test(s) || techy(s)) return false;
  if (WORDS.has(s)) return true;
  if (LOWER_WORD.test(s)) return false; // "culto", "vacío": puede ser una clave; se decide por el lugar (ver decide)
  if (!/\s/.test(s)) {
    if (/^[a-z0-9_.:-]+$/.test(s) || /^[A-Z0-9_]+$/.test(s)) return false; // claves, constantes
    if (/^[a-z]+[A-Z]/.test(s)) return false; // camelCase
    if (/[-_/=&?%+]/.test(s) && !SPANISH.test(s)) return false;
    if (SPANISH.test(s)) return true;
    return /^[¿¡(“"]?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,}[.:!?…)”"]*$/.test(s); // una palabra con mayúscula: "Guardar"
  }
  return SPANISH.test(s) || /[a-záéíóúñ]{3}/.test(s);
}

/** "persona"/"personas", "vez"/"veces": dos palabras que empiezan igual (singular y plural), no dos claves cualesquiera. */
const SPANISH_PAIR = (a, b) => !!a && !!b && a !== b && a.slice(0, 2) === b.slice(0, 2) && !/^(true|false)$/.test(a);

/** Regla suelta, para lugares que seguro se muestran (texto de pantalla, title=, Alert). */
export function isShown(text) {
  const s = text.trim();
  if (s.length < 2 || !LETTERS.test(s) || techy(s, true)) return false;
  if (!/\s/.test(s) && /[-_/.:=]/.test(s) && /^[a-z0-9_.:\-/=]+$/.test(s)) return false; // "arrow-left", "no-store"
  if (/^[A-Z0-9_]+$/.test(s) && s.length <= 3) return false; // "OK", "KB"
  return true;
}

// ---------- Archivos ----------
function listFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) files.push(full);
    }
  };
  walk(join(ROOT, 'app')); walk(join(ROOT, 'src'));
  const rel = (f) => relative(ROOT, f).split(sep).join('/');
  return files.filter((f) => !CONFIG.skipFiles.some((p) => (p.endsWith('/') ? rel(f).startsWith(p) : rel(f) === p))).sort();
}

const lit = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '').replace(/[\u2028\u2029]/g, ' ')}'`;

/** Texto de pantalla como lo deja JSX: cada renglón sin espacios a los costados, unidos por un espacio. */
function cookJsx(raw) {
  const lines = raw.replace(/\t/g, ' ').split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    let l = line;
    if (i !== 0) l = l.replace(/^ +/, '');
    if (i !== lines.length - 1) l = l.replace(/ +$/, '');
    if (l) out.push(l);
  });
  return out.join(' ');
}

const ENTITIES = { '&quot;': '"', '&amp;': '&', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': '\u00a0' };
/** Devuelve null si el texto trae algo de HTML que no sabemos pasar (se deja como está y se anota). */
function decodeEntities(s) {
  if (!s.includes('&')) return s;
  let bad = false;
  const out = s.replace(/&[a-zA-Z#0-9]+;/g, (m) => { if (ENTITIES[m] === undefined) { bad = true; return m; } return ENTITIES[m]; });
  return bad ? null : out;
}

/**
 * Recorre todo. Con write=true reescribe los archivos; si no, solo cuenta.
 * Devuelve las claves (los textos en castellano), lo que se dejó para revisar a mano y los archivos cambiados.
 */
export function run({ write = false } = {}) {
  const files = listFiles();
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json');
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, ROOT);
  const program = ts.createProgram({ rootNames: [...new Set([...parsed.fileNames, ...files])], options: { ...parsed.options, noEmit: true } });
  const checker = program.getTypeChecker();

  const keys = new Map(); // clave -> { n, files:Set, holes:[], done:n ya envueltos }
  const review = []; // { file, line, why, text }
  const pending = new Map(); // textos anotados para revisar: clave -> archivo
  const changed = [];
  const stats = { files: files.length, wrapped: 0, already: 0, getters: 0, lists: 0, merged: 0, locales: 0, dynamic: 0 };

  // Paso A: textos que se usan para comparar pedazos (startsWith, includes) en cualquier archivo.
  const markers = new Set();
  const comparedAll = new Set();
  const regexes = [];
  const regexHit = (s) => regexes.some((re) => re.test(s));
  const sources = files.map((f) => program.getSourceFile(f)).filter(Boolean);
  for (const sf of sources) {
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && PREFIX_CALLS.has(n.expression.name.text)) {
        const a = n.arguments[0];
        if (a && ts.isStringLiteralLike(a) && a.text.trim().length >= 4 && /[A-ZÁÉÍÓÚÑ\[¿¡]/.test(a.text) && !ts.isArrayLiteralExpression(n.expression.expression)) markers.add(a.text.trim());
      }
      const addC = (x) => { if (x && ts.isStringLiteralLike(x) && x.text.trim()) comparedAll.add(x.text); };
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind)) { addC(n.left); addC(n.right); }
      else if (ts.isCaseClause(n)) addC(n.expression);
      else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && COMPARE_CALLS.has(n.expression.name.text)) addC(n.arguments[0]);
      // Expresiones regulares que buscan una palabra (/cancel/i): un texto que coincida no se puede traducir si después se lo busca así.
      if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
        const m = n.text.match(/^\/(.*)\/([a-z]*)$/s);
        // Solo las que miran un mensaje de error: /cancel/i.test(msg), e.message.match(/.../).
        const call = n.parent && ts.isPropertyAccessExpression(n.parent) && ts.isCallExpression(n.parent.parent) ? n.parent.parent : n.parent && ts.isCallExpression(n.parent) ? n.parent : null;
        const about = call ? call.getText(sf) : '';
        if (m && /(msg|message|err\b|error)/i.test(about) && /[A-Za-zÁÉÍÓÚÑáéíóúñ]{5}/.test(m[1].replace(/\\[a-zA-Z]/g, ' ').replace(/\[[^\]]*\]/g, ' ')) && !/^\^?\(?https?/.test(m[1])) { try { regexes.push(new RegExp(m[1], m[2].replace(/[gy]/g, ''))); } catch { /* una expresión que Node no entiende: se ignora */ } }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const hitsMarker = (s) => { for (const m of markers) if (s.includes(m)) return m; return null; };

  for (const sf of sources) {
    const file = relative(ROOT, sf.fileName).split(sep).join('/');
    const text = sf.text;
    const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const note = (n, why, t, extra) => {
      review.push({ file, line: lineOf(n), why, text: String(t).trim().replace(/\s+/g, ' ').slice(0, 160) });
      for (const k of extra ?? []) if (isHuman(k) && !pending.has(k)) pending.set(k, file);
    };
    const skipTexts = new Set([...(CONFIG.skipTexts['*'] ?? []), ...(CONFIG.skipTexts[file] ?? [])]);
    const lines = text.split('\n');
    const lineSkipped = (n) => {
      const l = lineOf(n) - 1;
      return /i18n-skip/.test(lines[l] ?? '') || /i18n-skip-next/.test(lines[l - 1] ?? '');
    };
    if (/i18n-skip-file/.test(text.slice(0, 2000))) continue;

    // ¿El archivo ya usa nuestros nombres para otra cosa?
    let clash = null; let imp = null; const have = new Set();
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && /(^|\/)i18n$/.test(st.moduleSpecifier.text)) {
        imp = st;
        const nb = st.importClause?.namedBindings;
        if (nb && ts.isNamedImports(nb)) nb.elements.forEach((e) => have.add(e.name.text));
      }
    }
    const declCheck = (n) => {
      if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isFunctionDeclaration(n) || ts.isBindingElement(n) || ts.isImportSpecifier(n)) && n.name && ts.isIdentifier(n.name)
        && [FN, FN_LIST, FN_LOCALE].includes(n.name.text) && !(ts.isImportSpecifier(n) && imp && n.parent.parent.parent === imp)) clash = n.name.text;
      ts.forEachChild(n, declCheck);
    };
    declCheck(sf);
    if (clash) { review.push({ file, line: 1, why: `el archivo ya tiene algo llamado ${clash}: no se tocó`, text: '' }); continue; }

    // Textos que este archivo compara (===, case, includes, claves): no se pueden traducir donde podrían ser el valor comparado.
    const compared = new Set();
    const collect = (n) => {
      const add = (x) => { if (x && ts.isStringLiteralLike(x)) compared.add(x.text); };
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind)) { add(n.left); add(n.right); }
      else if (ts.isCaseClause(n)) add(n.expression);
      else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && COMPARE_CALLS.has(n.expression.name.text)) add(n.arguments[0]);
      else if (ts.isElementAccessExpression(n)) add(n.argumentExpression);
      else if (ts.isPropertyAssignment(n) && ts.isStringLiteralLike(n.name)) compared.add(n.name.text);
      else if (ts.isLiteralTypeNode(n)) add(n.literal);
      ts.forEachChild(n, collect);
    };
    collect(sf);

    const ctxOf = CONFIG.contexts?.[file] ?? {};
    /** La clave de un texto: si en este archivo esa palabra quiere decir otra cosa (scripts/i18n-config.json, "contexts"), lleva ##contexto. */
    const K = (value) => (ctxOf[value] ? `${value}##${ctxOf[value]}` : value);
    const edits = []; // { start, end, text }
    const need = new Set();
    const useKey = (key, holes, already = false) => {
      let k = keys.get(key);
      if (!k) { k = { n: 0, files: new Set(), holes: [] }; keys.set(key, k); }
      k.n++; k.files.add(file);
      for (const h of holes ?? []) if (!k.holes.includes(h)) k.holes.push(h);
      if (already) stats.already++;
    };
    /** El código de un nodo con los cambios de adentro ya puestos (y los saca de la lista). */
    const textOf = (n) => {
      const a = n.getStart(sf); const b = n.getEnd();
      const inner = edits.filter((e) => e.start >= a && e.end <= b).sort((x, y) => y.start - x.start);
      let s = text.slice(a, b);
      for (const e of inner) { s = s.slice(0, e.start - a) + e.text + s.slice(e.end - a); edits.splice(edits.indexOf(e), 1); }
      return s;
    };

    // ---------- Dónde está parado un texto ----------
    const isEagerFn = (fn) => {
      const p = fn.parent;
      if (!p) return false;
      const call = ts.isParenthesizedExpression(p) ? p.parent : p;
      if (ts.isCallExpression(call) && (call.expression === fn || call.expression === p)) return true; // (() => ...)()
      if (ts.isCallExpression(p) && p.arguments.includes(fn) && ts.isPropertyAccessExpression(p.expression) && EAGER_METHODS.has(p.expression.name.text)) return true;
      return false;
    };
    /** Cierto si el nodo se ejecuta al cargar el archivo (fuera de toda función que se llame después). */
    const atModuleLevel = (n) => {
      for (let p = n.parent; p; p = p.parent) {
        if (ts.isFunctionLike(p) && !isEagerFn(p)) return false;
        if (ts.isClassLike(p)) return false;
      }
      return true;
    };
    const rootName = (e) => { let x = e; while (x && (ts.isPropertyAccessExpression(x) || ts.isCallExpression(x) || ts.isElementAccessExpression(x) || ts.isNonNullExpression(x) || ts.isAwaitExpression(x) || ts.isParenthesizedExpression(x))) x = x.expression; return x && ts.isIdentifier(x) ? x.text : ''; };
    const calleeName = (c) => { const e = c.expression; return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''; };
    const insideOurs = (n) => {
      for (let p = n.parent, c = n; p; c = p, p = p.parent) {
        if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && OURS.has(p.expression.text) && p.arguments[0] === c) return true;
        if (ts.isFunctionLike(p)) return false;
      }
      return false;
    };
    const insideDb = (n) => {
      for (let p = n.parent; p; p = p.parent) {
        if (ts.isFunctionLike(p)) return false;
        if (ts.isCallExpression(p) && rootName(p.expression) === 'supabase') return true;
      }
      return false;
    };
    const transparent = (q, c) => ts.isParenthesizedExpression(q) || ts.isAsExpression(q) || ts.isNonNullExpression(q) || ts.isSatisfiesExpression?.(q)
      || (ts.isConditionalExpression(q) && q.condition !== c)
      || (ts.isBinaryExpression(q) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(q.operatorToken.kind))
      || (ts.isBinaryExpression(q) && q.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && q.right === c)
      || ts.isTemplateSpan(q) || ts.isTemplateExpression(q);
    /**
     * Qué es el lugar donde está el texto: 'shown' (seguro se muestra), 'maybe' (hay que mirar el texto), 'no' (clave, valor, técnica).
     * `direct` dice si el texto es el valor entero de ese lugar (sin ?: ni + de por medio).
     */
    const place = (n) => {
      let q = n.parent; let c = n; let direct = true; let viaTemplate = false;
      while (q && transparent(q, c)) { if (!ts.isParenthesizedExpression(q) && !ts.isAsExpression(q)) direct = false; if (ts.isTemplateSpan(q)) viaTemplate = true; c = q; q = q.parent; }
      const r = (kind, extra = {}) => ({ kind, direct, anchor: q, top: c, viaTemplate, ...extra });
      if (!q) return r('no');
      if (ts.isJsxAttribute(q)) { const name = q.name.getText(sf); return r(TECH_ATTR.has(name) ? 'no' : VISIBLE.has(name) ? 'shown' : 'maybe', { attr: name }); }
      if (ts.isJsxExpression(q)) {
        if (ts.isJsxAttribute(q.parent)) { const name = q.parent.name.getText(sf); return r(TECH_ATTR.has(name) ? 'no' : VISIBLE.has(name) ? 'shown' : 'maybe', { attr: name }); }
        return r('shown');
      }
      if (ts.isPropertyAssignment(q)) {
        if (q.name === c) return r('no');
        const name = ts.isIdentifier(q.name) || ts.isStringLiteralLike(q.name) ? q.name.text : q.name.getText(sf);
        if (TECH_PROP.has(name)) return r('no', { prop: name });
        return r(VISIBLE.has(name) ? 'shown' : 'maybe', { prop: name, assignment: q });
      }
      if (ts.isCallExpression(q) || ts.isNewExpression(q)) {
        const name = calleeName(q); const root = rootName(q.expression);
        if (root === 'supabase' || root === 'console' || root === 'router' || root === 'Linking' || root === 'AsyncStorage' || root === 'SecureStore' || root === 'document' || root === 'window' || root === 'localStorage') return r('no');
        if (ROUTER_ONLY.has(name)) {
          // out.push('frase') sí; router.push y text.replace no.
          if (name === 'push' && ts.isPropertyAccessExpression(q.expression) && root !== 'router' && !/^(router|nav|navigation)$/i.test(root)) return r('maybe', { call: name });
          return r('no');
        }
        if (TECH_CALL.has(name)) return r('no');
        if (root === 'Alert' || VISIBLE_CALL.has(name)) return r('shown', { call: name });
        return r('maybe', { call: name });
      }
      if (ts.isArrayLiteralExpression(q)) {
        // ['si', 'no'].includes(x) y new Set(['a', 'b']): son valores para comparar, no textos.
        const up = q.parent;
        if (ts.isPropertyAccessExpression(up) && up.expression === q && ['includes', 'indexOf', 'lastIndexOf', 'some', 'find', 'findIndex'].includes(up.name.text)) return r('no');
        if ((ts.isNewExpression(up) || ts.isCallExpression(up)) && ['Set', 'Map'].includes(calleeName(up))) return r('no');
      }
      if (ts.isReturnStatement(q) || ts.isArrowFunction(q) || ts.isVariableDeclaration(q) || ts.isArrayLiteralExpression(q) || ts.isParameter(q) || ts.isBindingElement(q)) return r('maybe');
      if (ts.isBinaryExpression(q) && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.BarBarEqualsToken].includes(q.operatorToken.kind) && q.right === c) return r('maybe');
      if (ts.isPropertyAccessExpression(q) && q.expression === c && ts.isCallExpression(q.parent) && ['trim', 'toLowerCase', 'toUpperCase'].includes(q.name.text)) return r('maybe');
      return r('no');
    };
    /** Cierto si el tipo que se espera ahí es una lista cerrada de valores ('a' | 'b'), no un texto cualquiera. */
    const literalTyped = (n) => {
      let ct;
      try { ct = checker.getContextualType(n); } catch { return false; }
      if (!ct) return false;
      const parts = ct.isUnion() ? ct.types : [ct];
      let saw = false;
      for (let p of parts) {
        if (p.flags & ts.TypeFlags.TypeParameter) { const c = checker.getBaseConstraintOfType(p); if (!c) return false; p = c; }
        const sub = p.isUnion?.() ? p.types : [p];
        for (const s of sub) {
          if (s.flags & (ts.TypeFlags.String | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
          if (s.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping | ts.TypeFlags.EnumLiteral)) saw = true;
        }
      }
      return saw;
    };
    const underAsConst = (n) => {
      for (let p = n.parent; p && !ts.isFunctionLike(p); p = p.parent) if (ts.isAsExpression(p) && p.type.getText(sf) === 'const') return true;
      return false;
    };
    /** Cierto si el valor de esa expresión es seguro un texto o un número (para poder meterlo dentro de una frase). */
    const stringy = (e) => {
      let ty;
      try { ty = checker.getTypeAtLocation(e); } catch { return false; }
      const ok = (x) => !!(x.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.BigIntLike));
      return ty.isUnion() ? ty.types.every(ok) : ok(ty);
    };

    /** Decide si un texto se traduce. Devuelve null (no) o { pl } con el lugar. Anota lo dudoso. */
    const decide = (n, value, opts = {}) => {
      const s = value.trim();
      if (!s || insideOurs(n) || lineSkipped(n)) return null;
      if (skipTexts.has(s) || skipTexts.has(value)) return null;
      const pl = opts.pl ?? place(n);
      if (pl.kind === 'no') return null;
      // Una palabra suelta en minúscula ("persona") solo cuenta si está en un lugar que se muestra, o si es una de las dos puntas de un singular/plural.
      const pair = ts.isConditionalExpression(n.parent) && n.parent.condition !== n && ts.isStringLiteralLike(n.parent.whenTrue) && ts.isStringLiteralLike(n.parent.whenFalse)
        && LOWER_WORD.test(n.parent.whenTrue.text.trim() || 'x') && LOWER_WORD.test(n.parent.whenFalse.text.trim() || 'x') && SPANISH_PAIR(n.parent.whenTrue.text.trim(), n.parent.whenFalse.text.trim());
      const human = pl.kind === 'shown' ? isShown(s) : (isHuman(s) || (pair && isShown(s)));
      if (!human) {
        if (pl.kind === 'maybe' && LOWER_WORD.test(s) && SPANISH.test(s)) note(n, 'palabra suelta en minúscula (¿texto o clave?)', s);
        return null;
      }
      if (pl.kind === 'maybe' && (comparedAll.has(value) || (pl.call === 'Error' && regexHit(s)))) { note(n, 'ese texto se compara en algún archivo (===, case, includes o una expresión regular)', s, [value]); return null; }
      if (insideDb(n)) { note(n, 'va a la base: no se tocó', s); return null; }
      if (literalTyped(n)) { if (isHuman(s)) note(n, 'el tipo es una lista cerrada de valores', s, [value]); return null; }
      const m = hitsMarker(s);
      if (m && !opts.jsxText) { note(n, `en otro lado se busca "${m}" con startsWith/includes`, s); return null; }
      if (compared.has(value) && !(pl.kind === 'shown' && pl.direct)) { note(n, 'el mismo texto se compara en este archivo (===, case o clave)', s, [value]); return null; }
      return pl;
    };

    /** Los textos posibles de una expresión cuando su tipo es una lista cerrada ('Tarjeta' | 'Llavero'); null si no lo es o ninguno es para la gente. */
    const literalValues = (e) => {
      let ty;
      try { ty = checker.getTypeAtLocation(e); } catch { return null; }
      const parts = ty.isUnion() ? ty.types : [ty];
      const vals = [];
      for (const p of parts) {
        if (!(p.flags & ts.TypeFlags.StringLiteral)) return null; // también corta si puede venir vacío (null): tx espera un texto
        vals.push(p.value);
      }
      return vals.length && vals.length <= 60 && vals.some((v) => isHuman(v)) ? vals : null;
    };
    /** Si la variable es el elemento de un .map sobre una lista de textos escrita fuera de una función, devuelve esos textos. */
    const originArray = (e) => {
      if (!ts.isIdentifier(e)) return null;
      let sym;
      try { sym = checker.getSymbolAtLocation(e); } catch { return null; }
      const d = sym?.declarations?.[0];
      if (!d || !ts.isParameter(d) || !ts.isFunctionLike(d.parent) || d.parent.parameters[0] !== d) return null;
      const call = d.parent.parent;
      if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression) || !['map', 'forEach', 'filter', 'find', 'flatMap'].includes(call.expression.name.text)) return null;
      const src = call.expression.expression;
      if (!ts.isIdentifier(src)) return null;
      let s2;
      try { s2 = checker.getSymbolAtLocation(src); if (s2 && s2.flags & ts.SymbolFlags.Alias) s2 = checker.getAliasedSymbol(s2); } catch { return null; }
      const vd = s2?.declarations?.[0];
      if (!vd || !ts.isVariableDeclaration(vd) || !vd.initializer) return null;
      let init = vd.initializer;
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === FN_LIST) return null; // ya se traduce sola
      if (!ts.isArrayLiteralExpression(init) || !init.elements.length || !init.elements.every((x) => ts.isStringLiteralLike(x))) return null;
      const vals = init.elements.map((x) => x.text);
      return vals.some((v) => isHuman(v)) ? vals : null;
    };
    /** Valores (no textos escritos ahí mismo) que se muestran y cuyo contenido es un texto fijo en castellano: se traducen al mostrarlos. */
    const dynValues = (e) => {
      if (!(ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e))) return null;
      if (ts.isIdentifier(e) && (e.text === 'undefined' || OURS.has(e.text))) return null;
      return literalValues(e) ?? originArray(e);
    };
    const dynamic = (n) => {
      const p = n.parent;
      if ((ts.isPropertyAccessExpression(p) && (p.expression === n || p.name === n)) || (ts.isElementAccessExpression(p) && p.expression === n) || (ts.isCallExpression(p) && p.expression === n)) return;
      if (ts.isJsxAttribute(p) || ts.isShorthandPropertyAssignment(p) || ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p) || ts.isBindingElement(p) || ts.isParameter(p) || ts.isVariableDeclaration(p) && p.name === n) return;
      if (ts.isJsxExpression(p) && handled.has(p)) return; // lo resuelve la frase armada
      if (insideOurs(n) || lineSkipped(n) || atModuleLevel(n)) return;
      const pl = place(n);
      if (pl.kind !== 'shown') return;
      if (pl.viaTemplate && !ts.isJsxExpression(p)) return; // dentro de una plantilla lo resuelve la plantilla
      const vals = dynValues(n);
      if (!vals) return;
      edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${FN}(${text.slice(n.getStart(sf), n.getEnd())})` });
      need.add(FN); vals.filter((v) => isHuman(v)).forEach((v) => useKey(v, holesOf(v))); stats.dynamic++; stats.wrapped++;
    };

    const holeName = (e, used) => {
      const base = (x) => {
        if (!x) return '';
        if (ts.isIdentifier(x)) return x.text;
        if (ts.isPropertyAccessExpression(x)) return ['length', 'size', 'count'].includes(x.name.text) ? 'n' : x.name.text;
        if (ts.isCallExpression(x)) return ts.isPropertyAccessExpression(x.expression) && ['join', 'trim', 'toLowerCase', 'toUpperCase', 'toFixed', 'toString', 'slice'].includes(x.expression.name.text) ? base(x.expression.expression) : calleeName(x);
        if (ts.isElementAccessExpression(x) || ts.isNonNullExpression(x) || ts.isParenthesizedExpression(x) || ts.isAsExpression(x)) return base(x.expression);
        if (ts.isConditionalExpression(x)) return ts.isStringLiteralLike(x.whenTrue) && ts.isStringLiteralLike(x.whenFalse) ? 'pl' : '';
        if (ts.isBinaryExpression(x) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(x.operatorToken.kind)) return base(x.left);
        return '';
      };
      let name = base(e);
      if (!/^[A-Za-z_]\w*$/.test(name) || name.length > 24) name = 'v';
      const src = text.slice(e.getStart(sf), e.getEnd());
      for (const [k, v] of used) if (v.src === src) return k;
      let k = name === 'v' ? 'v1' : name; let i = 1;
      while (used.has(k)) { i++; k = `${name}${i}`; }
      used.set(k, { src, node: e });
      return k;
    };
    const varsText = (used) => `{ ${[...used].map(([k, v]) => {
      let code = textOf(v.node);
      const vals = dynValues(v.node);
      if (vals) { code = `${FN}(${code})`; vals.filter((x) => isHuman(x)).forEach((x) => useKey(x, holesOf(x))); stats.dynamic++; }
      return code === k ? k : `${k}: ${code}`;
    }).join(', ')} }`;

    // ---------- Recorrido (primero lo de adentro) ----------
    const handled = new Set(); // nodos de texto que ya resolvió un padre (frase armada)

    const visit = (n) => {
      // Las frases de pantalla armadas con pedazos se deciden antes de bajar: <Text>Faltaron {n} personas</Text>
      if ((ts.isJsxElement(n) || ts.isJsxFragment(n))) planJsx(n);
      ts.forEachChild(n, visit);
      if (handled.has(n)) return;

      if (ts.isJsxElement(n) || ts.isJsxFragment(n)) { finishJsx(n); return; }
      if (ts.isJsxText(n)) { jsxText(n); return; }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && OURS.has(n.expression.text) && n.expression.text !== FN_LOCALE) {
        const a = n.arguments[0];
        if (a && ts.isStringLiteralLike(a)) useKey(a.text, holesOf(a.text), true);
        else if (a && ts.isArrayLiteralExpression(a)) a.elements.forEach((e) => { if (ts.isStringLiteralLike(e)) useKey(e.text, [], true); });
        else if (a && n.expression.text !== FN_LIST) { const vals = dynValues(a); if (vals) { vals.filter((v) => isHuman(v)).forEach((v) => useKey(v, holesOf(v))); stats.already++; } }
        return;
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { stringLit(n); return; }
      if (ts.isTemplateExpression(n)) { template(n); return; }
      if (ts.isArrayLiteralExpression(n)) { arrayLit(n); return; }
      if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) { dynamic(n); return; }
    };
    const holesOf = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

    const jsxPlans = new Map();
    const planJsx = (el) => {
      const kids = el.children;
      if (!kids.some((k) => ts.isJsxExpression(k) && k.expression)) return;
      if (!kids.every((k) => ts.isJsxText(k) || (ts.isJsxExpression(k) && k.expression && !k.dotDotDotToken))) return;
      if (!atModuleLevel(el) === false && atModuleLevel(el)) return;
      const hasJsx = (x) => { let f = false; const w = (y) => { if (ts.isJsxElement(y) || ts.isJsxSelfClosingElement(y) || ts.isJsxFragment(y)) f = true; else ts.forEachChild(y, w); }; w(x); return f; };
      const exprs = kids.filter((k) => ts.isJsxExpression(k));
      if (exprs.some((k) => hasJsx(k.expression) || (!ts.isStringLiteralLike(k.expression) && !stringy(k.expression)))) return;
      if (exprs.every((k) => ts.isStringLiteralLike(k.expression))) return;
      if (kids.some((k) => lineSkipped(k))) return;
      // Que no sea ya {tx(...)} solo.
      if (exprs.some((k) => ts.isCallExpression(k.expression) && ts.isIdentifier(k.expression.expression) && OURS.has(k.expression.expression.text))) return;
      const statics = kids.filter((k) => ts.isJsxText(k)).map((k) => k.text).join(' ');
      if (decodeEntities(statics) === null || /[{}]/.test(statics)) return;
      if (!isHuman(cookJsx(statics))) return;
      jsxPlans.set(el, true);
      kids.forEach((k) => { handled.add(k); if (ts.isJsxExpression(k) && ts.isStringLiteralLike(k.expression)) handled.add(k.expression); });
    };
    const finishJsx = (el) => {
      if (!jsxPlans.has(el)) return;
      const kids = [...el.children];
      const used = new Map();
      let key = '';
      kids.forEach((k, i) => {
        if (ts.isJsxText(k)) {
          // El espacio de las puntas de cada pedazo sigue las reglas de JSX; se arma como si fuera un solo texto.
          let raw = k.text;
          if (i === 0) raw = raw.replace(/^\s+/, '');
          if (i === kids.length - 1) raw = raw.replace(/\s+$/, '');
          const first = i === 0; const last = i === kids.length - 1;
          const ls = raw.replace(/\t/g, ' ').split(/\r?\n/);
          const parts = [];
          ls.forEach((line, j) => { let l = line; if (j !== 0) l = l.replace(/^ +/, ''); if (j !== ls.length - 1) l = l.replace(/ +$/, ''); if (l) parts.push(l); });
          void first; void last;
          key += decodeEntities(parts.join(' '));
        } else if (ts.isStringLiteralLike(k.expression)) key += k.expression.text;
        else key += `{${holeName(k.expression, used)}}`;
      });
      const firstK = kids[0]; const lastK = kids[kids.length - 1];
      const lead = ts.isJsxText(firstK) ? firstK.text.match(/^\s*/)[0] : '';
      const trail = ts.isJsxText(lastK) ? lastK.text.match(/\s*$/)[0] : '';
      const start = firstK.getFullStart() + lead.length; const end = lastK.getEnd() - trail.length;
      const vars = varsText(used);
      edits.push({ start, end, text: `{${FN}(${lit(key)}, ${vars})}` });
      need.add(FN); useKey(key, [...used.keys()]); stats.merged++; stats.wrapped++;
    };

    const jsxText = (n) => {
      const raw = n.text;
      if (!raw.trim()) return;
      const lead = raw.match(/^\s*/)[0]; const trail = raw.match(/\s*$/)[0];
      const core = raw.slice(lead.length, raw.length - trail.length);
      const cooked = decodeEntities(cookJsx(core));
      if (cooked === null) { note(n, 'tiene un símbolo de HTML (&...;) que no se sabe pasar', core); return; }
      if (!isShown(cooked) || lineSkipped(n) || skipTexts.has(cooked)) return;
      if (/[{}]/.test(cooked)) { note(n, 'tiene llaves', cooked); return; }
      if (atModuleLevel(n)) { note(n, 'pantalla armada fuera de una función', cooked); return; }
      const start = n.getFullStart() + lead.length;
      edits.push({ start, end: start + core.length, text: `{${FN}(${lit(K(cooked))})}` });
      need.add(FN); useKey(K(cooked), []); stats.wrapped++;
    };

    const stringLit = (n) => {
      const p = n.parent;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p) || ts.isExpressionStatement(p)) return;
      // 'es-AR' en fechas y números -> txLocale()
      if (n.text === 'es-AR' && (ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.[0] === n && /^(toLocale(Date|Time)?String|DateTimeFormat|NumberFormat)$/.test(calleeName(p))) {
        if (atModuleLevel(n)) { note(n, "'es-AR' fuera de una función", n.text); return; }
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${FN_LOCALE}()` }); need.add(FN_LOCALE); stats.locales++; return;
      }
      if (ts.isArrayLiteralExpression(p) && atModuleLevel(n)) return; // lo decide la lista entera
      const pl = decide(n, n.text);
      if (!pl) return;
      const src = ctxOf[n.text] ? lit(K(n.text)) : text.slice(n.getStart(sf), n.getEnd());
      if (ts.isJsxAttribute(p)) {
        if (/[\\&]/.test(n.text)) { note(n, 'atributo con \\ o &', n.text); return; }
        if (atModuleLevel(n)) { note(n, 'pantalla armada fuera de una función', n.text); return; }
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `{${FN}(${lit(K(n.text))})}` });
        need.add(FN); useKey(K(n.text), []); stats.wrapped++; return;
      }
      if (atModuleLevel(n)) {
        // Fuera de una función solo se puede si es el valor de una propiedad: se vuelve un "get" que traduce al leerla.
        const a = pl.assignment;
        if (a && pl.direct && a.initializer === n && ts.isObjectLiteralExpression(a.parent) && !underAsConst(n)) {
          const nameSrc = text.slice(a.name.getStart(sf), a.name.getEnd());
          edits.push({ start: a.getStart(sf), end: a.getEnd(), text: `get ${nameSrc}() { return ${FN}(${src}); }` });
          need.add(FN); useKey(K(n.text), holesOf(n.text)); stats.getters++; stats.wrapped++; return;
        }
        if (CONFIG.identityLists?.includes(file) && !/\s/.test(n.text.trim())) return;
        note(n, 'texto fuera de una función (se crea una sola vez al abrir la app)', n.text, [n.text]); return;
      }
      edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${FN}(${src})` });
      need.add(FN); useKey(K(n.text), holesOf(n.text)); stats.wrapped++;
    };

    const template = (n) => {
      if (ts.isTaggedTemplateExpression(n.parent)) return;
      const statics = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
      const joined = statics.join(' ').trim();
      const pl = place(n);
      if (pl.kind === 'no' || insideOurs(n)) return;
      // Hace falta al menos una palabra de verdad en la parte fija: `${a} · ${b}` no es un texto.
      const words = statics.join(' ').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñü\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
      if (!words.length) return;
      if (techy(statics.join('x').trim()) || /^[\w.-]*$/.test(statics.join('')) || /[=&?]\w*$/.test(n.head.text) && !/\s/.test(n.head.text)) return;
      if (!/\s/.test(statics.join('')) && /^[\w.:/\-=?&#@]*$/.test(statics.join(''))) return; // `ministry:${id}`, `finance/${a}/${b}`: claves y direcciones
      const probe = statics.join(' … ');
      const ok = pl.kind === 'shown' ? isShown(probe) : (isHuman(probe) && (words.some((w) => w.length >= 3 && /[a-záéíóúñ]/.test(w))));
      if (!ok) return;
      if (!decide(n, probe, { pl })) return;
      if (/[{}]/.test(statics.join(''))) { note(n, 'tiene llaves', probe); return; }
      if (atModuleLevel(n)) { note(n, 'texto fuera de una función (se crea una sola vez al abrir la app)', probe); return; }
      const used = new Map();
      let key = n.head.text;
      for (const s of n.templateSpans) key += `{${holeName(s.expression, used)}}${s.literal.text}`;
      const vars = varsText(used);
      edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${FN}(${lit(key)}, ${vars})` });
      need.add(FN); useKey(key, [...used.keys()]); stats.wrapped++;
    };

    const arrayLit = (n) => {
      if (!atModuleLevel(n) || !n.elements.length || !n.elements.every((e) => ts.isStringLiteralLike(e))) return;
      if (CONFIG.identityLists?.includes(file)) return; // listas que son valores para comparar (títulos de planilla, abreviaturas): ni se tocan ni se anotan
      if (insideOurs(n.elements[0]) || lineSkipped(n)) return;
      const vals = n.elements.map((e) => e.text);
      if (!vals.some((v) => isHuman(v)) || vals.every((v) => skipTexts.has(v.trim()))) return;
      const pl = place(n);
      const calendar = vals.every((v) => CALENDAR.has(v)) || vals.join() === MONTHS_SHORT.join();
      const phrases = vals.every((v) => v.trim().split(/\s+/).length >= 4 && isHuman(v));
      const blocked = pl.kind === 'no' || underAsConst(n) || ts.isAsExpression(n.parent) || vals.some((v) => compared.has(v) || hitsMarker(v)) || literalTyped(n.elements[0]);
      if ((calendar || phrases) && !blocked) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${FN_LIST}(${textOf(n)})` });
        need.add(FN_LIST); vals.forEach((v) => useKey(v, holesOf(v))); stats.lists++; stats.wrapped += vals.length; return;
      }
      if (pl.kind !== 'no') note(n, 'lista de textos fuera de una función (¿se muestran o son valores?)', vals.filter((v) => isHuman(v)).slice(0, 6).join(' | '), vals);
    };

    visit(sf);
    if (!edits.length) continue;

    // El import.
    const names = [...need].filter((x) => !have.has(x));
    if (names.length) {
      if (imp && imp.importClause?.namedBindings && ts.isNamedImports(imp.importClause.namedBindings)) {
        const nb = imp.importClause.namedBindings;
        const all = [...nb.elements.map((e) => text.slice(e.getStart(sf), e.getEnd())), ...names];
        edits.push({ start: nb.getStart(sf), end: nb.getEnd(), text: `{ ${all.join(', ')} }` });
      } else {
        const spec = /^src\/lib\/[^/]+$/.test(file) ? './i18n' : '@/lib/i18n';
        const line = `import { ${[FN, FN_LIST, FN_LOCALE].filter((x) => names.includes(x)).join(', ')} } from '${spec}';`;
        const imports = sf.statements.filter((s) => ts.isImportDeclaration(s));
        if (imports.length) { const at = imports[imports.length - 1].getEnd(); edits.push({ start: at, end: at, text: `\n${line}` }); }
        else { const at = sf.statements[0].getStart(sf); edits.push({ start: at, end: at, text: `${line}\n` }); }
      }
    }
    edits.sort((a, b) => b.start - a.start || b.end - a.end);
    let out = text;
    for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    if (out !== text) {
      changed.push(file);
      if (write) writeFileSync(sf.fileName, out);
    }
  }
  return { keys, review, changed, stats, pending };
}
