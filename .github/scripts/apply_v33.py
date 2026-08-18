from pathlib import Path

# ---------------- motor-v10.js ----------------
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
s=s.replace("const categoria=speciale?null:await motoreV10CategoriaVoce(voce,rById);","const categoria=(speciale||!protetta)?null:await motoreV10CategoriaVoce(voce,rById);",1)
s=s.replace("if(col&&col.origine==='motore')await delKey('piano',idCol);","if(col&&(col.origine==='motore'||col.origine==='motore_set'))await delKey('piano',idCol);",1)
s=s.replace("comp=await motoreV10ColazioneDaSetParziale(pref.valore,varianti,esclusi,[]);","comp=componentiColazioneDaSet(pref.valore,varianti);",1)

macro_block=r'''
/* v10: ricerca culinaria dopo la griglia alimentare.
   Unico/sfiziosa rappresentano la funzione gia decisa: match esatto prima,
   fallback sulle macrocategorie; verdura ricorrente programmata resta HARD. */
async function motoreV10AnalizzaUnico(r,varianti,ingredienti){
  const vById=new Map(varianti.map(v=>[v.id,v]));
  const bById=new Map(ingredienti.map(b=>[b.id,b]));
  const nomi=[],verdure=[];
  for(const ing of (r.ingredienti||[])){
    if(ing.variantId){const v=vById.get(ing.variantId);if(!v)continue;const nome=(v.nome||'').toLowerCase();nomi.push(nome);const b=bById.get(v.ingredienteId);if(b&&b.gruppo==='verdura')verdure.push(nome);}
    else if(ing.nomeLibero)nomi.push((ing.nomeLibero||'').toLowerCase());
  }
  const testo=nomi.join(' '),carbKeys=[];
  for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){const target=(cfg.ingrediente||'').toLowerCase();if(target&&nomi.includes(target))carbKeys.push(k);}
  const euristiche=[['pasta','pasta'],['pasta_fresca','raviol'],['riso','riso'],['farro','farro'],['orzo','orzo'],['cous_cous','cous cous'],['pane','pane'],['friselle','frisell'],['patate','patat'],['polenta','polenta'],['piadina','piadin'],['crackers','cracker'],['taralli_grissini_crostini','grissin'],['taralli_grissini_crostini','tarall']];
  for(const [k,t] of euristiche)if(CARBOIDRATI_PASTO[k]&&testo.includes(t)&&!carbKeys.includes(k))carbKeys.push(k);
  return {nomi,verdure,carbKeys,categoria:motoreCategoriaDiSottotipo(r.gruppoProteico),sottotipo:r.gruppoProteico||null};
}
async function motoreV10VerduraHardSlot(giorno,pasto,varianti){
  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;
  const [rec,recP]=await Promise.all([getOne('impostazioni','verduraRicorrente'),getOne('impostazioni','verduraRicorrentePasti')]);
  const pasti=recP&&Array.isArray(recP.valore)?recP.valore:[];
  if(!rec||!rec.valore||!pasti.includes(pasto+'_'+idx))return null;
  const v=varianti.find(x=>x.id===rec.valore);return v?(v.nome||'').toLowerCase():null;
}
trovaPiattoUnicoCompatibileDraft=async function(pasto,giorno,draft,escludiId){
  const info=await infoCombinazioneDraft(draft);
  const [tutte,varianti,ingredienti,storico]=await Promise.all([getAll('ricette'),getAll('varianti'),getAll('ingredienti'),costruisciStoricoConsumatiMotore()]);
  const targetCarbKey=info.carboidrato||null,targetCarbNome=(info.ingredienteCarboidrato||'').toLowerCase();
  const targetVerdure=new Set((info.verdure||[]).map(x=>(x||'').toLowerCase()));
  const hardVerdura=await motoreV10VerduraHardSlot(giorno,pasto,varianti);
  let best=-Infinity,compatibili=[];
  for(const r of tutte){
    if(r.id===escludiId||r.esclusa||r.piattoSpeciale||(r.tipoPortata||'unico')!=='unico')continue;
    const a=await motoreV10AnalizzaUnico(r,varianti,ingredienti);
    if(info.categoriaProteica&&a.categoria!==info.categoriaProteica)continue;
    if(!a.carbKeys.length||!a.verdure.length)continue;
    if(hardVerdura&&!a.verdure.includes(hardVerdura))continue;
    let score=0;
    if(targetCarbKey&&a.carbKeys.includes(targetCarbKey))score+=100;else if(targetCarbNome&&a.nomi.includes(targetCarbNome))score+=100;else score+=30;
    if(info.sottotipoProteico&&a.sottotipo===info.sottotipoProteico)score+=35;else if(info.categoriaProteica&&a.categoria===info.categoriaProteica)score+=20;
    if(hardVerdura)score+=100;else if(targetVerdure.size&&a.verdure.some(v=>targetVerdure.has(v)))score+=60;else score+=20;
    if(score>best){best=score;compatibili=[r];}else if(score===best)compatibili.push(r);
  }
  if(!compatibili.length){
    if(typeof registraRichiestaRicettaReview==='function')await registraRichiestaRicettaReview({tipo:draft&&draft.tabAttiva==='sfiziosa'?'ricetta_sfiziosa_mancante':'piatto_unico_mancante',carboidrato:info.carboidrato,categoriaProteica:info.categoriaProteica,sottotipoProteico:info.sottotipoProteico,verdura:(info.verdure||[]).join(' + '),pasto,giorno});
    return null;
  }
  const nonCorrente=compatibili.filter(r=>r.id!==draft.ricettaId),pool=nonCorrente.length?nonCorrente:compatibili;
  return scegliMenoRecenteMotore(pool,r=>storico.ultimoRicetta[r.id]||0,()=>0);
};
'''
marker="window.MOTORE_V10_REGOLE="
if 'async function motoreV10AnalizzaUnico' not in s:
    pos=s.find(marker)
    if pos<0:raise SystemExit('motor-v10 insertion marker not found')
    s=s[:pos]+macro_block+'\n'+s[pos:]
p.write_text(s,encoding='utf-8')

# ---------------- index.html ----------------
p=Path('index.html')
s=p.read_text(encoding='utf-8')
# motor-v10 cache bust after final logic patch
s=s.replace('<script src="motor-v10.js?v=1"></script>','<script src="motor-v10.js?v=2"></script>')
if '<script src="motor-v10.js?v=2"></script>' not in s:
    anchor='\n</body>\n</html>';pos=s.rfind(anchor)
    if pos<0:raise SystemExit('index closing anchor not found')
    s=s[:pos]+'\n<script src="motor-v10.js?v=2"></script>\n'+s[pos:]

# Direct recipe assignment from Ricettario is HARD; normalize accidental duplicate patch.
s=s.replace("  voce.origine = 'utente';\n  voce.origine = 'utente';\n  await put('piano', voce);","  voce.origine = 'utente';\n  await put('piano', voce);")
old="  await put('piano', voce);\n  await segnaRicettaUsata(ricetta.id);"
if old in s:s=s.replace(old,"  voce.origine = 'utente';\n  await put('piano', voce);\n  await segnaRicettaUsata(ricetta.id);",1)

# Manual breakfast replacement is HARD.
old="    voce.componenti=draft.componenti ? {...draft.componenti} : null;\n    voce.colazioneSpecialeId=draft.colazioneSpecialeId||null;\n    await put('piano',voce);"
if old in s:s=s.replace(old,"    voce.componenti=draft.componenti ? {...draft.componenti} : null;\n    voce.colazioneSpecialeId=draft.colazioneSpecialeId||null;\n    voce.origine='utente';\n    await put('piano',voce);",1)

# Budino reward stays optional even if an ordinary breakfast was already planned.
old="const mostraPremioCostanza = contatorePremioRender >= 5 && !voce.componenti && !voce.colazioneSpecialeId && !colazioneScaduta && giorno === todayISO();"
new="const mostraPremioCostanza = contatorePremioRender >= 5 && !voce.colazioneSpecialeId && !voce.consumato && !colazioneScaduta && giorno === todayISO();"
if old in s:s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('v33 complete and normalized')
# trigger v33 normalized
