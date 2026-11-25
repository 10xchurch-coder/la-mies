#!/usr/bin/env python3
"""repartir.py G LL-CC LL-CC ... : reparte G.txt (index corrido del grupo) en LL-CC.txt por capítulo"""
import json, sys
g, caps = sys.argv[1], sys.argv[2:]
nom = {}
for l in open(g + '.txt'):
    i, n = l.split(); nom[int(i)] = n
k = 0; falta = []
for c in caps:
    n = len(json.load(open(f'/home/claude/la-mies/scripts/narracion/planes/{c}.json'))['voces'])
    rows = [(i, nom.get(k + i)) for i in range(n)]
    falta += [k + i for i, x in rows if not x]
    if all(x for _, x in rows): open(c + '.txt', 'w').write(''.join(f'{i} {x}\n' for i, x in rows))
    k += n
print('total', k, 'FALTAN', falta or 'ninguno')
