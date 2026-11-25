#!/bin/bash
# fin.sh "linea Hecho" "linea EN CURSO o vacío" "linea Sigue" "mensaje commit"
cd /home/claude/la-mies
bash scripts/narracion/subir.sh || exit 1
git fetch -q origin main && git rebase -q origin/main
H="$1" E="$2" S="$3" python3 - <<'P'
import os
f='scripts/narracion/AVANCE.md'; L=open(f).read().split('\n'); out=[]
for l in L:
    if l.startswith('- EN CURSO:'): continue
    if l.startswith('- Sigue:'):
        out.append(os.environ['H'])
        if os.environ['E']: out.append(os.environ['E'])
        out.append(os.environ['S']); continue
    out.append(l)
open(f,'w').write('\n'.join(out))
P
git add scripts/narracion && git commit -qm "$4

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
git push -q origin HEAD:main || { git pull -q --rebase origin main && git push -q origin HEAD:main; }
git log --oneline | head -1; date -u +%T
