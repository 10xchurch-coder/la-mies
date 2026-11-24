#!/usr/bin/env python3
"""Arma las "Palabras originales" (hebreo y griego con números de Strong) a partir de STEPBible-Data (CC BY 4.0).
Fuente: https://github.com/STEPBible/STEPBible-Data  (datos de Tyndale House, Cambridge, y STEPBible.org).

Uso:
  git clone --depth 1 https://github.com/STEPBible/STEPBible-Data.git /tmp/step
  python3 -I scripts/bible-import-strongs.py /tmp/step src/data/bible/orig src/data/bible/kjv

Qué se toma de cada archivo (y qué NO, por el permiso):
- TAHOT (Antiguo Testamento en hebreo): la palabra hebrea y su número (dStrong). No se toman la traducción palabra por
  palabra ni la gramática (la gramática viene de ETCBC, con otra licencia).
- TAGNT (Nuevo Testamento en griego): la palabra griega y su número. Solo las palabras del texto tradicional (el de la
  King James y la Reina-Valera: tipo con "K"). No se toman la traducción al inglés (basada en la Berean Study Bible)
  ni la del español (viene de OpenGNT, con otra licencia).
- TBESH (léxico hebreo): forma de diccionario, pronunciación y glosa corta. NO se toma la columna "Meaning": el archivo
  dice que es del Abridged BDB de Online Bible (© Larry Pierce) y que hace falta pedirle permiso a Online Bible.
- TBESG (léxico griego): forma de diccionario, pronunciación, glosa corta y la definición (Abbott-Smith, dominio público,
  adaptada por Tyndale; cuando falta, Middle Liddell o STEPBible).

Cambios que se le hacen al dato (la licencia pide anotarlos):
- Se cambia el formato (un archivo por libro, números en vez de texto repetido). No se cambia ninguna palabra ni número.
- Al hebreo se le quitan los acentos de canto y la puntuación (quedan las letras y las vocales). Al griego, la puntuación.
- Los títulos de los salmos (versículo 0 en la fuente) van al principio del versículo 1, como en las Biblias de la app.
- No entran las palabras agregadas desde la Septuaginta (tipo "X") ni las del Ketiv sin texto.
- Las letras con tilde se guardan en la forma normal de Unicode (NFC), para que se vean igual en todos los teléfonos.
- De la definición griega se quitan las marcas de formato (<b>, <i>, <ref>); el texto queda entero.
La numeración de versículos que queda es la de la King James. El programa avisa dónde no coincide con la KJV de la app.

Formato de salida (ver src/lib/bibleOrig.ts, que lo lee). Está pensado para ocupar poco dentro de la app del teléfono,
donde un texto con una sola letra hebrea o griega ocupa el doble: por eso casi todo se guarda con letras comunes (ASCII).
- Los números van en base 45 (ver enc()): los chicos ocupan una letra.
- NN.json por libro: {"k": las letras hebreas o griegas que usa el libro, de la más usada a la menos usada,
  "w": las formas separadas por espacio, cada letra escrita como su lugar en "k" (ver pack_word()),
  "l": el lema de cada forma (números pegados), "c": un texto por capítulo, con los versículos separados por espacio;
  cada versículo es el número de forma de cada palabra}.
- lex-h.json y lex-g.json: tabla de lemas del hebreo y del griego: {"k": letras, "s": números, "w": formas de diccionario,
  "t": pronunciación, "g": glosa, "b": en qué libros aparece cada uno}. Campos separados por tabulador, en el mismo orden.
  En "w", "t" y "g" las letras que no son ASCII van como "`" + su lugar en "k" (ver pack_text()).
- def-g-N.json: definiciones del griego, de a 500 números de Strong: {"k": letras, "d": {"G0026": texto como en pack_text()}}.
"""
import collections, glob, json, os, re, sys, unicodedata

NFC = lambda x: unicodedata.normalize('NFC', x)

CHAPTERS = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,
            28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22]
CODES = ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo '
         'Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe '
         '2Pe 1Jn 2Jn 3Jn Jud Rev').split()
IDX = {b: i for i, b in enumerate(CODES)}
# 90 letras que se pueden escribir tal cual dentro de un JSON (sin comillas ni barra invertida).
ALPHA = ''.join(chr(c) for c in range(35, 127) if c != 92)[:90]
assert len(ALPHA) == 90 and '"' not in ALPHA and '\\' not in ALPHA and ' ' not in ALPHA

def enc(n):
    """Un número en base 45: los primeros dígitos van corridos 45 lugares ("sigue"), el último no. 0..44 ocupa una letra."""
    out = [ALPHA[n % 45]]
    n //= 45
    while n:
        out.append(ALPHA[45 + n % 45])
        n //= 45
    return ''.join(reversed(out))

MARK = '`'

def table_of(texts, ascii_too):
    """Las letras que hay que guardar aparte, de la más usada a la menos usada."""
    freq = collections.Counter()
    for t in texts:
        for ch in t:
            if ascii_too or ord(ch) > 126 or ord(ch) < 32 or ch == MARK: freq[ch] += 1
    for ch in freq: assert ord(ch) < 0x10000, ch
    return ''.join(ch for ch, _ in freq.most_common())

def pack_word(word, pos):
    """Una palabra hebrea o griega: cada letra es su lugar en la tabla, en base 45. Queda todo en ASCII, sin espacios."""
    return ''.join(enc(pos[ch]) for ch in word)

def pack_text(text, pos):
    """Un texto casi todo en ASCII: las letras de la tabla van como "`" + su lugar. Lo demás queda igual."""
    return ''.join(MARK + enc(pos[ch]) if ch in pos else ch for ch in text)

ROW = re.compile(r'^([1-3A-Z][A-Za-z0-9]{2})\.(\d+)\.(\d+)(?:([\(\[\{])(\d+)\.(\d+)[\)\]\}])?#(\d+)=(\S+)$')
STRONG = re.compile(r'^[HG]\d{4,5}[A-Za-z]?$')

def clean_hebrew(s):
    s = s.split('\\')[0].replace('/', '')
    # Fuera los acentos de canto (0591-05AF), meteg, paseq, sof pasuq y otros signos; quedan letras, vocales, daguesh y puntos de shin/sin.
    s = ''.join(c for c in s if not (0x0591 <= ord(c) <= 0x05AF or ord(c) in (0x05BD, 0x05C0, 0x05C3, 0x05C6, 0x05F3, 0x05F4)))
    return NFC(s.strip().strip('\u05BE').replace(' ', ''))

def clean_greek(s):
    s = re.sub(r'\s*\(.*\)\s*$', '', s)
    return NFC(s.strip().strip('.,;·:!?()[]«»“”"—–¶').replace(' ', ''))

def read_rows(step, pattern):
    files = sorted(glob.glob(os.path.join(step, 'Translators Amalgamated OT+NT', pattern)))
    assert files, pattern
    for f in files:
        head = open(f, encoding='utf-8-sig').read(4000)
        assert 'CC BY 4.0' in head, ('la licencia cambió, revisar', f)
        for line in open(f, encoding='utf-8-sig'):
            c = line.rstrip('\n').split('\t')
            m = ROW.match(c[0])
            if m and len(c) >= 5:
                yield m, c

def main():
    step, out = sys.argv[1], sys.argv[2]
    kjv_dir = sys.argv[3] if len(sys.argv) > 3 else None
    # tokens[libro][(capítulo, versículo)] = [(forma, dStrong), ...]
    tokens = [collections.OrderedDict() for _ in CODES]
    skipped = collections.Counter()

    for m, c in read_rows(step, 'TAHOT*.txt'):
        b = IDX[m.group(1)]
        assert b < 39
        typ = m.group(8)
        if typ.startswith('X'): skipped['hebreo: agregado de la Septuaginta (X)'] += 1; continue
        word = clean_hebrew(c[1])
        if not word: skipped['hebreo: sin texto'] += 1; continue
        root = re.search(r'\{(H\d+[A-Za-z]?)\}', c[4]) or re.search(r'(H\d+[A-Za-z]?)', c[4])
        assert root, c[:5]
        ch, v = int(m.group(2)), max(1, int(m.group(3)))
        tokens[b].setdefault((ch, v), []).append((word, root.group(1)))

    for m, c in read_rows(step, 'TAGNT*.txt'):
        b = IDX[m.group(1)]
        assert b >= 39
        typ = m.group(8)
        if 'k' not in typ.lower(): skipped['griego: no está en el texto tradicional'] += 1; continue
        word = clean_greek(c[1])
        assert word, c[:4]
        strong = c[3].split('=')[0].strip()
        assert STRONG.match(strong), c[:4]
        # La numeración de la King James va entre corchetes cuando es distinta.
        if m.group(4) == '[': ch, v = int(m.group(5)), int(m.group(6))
        else: ch, v = int(m.group(2)), int(m.group(3))
        tokens[b].setdefault((ch, max(1, v)), []).append((word, strong))

    # ---- Léxicos ----
    def read_lex(name):
        f = glob.glob(os.path.join(step, 'Lexicons', name + '*'))[0]
        assert 'CC BY 4.0' in open(f, encoding='utf-8-sig').read(3000), f
        lex = {}
        for line in open(f, encoding='utf-8-sig'):
            c = line.rstrip('\n').split('\t')
            if len(c) < 7 or not re.match(r'^[HG]\d{4,5}[a-z]?$', c[0]): continue
            d = c[1].split('=')[0].strip()
            if STRONG.match(d) and d not in lex:
                lex[d] = (NFC(c[3].strip()), NFC(c[4].strip()), NFC(c[6].strip()), NFC(c[7].strip()) if len(c) > 7 else '')
        # Algunos números del texto no están tal cual en el léxico (G2453 está como G2453G): se busca por el número sin letra.
        base = collections.defaultdict(list)
        for d in lex: base[re.sub(r'[A-Za-z]$', '', d)].append(d)
        def find(s):
            if s in lex: return lex[s]
            b = re.sub(r'[A-Za-z]$', '', s)
            for k in (b, b + 'G'):
                if k in lex: return lex[k]
            return lex[sorted(base[b])[0]] if base.get(b) else None
        return find
    lex = {'H': read_lex('TBESH'), 'G': read_lex('TBESG')}

    def clean_def(s):
        s = re.sub(r'(?i)<br\s*/?>', '\n', s)
        s = re.sub(r'<[^>]*>', '', s)
        s = s.replace('__', '  ')
        s = re.sub(r'[ \t]+', ' ', s)
        s = re.sub(r' ?\n ?', '\n', s)
        return re.sub(r'\n{2,}', '\n', s).strip()

    os.makedirs(out, exist_ok=True)
    report = []
    total = 0
    for lang, books in (('H', range(0, 39)), ('G', range(39, 66))):
        freq = collections.Counter()
        where = collections.defaultdict(set)
        for b in books:
            for toks in tokens[b].values():
                for _, s in toks:
                    freq[s] += 1; where[s].add(b)
        missing = [s for s in freq if not lex[lang](s)]
        report.append(f'{lang}: lemas {len(freq)}, sin entrada en el léxico {len(missing)} {missing[:12]}')
        lemmas = [s for s, _ in freq.most_common()]
        lidx = {s: i for i, s in enumerate(lemmas)}
        rows = [lex[lang](s) or ('', '', '', '') for s in lemmas]
        for r in rows: assert not any('\t' in x for x in r[:3])
        k = table_of([x for r in rows for x in r[:3]], False)
        pos = {ch: i for i, ch in enumerate(k)}
        table = {
            'k': k,
            's': '\t'.join(lemmas),
            'w': '\t'.join(pack_text(r[0], pos) for r in rows),
            't': '\t'.join(pack_text(r[1], pos) for r in rows),
            'g': '\t'.join(pack_text(r[2], pos) for r in rows),
            'b': '\t'.join(''.join(enc(b) for b in sorted(where[s])) for s in lemmas),
        }
        with open(os.path.join(out, f'lex-{lang.lower()}.json'), 'w', encoding='utf-8') as f:
            json.dump(table, f, ensure_ascii=False, separators=(',', ':'))
        if lang == 'G':
            chunks = collections.defaultdict(dict)
            for s, r in zip(lemmas, rows):
                d = clean_def(r[3])
                if d: chunks[min(int(s[1:5 if len(re.sub(r'[A-Za-z]$', '', s)) == 5 else 6]) // 500, 12)][s] = d
            for k in range(13):
                dk = table_of(chunks.get(k, {}).values(), False)
                dpos = {ch: i for i, ch in enumerate(dk)}
                with open(os.path.join(out, f'def-g-{k:02d}.json'), 'w', encoding='utf-8') as f:
                    json.dump({'k': dk, 'd': {s: pack_text(d, dpos) for s, d in sorted(chunks.get(k, {}).items())}}, f, ensure_ascii=False, separators=(',', ':'))
            report.append(f'G: definiciones {sum(len(c) for c in chunks.values())}')
        for b in books:
            ffreq = collections.Counter(t for toks in tokens[b].values() for t in toks)
            forms = [t for t, _ in ffreq.most_common()]
            fidx = {t: i for i, t in enumerate(forms)}
            for w, _ in forms: assert w and ' ' not in w and '"' not in w, w
            chapters = []
            for c in range(1, CHAPTERS[b] + 1):
                n = max([v for (cc, v) in tokens[b] if cc == c], default=0)
                assert n, (CODES[b], c)
                chapters.append([''.join(enc(fidx[t]) for t in tokens[b].get((c, v), [])) for v in range(1, n + 1)])
                total += sum(len(tokens[b].get((c, v), [])) for v in range(1, n + 1))
            assert not any(cc > CHAPTERS[b] for (cc, _) in tokens[b]), CODES[b]
            if kjv_dir:
                kjv = json.load(open(os.path.join(kjv_dir, f'{b:02d}.json'), encoding='utf-8'))
                for c, ch in enumerate(chapters):
                    if len(ch) != len(kjv[c]):
                        report.append(f'OJO {CODES[b]} {c + 1}: {len(ch)} versículos acá, {len(kjv[c])} en la KJV de la app')
                    empty = [v + 1 for v, t in enumerate(ch) if not t and v < len(kjv[c])]
                    if empty: report.append(f'OJO {CODES[b]} {c + 1}: sin palabras en los versículos {empty}')
            wk = table_of([w for w, _ in forms], True)
            wpos = {ch: i for i, ch in enumerate(wk)}
            data = {'k': wk, 'w': ' '.join(pack_word(w, wpos) for w, _ in forms), 'l': ''.join(enc(lidx[s]) for _, s in forms),
                    'c': [' '.join(ch) for ch in chapters]}
            with open(os.path.join(out, f'{b:02d}.json'), 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('palabras', total)
    for k, n in skipped.items(): print('no entran:', k, n)
    print('\n'.join(report))

main()
