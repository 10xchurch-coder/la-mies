#!/usr/bin/env python3
"""Convierte la King James Version (OSIS de eBible.org, tomado de github.com/seven1m/open-bibles, archivo eng-kjv.osis.xml)
a un archivo por libro para la app, igual que la RV1909.
Uso: python3 scripts/bible-import-kjv.py eng-kjv.osis.xml src/data/bible/kjv
- Solo los 66 libros (la fuente trae también los apócrifos: no se incluyen).
- Los títulos de los salmos ("A Psalm of David...") y las letras del Salmo 119 van al principio del versículo que sigue,
  como en la RV1909 de la app.
- Las palabras en cursiva de la KJV (transChange) quedan como texto común.
Falla si falta un libro, un capítulo o un versículo."""
import json, os, re, sys

CHAPTERS = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,
            28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22]
OSIS = ('Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek '
        'Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col '
        '1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev').split()
IDX = {b: i for i, b in enumerate(OSIS)}

src, out = sys.argv[1], sys.argv[2]
xml = open(src, encoding='utf-8').read()
xml = xml[xml.index('</header>'):]
ENT = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"}

verses = {}      # (libro, capítulo, versículo) -> texto
cur = None       # versículo abierto
buf = []
pending = ''     # título de salmo que espera al versículo siguiente
in_title = None  # None, 'psalm' (se guarda) o 'skip'
tbuf = []
for m in re.finditer(r'<[^>]+>|[^<]+', xml):
    t = m.group(0)
    if t[0] != '<':
        if in_title == 'psalm': tbuf.append(t)
        elif in_title is None and cur: buf.append(t)
        continue
    if t.startswith('<title'):
        in_title = 'psalm' if 'type="psalm"' in t else 'skip'
        tbuf = []
    elif t.startswith('</title'):
        if in_title == 'psalm':
            pending = (pending + ' ' + ''.join(tbuf)).strip()
        in_title = None
    elif t.startswith('<verse'):
        s = re.search(r'osisID="([^"]+)"', t)
        if s and 'sID=' in t:
            b, c, v = s.group(1).split('.')
            cur = (IDX[b], int(c), int(v)) if b in IDX else None
            buf = [pending + ' '] if (pending and cur) else []
            pending = ''
        elif 'eID=' in t and cur:
            text = ''.join(buf)
            for k, r in ENT.items(): text = text.replace(k, r)
            verses[cur] = re.sub(r'\s+', ' ', text).strip()
            cur = None

os.makedirs(out, exist_ok=True)
total = 0
for i, n in enumerate(CHAPTERS):
    book = []
    for c in range(1, n + 1):
        ch = []
        v = 1
        while (i, c, v) in verses:
            assert verses[(i, c, v)], (OSIS[i], c, v)
            ch.append(verses[(i, c, v)]); v += 1
        assert ch, (OSIS[i], c)
        assert not any(k[0] == i and k[1] == c and k[2] > len(ch) for k in verses), ('hueco', OSIS[i], c)
        total += len(ch)
        book.append(ch)
    assert not any(k[0] == i and k[1] > n for k in verses), OSIS[i]
    with open(os.path.join(out, f'{i:02d}.json'), 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, separators=(',', ':'))
print('libros', len(CHAPTERS), 'capítulos', sum(CHAPTERS), 'versículos', total)
