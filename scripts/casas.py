#!/usr/bin/env python3
"""Casas de la zona a partir de Google Open Buildings (edificios detectados con IA en imágenes satelitales).

Baja el archivo de la región, se queda con los edificios de la zona de la iglesia, y a cada uno le asigna
la calle, el tramo y la vereda (con las mismas cuentas que la app), usando las calles de OpenStreetMap.
Resultado: data/casas_<ciudad>.csv con lat,lng,area,road_id,seg,side.

Datos: Google Open Buildings v3 (CC BY-4.0) · Calles: © colaboradores de OpenStreetMap (ODbL).
"""
import csv, gzip, io, json, math, os, sys, time, urllib.parse, urllib.request

BBOX = tuple(float(x) for x in os.environ.get('BBOX', '-27.55,-56.05,-27.30,-55.65').split(','))  # sur,oeste,norte,este
CELL = os.environ.get('CELL', '945')
OUT = os.environ.get('OUT', 'data/casas_posadas.csv')
MIN_CONF = float(os.environ.get('MIN_CONF', '0.72'))
MAX_DIST = float(os.environ.get('MAX_DIST', '45'))  # metros desde la calle
TYPES = 'residential|primary|secondary|tertiary|unclassified|living_street|pedestrian|trunk|primary_link|secondary_link|tertiary_link|service'
R = 6371000.0
DEG = math.pi / 180

def local(o, p):
    return ((p[1] - o[1]) * DEG * R * math.cos(o[0] * DEG), (p[0] - o[0]) * DEG * R)

def buildings():
    url = f'https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip/{CELL}_buildings.csv.gz'
    print('Bajando', url, flush=True)
    s, w, n, e = BBOX
    out = []
    with urllib.request.urlopen(url) as r:
        f = io.TextIOWrapper(gzip.GzipFile(fileobj=r), encoding='utf-8')
        rd = csv.reader(f)
        head = next(rd)
        il, io_, ia, ic = head.index('latitude'), head.index('longitude'), head.index('area_in_meters'), head.index('confidence')
        for i, row in enumerate(rd):
            lat, lng = float(row[il]), float(row[io_])
            if s <= lat <= n and w <= lng <= e:
                conf, area = float(row[ic]), float(row[ia])
                if conf >= MIN_CONF and 18 <= area <= 3000:
                    out.append((lat, lng, area))
            if i % 2000000 == 0:
                print(f'  {i:,} leídos, {len(out):,} en la zona', flush=True)
    print(f'{len(out):,} edificios en la zona', flush=True)
    return out

def roads():
    s, w, n, e = BBOX
    ways = {}
    la = s
    while la < n - 1e-9:
        lo = w
        while lo < e - 1e-9:
            q = f'[out:json][timeout:120];way["highway"~"^({TYPES})$"]({la},{lo},{min(la+0.05,n)},{min(lo+0.05,e)});out geom;'
            for attempt in range(5):
                try:
                    data = urllib.request.urlopen('https://overpass-api.de/api/interpreter?' + urllib.parse.urlencode({'data': q}), timeout=180).read()
                    break
                except Exception as ex:  # noqa
                    print('  reintento Overpass', ex, flush=True); time.sleep(20 * (attempt + 1))
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
    # grilla de tramos (celdas de ~0.0006° ≈ 65 m)
    G = 0.0006
    grid = {}
    for rid, pts in ways.items():
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            for gy in range(int(math.floor(min(a[0], b[0]) / G)) - 1, int(math.floor(max(a[0], b[0]) / G)) + 2):
                for gx in range(int(math.floor(min(a[1], b[1]) / G)) - 1, int(math.floor(max(a[1], b[1]) / G)) + 2):
                    grid.setdefault((gy, gx), []).append((rid, i))
    rows = []
    for lat, lng, area in buildings():
        p = (lat, lng)
        best = None
        for rid, i in grid.get((int(math.floor(lat / G)), int(math.floor(lng / G))), []):
            a, b = ways[rid][i], ways[rid][i + 1]
            bx, by = local(a, b)
            px, py = local(a, p)
            l2 = bx * bx + by * by
            t = max(0.0, min(1.0, (px * bx + py * by) / l2)) if l2 > 0 else 0.0
            d = math.hypot(px - bx * t, py - by * t)
            if d <= MAX_DIST and (best is None or d < best[0]):
                side = 1 if bx * py - by * px >= 0 else -1
                best = (d, rid, i, side)
        if best:
            rows.append((round(lat, 6), round(lng, 6), int(round(area)), best[1], best[2], best[3]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['lat', 'lng', 'area', 'road_id', 'seg', 'side'])
        w.writerows(rows)
    print(f'Listo: {len(rows):,} casas junto a una calle → {OUT}', flush=True)

if __name__ == '__main__':
    main()
