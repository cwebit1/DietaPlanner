from pathlib import Path

idx=Path('index.html').read_text(encoding='utf-8')
v94=Path('motor-v9-4.js').read_text(encoding='utf-8')
v10=Path('motor-v10.js').read_text(encoding='utf-8')
errors=[];notes=[]
def req(c,m):
    if not c:errors.append(m)

req("if(tipo==='primo') voce.hardPrimo = true;" in idx,'hardPrimo non scritto alla fonte')
req("if(tipo==='secondo') voce.hardSecondo = true;" in idx,'hardSecondo non scritto alla fonte')
req("if(tipo==='contorno') voce.hardContorno = true;" in idx,'hardContorno non scritto alla fonte')
req("if(tipo==='colazione') voce.hardColazione = true;" in idx,'hardColazione non scritto alla fonte')
req('voce.hardPasto = true;' in idx,'hardPasto non scritto per unico')
req('voce.hardPasto = false;' in idx,'passaggio unico->multi non libera hardPasto')
req('voce.ricettaId = null;' in idx,'passaggio unico->multi non elimina ricettaId precedente')
req('voce.hardPrimo = voce.hardSecondo = voce.hardContorno = false;' in idx,'unico non azzera marker granulari')
req('hardPrimo' in v94 and 'hardSecondo' in v94 and 'hardContorno' in v94,'wrapper compatibilità marker assente')
req("if(!seed.hardPrimo)" in v94 and "if(!seed.hardSecondo)" in v94 and "if(!seed.hardContorno)" in v94,'componenti non-HARD non vengono liberate')
req('motoreV10Protetta' in v10,'protezione v10 assente')
notes.append('assegnazioni primo/secondo/contorno/unico/colazione collegate direttamente ai marker HARD')
notes.append('wrapper v34 mantenuto come compatibilità e rigenerazione delle sole componenti libere')

report=['# Stress test motore v39','',f'Esito: **{"OK" if not errors else "FAIL"}**','','## Controlli']+[f'- {n}' for n in notes]
if errors:report+=['','## Errori']+[f'- {e}' for e in errors]
Path('STRESS-V39-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
if errors:raise SystemExit(1)
# trigger v39
