from pathlib import Path
import re

idx=Path('index.html').read_text(encoding='utf-8')
v10=Path('motor-v10.js').read_text(encoding='utf-8')
errors=[];notes=[]
def req(c,m):
    if not c:errors.append(m)

# Cambio manuale carboidrato: nessuna quota/tetto del motore deve filtrarlo.
m=re.search(r'async function carboidratiAmmessiCambioDraft\(giorno,pasto,draft\)\{(.*?)\n\}',idx,re.S)
req(bool(m),'funzione carboidratiAmmessiCambioDraft non trovata')
if m:
    body=m.group(1)
    req('Object.keys(CARBOIDRATI_PASTO)' in body,'cambio manuale non espone tutta la macrocategoria carboidrati')
    req('configCarboidrati' not in body,'cambio manuale usa ancora quote Set')
    req('tettoSettimanale' not in body and 'limitato' not in body,'cambio manuale usa ancora tetti automatici')

m2=re.search(r'async function validaCarboidratoDraft\(giorno,pasto,draft\)\{(.*?)\n\}',idx,re.S)
req(bool(m2),'validaCarboidratoDraft non trovata')
if m2:
    body=m2.group(1)
    req('configCarboidrati' not in body and 'tettoSettimanale' not in body,'conferma manuale ancora vincolata alle quote')

# Proteina manuale: libera dentro la macro, non usa tetti.
prot=re.search(r"\}else if\(cella==='proteina'\)\{(.*?)\}else if\(cella==='cottura'\)",idx,re.S)
req(bool(prot),'blocco cambio proteina non trovato')
if prot:
    body=prot.group(1)
    req('motoreCategoriaDiSottotipo(r.gruppoProteico)===draft.categoriaLarga' in body,'cambio proteina non resta nella macro')
    req('FREQUENZE_CONSIGLIATE' not in body and 'EXTRA_CAP' not in body,'cambio proteina manuale applica tetti motore')

# Motore automatico deve restare rigoroso: budget e tetti ancora presenti nei moduli automatici.
v92=Path('motor-v9-2.js').read_text(encoding='utf-8')
req('stato.budgetCarb.residuo' in v92,'motore automatico ha perso budget carboidrati')
req('tettoSettimanale' in v92,'motore automatico ha perso tetti carboidrati limitati')

# Unico/sfiziosa: fallback deve completare solo vuoti e persistere una composizione runtime.
req('async function motoreV10CompletaDraftPerRealizzazione' in v10,'helper completamento realizzazione assente')
helper=re.search(r'async function motoreV10CompletaDraftPerRealizzazione\(pasto,giorno,draft\)\{(.*?)\n\}',v10,re.S)
if helper:
    body=helper.group(1)
    req('if(!draft.primoCereale' in body,'helper può sovrascrivere carboidrato già scelto')
    req('if(!draft.proteinaId' in body,'helper può sovrascrivere proteina già scelta')
    req('if(!draft.contornoId' in body,'helper può sovrascrivere contorno già scelto')
req("fonte:'composta_runtime'" in v10 and 'motoreV10UpsertComposta' in v10,'composizione runtime non persistita')
req('await motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft);' in v10,'fallback unico non completa componenti libere')
req('motor-v10.js?v=8' in idx,'cache bust v41 mancante')

notes.append('cambio manuale carboidrato libero su tutta la macrocategoria')
notes.append('cambio manuale proteina libero dentro la macro senza tetti automatici')
notes.append('motore automatico conserva budget/tetti')
notes.append('unico/sfiziosa completano solo i vuoti e possono creare ricetta runtime')

report=['# Stress test motore v41','',f'Esito: **{"OK" if not errors else "FAIL"}**','','## Controlli']+[f'- {n}' for n in notes]
if errors:report+=['','## Errori']+[f'- {e}' for e in errors]
Path('STRESS-V41-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if errors:raise SystemExit(1)

# trigger v41
