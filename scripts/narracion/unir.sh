#!/bin/bash
# unir.sh LL CC : junta el capítulo con los nombres anotados en LL-CC.txt (en orden de index)
f=/home/claude/nombres/$1-$2.txt
n=$(sort -n "$f" | awk '{print $1}' | uniq | wc -l); t=$(wc -l < "$f")
[ "$n" = "$t" ] || { echo "indices repetidos en $f"; exit 1; }
python3 /home/claude/la-mies/scripts/narracion/juntar.py $((10#$1)) $((10#$2)) /home/claude/audio-rvg $(sort -n "$f" | awk '{print $2}')
