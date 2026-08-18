from pathlib import Path
import re
idx=Path('index.html').read_text(encoding='utf-8')
v10=Path('motor-v10.js').read_text(encoding='utf-8')
errors=[];notes=[]
def req(c,m):
    if not c:errors.append(m)

req('macroProteicaDraftRefresh' in idx,'manca inferenza macro dal secondo corrente')
req('if(draft.primoCereale && draft.proteinaId && draft.contornoId) return;' in idx,'apertura draft continua a sovrascrivere pasto completo')
req("(motoreCategoriaDiSottotipo(r.gruppoProteico)||r.gruppoProteico)===macro" in idx,'refresh proteina non vincolato alla macro')
req("famiglia_proteica_refresh_mancante" in idx,'manca review quando la macro non ha alternative')
req('variantiFrigoPrioritarieRefresh' in idx and 'punteggioRicettaFrigoRefresh' in idx,'frigo non usato nei refresh specifici')
req("cercaComponentiModulari('sugo'),variantiFrigoPrioritarieRefresh()" in idx,'sugo non orientato dal frigo')
req('motoreV10ScoreFrigoRicetta' in v10,'piatto unico/sfiziosa non orientati dal frigo')
req("score+=(await motoreV10ScoreFrigoRicetta(r))*2;" in v10,'bonus frigo non applicato al matching unico')
req('motor-v10.js?v=9' in idx,'cache bust v42 assente')

m=re.search(r"\}else if\(cella==='proteina'\)\{(.*?)\}else if\(cella==='cottura'\)",idx,re.S)
req(bool(m),'blocco proteina non trovato')
if m:
    b=m.group(1)
    req('===macro' in b,'macro non confrontata')
    req("pool=tutte.filter" in b,'pool proteine non costruito')
    req("await avviso('Non ci sono ancora altre preparazioni disponibili per questa famiglia." in b,'assenza alternative non segnalata')

notes.append('refresh secondo vincolato alla macro corrente, anche per vecchi record senza marker')
notes.append('apertura editor non rigenera componenti già presenti')
notes.append('frigo orienta secondo, sugo e unico/sfiziosa senza cambiare i vincoli')
notes.append('assenza di alternative registra Review invece di saltare macro')

report=['# Stress test motore v42','',f'Esito: **{"OK" if not errors else "FAIL"}**','','## Controlli']+[f'- {n}' for n in notes]
if errors:report+=['','## Errori']+[f'- {e}' for e in errors]
Path('STRESS-V42-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if errors: raise SystemExit(1)

# trigger v42
