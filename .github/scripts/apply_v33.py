from pathlib import Path

# Patch motor-v10 before enabling it.
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
s=s.replace("const categoria=speciale?null:await motoreV10CategoriaVoce(voce,rById);","const categoria=(speciale||!protetta)?null:await motoreV10CategoriaVoce(voce,rById);",1)
s=s.replace("if(col&&col.origine==='motore')await delKey('piano',idCol);","if(col&&(col.origine==='motore'||col.origine==='motore_set'))await delKey('piano',idCol);",1)
p.write_text(s,encoding='utf-8')

# Enable v10 only after every legacy/v17 override, so v10 is authoritative.
p=Path('index.html')
s=p.read_text(encoding='utf-8')
if '<script src="motor-v10.js?v=1"></script>' not in s:
    anchor='\n</body>\n</html>'
    pos=s.rfind(anchor)
    if pos<0:
        raise SystemExit('index closing anchor not found')
    s=s[:pos]+'\n<script src="motor-v10.js?v=1"></script>\n'+s[pos:]

# Direct recipe assignment from Ricettario is a HARD user choice.
old="""  await put('piano', voce);\n  await segnaRicettaUsata(ricetta.id);"""
new="""  voce.origine = 'utente';\n  await put('piano', voce);\n  await segnaRicettaUsata(ricetta.id);"""
if old not in s:
    raise SystemExit('Ricettario assignment target not found')
s=s.replace(old,new,1)

# Manual breakfast replacement is also HARD and must survive Generate menu.
old="""    voce.componenti=draft.componenti ? {...draft.componenti} : null;\n    voce.colazioneSpecialeId=draft.colazioneSpecialeId||null;\n    await put('piano',voce);"""
new="""    voce.componenti=draft.componenti ? {...draft.componenti} : null;\n    voce.colazioneSpecialeId=draft.colazioneSpecialeId||null;\n    voce.origine='utente';\n    await put('piano',voce);"""
if old not in s:
    raise SystemExit('Breakfast manual replacement target not found')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('v33 motor v10 enabled; direct recipe/breakfast choices marked HARD')
# trigger layered v33
