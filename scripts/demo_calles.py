# Baja las calles de una zona chica (para las capturas de la tienda) y las guarda en data/demo_calles.json.
import json, os, time, urllib.request, urllib.parse
s, w, n, e = (float(x) for x in os.environ.get('BBOX', '-27.437,-55.935,-27.420,-55.915').split(','))
q = f'[out:json][timeout:60];way["highway"]({s},{w},{n},{e});out geom tags;'
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']:
    try:
        data = json.load(urllib.request.urlopen(url, data=urllib.parse.urlencode({'data': q}).encode(), timeout=90))
        break
    except Exception as ex:
        print('reintento', url, ex); time.sleep(5)
out = [{'id': el['id'], 'name': el.get('tags', {}).get('name'), 'highway': el['tags'].get('highway'),
        'coords': [[round(p['lat'], 6), round(p['lon'], 6)] for p in el['geometry']]} for el in data['elements'] if el['type'] == 'way']
os.makedirs('data', exist_ok=True)
json.dump(out, open('data/demo_calles.json', 'w'))
print(len(out), 'calles')
