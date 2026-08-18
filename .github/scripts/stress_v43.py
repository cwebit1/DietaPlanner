from pathlib import Path
import re
idx=Path('index.html').read_text(encoding='utf-8')
v10=Path('motor-v10.js').read_text(encoding='utf-8')
errors=[];notes=[]
def req(c,m):
    if not c: errors.append(m)

req('soggettoProteico' in idx,'soggetto proteico non presente nel draft')
req('sincronizzaSoggettoProteicoDraft' in idx,'helper soggetto proteico mancante')
req('data-pasto-cambia="proteina"' not in idx,'pulsante Cambia proteina ancora presente')
req('data-pasto-refresh="secondo" title="Cambia ricetta"' in idx,'refresh secondo non etichettato come Cambia ricetta')
req("const macroTarget=(draft&&draft.soggettoProteico)||info.categoriaProteica||null;" in v10,'matching unico non usa soggetto proteico')
req('if(macroTarget&&a.categoria!==macroTarget)continue;' in v10,'piatto unico/sfiziosa non filtrati HARD per soggetto')
req('motor-v10.js?v=10' in idx,'cache bust v43 mancante')

m=re.search(r'async function macroProteicaDraftRefresh\(draft\)\{(.*?)\n\}',idx,re.S)
req(bool(m),'macroProteicaDraftRefresh assente')
if m:
    body=m.group(1)
    pprot=body.find('if(draft.proteinaId)')
    pcat=body.find('if(draft.categoriaLarga)')
    req(pprot>=0 and pcat>=0 and pprot<pcat,'marker categoria prevale ancora sulla proteina concreta')

req("}else if(tab==='unico'||tab==='sfiziosa'){\n    await sincronizzaSoggettoProteicoDraft" in idx,'tab unico/sfiziosa non sincronizza soggetto')
req("}else if(tipo==='unico'||tipo==='sfiziosa'){\n    await sincronizzaSoggettoProteicoDraft" in idx,'refresh unico/sfiziosa non sincronizza soggetto')

notes += [
 'Cambia proteina rimosso; refresh secondo = cambia ricetta nella stessa macro',
 'macro ricavata dalla proteina concreta prima dei marker storici',
 'Portate/Piatto unico/Sfiziosa condividono un solo soggetto proteico HARD',
 'nessun fallback unico/sfiziosa fuori macro'
]
report=['# Stress test motore v43','',f'Esito: **{"OK" if not errors else "FAIL"}**','','## Controlli']+[f'- {n}' for n in notes]
if errors: report += ['','## Errori']+[f'- {e}' for e in errors]
Path('STRESS-V43-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if errors: raise SystemExit(1)
# trigger v43
