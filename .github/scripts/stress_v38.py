from pathlib import Path
import re

idx=Path('index.html').read_text(encoding='utf-8')
v10=Path('motor-v10.js').read_text(encoding='utf-8')
errors=[];notes=[]
def req(c,m):
    if not c:errors.append(m)

req("verdureDiStagione(new Date(giorno+'T12:00:00'))" in v10,'filtro stagionale non collegato al giorno del pasto')
req("x.info.tier==='confezionato'||x.info.tier==='surgelato'||stag.has(x.info.nome)" in v10,'confezionati/surgelati o freschi stagionali non filtrati correttamente')
req("const hard=candidati.filter(x=>x.info.variantId===preferenze.verduraRicorrenteVariantId)" in v10,'verdura ricorrente HARD assente')
req('Questa verdura è programmata come ricorrente' in idx,'manca blocco esclusione di verdura ricorrente')
req('Questa verdura è indicata come non disponibile' in idx,'manca blocco ricorrente su verdura non disponibile')
req('motor-v10.js?v=7' in idx,'cache bust v38 mancante')

def month_items(m):
    mt=re.search(rf"\n\s*{m}:\s*\[(.*?)\]",idx,re.S)
    if not mt:return []
    return re.findall(r"'([^']+)'",mt.group(1))
aug=month_items(8);jan=month_items(1)
req('Pomodoro fresco' in aug,'Pomodoro non stagionale in agosto: mappa errata')
req('Cavolfiore' not in aug and 'Radicchio' not in aug,'verdure invernali presenti nella lista agosto')
req('Pomodoro fresco' not in jan and 'Zucchine' not in jan,'verdure estive presenti nella lista gennaio')
req('Cavolfiore' in jan and 'Radicchio' in jan,'verdure invernali mancanti a gennaio')
notes.append('mappa stagionale verificata su gennaio/agosto e filtro automatico collegato')

req("['fresco','fresco_duraturo','confezionato','surgelato']" in idx,'priorità 4 classi verdure primi giorni assente')
req("['confezionato','surgelato','fresco_duraturo','fresco']" in idx,'priorità fine settimana assente')
notes.append('priorità deperibilità 4 livelli ancora presente')

report=['# Stress test motore v38','',f'Esito: **{"OK" if not errors else "FAIL"}**','','## Controlli']+[f'- {n}' for n in notes]
if errors:report+=['','## Errori']+[f'- {e}' for e in errors]
Path('STRESS-V38-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if errors:raise SystemExit(1)
# trigger v38
