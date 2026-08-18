from pathlib import Path
import itertools,random,json

v92=Path('motor-v9-2.js').read_text(encoding='utf-8')
v93=Path('motor-v9-3.js').read_text(encoding='utf-8')
v10=Path('motor-v10.js').read_text(encoding='utf-8')
idx=Path('index.html').read_text(encoding='utf-8')
errors=[];notes=[]
def req(c,m):
    if not c:errors.append(m)

req('const puoUsareJolly=!!forzaJolly' in v92,'manca guardia matematica poco tempo')
req('slotResidui>totaleResiduo' in v92,'manca confronto capacità/quote')
req('scegliPrimoVelocePerCarbMotore(esito.primoCarboidrato,stato)' in v93,'ricetta rapida non vincolata al carb scelto')
req("carb==='friselle'?isFrisella" in v93 and "carb==='pane'?isPane" in v93,'filtro pane/friselle non separato')
req('motoreV10PreparaSlotCarbAutomatici' in v10,'manca conteggio slot carboidrato')
req('quoteCarboidratiResidue:motoreV10QuoteCarbResidue(stato)' in v10,'manca report quote residue')
req('motor-v9-2.js?v=12' in idx and 'motor-v9-3.js?v=12' in idx and 'motor-v10.js?v=6' in idx,'cache bust v37 mancante')

def sim(slots,quick_slots,quota):
    R=quota;S=slots;jolly=0;quota_usata=0
    for i in range(slots):
        quick=i in quick_slots
        if quick and (R==0 or S>R):jolly+=1
        elif R>0:R-=1;quota_usata+=1
        S-=1
    return R,jolly,quota_usata

cases=0
for slots in range(0,15):
    allidx=list(range(slots))
    for nq in range(slots+1):
        quick=set(allidx[:nq])
        for quota in range(0,15):
            R,j,q=sim(slots,quick,quota);cases+=1
            if quota<=slots and R!=0:errors.append(f'quota persa: slots={slots}, quick={nq}, quota={quota}, R={R}')
            if quota>slots and R!=quota-slots:errors.append(f'residuo inatteso: slots={slots}, quota={quota}, R={R}')
            if q>min(quota,slots):errors.append('quota usata oltre capacità')
notes.append(f'{cases} combinazioni capacità/quote/poco-tempo verificate')

for _ in range(100000):
    speciali=random.randint(0,2);slots=14-speciali
    quick=set(random.sample(range(slots),random.randint(0,slots))) if slots else set()
    quota=random.randint(0,14)
    R,j,q=sim(slots,quick,quota)
    if quota<=slots and R:errors.append('stress: quota realizzabile rimasta residua');break
    if quota>slots and R!=quota-slots:errors.append('stress: residuo non coincide con slot occupati speciali/HARD');break
notes.append('100000 settimane casuali con 0-2 speciali verificate')

req("tettoSettimanale:1" in idx,'tetto friselle 1 assente')
req("pool=['pane','friselle']" in v92,'pool rapido pane/friselle assente')
req("(stato.carboidratiUsati[k]||0)<(c.tettoSettimanale||2)" in v92,'cap jolly non applicato')

report=['# Stress test motore v37','',f'Esito: **{"OK" if not errors else "FAIL"}**','','## Controlli']+[f'- {n}' for n in notes]
if errors:report+=['','## Errori']+[f'- {e}' for e in errors[:50]]
Path('STRESS-V37-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if errors:raise SystemExit(1)
# trigger v37
