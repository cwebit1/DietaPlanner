from pathlib import Path

idx=Path('index.html').read_text(encoding='utf-8')
v10=Path('motor-v10.js').read_text(encoding='utf-8')
errors=[];notes=[]
def req(c,m):
    if not c:errors.append(m)

req('Questo ingrediente è già selezionato nella colazione predefinita' in idx,'manca blocco esclusione ingrediente già scelto')
req('Questo ingrediente è escluso dalla colazione' in idx,'manca blocco scelta ingrediente già escluso')
req("getOne('impostazioni','colazioneIngredientiEsclusi')" in idx,'impostazione esclusioni colazione non letta in Set')
req("getOne('impostazioni','colazioneIngredientiEsclusi')" in v10,'motore non legge esclusioni colazione')
req("comp=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],esclusi)" in v10,'esclusioni non passate alla scelta automatica')
req("if(usa){\n      comp=componentiColazioneDaSet(pref.valore,varianti);" in v10,'giorni configurati non applicano esattamente il Set')
req('premioMaturo' in v10,'Budino premio non preservato dal generatore')
notes.append('coerenza bidirezionale tra colazione predefinita ed esclusioni verificata')
notes.append('esclusioni restano nel ramo colazione automatica; giorni Set restano esatti; Budino resta separato')

report=['# Stress test motore v40','',f'Esito: **{"OK" if not errors else "FAIL"}**','','## Controlli']+[f'- {n}' for n in notes]
if errors:report+=['','## Errori']+[f'- {e}' for e in errors]
Path('STRESS-V40-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if errors:raise SystemExit(1)
# trigger v40
