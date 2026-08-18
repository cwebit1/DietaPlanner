function scegliMenoRecenteMotore(candidati, getterTs, getterUsoSettimana){
  if(!candidati||!candidati.length) return null;
  let bestTs=Infinity,bestUso=Infinity,pool=[];
  for(const c of candidati){
    const uso=getterUsoSettimana?getterUsoSettimana(c):0;
    const ts=getterTs?getterTs(c):0;
    if(uso<bestUso || (uso===bestUso && ts<bestTs)){
      bestUso=uso;bestTs=ts;pool=[c];
    }else if(uso===bestUso && ts===bestTs){
      pool.push(c);
    }
  }
  return motoreMescola(pool)[0];
}

async function scegliSottotipoMotore(categoria, stato){
  const possibili=(SOTTOTIPI_MOTORE[categoria]||[]).slice();
  if(!possibili.length) return categoria;
  const ricette=await getAll('ricette');

  let candidati=possibili.filter(s=>{
    const cap=CAP_SOTTOTIPI_MOTORE[s];
    if(cap && (stato.conteggiSottotipi[s]||0)>=cap) return false;
    return ricette.some(r=>r.tipoPortata==='modulare' && r.sottoCategoriaModulare==='proteina' && r.gruppoProteico===s && !r.esclusa);
  });
  if(!candidati.length){
    candidati=possibili.filter(s=>ricette.some(r=>r.tipoPortata==='modulare' && r.sottoCategoriaModulare==='proteina' && r.gruppoProteico===s && !r.esclusa));
  }
  if(!candidati.length) return possibili[0];

  const scelto=scegliMenoRecenteMotore(
    candidati,
    s=>stato.ultimoConsumoSottotipo[s]||0,
    s=>stato.conteggiSottotipi[s]||0
  );
  stato.conteggiSottotipi[scelto]=(stato.conteggiSottotipi[scelto]||0)+1;
  return scelto;
}

function risolviSottotipoFine(categoriaLarga, consumiSottotipi){
  const possibili=(SOTTOTIPI_MOTORE[categoriaLarga]||[categoriaLarga]).filter(Boolean);
  const validi=possibili.filter(s=>!CAP_SOTTOTIPI_MOTORE[s] || (consumiSottotipi&&consumiSottotipi[s]||0)<CAP_SOTTOTIPI_MOTORE[s]);
  const pool=validi.length?validi:possibili;
  if(!pool.length) return categoriaLarga;
  let min=Infinity,c=[];
  for(const s of pool){
    const n=(consumiSottotipi&&consumiSottotipi[s])||0;
    if(n<min){min=n;c=[s];} else if(n===min)c.push(s);
  }
  return motoreMescola(c)[0];
}

/* Queste utility erano referenziate da rami legacy ma non più definite.
   Restano implementate per le modifiche manuali fuori da Genera menu. */
function costruisciMappaVarianti(varianti, ingredientiBase, jsonMap){
  const baseById=new Map((ingredientiBase||[]).map(i=>[i.id,i]));
  const out={};
  for(const v of (varianti||[])){
    const b=baseById.get(v.ingredienteId);
    const j=(jsonMap&&jsonMap[v.nome])||{};
    out[v.id]=Object.assign({},v,{
      gruppoBase:b?b.gruppo:null,
      deperibilita:j.deperibilita||null
    });
  }
  return out;
}
function poolDelGiorno(indiceGiorno){
  if(indiceGiorno<=2) return ['fresco'];
  if(indiceGiorno<=4) return ['resistente'];
  return ['surgelato'];
}
function contorniAmmessiPerPool(contorni, mappaVarianti, pool){
  const tier=pool&&pool[0];
  const out=(contorni||[]).filter(r=>{
    for(const i of (r.ingredienti||[])){
      const v=mappaVarianti[i.variantId];
      if(!v || v.gruppoBase!=='verdura') continue;
      const t=v.categoria==='surgelato'?'surgelato':
        ((v.deperibilita==='alta'||v.categoria==='fresco')?'fresco':'resistente');
      if(t===tier) return true;
    }
    return false;
  });
  return out;
}
async function calcolaPoolVerdureGiornaliero(giorno){
  const varianti=await getAll('varianti');
  const ingredienti=await getAll('ingredienti');
  const bById=new Map(ingredienti.map(b=>[b.id,b]));
  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;
  const ordine=idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']);
  const gruppi={fresco:[],resistente:[],surgelato:[]};
  for(const v of varianti){
    const b=bById.get(v.ingredienteId); if(!b||b.gruppo!=='verdura') continue;
    const dep=ingredientiJsonMap[v.nome]&&ingredientiJsonMap[v.nome].deperibilita;
    const t=v.categoria==='surgelato'?'surgelato':((dep==='alta'||v.categoria==='fresco')?'fresco':'resistente');
    gruppi[t].push(v);
  }
  for(const t of ordine) if(gruppi[t].length) return gruppi[t];
  return [];
}

/* Filtro esclusione verdure: HARD. Non ripiega sulle verdure disattivate. */
filtraContorniPerVerdureAttive = async function(contorni){
  const cfg=await getOne('impostazioni','setVerdureDisattivate');
  const off=new Set(cfg&&cfg.valore?cfg.valore:[]);
  if(!off.size) return contorni;
  const varianti=await getAll('varianti');
  const ingredienti=await getAll('ingredienti');
  const vById=new Map(varianti.map(v=>[v.id,v]));
  const bById=new Map(ingredienti.map(b=>[b.id,b]));
  return (contorni||[]).filter(c=>{
    const verdure=(c.ingredienti||[]).map(i=>vById.get(i.variantId)).filter(v=>v&&bById.get(v.ingredienteId)?.gruppo==='verdura');
    return !verdure.some(v=>off.has(v.id));
  });
};

async function motoreInfoVerduraContorno(r, cache){
  for(const ing of (r.ingredienti||[])){
    if(!ing.variantId) continue;
    const v=cache.vById.get(ing.variantId);
    if(!v) continue;
    const b=cache.bById.get(v.ingredienteId);
    if(b && b.gruppo==='verdura'){
      const dep=ingredientiJsonMap[v.nome]&&ingredientiJsonMap[v.nome].deperibilita;
      const tier=v.categoria==='surgelato'?'surgelato':((dep==='alta'||v.categoria==='fresco')?'fresco':'resistente');
      return {variantId:v.id,nome:v.nome,tier};
    }
  }
  return null;
}

async function scegliContornoMotore(giorno, stato, preferenze, escludiId){
  const ricette=await getAll('ricette');
  const varianti=await getAll('varianti');
  const ingredienti=await getAll('ingredienti');
  const cache={vById:new Map(varianti.map(v=>[v.id,v])),bById:new Map(ingredienti.map(b=>[b.id,b]))};
  const off=new Set(preferenze.verdureDisattivate||[]);
  const prefIds=new Set(preferenze.verdurePreferiteVariantIds||[]);
  let candidati=[];
  for(const r of ricette){
    if(r.tipoPortata!=='modulare'||r.sottoCategoriaModulare!=='contorno'||r.esclusa||r.id===escludiId) continue;
    const info=await motoreInfoVerduraContorno(r,cache);
    if(!info||off.has(info.variantId)) continue;
    candidati.push({r,info});
  }
  if(!candidati.length) return null;

  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;
  const slotRicorrente=(preferenze._pastoCorrente||'')+'_'+idx;
  const ricorrenteHard=preferenze.verduraRicorrenteVariantId && (preferenze.verduraRicorrentePasti||[]).includes(slotRicorrente);
  if(ricorrenteHard){
    const hard=candidati.filter(x=>x.info.variantId===preferenze.verduraRicorrenteVariantId);
    if(!hard.length) return null;
    const scelta=scegliMenoRecenteMotore(hard,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    return scelta?scelta.r:null;
  }

  const ordine=idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']);
  let pool=[];
  for(const t of ordine){
    pool=candidati.filter(x=>x.info.tier===t);
    if(pool.length) break;
  }
  if(!pool.length) pool=candidati;

  // Preferite = prevalenza maggiore.
  const preferite=pool.filter(x=>prefIds.has(x.info.variantId));
  if(preferite.length){
    // Anti-ripetizione SOLO nel pool preferito: finché esiste una preferita non
    // ancora usata nella settimana, non ripetere una preferita già usata.
    const nuove=preferite.filter(x=>!stato.preferiteVerdureUsate.has(x.info.variantId));
    pool=nuove.length?nuove:preferite;
    const scelta=scegliMenoRecenteMotore(pool,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    stato.preferiteVerdureUsate.add(scelta.info.variantId);
    return scelta.r;
  }

  // Non preferite: nessun anti-ripetizione aggiuntivo; scelta varia a parità.
  return motoreMescola(pool)[0].r;
}

async function scegliProteinaModulareMotore(sottotipo, stato, escludiId){
  const tutte=await cercaProteineModulari(sottotipo);
  let pool=tutte.filter(r=>r.id!==escludiId);
  if(!pool.length) pool=tutte;
  if(!pool.length) return null;
  // Esclude ciò che è già stato realmente mangiato finché esiste alternativa mai mangiata.
  const mai=pool.filter(r=>!stato.storico.ultimoRicetta[r.id] && !stato.ricetteUsateGenerazione.has(r.id));
  if(mai.length) pool=mai;
  else{
    const nonUsateOra=pool.filter(r=>!stato.ricetteUsateGenerazione.has(r.id));
    if(nonUsateOra.length) pool=nonUsateOra;
  }
  const scelta=scegliMenoRecenteMotore(pool,r=>stato.storico.ultimoRicetta[r.id]||0,()=>0);
  if(scelta) stato.ricetteUsateGenerazione.add(scelta.id);
  return scelta;
}

async function scegliSugoMotore(stato, escludiId){
  let pool=(await cercaComponentiModulari('sugo')).filter(r=>r.id!==escludiId);
  if(!pool.length) pool=await cercaComponentiModulari('sugo');
  if(!pool.length) return null;
  const nonUsati=pool.filter(r=>!stato.ricetteUsateGenerazione.has(r.id));
  if(nonUsati.length) pool=nonUsati;
  const mai=pool.filter(r=>!stato.storico.ultimoRicetta[r.id]);
  if(mai.length) pool=mai;
  const scelta=scegliMenoRecenteMotore(pool,r=>stato.storico.ultimoRicetta[r.id]||0,()=>0);
  if(scelta) stato.ricetteUsateGenerazione.add(scelta.id);
  return scelta;
}

async function preparaBudgetCarboidratiMotore(){
  const rec=await getOne('impostazioni','configCarboidrati');
  const cfg=rec&&rec.valore?Object.assign({},rec.valore):{};
  const residuo={};
  for(const [k,n] of Object.entries(cfg)){
    const q=Math.max(0,parseInt(n)||0);
    if(q>0&&CARBOIDRATI_PASTO[k]) residuo[k]=q;
  }
  return {config:cfg,residuo,totaleEsplicito:Object.values(residuo).reduce((a,b)=>a+b,0)};
}

async function scegliCarboidratoMotore(stato, forzaJolly){
  const residuiOra=Object.entries(stato.budgetCarb.residuo).filter(([k,n])=>n>0&&CARBOIDRATI_PASTO[k]);
  const totaleResiduo=residuiOra.reduce((n,[,q])=>n+(Number(q)||0),0);
  const slotResidui=Number.isFinite(stato.slotCarbAutomaticiResidui)?stato.slotCarbAutomaticiResidui:Infinity;
  // Poco tempo è una preferenza forte, ma non può rendere matematicamente impossibile
  // soddisfare quote carboidrati già scelte dall'utente. Usa pane/friselle soltanto
  // quando, dopo questo slot, resterà ancora capacità sufficiente per tutte le quote.
  const puoUsareJolly=!!forzaJolly && (totaleResiduo===0 || slotResidui>totaleResiduo);
  if(puoUsareJolly){
    let pool=['pane','friselle'].filter(k=>CARBOIDRATI_PASTO[k]);
    pool=pool.filter(k=>{ const c=CARBOIDRATI_PASTO[k]; return !c.limitato || (stato.carboidratiUsati[k]||0)<(c.tettoSettimanale||2); });
    if(!pool.length) pool=['pane'];
    const nonUsati=pool.filter(k=>(stato.carboidratiUsati[k]||0)===0);
    if(nonUsati.length) pool=nonUsati;
    const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
    stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
    return scelta;
  }

  // Quote esplicite Set: prima soddisfa le caselle ancora residue.
  const residui=residuiOra;
  let pool=residui.map(([k])=>k);
  if(!pool.length){
    pool=CARBOIDRATI_ROTAZIONE.filter(k=>CARBOIDRATI_PASTO[k]);
  }
  // Limiti 0-2 per i carboidrati esplicitamente limitati.
  pool=pool.filter(k=>{
    const c=CARBOIDRATI_PASTO[k];
    if(!c.limitato) return true;
    const cap=(c.tettoSettimanale||2);
    return (stato.carboidratiUsati[k]||0)<cap;
  });
  if(!pool.length) pool=['pane'];

  const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
  stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
  if(stato.budgetCarb.residuo[scelta]>0) stato.budgetCarb.residuo[scelta]--;
  return scelta;
}

/* Override del compositore modulare: usa il nuovo stato di rotazione e la
   temporizzazione delle verdure. Mantiene la firma precedente con due parametri
   opzionali finali per compatibilità. */
