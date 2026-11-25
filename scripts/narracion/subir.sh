#!/bin/bash
# Sube los mp3 de /home/claude/audio-rvg (o la carpeta que se pase) a la rama "audio-rvg" y rehace la lista index.json.
# La app lee esa lista para saber qué capítulos ya tienen narración.
# Varias tareas suben a la vez: si otra subió primero, vuelve a bajar la rama y prueba de nuevo (hasta 6 veces).
set -e
DIR="${1:-/home/claude/audio-rvg}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
for intento in 1 2 3 4 5 6; do
  W=$(mktemp -d)
  git worktree prune
  if git ls-remote --exit-code origin audio-rvg >/dev/null 2>&1; then git fetch -q origin audio-rvg && git worktree add -q -f --detach "$W" origin/audio-rvg
  else git worktree add -q -f --detach "$W" && (cd "$W" && git checkout -q --orphan audio-rvg && git rm -rfq . ); fi
  cp -a "$DIR"/. "$W"/
  ok=0
  (cd "$W" && python3 - <<'P'
import glob, json
caps = sorted(f[:-4].replace('/', '-') for f in glob.glob('[0-9][0-9]/[0-9][0-9]*.mp3'))
json.dump({'rvg': caps}, open('index.json', 'w'))
print(len(caps), 'capítulos con narración')
P
  cd "$W" && git add -A && { git diff --cached --quiet || git -c user.name="la-mies-bot" -c user.email="bot@users.noreply.github.com" commit -qm "Narración: más capítulos"; } && git push -q origin HEAD:audio-rvg) && ok=1
  cd "$REPO" && git worktree remove --force "$W"
  [ $ok = 1 ] && exit 0
  echo "No se pudo subir (intento $intento), pruebo de nuevo"; sleep $((intento * 4))
done
echo "NO SE PUDO SUBIR"; exit 1
