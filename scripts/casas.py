#!/usr/bin/env python3
"""Casas de la zona: un punto por casa, adelante, mirando a la calle.

Fuentes de edificios (con su contorno, no solo el centro):
  - Overture Maps (reúne OpenStreetMap, Microsoft, Google Open Buildings y Esri). Es la principal.
  - Google Open Buildings v3, si Overture no está disponible (SOURCE=google).
Calles: © colaboradores de OpenStreetMap (ODbL), las mismas que usa la app.

Cómo se pasa de "edificios vistos desde el satélite" a "casas":
  1. Cada edificio se asigna a la cuadra (tramo de calle) y vereda más cercana.
  2. Casas pegadas (las del IPRODHA, dúplex, hileras) se ven como un solo techo largo: si el frente mide
     bastante más que un lote (LOT_W, 9 m), se parte en tantas casas como lotes entran.
  3. El punto va al frente de cada casa (2,5 m adentro de la pared que da a la calle), no al centro del techo.
  4. Lo del fondo del terreno (quinchos, piezas, galpones) no es otra casa: si hay un edificio más cerca
     de la calle en el mismo lote, el de atrás se descarta.
  5. Lo que queda a más de MAX_FRONT metros de la calle (el medio de la manzana) no se cuenta.
Resultado: data/casas_<ciudad>.csv con lat,lng,area,road_id,seg,side (lo carga la base con load_houses).
Al final imprime el control de la cuadra de prueba (CHECK_ROAD, CHECK_SEGS).
"""
import csv, gzip, io, json, math, os, re, subprocess, sys, time, urllib.parse, urllib.request

BBOX = tuple(float(x) for x in os.environ.get('BBOX', '-27.55,-56.05,-27.30,-55.65').split(','))  # sur,oeste,norte,este
SOURCE = os.environ.get('SOURCE', 'overture')
OVERTURE_RELEASE = os.environ.get('OVERTURE_RELEASE', '2026-10-21.0')
CELL = os.environ.get('CELL', '945')
OUT = os.environ.get('OUT', 'data/casas_posadas.csv')
MIN_CONF = float(os.environ.get('MIN_CONF', '0.70'))   # solo para Google: más bajo = menos casas perdidas
MIN_AREA = float(os.environ.get('MIN_AREA', '18'))     # m² (una pieza chica igual es una casa)
MAX_AREA = float(os.environ.get('MAX_AREA', '3000'))
LOT_W = float(os.environ.get('LOT_W', '10'))           # ancho típico de un lote en Posadas
MAX_ASSIGN = float(os.environ.get('MAX_ASSIGN', '40')) # metros de la pared más cercana a la calle
MAX_FRONT = float(os.environ.get('MAX_FRONT', '28'))   # más lejos que esto, es el medio de la manzana
BACK_GAP = float(os.environ.get('BACK_GAP', '6'))      # 6 m más atrás que otro en el mismo lote = fondo
CHECK_ROAD = int(os.environ.get('CHECK_ROAD', '92236456'))  # Calle 174a entre 9 de Julio y 77A
CHECK_SEGS = tuple(int(x) for x in os.environ.get('CHECK_SEGS', '0,1').split(','))
TYPES = 'residential|primary|secondary|tertiary|unclassified|living_street|pedestrian|trunk|primary_link|secondary_link|tertiary_link|service'
R = 6371000.0
DEG = math.pi / 180


def to_local(o, p):
    return ((p[1] - o[1]) * DEG * R * math.cos(o[0] * DEG), (p[0] - o[0]) * DEG * R)


def to_geo(o, x, y):
    return (o[0] + y / (DEG * R), o[1] + x / (DEG * R * math.cos(o[0] * DEG)))


def parse_wkt(w):
    """Primer anillo de un POLYGON o MULTIPOLYGON en WKT → lista de (lat, lng)."""
    m = re.search(r'\(\(\(?([^()]+)\)', w)
    if not m:
        return None
    pts = []
    for pair in m.group(1).split(','):
        a = pair.strip().split()
        if len(a) >= 2:
            pts.append((float(a[1]), float(a[0])))
    return pts if len(pts) >= 3 else None


def area_m2(ring):
    o = ring[0]
    xy = [to_local(o, p) for p in ring]
    return abs(sum(xy[i][0] * xy[i - 1][1] - xy[i - 1][0] * xy[i][1] for i in range(len(xy)))) / 2


def buildings_overture():
    s, w, n, e = BBOX
    sql = f"""
INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
COPY (
  SELECT ST_AsText(geometry) AS wkt
  FROM read_parquet('s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}
) TO 'buildings.csv' (HEADER, DELIMITER ',');
"""
    print('Bajando edificios de Overture', OVERTURE_RELEASE, flush=True)
    import duckdb  # noqa
    duckdb.connect().execute(sql)
    out = []
    csv.field_size_limit(10 ** 9)
    with open('buildings.csv', newline='') as f:
        for row in csv.DictReader(f):
            ring = parse_wkt(row['wkt'])
            if ring:
                out.append(ring)
    print(f'{len(out):,} edificios de Overture', flush=True)
    return out


def buildings_google():
    url = f'https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip/{CELL}_buildings.csv.gz'
    print('Bajando', url, flush=True)
    s, w, n, e = BBOX
    out = []
    csv.field_size_limit(10 ** 9)
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'LaMies/1.0'})) as r:
        f = io.TextIOWrapper(gzip.GzipFile(fileobj=r), encoding='utf-8')
        rd = csv.reader(f)
        head = next(rd)
        il, io_, ic, ig = head.index('latitude'), head.index('longitude'), head.index('confidence'), head.index('geometry')
        for row in rd:
            lat, lng = float(row[il]), float(row[io_])
            if s <= lat <= n and w <= lng <= e and float(row[ic]) >= MIN_CONF:
                ring = parse_wkt(row[ig])
                if ring:
                    out.append(ring)
    print(f'{len(out):,} edificios de Google', flush=True)
    return out


def roads():
    s, w, n, e = BBOX
    ways = {}
    la = s
    while la < n - 1e-9:
        lo = w
        while lo < e - 1e-9:
            q = f'[out:json][timeout:120];way["highway"~"^({TYPES})$"]({la},{lo},{min(la+0.05,n)},{min(lo+0.05,e)});out geom;'
            data = None
            for attempt in range(6):
                try:
                    req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': q}).encode(),
                                                 headers={'User-Agent': 'LaMies/1.0 (app de una iglesia; github.com/10xchurch-coder/la-mies)', 'Accept': 'application/json'})
                    data = urllib.request.urlopen(req, timeout=180).read()
                    break
                except Exception as ex:  # noqa
                    print('  reintento Overpass', ex, flush=True); time.sleep(20 * (attempt + 1))
            if data is None:
                raise SystemExit('Overpass no respondió')
            for el in json.loads(data)['elements']:
                if el.get('type') != 'way' or len(el.get('geometry', [])) < 2:
                    continue
                tags = el.get('tags', {})
                if tags.get('highway') == 'service' and not tags.get('name'):
                    continue
                ways[el['id']] = [(round(g['lat'], 6), round(g['lon'], 6)) for g in el['geometry']]
            lo = round(lo + 0.05, 6)
        la = round(la + 0.05, 6)
    print(f'{len(ways):,} calles', flush=True)
    return ways


def main():
    ways = roads()
    G = 0.0006  # grilla de tramos (~65 m)
    grid = {}
    for rid, pts in ways.items():
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            for gy in range(int(math.floor(min(a[0], b[0]) / G)) - 1, int(math.floor(max(a[0], b[0]) / G)) + 2):
                for gx in range(int(math.floor(min(a[1], b[1]) / G)) - 1, int(math.floor(max(a[1], b[1]) / G)) + 2):
                    grid.setdefault((gy, gx), []).append((rid, i))

    rings = buildings_overture() if SOURCE == 'overture' else buildings_google()
    units = []  # (rid, seg, side, t0, t1, front, back, area, lat, lng)
    stats = {'edificios': 0, 'chicos_o_grandes': 0, 'lejos_de_calle': 0, 'partidos': 0}
    for ring in rings:
        stats['edificios'] += 1
        ar = area_m2(ring)
        if not (MIN_AREA <= ar <= MAX_AREA):
            stats['chicos_o_grandes'] += 1
            continue
        clat = sum(p[0] for p in ring) / len(ring)
        clng = sum(p[1] for p in ring) / len(ring)
        best = None
        for rid, i in grid.get((int(math.floor(clat / G)), int(math.floor(clng / G))), []):
            a, b = ways[rid][i], ways[rid][i + 1]
            bx, by = to_local(a, b)
            L = math.hypot(bx, by)
            if L < 1:
                continue
            ux, uy = bx / L, by / L
            ts, ds = [], []
            for p in ring:
                px, py = to_local(a, p)
                ts.append(px * ux + py * uy)
                ds.append(ux * py - uy * px)  # + a la izquierda, − a la derecha (como la app)
            cx, cy = to_local(a, (clat, clng))
            side = 1 if (ux * cy - uy * cx) >= 0 else -1
            near = min(abs(d) for d in ds)
            tc = cx * ux + cy * uy
            if tc < -8 or tc > L + 8:
                continue  # el edificio no está frente a este tramo
            if near <= MAX_ASSIGN and (best is None or near < best[0]):
                best = (near, rid, i, side, min(ts), max(ts), max(abs(d) for d in ds), L, a, ux, uy)
        if not best:
            stats['lejos_de_calle'] += 1
            continue
        near, rid, i, side, t0, t1, back, L, a, ux, uy = best
        t0, t1 = max(t0, -2.0), min(t1, L + 2.0)
        frontage = t1 - t0
        n = max(1, round(frontage / LOT_W)) if frontage >= 2.2 * LOT_W else 1  # solo techos claramente de varias casas (filas de departamentos o locales)
        if n > 1:
            stats['partidos'] += 1
        wseg = frontage / n
        for k in range(n):
            u0, u1 = t0 + k * wseg, t0 + (k + 1) * wseg
            tm = (u0 + u1) / 2
            off = near + 2.5
            x = ux * tm - uy * off * side
            y = uy * tm + ux * off * side
            lat, lng = to_geo(a, x, y)
            units.append([rid, i, side, u0, u1, near, back, ar / n, lat, lng])

    # Por cuadra y vereda: descartar lo del fondo del lote y lo del medio de la manzana.
    by = {}
    for u in units:
        by.setdefault((u[0], u[1], u[2]), []).append(u)
    rows = []
    dropped_back = dropped_mid = 0
    for key, us in by.items():
        us.sort(key=lambda u: u[5])  # primero los más cerca de la calle
        kept = []
        for u in us:
            if u[5] > MAX_FRONT:
                dropped_mid += 1
                continue
            w = u[4] - u[3]
            behind = False
            for k in kept:
                ov = min(u[4], k[4]) - max(u[3], k[3])
                if ov >= 0.5 * min(w, k[4] - k[3]) and u[5] >= k[5] + BACK_GAP:
                    behind = True
                    break
                # mismo lote y casi pegados: es la misma casa (un alero, un garaje)
                if ov >= 0.6 * min(w, k[4] - k[3]) and abs(u[5] - k[5]) < BACK_GAP and u[7] < 30:
                    behind = True
                    break
            if behind:
                dropped_back += 1
                continue
            kept.append(u)
        for u in kept:
            rows.append((round(u[8], 6), round(u[9], 6), int(round(u[7])), u[0], u[1], u[2]))

    print(f"{stats['edificios']:,} edificios · {stats['chicos_o_grandes']:,} fuera de tamaño · {stats['lejos_de_calle']:,} lejos de la calle · "
          f"{stats['partidos']:,} techos partidos en varias casas · {dropped_back:,} del fondo del lote · {dropped_mid:,} del medio de la manzana", flush=True)
    os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
    with open(OUT, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['lat', 'lng', 'area', 'road_id', 'seg', 'side'])
        w.writerows(rows)
    print(f'Listo: {len(rows):,} casas → {OUT}', flush=True)
    chk = [r for r in rows if r[3] == CHECK_ROAD and r[4] in CHECK_SEGS]
    print(f'CONTROL calle {CHECK_ROAD} tramos {CHECK_SEGS}: vereda +1 = {sum(1 for r in chk if r[5] == 1)} casas, vereda -1 = {sum(1 for r in chk if r[5] == -1)} casas', flush=True)
    for r in sorted(chk, key=lambda r: (r[5], r[1], r[1])):
        print('   ', r, flush=True)


if __name__ == '__main__':
    main()
