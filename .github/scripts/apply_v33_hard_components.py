from pathlib import Path

# ===== motor-v10.js: hard choices at component granularity =====
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')

old="""function motoreV10Protetta(v){
  if(!motoreV10VoceHaContenuto(v)) return false;
  if(v.consumato || v.bloccata) return true;
  return v.origine !== 'motore' && v.origine !== 'motore_set';
}"""
new="""function motoreV10HaMarkerComponenti(v){
  return !!(v&&(v.hardPrimo||v.hardSecondo||v.hardContorno));
}
function motoreV10Protetta(v){
  if(!motoreV10VoceHaContenuto(v)) return false;
  if(v.consumato||v.bloccata||v.hardPasto||v.hardColazione) return true;
  if(motoreV10HaMarkerComponenti(v)) return true;
  // Retrocompatibilita: i record user creati prima dei marker erano interamente HARD.
  return v.origine !== 'motore' && v.origine !== 'motore_set';
}
function motoreV10InteramenteProtetta(v){
  if(!v)return false;
  if(v.consumato||v.bloccata||v.hardPasto||v.hardColazione)return true;
  if(v.hardPrimo&&v.hardSecondo&&v.hardContorno)return true;
  // Record user legacy senza marker: trattalo come scelta completa.
  return v.origine!=='motore'&&v.origine!=='motore_set'&&!motoreV10HaMarkerComponenti(v);
}
function motoreV10SeedDaVincoli(v){
  if(!v)return null;
  if(motoreV10InteramenteProtetta(v))return Object.assign({},v);
  const out={id:v.id,modo:'multi',porzioni:v.porzioni||1,fascia:v.fascia||'facile',origine:'utente',hardPrimo:!!v.hardPrimo,hardSecondo:!!v.hardSecondo,hardContorno:!!v.hardContorno};
  if(v.hardPrimo){out.primoId=v.primoId||null;out.primoCereale=v.primoCereale||null;out.primoSugoId=v.primoSugoId||null;}
  if(v.hardSecondo){out.secondoId=v.secondoId||null;out.cotturaSecondo=v.cotturaSecondo||null;}
  if(v.hardContorno)out.contornoId=v.contornoId||null;
  return out;
}"""
if old not in s and 'function motoreV10InteramenteProtetta' not in s:raise SystemExit('motoreV10Protetta target not found')
if old in s:s=s.replace(old,new,1)

old="""async function motoreV10CategoriaVoce(voce,ricById){
  const r=await motoreV10RicettaPrincipaleVoce(voce,ricById);
  return r&&r.gruppoProteico ? motoreCategoriaDiSottotipo(r.gruppoProteico) : null;
}"""
new="""async function motoreV10CategoriaVoce(voce,ricById){
  const r=await motoreV10RicettaPrincipaleVoce(voce,ricById);
  return r&&r.gruppoProteico ? motoreCategoriaDiSottotipo(r.gruppoProteico) : null;
}
async function motoreV10CategoriaHardVoce(voce,ricById){
  if(!voce)return null;
  if(motoreV10InteramenteProtetta(voce)||voce.hardSecondo)return motoreV10CategoriaVoce(voce,ricById);
  return null;
}"""
if old not in s and 'motoreV10CategoriaHardVoce' not in s:raise SystemExit('category helper target not found')
if old in s:s=s.replace(old,new,1)

s=s.replace("const categoria=(speciale||!protetta)?null:await motoreV10CategoriaVoce(voce,rById);","const categoria=(speciale||!protetta)?null:await motoreV10CategoriaHardVoce(voce,rById);",1)

old="""      const c=griglia.celle[g][p], v=c.voce;
      if(!v||c.speciale||!c.protetta)continue;
      const k=await motoreV10InferisciCarboidrato(v,rById,vById);"""
new="""      const c=griglia.celle[g][p], v=c.voce;
      if(!v||c.speciale||!c.protetta)continue;
      const sorgente=motoreV10InteramenteProtetta(v)?v:motoreV10SeedDaVincoli(v);
      const k=await motoreV10InferisciCarboidrato(sorgente,rById,vById);"""
if old not in s and 'const sorgente=motoreV10InteramenteProtetta(v)' not in s:raise SystemExit('quota protected target not found')
if old in s:s=s.replace(old,new,1)

old="""      const protetta=motoreV10Protetta(esistente);
      if(protetta&&motoreV10VoceCompleta(esistente))continue;
      if(protetta&&esistente&&esistente.modo==='multi'){
        const r=await motoreV10CompletaMulti(g,pasto,esistente,cella,preferenze,stato);
        if(!r.voce){stato.errori.push(r.errore);continue;}
        await put('piano',r.voce);generati.push(r.voce);continue;
      }"""
new="""      const protetta=motoreV10Protetta(esistente);
      const interamenteProtetta=motoreV10InteramenteProtetta(esistente);
      if(interamenteProtetta&&motoreV10VoceCompleta(esistente))continue;
      if(protetta&&esistente&&esistente.modo==='multi'&&!interamenteProtetta){
        // Rigenera soltanto le componenti NON fissate esplicitamente dall'utente.
        const seed=motoreV10SeedDaVincoli(esistente);
        const r=await motoreV10CompletaMulti(g,pasto,seed,cella,preferenze,stato);
        if(!r.voce){stato.errori.push(r.errore);continue;}
        await put('piano',r.voce);generati.push(r.voce);continue;
      }"""
if old not in s and 'const interamenteProtetta=motoreV10InteramenteProtetta(esistente);' not in s:raise SystemExit('generator protection target not found')
if old in s:s=s.replace(old,new,1)

# Direct user breakfast from Ricettario also survives menu generation.
s=s.replace("if(col&&col.origine==='utente'&&col.componenti)continue;","if(col&&col.origine==='utente'&&(col.componenti||col.colazioneSpecialeId||col.ricettaId||col.hardColazione))continue;",1)

p.write_text(s,encoding='utf-8')

# ===== index.html: write hard markers where user makes the choice =====
p=Path('index.html')
s=p.read_text(encoding='utf-8')

# Whole meal confirmed from the Piano/tab is entirely user-controlled.
old="voceCommittata.fascia=draft.fascia;voceCommittata.origine='utente';voceCommittata.viaSalvafrigo=draft.viaSalvafrigo||null;"
new="voceCommittata.fascia=draft.fascia;voceCommittata.origine='utente';voceCommittata.hardPasto=true;voceCommittata.hardPrimo=voceCommittata.hardSecondo=voceCommittata.hardContorno=false;voceCommittata.viaSalvafrigo=draft.viaSalvafrigo||null;"
if old not in s and 'voceCommittata.hardPasto=true' not in s:raise SystemExit('whole meal hard marker target not found')
if old in s:s=s.replace(old,new,1)

# Breakfast manual replacement is hard.
old="voce.origine='utente';\n    await put('piano',voce);"
new="voce.origine='utente';\n    voce.hardColazione=true;\n    await put('piano',voce);"
if old in s and 'voce.hardColazione=true;' not in s:s=s.replace(old,new,1)

# Ricettario assignment: mark only the chosen component, or whole meal for unico/speciale.
anchor="""  voce.origine = 'utente';
  voce.origine = 'utente';
  await put('piano', voce);"""
if anchor not in s:
    anchor="""  voce.origine = 'utente';
  await put('piano', voce);"""
replacement="""  voce.origine = 'utente';
  if(tipo==='primo') voce.hardPrimo=true;
  else if(tipo==='secondo') voce.hardSecondo=true;
  else if(tipo==='contorno') voce.hardContorno=true;
  else if(tipo==='colazione') voce.hardColazione=true;
  else if(tipo!=='spuntino') { voce.hardPasto=true; voce.hardPrimo=voce.hardSecondo=voce.hardContorno=false; }
  await put('piano', voce);"""
if anchor not in s and 'if(tipo===\'primo\') voce.hardPrimo=true;' not in s:raise SystemExit('Ricettario hard markers target not found')
if anchor in s:s=s.replace(anchor,replacement,1)
# Normalize any duplicate origin left by previous patch.
s=s.replace("  voce.origine = 'utente';\n  voce.origine = 'utente';","  voce.origine = 'utente';")

# Cache bust v10 after hard-component semantics.
s=s.replace('<script src="motor-v10.js?v=2"></script>','<script src="motor-v10.js?v=3"></script>')
p.write_text(s,encoding='utf-8')
print('hard component markers integrated')
