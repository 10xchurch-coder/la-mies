import json,re,html,sys
P=json.load(open('/tmp/rvg/paras.json'))
K=[json.load(open(f'/home/claude/la-mies/src/data/bible/kjv/{i:02d}.json')) for i in range(66)]
canon=[[len(c) for c in b] for b in K]
ACR={'ALEF','BET','GIME','DALET','HE','VAV','ZAYIN','JET','TET','YOD','KAF','LAMED','MEM','NUN','SAMEC','AIN','PE','TZADI','COF','RESH','SIN','TAU'}
chs=[]; cur=None; pend=None; pre=None; buf=[]; odd=[]
def clean(t): return re.sub(r'^[<«\s]+|[>»\s]+$','',t).strip()
def start(txt):
    global cur,pend
    cur=[]; chs.append(cur)
    if pend:
        ti=clean(pend); txt=ti+('' if ti[-1] in '.:;!?' else '.')+' '+txt
    cur.append(txt); pend=None
for i,(s,t) in enumerate(P):
    t=re.sub(r'\s+',' ',html.unescape(t).replace(' ',' ')).strip()
    if not t: continue
    if t in ACR: pre=t; continue
    if re.match(r'^(CAP[ÍI]TULO|SALMO)\s*\d*$',t): pend=None; buf=[]; continue
    if re.match(r'^(\d )?[A-ZÁÉÍÓÚÑ]{3,}( [A-ZÁÉÍÓÚÑ]+)*( \d)?$',t): pend=None; buf=[]; continue
    m=re.match(r'^(\d+)\s*(\S.*)$',t)
    if m:
        n=int(m.group(1)); txt=m.group(2).strip()
        if pre: txt=pre+'. '+txt; pre=None
        if n==1: start(txt); buf=[]; continue
        if n==2 and buf and (cur is None or len(cur)!=1): start(''.join(buf) if len(buf[0])==1 else ' '.join(buf)); buf=[]
        if cur is not None and n==len(cur)+1: cur.append(txt); continue
        odd.append((i,t[:80])); cur[-1]+=' '+t; continue
    if t.startswith('<') or (pend and not pend.rstrip().endswith('>')): pend=(pend+' '+t) if pend and not pend.rstrip().endswith('>') else t; continue
    if t in ('Aleluya','Salmo de alabanza: de David.'): pend=t; continue
    buf.append(t); odd.append((i,'txt',t[:80]))
flat=[(bi,ci,n) for bi,b in enumerate(canon) for ci,n in enumerate(b)]
print(len(chs), sum(map(len,chs)), sum(sum(b) for b in canon))
bad=[(flat[k][0],flat[k][1]+1,flat[k][2],len(chs[k])) for k in range(min(len(chs),len(flat))) if flat[k][2]!=len(chs[k])]
print(len(bad), bad[:30]); print(odd[:20])
out=[]; k=0
for b in canon:
    out.append(chs[k:k+len(b)]); k+=len(b)
json.dump(out,open('/tmp/rvg/books.json','w'),ensure_ascii=False)
