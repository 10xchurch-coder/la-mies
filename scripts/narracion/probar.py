#!/usr/bin/env python3
"""probar.py LL-CC INDICE_INICIAL id id ... : busca el nombre hf_FECHA_HORA_id de cada trabajo y lo anota en LL-CC.txt"""
import sys, time, datetime, urllib.request, concurrent.futures as cf
BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3MOp2KrVxlULBbdqXUEM1sjRuXl/'
cap, i0, ids = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
t0 = datetime.datetime.utcnow()
def existe(n):
    try:
        r = urllib.request.urlopen(urllib.request.Request(BASE + n + '.mp3', method='HEAD'), timeout=10)
        return n if r.status == 200 else None
    except Exception: return None
falta = dict(enumerate(ids, i0)); hallado = {}
fin = time.time() + 100
ex = cf.ThreadPoolExecutor(48)
while falta and time.time() < fin:
    for i, j in list(falta.items()):
        cands = [f'hf_{(t0 + datetime.timedelta(seconds=s)):%Y%m%d_%H%M%S}_{j}' for s in range(-150, 5)]
        r = [x for x in ex.map(existe, cands) if x]
        if r: hallado[i] = r[0]; del falta[i]
    if falta: time.sleep(4)
with open(cap + '.txt', 'a') as f:
    for i in sorted(hallado): f.write(f'{i} {hallado[i]}\n')
print('hallados', len(hallado), 'FALTAN', falta if falta else 'ninguno')
