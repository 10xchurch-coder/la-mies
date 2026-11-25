#!/bin/bash
# Sube los mp3 de /home/claude/audio-rvg (o la carpeta que se pase) a la rama "audio-rvg" y rehace la lista index.json.
# La app lee esa lista para saber qué capítulos ya tienen narración.
set -e
DIR="${1:-/home/claude/audio-rvg}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
W=$(mktemp -d)
cd "$REPO"
if git ls-remote --exit-code origin audio-rvg >/dev/null 2>&1; then git fetch -q origin audio-rvg && git worktree add -q -f "$W" origin/audio-rvg && (cd "$W" && git checkout -q -B audio-rvg)
else git worktree add -q -f --detach "$W" && (cd "$W" && git checkout -q --orphan audio-rvg && git rm -rfq . ); fi
cp -a "$DIR"/. "$W"/
cd "$W"
python3 - <<'P'
import glob, json
caps = sorted(f[:-4].replace('/', '-') for f in glob.glob('[0-9][0-9]/[0-9][0-9]*.mp3'))
json.dump({'rvg': caps}, open('index.json', 'w'))
print(len(caps), 'capítulos con narración')
P
git add -A && git -c user.name="la-mies-bot" -c user.email="bot@users.noreply.github.com" commit -qm "Narración: más capítulos" && git push -q origin audio-rvg
cd "$REPO" && git worktree remove --force "$W"
