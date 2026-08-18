from pathlib import Path
import json, re, itertools, datetime

ROOT=Path('.')
RIC=json.loads((ROOT/'ricette.json').read_text(encoding='utf-8'))
ING=json.loads((ROOT/'ingredienti.json').read_text(encoding='utf-8'))
recipes=RIC.get('ricette',RIC if isinstance(RIC,list) else [])
ingdb=ING.get('ingredienti',ING if isinstance(ING,dict) else {})
engine=(ROOT/'motor-v10.js').read_text(encoding='utf-8')
index=(ROOT/'index.html').read_text(encoding='utf-8')

MACROS=['carne','pesce','formaggi','uova','legumi']
FREQ={
 'carne':(1,3,3),'pesce':(2,3,3),'formaggi':(2,3,3),'uova':(1,2,2),'legumi':(2,3,14)
}

def macro(g):
    g=(g or '').lower()
    if g.startswith('carne_') or g in ('carne','affettati'): return 'carne'
    if g.startswith('pesce_') or g in ('pesce','crostacei','molluschi'): return 'pesce'
    if g.startswith('formaggio_') or g in ('formaggi','formaggio'): return 'formaggi'
    if g=='uova': return 'uova'
    if g in ('legumi','soia','tofu'): return 'legumi'
    return None

def ingredients(r):
    out=[]
    for x in r.get('ingredienti',[]):
        if isinstance(x,(list,tuple)) and x: out.append(str(x[0]))
        elif isinstance(x,dict):
            n=x.get('nome') or x.get('nomeLibero') or x.get('name')
            if n: out.append(str(n))
    return out

veg_names={n.lower() for n,d in ingdb.items() if isinstance(d,dict) and d.get('gruppo')=='verdura'}
CARB_PATTERNS={
 'pasta':['pasta corta','pasta integrale'], 'pasta_fresca':['pasta fresca','raviol','tortell'],
 'riso':['riso '], 'farro':['farro'], 'orzo':['orzo'], 'cous_cous':['cous cous','couscous'],
 'pane':['pane '], 'friselle':['frisell'], 'patate':['patat'], 'polenta':['polenta'],
 'piadina':['piadin'], 'crackers':['cracker'], 'taralli_grissini_crostini':['tarall','grissin','crostin']
}

def carb_keys(r):
    text=' | '.join(ingredients(r)).lower()
    out=[]
    for k, pats in CARB_PATTERNS.items():
        if any(p in text for p in pats): out.append(k)
    return out

def vegetables(r):
    return sorted({n for n in ingredients(r) if n.lower() in veg_names})

def is_unico(r): return (r.get('tipoPortata') or 'unico')=='unico' and not r.get('piattoSpeciale')

def is_modular(r,sub): return r.get('tipoPortata')=='modulare' and r.get('sottoCategoriaModulare')==sub

# -------- static invariants: actual integration --------
checks={
 'v10 loaded last/cache >=3': bool(re.search(r'<script src="motor-v10\.js\?v=([3-9]|[1-9][0-9]+)"></script>',index)),
 'special max 2': 'MOTORE_V10_MAX_SPECIALI = 2' in engine,
 'special excluded from ordinary counts': 'if(await motoreV10VoceSpeciale(voce,rById)) continue;' in engine,
 'consumed history only': 'if(!voce||!voce.consumato) continue;' in engine,
 'hard granular helpers': 'motoreV10InteramenteProtetta' in engine and 'motoreV10SeedDaVincoli' in engine,
 'hard recipe component markers': all(x in index for x in ['hardPrimo','hardSecondo','hardContorno','hardPasto']),
 'hard breakfast marker': 'hardColazione' in index,
 'budino mature handling': 'contatoreColazioniMorigerate' in engine and 'premioMaturo' in engine,
 'recipe review fallback': 'reviewRicetteMancanti' in engine,
 'recurring vegetable hard': 'verduraRicorrenteVariantId' in engine and 'return null;' in engine,
}

# -------- abstract Set grid test --------
def fill_grid(explicit, special_slots=0, limited=None):
    limited=set(limited or [])
    counts={k:0 for k in MACROS}
    for c in explicit:
        if c in counts: counts[c]+=1
    available=14-special_slots-len(explicit)
    seq=list(explicit)
    for _ in range(max(0,available)):
        cand=[c for c in MACROS if counts[c]<FREQ[c][0] and counts[c]<FREQ[c][2]]
        if not cand: cand=[c for c in MACROS if counts[c]<FREQ[c][1] and counts[c]<FREQ[c][2] and c not in limited]
        if not cand: cand=[c for c in MACROS if counts[c]<FREQ[c][1] and counts[c]<FREQ[c][2]]
        if not cand: cand=[c for c in MACROS if counts[c]<FREQ[c][2] and c not in limited]
        if not cand: cand=[c for c in MACROS if counts[c]<FREQ[c][2]]
        if not cand: break
        # largest deficit; avoid immediate repeat when possible
        prev=seq[-1] if seq else None
        alt=[c for c in cand if c!=prev]
        if alt: cand=alt
        cand.sort(key=lambda c: ((FREQ[c][0]-counts[c] if counts[c]<FREQ[c][0] else FREQ[c][1]-counts[c]), -counts[c]), reverse=True)
        c=cand[0]; counts[c]+=1; seq.append(c)
    return counts,seq

scenarios=[
 ('SET vuoto',[],0,[]),
 ('1 scelta carne',['carne'],0,[]),
 ('parziale 5 scelte',['pesce','formaggi','uova','legumi','carne'],0,[]),
 ('parziale con categoria gradita meno',['pesce','formaggi','uova'],0,['carne']),
 ('2 speciali fuori conteggio',['pesce','formaggi'],2,[]),
 ('SET quasi completo',['carne','pesce','formaggi','uova','legumi','pesce','formaggi','legumi','carne','pesce','formaggi','uova'],0,[]),
]
scenario_rows=[]
for name,exp,special,lim in scenarios:
    counts,seq=fill_grid(exp,special,lim)
    ordinary=14-special
    ok=len(seq)==ordinary and all(counts[c]>=FREQ[c][0] for c in MACROS)
    scenario_rows.append((name,ordinary,counts,ok))

# -------- recipe DB coverage --------
unicos=[r for r in recipes if is_unico(r)]
coverage={m:{} for m in MACROS}
veg_coverage={m:{} for m in MACROS}
for r in unicos:
    m=macro(r.get('gruppoProteico'))
    if not m: continue
    vs=vegetables(r); cs=carb_keys(r)
    if not vs or not cs: continue
    for c in cs: coverage[m].setdefault(c,[]).append(r.get('nome','?'))
    for v in vs: veg_coverage[m].setdefault(v.lower(),[]).append(r.get('nome','?'))

modular_prot={m:[] for m in MACROS}
contorni=[]
for r in recipes:
    if is_modular(r,'proteina'):
        m=macro(r.get('gruppoProteico'))
        if m: modular_prot[m].append(r.get('nome','?'))
    if is_modular(r,'contorno'): contorni.append(r.get('nome','?'))

# Gaps: critical = no valid unico in macro AND no modular protein; high = carb family has no unico; medium = only one unico.
gaps=[]
all_carbs=list(CARB_PATTERNS)
for m in MACROS:
    any_unico=sum(len(v) for v in coverage[m].values())
    if any_unico==0 and not modular_prot[m]:
        gaps.append(('CRITICA',m,'QUALSIASI','QUALSIASI','Nessuna realizzazione ordinaria valida (né unico completo né proteina modulare).'))
    for c in all_carbs:
        n=len(set(coverage[m].get(c,[])))
        if n==0:
            gaps.append(('ALTA',m,c,'qualsiasi','Nessun piatto unico completo trovato per questa macro + fonte carboidrati; resta il percorso a portate se disponibile.'))
        elif n==1:
            gaps.append(('MEDIA',m,c,'qualsiasi',f'Un solo piatto unico candidato: {coverage[m][c][0]}'))

# recurring vegetable robustness: only vegetables that exist in DB; flag macro with zero/one unico candidate for each.
for v in sorted(veg_names):
    for m in MACROS:
        n=len(set(veg_coverage[m].get(v,[])))
        if n==0:
            gaps.append(('ALTA',m,'qualsiasi',v,'Verdura ricorrente HARD: nessun piatto unico completo con questa macro; modalità portate necessaria.'))
        elif n==1:
            gaps.append(('MEDIA',m,'qualsiasi',v,f'Verdura ricorrente HARD con un solo unico: {veg_coverage[m][v][0]}'))

# Deduplicate and sort severity. Limit report rows but preserve all in machine-readable json.
sev={'CRITICA':0,'ALTA':1,'MEDIA':2,'BASSA':3}
seen=set(); unique=[]
for g in gaps:
    k=g[:4]
    if k not in seen: seen.add(k); unique.append(g)
unique.sort(key=lambda g:(sev[g[0]],g[1],g[2],g[3]))
(Path('review-ricette-db.json')).write_text(json.dumps({'generated_at':datetime.datetime.now().isoformat(),'gaps':[{'severita':a,'macro':b,'carboidrato':c,'verdura':d,'nota':e} for a,b,c,d,e in unique]},ensure_ascii=False,indent=2),encoding='utf-8')

# -------- Markdown matrix --------
lines=['# DietaPlanner — Matrice test Set e copertura ricette','',f'Generato automaticamente: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}.','',
'## Invarianti integrazione']
for k,v in checks.items(): lines.append(f'- {"✅" if v else "❌"} {k}')
lines += ['','## Scenari Set astratti','', '| Scenario | Slot ordinari | Conteggi finali | Esito |','|---|---:|---|---|']
for name,n,c,ok in scenario_rows:
    s=', '.join(f'{k}:{c[k]}' for k in MACROS)
    lines.append(f'| {name} | {n} | {s} | {"✅" if ok else "❌"} |')
lines += ['','## Copertura DB sintetica','']
for m in MACROS:
    cand=set(itertools.chain.from_iterable(coverage[m].values())) if coverage[m] else set()
    lines.append(f'- **{m}**: {len(cand)} piatti unici completi riconosciuti; {len(modular_prot[m])} basi proteiche modulari.')
lines.append(f'- **Contorni modulari**: {len(contorni)}.')
counts_sev={s:sum(1 for g in unique if g[0]==s) for s in sev}
lines += ['','## Lacune rilevate','', 'Le lacune complete sono in `review-ricette-db.json`; qui il riepilogo:',
       f'- CRITICHE: {counts_sev["CRITICA"]}',f'- ALTE: {counts_sev["ALTA"]}',f'- MEDIE: {counts_sev["MEDIA"]}']
(Path('TEST-MATRICE-SET.md')).write_text('\n'.join(lines)+'\n',encoding='utf-8')

# Update persistent human review generated section, keeping header and any manual notes outside markers.
review=Path('REVIEW-RICETTE-DB.md')
text=review.read_text(encoding='utf-8') if review.exists() else '# DietaPlanner — Review ricette DB\n'
start='<!-- AUTO-GAPS-START -->'; end='<!-- AUTO-GAPS-END -->'
auto=[start,'## Evidenze automatiche correnti','',f'Ultimo scan: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}.', '']
for level in ['CRITICA','ALTA','MEDIA']:
    subset=[g for g in unique if g[0]==level]
    auto += [f'### {level} ({len(subset)})','']
    # human file keeps actionable top 80 per severity; JSON retains every combination.
    for a,b,c,d,e in subset[:80]: auto.append(f'- **{b} / {c} / {d}** — {e}')
    if len(subset)>80: auto.append(f'- … altre {len(subset)-80} combinazioni nel file `review-ricette-db.json`.')
    auto.append('')
auto.append(end)
block='\n'.join(auto)
if start in text and end in text:
    text=text[:text.index(start)]+block+text[text.index(end)+len(end):]
else:
    text=text.rstrip()+'\n\n'+block+'\n'
review.write_text(text,encoding='utf-8')

failed=[k for k,v in checks.items() if not v]
if failed:
    raise SystemExit('Invarianti mancanti: '+', '.join(failed))
print(f'OK: {len(scenario_rows)} scenari Set; {len(unique)} gap DB registrati; invarianti integrazione presenti.')
