from pathlib import Path

p=Path('motor-v9-1.js')
s=p.read_text(encoding='utf-8')
s=s.replace('''   - Set = vincoli HARD quando espliciti.\n   - Default pranzo/cena = portate modulari complete.\n   - Slot non configurati = rotazione automatica entro frequenze del piano.''','''   - Set = vincoli HARD quando espliciti e gia compatibili con il percorso.\n   - La Bibbia NON sovrascrive le scelte utente: completa soltanto gli slot liberi.\n   - Default pranzo/cena = portate modulari complete.\n   - Slot non configurati = completamento Bibbia + rotazione automatica.''')
s=s.replace('''  const sottotipiTotali={};''','''  const sottotipiTotali={};\n  const ultimoSottotipo={};\n  const ultimoCategoriaProteica={};''')
s=s.replace('''      if(r.gruppoProteico) sottotipiTotali[r.gruppoProteico]=(sottotipiTotali[r.gruppoProteico]||0)+1;''','''      if(r.gruppoProteico){\n        sottotipiTotali[r.gruppoProteico]=(sottotipiTotali[r.gruppoProteico]||0)+1;\n        ultimoSottotipo[r.gruppoProteico]=Math.max(ultimoSottotipo[r.gruppoProteico]||0,ts);\n        const macro=motoreCategoriaDiSottotipo(r.gruppoProteico);\n        if(macro) ultimoCategoriaProteica[macro]=Math.max(ultimoCategoriaProteica[macro]||0,ts);\n      }''')
s=s.replace('''  return {ultimoRicetta,ultimoCarb,ultimoVerdura,sottotipiTotali};''','''  return {ultimoRicetta,ultimoCarb,ultimoVerdura,sottotipiTotali,ultimoSottotipo,ultimoCategoriaProteica};''')
p.write_text(s,encoding='utf-8')

p=Path('motor-v9-3.js')
s=p.read_text(encoding='utf-8')
s=s.replace('''  const ultimoConsumoSottotipo={};\n  // In assenza di timestamp per sottotipo, il totale storico mantiene comunque\n  // una rotazione equilibrata; i singoli piatti usano invece il timestamp reale.\n  return {\n    storico,\n    ultimoConsumoSottotipo,''','''  // Lo storico reale alimenta la rotazione anche a livello di macrocategoria/sottotipo.\n  const ultimoConsumoSottotipo=Object.assign({},storico.ultimoSottotipo||{});\n  return {\n    storico,\n    ultimoConsumoSottotipo,''')
s=s.replace('''  const griglia=costruisciGrigliaMotore(giorni,preferenze.giornoCategoria||{},preferenze.proteineLimitate||[]);''','''  // LAYER 1: scelte esplicite Set. LAYER 2/3: preferenze + Bibbia completano solo i vuoti.\n  // Le scelte utente non vengono mai rimpiazzate dal completamento automatico.\n  const griglia=costruisciGrigliaMotore(giorni,preferenze.giornoCategoria||{},preferenze.proteineLimitate||[]);''')
p.write_text(s,encoding='utf-8')
print('v33 layer precedence + real subtype history applied')
