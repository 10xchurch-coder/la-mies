#!/usr/bin/env python3
"""Convierte las referencias cruzadas de openbible.info (CC-BY) a un archivo por libro para la app.
Fuente: cross_references.txt (github.com/scrollmapper/bible_databases, sources/extras/; la primera línea dice
"#www.openbible.info CC-BY 2024-11-04"). Viene de https://www.openbible.info/labs/cross-references/ y parte del
Treasury of Scripture Knowledge (dominio público).
Uso: python3 scripts/bible-import-xrefs.py cross_references.txt src/data/bible/xrefs src/data/bible/kjv [MAX_POR_VERSICULO]
(la carpeta de la King James se usa para saber cuántos versículos tiene cada capítulo)
Cada archivo NN.json es un libro: lista de capítulos; cada capítulo, lista de versículos; cada versículo, lista de números
ya ordenados por los votos de la fuente (el más votado primero). Un número es
  libro*10^8 + capítulo*10^5 + versículo*100 + cuántos versículos más abarca (0 = uno solo).
Se dejan afuera las referencias con votos negativos o en cero. Un tramo que pasa de capítulo se corta al final del capítulo.
La numeración de versículos es la de la King James (la que usa la fuente). Lo único distinto: la fuente trae 3 Juan 15,
que en la King James es parte del versículo 14; sus referencias se suman a las del 14."""
import json, os, sys

CHAPTERS = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,
            28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22]
OSIS = ('Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek '
        'Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col '
        '1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev').split()
IDX = {b: i for i, b in enumerate(OSIS)}

src, out, kjv = sys.argv[1], sys.argv[2], sys.argv[3]
cap = int(sys.argv[4]) if len(sys.argv) > 4 else 0
# Cuántos versículos tiene cada capítulo en la King James.
LEN = {}
for i in range(66):
    for c, ch in enumerate(json.load(open(os.path.join(kjv, f'{i:02d}.json'), encoding='utf-8')), 1):
        LEN[(i, c)] = len(ch)

def ref(s):
    b, c, v = s.split('.')
    return IDX[b], int(c), int(v)

rows = {}
total = kept = 0
for line in open(src, encoding='utf-8'):
    if line.startswith('From') or not line.strip():
        continue
    a, b, votes = line.rstrip('\n').split('\t')[:3]
    total += 1
    if int(votes) <= 0:
        continue
    frm = ref(a)
    if frm[2] > LEN[frm[:2]]:
        frm = (frm[0], frm[1], LEN[frm[:2]])
    parts = b.split('-')
    to = ref(parts[0])
    extra = 0
    if len(parts) > 1:
        end = ref(parts[1])
        # Mismo capítulo: hasta el versículo final. Si pasa de capítulo: hasta donde dé (la app lo corta al final del capítulo).
        last = end[2] if end[:2] == to[:2] else LEN[to[:2]]
        extra = max(0, min(99, min(last, LEN[to[:2]]) - to[2]))
    assert to[2] <= LEN[to[:2]], b
    rows.setdefault(frm, []).append((-int(votes), to[0] * 10**8 + to[1] * 10**5 + to[2] * 100 + extra))

os.makedirs(out, exist_ok=True)
LAST = {}
for k in rows:
    LAST[k[:2]] = max(LAST.get(k[:2], 0), k[2])
for i, n in enumerate(CHAPTERS):
    book = []
    for c in range(1, n + 1):
        last = LAST.get((i, c), 0)
        ch = []
        for v in range(1, last + 1):
            r = sorted(rows.get((i, c, v), []))
            seen = set()
            r = [x for x in r if not (x[1] in seen or seen.add(x[1]))]
            if cap: r = r[:cap]
            kept += len(r)
            ch.append([x[1] for x in r])
        book.append(ch)
    with open(os.path.join(out, f'{i:02d}.json'), 'w', encoding='utf-8') as f:
        json.dump(book, f, separators=(',', ':'))
print('referencias en la fuente', total, 'guardadas', kept)
