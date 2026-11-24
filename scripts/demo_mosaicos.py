# Baja los mosaicos del mapa de una zona chica (para las fotos del manual y del folleto). Pocos y despacio.
import math, os, time, urllib.request
s, w, n, e = (float(x) for x in os.environ.get('BBOX', '-27.445,-55.945,-27.412,-55.905').split(','))
def xy(lat, lng, z):
    k = 2 ** z
    return int((lng + 180) / 360 * k), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * k)
total = 0
for z in range(12, 18):
    x0, y0 = xy(n, w, z); x1, y1 = xy(s, e, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            p = f'mosaicos/{z}/{x}'; os.makedirs(p, exist_ok=True)
            for intento in range(3):
                try:
                    req = urllib.request.Request(f'https://tile.openstreetmap.org/{z}/{x}/{y}.png', headers={'User-Agent': 'la-mies/1.0 (church app manual screenshots; info@iglesiavictoria.com)'})
                    open(f'{p}/{y}.png', 'wb').write(urllib.request.urlopen(req, timeout=30).read()); total += 1; break
                except Exception as ex:
                    print('reintento', z, x, y, ex); time.sleep(3)
            time.sleep(0.2)
print(total, 'mosaicos')
