#!/usr/bin/env python3
"""Baja los pedazos ya generados de un capítulo, en orden, y los une en un solo mp3.

Uso:  python3 juntar.py LIBRO CAP SALIDA_DIR  nombre1 nombre2 ...
Cada nombre es el final de la dirección del resultado, sin ".mp3": hf_AAAAMMDD_HHMMSS_<id del trabajo>
Tienen que ir en el orden del plan (index 0, 1, 2...). Deja SALIDA_DIR/LL/CC.mp3 (voz, mono, liviano).
"""
import json, os, subprocess, sys, tempfile, urllib.request
BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3MOp2KrVxlULBbdqXUEM1sjRuXl/'
AQUI = os.path.dirname(os.path.abspath(__file__))
libro, cap, salida, nombres = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4:]
plan = json.load(open(os.path.join(AQUI, 'planes', f'{libro:02d}-{cap:02d}.json')))
if len(nombres) != len(plan['voces']): raise SystemExit(f'El plan tiene {len(plan["voces"])} pedazos y llegaron {len(nombres)}')
tmp = tempfile.mkdtemp()
F = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2'
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.4', f'{tmp}/sil.wav'], check=True)
lista = []
for i, n in enumerate(nombres):
    urllib.request.urlretrieve(BASE + n + '.mp3', f'{tmp}/{i}.mp3')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{tmp}/{i}.mp3', '-ar', '44100', '-ac', '1', '-af', F, f'{tmp}/{i}.wav'], check=True)
    lista += [f"file '{tmp}/{i}.wav'", f"file '{tmp}/sil.wav'"]
open(f'{tmp}/l.txt', 'w').write('\n'.join(lista))
os.makedirs(f'{salida}/{libro:02d}', exist_ok=True)
out = f'{salida}/{libro:02d}/{cap:02d}.mp3'
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{tmp}/l.txt', '-c:a', 'libmp3lame', '-b:a', '40k', out], check=True)
d = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip()
print(out, round(float(d)), 'segundos', os.path.getsize(out) // 1024, 'KB')
