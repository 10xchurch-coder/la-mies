#!/usr/bin/env python3
"""Arma el plan de voces de un capítulo de la Biblia narrada (Reina Valera Gómez).

Uso:  python3 armar.py LIBRO CAP        (LIBRO de 0 a 65, CAP desde 1)
Lee   tags/LL/CC.txt   -> quién habla en cada cita (lo demás lo lee el narrador)
Deja  planes/LL-CC.json -> {"batches": [[pedido, ...], ...], "orden": [...]}  (tandas de 8 para generate_audio_batch)

Cada línea de tags:   VERSO[-VERSO] | QUIÉN | primeras palabras de la cita | últimas palabras de la cita
QUIÉN: jesus, dios, angel, o con prefijo  h:Nombre (hombre)  v:Nombre (hombre mayor)  m:Nombre (mujer)  n:Nombre (niño)  g:grupo
Se puede fijar la voz de alguien con  h:Nombre=voz  (por ejemplo h:Salomón=sterling) la primera vez que aparece en el archivo.
Las palabras tienen que estar tal cual en el texto. Si no se encuentran, el programa avisa y no arma nada.
"""
import hashlib, json, os, re, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
RVG = os.path.join(AQUI, '..', '..', 'src', 'data', 'bible', 'rvg')
V = {'andre': 'f1e8226e-2248-4d5f-b43c-0a79e9949dbf', 'xavier': '43173c95-3ec8-446a-a162-6504332c578b', 'desmond': '563f728c-e249-5a85-97ab-8461e8c09da6',
     'sterling': 'dc382508-c8bd-443c-8cb2-46e57b8d2e6f', 'arthur': '30fc8796-ceb6-4a66-b3a7-4a145ef7f346', 'gideon': '1ad38ba4-9cc4-4f2f-9fde-b0fefdf67ae5',
     'marcus': '6f98d3dd-324f-4845-8c28-c1d1647a06cd', 'julian': '95429266-c0ac-4137-a209-63b8812b0f23', 'elena': 'ca83ca7f-c186-493d-bd69-0d765fa861b2',
     'naomi': 'caeba733-3c17-43db-863e-69c7025512cd', 'helena': '3c2b83c0-2e0a-5ae8-998a-a5fe71b7eccd', 'soraya': '5c1d2f7f-cdb4-5b1d-bca9-156439e3275e',
     'benji': 'e6f9b893-51b1-51d3-afe9-9e0482cb7ac1'}
HOMBRES = ['desmond', 'sterling', 'arthur', 'julian']
MAYORES = ['desmond', 'arthur']
MUJERES = ['elena', 'naomi', 'helena', 'soraya']
FIJOS = {'narrador': 'andre', 'jesus': 'xavier', 'dios': 'marcus', 'angel': 'gideon'}
LIBROS = ['Génesis', 'Éxodo', 'Levítico', 'Números', 'Deuteronomio', 'Josué', 'Jueces', 'Rut', 'Primero de Samuel', 'Segundo de Samuel', 'Primero de Reyes', 'Segundo de Reyes',
          'Primero de Crónicas', 'Segundo de Crónicas', 'Esdras', 'Nehemías', 'Ester', 'Job', 'Salmo', 'Proverbios', 'Eclesiastés', 'Cantares', 'Isaías', 'Jeremías', 'Lamentaciones',
          'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amós', 'Abdías', 'Jonás', 'Miqueas', 'Nahúm', 'Habacuc', 'Sofonías', 'Hageo', 'Zacarías', 'Malaquías', 'Mateo', 'Marcos', 'Lucas', 'Juan',
          'Hechos', 'Romanos', 'Primera a los Corintios', 'Segunda a los Corintios', 'Gálatas', 'Efesios', 'Filipenses', 'Colosenses', 'Primera a los Tesalonicenses',
          'Segunda a los Tesalonicenses', 'Primera a Timoteo', 'Segunda a Timoteo', 'Tito', 'Filemón', 'Hebreos', 'Santiago', 'Primera de Pedro', 'Segunda de Pedro', 'Primera de Juan',
          'Segunda de Juan', 'Tercera de Juan', 'Judas', 'Apocalipsis']


USADAS = {}   # en este capítulo: quién -> voz, para que dos personas distintas no suenen igual


def voz(quien):
    q = quien.strip().lower()
    if '=' in q:   # "h:Salomón=sterling" fija la voz de esa persona en el capítulo (para que no cambie de un capítulo a otro)
        q, _, fija = [x.strip() for x in q.partition('=')]
        if fija not in V: raise SystemExit(f'No conozco la voz "{fija}"')
        USADAS[q] = fija
    if q in FIJOS: return FIJOS[q]
    if q in USADAS: return USADAS[q]
    tipo, _, nombre = q.partition(':')
    lista = {'h': HOMBRES, 'g': HOMBRES, 'v': MAYORES, 'm': MUJERES, 'n': ['benji']}.get(tipo)
    if not lista: raise SystemExit(f'No sé qué voz es "{quien}"')
    k = int(hashlib.md5(nombre.encode()).hexdigest(), 16) % len(lista)
    libres = [lista[(k + i) % len(lista)] for i in range(len(lista)) if lista[(k + i) % len(lista)] not in USADAS.values()]
    USADAS[q] = (libres or [lista[k]])[0]
    return USADAS[q]


def trozos(texto, tope=900):
    """Parte un texto largo en pedazos, siempre al final de una oración."""
    out, cur = [], ''
    for o in re.findall(r'[^.;:!?]+[.;:!?]*\s*', texto):
        if cur and len(cur) + len(o) > tope: out.append(cur.strip()); cur = ''
        cur += o
    if cur.strip(): out.append(cur.strip())
    return out


def main(libro, cap):
    versos = json.load(open(os.path.join(RVG, f'{libro:02d}.json')))[cap - 1]
    ini, pos = [], 0
    for v in versos: ini.append(pos); pos += len(v) + 1
    todo = ' '.join(versos)
    marcas = []
    f = os.path.join(AQUI, 'tags', f'{libro:02d}', f'{cap:02d}.txt')
    for n, linea in enumerate(open(f, encoding='utf8') if os.path.exists(f) else [], 1):
        linea = linea.strip()
        if not linea or linea.startswith('#'): continue
        vs, quien, a, b = [x.strip() for x in linea.split('|')]
        v1, _, v2 = vs.partition('-'); v1 = int(v1); v2 = int(v2 or v1)
        desde = todo.find(a, ini[v1 - 1], ini[v1 - 1] + len(versos[v1 - 1]) + 1)
        fin_v = ini[v2 - 1] + len(versos[v2 - 1])
        hasta = todo.rfind(b, max(desde, ini[v2 - 1] - len(b)), fin_v)
        if desde < 0 or hasta < 0: raise SystemExit(f'{f} línea {n}: no encuentro "{a if desde < 0 else b}"')
        marcas.append((desde, hasta + len(b), voz(quien)))
    marcas.sort()
    segs, p = [], 0
    for d, h, vz in marcas:
        if d < p: raise SystemExit(f'Citas encimadas cerca de "{todo[d:d+40]}"')
        if todo[p:d].strip(): segs.append(('andre', todo[p:d].strip()))
        segs.append((vz, todo[d:h].strip())); p = h
    if todo[p:].strip(): segs.append(('andre', todo[p:].strip()))
    titulo = f'{LIBROS[libro]} {cap}.' if libro == 18 else f'{LIBROS[libro]}, capítulo {cap}.'
    segs.insert(0, ('andre', titulo))
    # junta lo seguido de la misma voz y corta lo largo
    juntos = []
    for vz, t in segs:
        t = re.sub(r'^[)\s]+|[(\s]+$', '', t)
        if not re.search(r'\w', t): continue
        if juntos and juntos[-1][0] == vz: juntos[-1][1] += ' ' + t
        else: juntos.append([vz, t])
    pedidos = []
    for vz, t in juntos:
        for tr in trozos(t):
            pedidos.append({'index': len(pedidos), 'params': {'model': 'text2speech_v2', 'variant': 'elevenlabs', 'voice_type': 'preset', 'voice_id': V[vz], 'prompt': tr}})
    os.makedirs(os.path.join(AQUI, 'planes'), exist_ok=True)
    plan = {'libro': libro, 'cap': cap, 'voces': [vz for vz, t in juntos for _ in trozos(t)], 'batches': [pedidos[i:i + 8] for i in range(0, len(pedidos), 8)]}
    json.dump(plan, open(os.path.join(AQUI, 'planes', f'{libro:02d}-{cap:02d}.json'), 'w'), ensure_ascii=False)
    print(f'{LIBROS[libro]} {cap}: {len(pedidos)} pedazos en {len(plan["batches"])} tandas, {sum(len(p["params"]["prompt"]) for p in pedidos)} letras')
    for p in pedidos: print(f'  {p["index"]:3d} {plan["voces"][p["index"]]:9s} {p["params"]["prompt"][:70]}')


if __name__ == '__main__':
    main(int(sys.argv[1]), int(sys.argv[2]))
