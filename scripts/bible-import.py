#!/usr/bin/env python3
"""Convierte una Biblia en JSON (scrollmapper/bible_databases) a un archivo por libro para la app.
Uso: python3 scripts/bible-import.py ORIGEN.json src/data/bible/rv1909
Cada archivo NN.json es una lista de capítulos; cada capítulo, una lista de versículos (versículo 1 = posición 0).
Los capítulos se numeran como en la fuente. Falla si falta algún libro, capítulo o versículo, o si los capítulos no coinciden con BOOKS de src/lib/biblePlan.ts."""
import json, os, re, sys

CHAPTERS = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,
            28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22]

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
books = d['books']
assert len(books) == 66, len(books)
os.makedirs(out, exist_ok=True)
total = 0
for i, b in enumerate(books):
    chs = sorted(b['chapters'], key=lambda c: c['chapter'])
    assert len(chs) == CHAPTERS[i], (b['name'], len(chs), CHAPTERS[i])
    book = []
    for n, c in enumerate(chs, 1):
        assert c['chapter'] == n, (b['name'], c['chapter'], n)
        vs = sorted(c['verses'], key=lambda v: v['verse'])
        for k, v in enumerate(vs, 1):
            assert v['verse'] == k, (b['name'], n, v['verse'], k)
        texts = [re.sub(r'\s+', ' ', v['text']).strip() for v in vs]
        # La fuente completa con versículos vacíos al final de algunos capítulos (Job 38, Jonás 1, 2 Co 13...):
        # no falta texto, es otra numeración (el texto va en el capítulo siguiente). Se sacan los vacíos del final;
        # uno vacío en el medio sí sería un error.
        while texts and not texts[-1]:
            texts.pop()
        assert texts and all(texts), (b['name'], n)
        total += len(texts)
        book.append(texts)
    with open(os.path.join(out, f'{i:02d}.json'), 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, separators=(',', ':'))
print('libros', len(books), 'capítulos', sum(CHAPTERS), 'versículos', total)
