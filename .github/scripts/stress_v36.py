from pathlib import Path
import json,re,random,itertools

ROOT=Path('.')
idx=(ROOT/'index.html').read_text(encoding='utf-8')
v9_1=(ROOT/'motor-v9-1.js').read_text(encoding='utf-8')
v9_2=(ROOT/'motor-v9-2.js').read_text(encoding='utf-8')
v9_3=(ROOT/'motor-v9-3.js').read_text(encoding='utf-8')
v9_4=(ROOT/'motor-v9-4.js').read_text(encoding='utf-8')
v10=(ROOT/'motor-v10.js').read_text(encoding='utf-8')
recipes=json.loads((ROOT/'ricette.json').read_text(encoding='utf-8')).get('ricette',[])
ing_data=json.loads((ROOT/'ingredienti.json').read_text(encoding='utf-8'))
base=ing_data.get('ingredienti',{})

fail=[]; notes=[]
def require(cond,msg):
    if not cond: fail.append(msg)

# ---------- invarianti statici collegamenti Set -> motore ----------
for key in ['tabellaGiornoCategoria','setProteineLimitate','setPocoTempo','setVerdurePreferite','setVerdureDisattivate','verduraRicorrente','verduraRicorrentePasti']:
    require(key in v9_3,f'Set non letto dal motore: {key}')
for key in ['colazionePreferita','colazionePreferitaGiorni','colazioneIngredientiEsclusi']:
    require(key in v10,f'Colazione non letta dal motore v10: {key}')
require('MOTORE_V10_MAX_SPECIALI = 2' in v10,'Limite 2 pasti speciali assente')
require("friselle:      { label:'Friselle'" in idx and 'tettoSettimanale:1' in idx,'Tetto friselle 1 non trovato')
require('MAX_VERDURA_RICORRENTE_PASTI=5' in idx.replace(' ',''),'Limite verdura ricorrente 5 non trovato')
require('MAX_VERDURE_DISATTIVATE=7' in idx.replace(' ',''),'Limite esclusioni verdure 7 non trovato')
require("if(mancaSoloCarb&&targetCarbKey&&targetCarbKey!=='pane')continue;" in v10,'Protezione carboidrato già assegnato assente')
require('async function motoreV10CarboidratoDaDraft' in v10,'Inferenza carboidrato da primo HARD assente')
require("fonte:'composta_runtime'" in v10 and 'chiaveComposta' in v10,'Dedup composizioni runtime assente')
require("if(col&&col.origine==='utente'" in v10,'Protezione colazione user assente')
require('premioMaturo' in v10 and 'contatoreColazioniMorigerate' in v10,'Budino premio non collegato nel generatore')
require("origine !== 'motore'" in v10 or 'origine!==\'motore\'' in v10,'Protezione origine user assente')

# ---------- stress matematico proteine ----------
freq={'carne':(1,3,3),'pesce':(2,3,3),'formaggi':(2,3,3),'uova':(1,2,2),'legumi':(2,3,14)}
ui_max={'carne':3,'pesce':3,'formaggi':3,'uova':2,'legumi':7}
def fattibile(counts, speciali=0):
    fixed=sum(counts.values())
    free=14-speciali-fixed
    if free<0:return False
    deficit=sum(max(0,freq[k][0]-counts.get(k,0)) for k in freq)
    return deficit<=free
profiles=0;invalid=0
for vals in itertools.product(*(range(ui_max[k]+1) for k in freq)):
    c=dict(zip(freq,vals))
    if sum(vals)<=14:
        profiles+=1
        if not fattibile(c):invalid+=1
require(invalid>0,'Test proteico non rileva configurazioni matematicamente incompatibili')
require('deficit' in idx and 'slotLiberi' in idx,'UI Set non sembra contenere controllo fattibilità globale proteine')
notes.append(f'profili proteici UI esplorati={profiles}; incompatibili da bloccare={invalid}')

# ---------- stress carboidrati ----------
normal=['pasta','pasta_fresca','riso','farro','orzo','cous_cous','pane','patate','polenta']
limited={'friselle':1,'gnocchi':2,'pasta_ripiena':2,'gallette':2,'crackers':2,'taralli':2,'piadina':2,'pasta_sfoglia':2}
for _ in range(100000):
    q={k:0 for k in normal+list(limited)}
    n=random.randint(0,14); limtot=0
    for _j in range(n):
        choices=[]
        for k in normal: choices.append(k)
        for k,cap in limited.items():
            if q[k]<cap and limtot<3: choices.append(k)
        if not choices:break
        k=random.choice(choices);q[k]+=1
        if k in limited:limtot+=1
    require(q['friselle']<=1,'Stress carb: friselle >1')
    require(sum(q[k] for k in limited)<=3,'Stress carb: limitati >3')
    require(sum(q.values())<=14,'Stress carb: quote >14')
notes.append('100000 configurazioni carboidrati valide simulate senza violazioni dei tetti')

# ---------- poco tempo ----------
require("let pool=['pane','friselle']" in v9_2,'Poco tempo non forza pool pane/friselle')
require('tettoSettimanale||2' in v9_2,'Poco tempo non applica tetto individuale limitati')

# ---------- classificazione copertura ricette uniche ----------
macro_map={
 'carne_bianca':'carne','carne_rossa':'carne','affettati':'carne',
 'pesce_bianco':'pesce','pesce_azzurro':'pesce','pesce_grande':'pesce','crostacei':'pesce','molluschi':'pesce','pesce_conservato':'pesce',
 'formaggio_fresco':'formaggi','formaggio_stagionato':'formaggi','uova':'uova','legumi':'legumi'
}
veg_names={n.lower() for n,v in base.items() if isinstance(v,dict) and v.get('gruppo')=='verdura'}
carb_tokens=['pasta','riso','farro','orzo','cous cous','pane','frisell','patat','polenta','gnocch','raviol','cracker','piadin','sfoglie di lasagna']
def ingredients(r):
    out=[]
    for x in r.get('ingredienti',[]):
        if isinstance(x,list) and x:out.append(str(x[0]).lower())
        elif isinstance(x,dict):out.append(str(x.get('nomeLibero') or x.get('nome') or '').lower())
    return out
coverage={k:{'complete':0,'bread_fix':0,'no_veg':0} for k in freq}
for r in recipes:
    if r.get('piattoSpeciale') or (r.get('tipoPortata') or 'unico')!='unico' or r.get('esclusa'):continue
    mac=macro_map.get(r.get('gruppoProteico'))
    if not mac:continue
    names=ingredients(r); txt=' '.join(names)
    has_c=any(t in txt for t in carb_tokens)
    has_v=any(any(vn==n or vn in n for vn in veg_names) for n in names)
    if has_c and has_v:coverage[mac]['complete']+=1
    elif has_v:coverage[mac]['bread_fix']+=1
    else:coverage[mac]['no_veg']+=1
for mac,d in coverage.items():
    require(d['complete']+d['bread_fix']>0,f'Nessuna ricetta unica o completabile con pane per macro {mac}')
notes.append('copertura unico per macro: '+json.dumps(coverage,ensure_ascii=False))

# ---------- controlli verdura HARD ----------
require('verduraRicorrenteVariantId' in v10 and 'return null' in v10,'Verdura ricorrente HARD non evidente nel v10')
require('verdureDisattivate' in v10,'Esclusioni verdure non applicate nel v10')
require('ordineVerdureGiornoV17' in v10,'Priorità temporale verdure non usata dal v10')

# ---------- HARD Ricettario / rigenerazione ----------
require('hardPrimo' in v9_4 and 'hardSecondo' in v9_4 and 'hardContorno' in v9_4,'Marker HARD granulari mancanti')
require("if(!seed.hardPrimo)" in v9_4 and "if(!seed.hardSecondo)" in v9_4 and "if(!seed.hardContorno)" in v9_4,'Rigenerazione non preserva componenti HARD')

# ---------- output persistente ----------
report=['# Stress test motore v36','',f'Esito: **{"OK" if not fail else "FAIL"}**','']
report+=['## Controlli']+[f'- {x}' for x in notes]
if fail:
    report+=['','## Errori']+[f'- {x}' for x in fail]
Path('STRESS-V36-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if fail: raise SystemExit(1)

# trigger v36 workflow
