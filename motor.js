/* ============================================================
   DietaPlanner — motor.js (file unico)
   Unione di: motor-v9-1, motor-v9-2, motor-v9-3, motor-v9-4,
   patch inline v17 (verdura/contorno), motor-v10 — nello stesso
   ordine di esecuzione originale. Sostituisce i 5 script separati
   PIU' il blocco <script> inline che stava tra v9-4 e v10.
   ============================================================ */

/* ---------- da motor-v9-1.js ---------- */

/* =========================================================
   MOTORE MENU DEFINITIVO v9
   Fonte normativa: percorso alimentare + configurazione Set.
   Regole:
   - Set = vincoli HARD quando espliciti.
   - Default pranzo/cena = portate modulari complete.
   - Slot non configurati = rotazione automatica entro frequenze del piano.
   - La rotazione usa i pasti CONSUMATI, non le sole proposte.
   - Verdure: esclusioni HARD; priorità temporale per conservazione;
     preferite più prevalenti ma con anti-ripetizione tra le preferite.
   - Poco tempo = famiglia pane/friselle con priorità obbligatoria.
   ========================================================= */

const FREQUENZE_MOTORE_BIBBIA = {
  carne:    {min:1, target:3, max:3},
  pesce:    {min:2, target:3, max:3},
  formaggi: {min:2, target:3, max:3},
  uova:     {min:1, target:2, max:2},
  // Il percorso dice "2-3 o più": 3 è il target automatico, non un tetto.
  legumi:   {min:2, target:3, max:14}
};

const SOTTOTIPI_MOTORE = {
  carne:    ['carne_bianca','carne_rossa','affettati'],
  pesce:    ['pesce_bianco','pesce_azzurro','pesce_grande','crostacei','molluschi','pesce_conservato'],
  formaggi: ['formaggio_fresco','formaggio_stagionato'],
  uova:     ['uova'],
  legumi:   ['legumi']
};

const CAP_SOTTOTIPI_MOTORE = {
  carne_rossa:1,
  affettati:1,
  pesce_grande:1,
  pesce_conservato:1
};

function motoreMescola(arr){
  const a=(arr||[]).slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function motoreCategoriaDiSottotipo(sottotipo){
  return SOTTOTIPO_A_GRUPPO[sottotipo] || sottotipo || null;
}

function motoreSequenzaSlot(giorni){
  const out=[];
  for(const g of giorni){
    out.push({giorno:g,pasto:'pranzo'});
    out.push({giorno:g,pasto:'cena'});
  }
  return out;
}

function motoreContaCategorie(celle, giorni){
  const out={carne:0,pesce:0,formaggi:0,uova:0,legumi:0};
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const c=celle[g][p].gruppoProteicoLargo;
      if(c && out[c]!==undefined) out[c]++;
    }
  }
  return out;
}

/* Costruisce la griglia proteica.
   Le scelte dell'utente occupano pranzo poi cena nel giorno selezionato.
   Gli slot liberi vengono completati prima ai minimi del percorso, poi ai target.
   Le categorie marcate "gradisci meno" restano ai minimi quando possibile. */
function costruisciGrigliaMotore(giorni, tabellaGiorno, categorieLimitate){
  const celle={};
  const errori=[];
  const limitate=new Set(categorieLimitate||[]);
  for(const g of giorni){
    celle[g]={
      pranzo:{gruppoProteicoLargo:null,origine:null,stato:'libera'},
      cena:{gruppoProteicoLargo:null,origine:null,stato:'libera'}
    };
  }

  // 1) vincoli espliciti Set
  for(const g of giorni){
    const scelte=(tabellaGiorno&&tabellaGiorno[g]) ? tabellaGiorno[g].slice(0,2) : [];
    for(let i=0;i<scelte.length;i++){
      const cat=scelte[i];
      if(!FREQUENZE_MOTORE_BIBBIA[cat]) continue;
      const p=i===0?'pranzo':'cena';
      celle[g][p]={gruppoProteicoLargo:cat,origine:'utente',stato:'definita'};
    }
  }

  let conteggi=motoreContaCategorie(celle,giorni);
  for(const [cat,n] of Object.entries(conteggi)){
    const max=FREQUENZE_MOTORE_BIBBIA[cat].max;
    if(n>max) errori.push(`${cat}: ${n} selezioni, massimo ${max}`);
  }
  if(errori.length) return {celle,errori,conteggi};

  const slot=motoreSequenzaSlot(giorni);
  const liberi=slot.filter(s=>!celle[s.giorno][s.pasto].gruppoProteicoLargo);

  function scegliCategoriaPerSlot(indiceLibero){
    const prevIndex=slot.findIndex(x=>x.giorno===liberi[indiceLibero].giorno && x.pasto===liberi[indiceLibero].pasto)-1;
    const prev=prevIndex>=0 ? celle[slot[prevIndex].giorno][slot[prevIndex].pasto].gruppoProteicoLargo : null;

    // Prima colma i minimi obbligatori
    let candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(cat=>{
      const f=FREQUENZE_MOTORE_BIBBIA[cat];
      return conteggi[cat] < f.min && conteggi[cat] < f.max;
    });

    // Poi tende ai target, evitando le categorie "gradite meno" se esiste alternativa
    if(!candidati.length){
      candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(cat=>{
        const f=FREQUENZE_MOTORE_BIBBIA[cat];
        return conteggi[cat] < f.target && conteggi[cat] < f.max && !limitate.has(cat);
      });
    }
    if(!candidati.length){
      candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(cat=>{
        const f=FREQUENZE_MOTORE_BIBBIA[cat];
        return conteggi[cat] < f.target && conteggi[cat] < f.max;
      });
    }
    // Ultima estensione consentita dal piano: legumi "2-3 o più"
    if(!candidati.length && conteggi.legumi < FREQUENZE_MOTORE_BIBBIA.legumi.max){
      candidati=['legumi'];
    }
    if(!candidati.length) return null;

    // Evita la stessa categoria consecutiva quando possibile.
    const alternati=candidati.filter(c=>c!==prev);
    if(alternati.length) candidati=alternati;

    // Privilegia la categoria col maggior deficit verso il target/minimo.
    let best=-Infinity, pool=[];
    for(const c of candidati){
      const f=FREQUENZE_MOTORE_BIBBIA[c];
      const deficit=(conteggi[c]<f.min ? (f.min-conteggi[c])*100 : (f.target-conteggi[c])*10);
      if(deficit>best){best=deficit;pool=[c];}
      else if(deficit===best) pool.push(c);
    }
    return motoreMescola(pool)[0];
  }

  for(let i=0;i<liberi.length;i++){
    const cat=scegliCategoriaPerSlot(i);
    if(!cat){
      errori.push(`nessuna categoria disponibile per ${liberi[i].giorno} ${liberi[i].pasto}`);
      continue;
    }
    celle[liberi[i].giorno][liberi[i].pasto]={
      gruppoProteicoLargo:cat,origine:'motore',stato:'definita'
    };
    conteggi[cat]++;
  }

  // Se Set è completo, deve comunque rispettare i minimi del percorso.
  for(const [cat,f] of Object.entries(FREQUENZE_MOTORE_BIBBIA)){
    if(conteggi[cat] < f.min){
      errori.push(`${cat}: ${conteggi[cat]} presenze, minimo ${f.min}`);
    }
  }
  return {celle,errori,conteggi};
}

/* Compatibilità con il vecchio codice: da v9 questi nomi puntano al motore unico. */
function costruisciGrigliaBase(giorni, tabellaGiorno){
  return costruisciGrigliaMotore(giorni, tabellaGiorno||{}, []);
}
function validaGrigliaBase(celle){
  let piene=0,totale=0; const vuote=[],conteggiPerCategoria={};
  for(const g of Object.keys(celle||{})){
    for(const p of ['pranzo','cena']){
      totale++;
      const c=celle[g][p]&&celle[g][p].gruppoProteicoLargo;
      if(c){piene++;conteggiPerCategoria[c]=(conteggiPerCategoria[c]||0)+1;}
      else vuote.push(g+'_'+p);
    }
  }
  return {piene,totale,vuote,completa:vuote.length===0,conteggiPerCategoria};
}

/* Storico reale: considera soltanto i pasti marcati consumato.
   Conserva l'ultimo consumo di ricette, carboidrati e verdure. */
async function costruisciStoricoConsumatiMotore(){
  const piano=await getAll('piano');
  const ricette=await getAll('ricette');
  const varianti=await getAll('varianti');
  const ingredienti=await getAll('ingredienti');
  const ricById=new Map(ricette.map(r=>[r.id,r]));
  const varById=new Map(varianti.map(v=>[v.id,v]));
  const baseById=new Map(ingredienti.map(i=>[i.id,i]));
  const ultimoRicetta={};
  const ultimoCarb={};
  const ultimoVerdura={};
  const sottotipiTotali={};

  for(const voce of piano){
    if(!voce || !voce.consumato) continue;
    const data=(voce.id||'').slice(0,10);
    const ts=Date.parse(data+'T12:00:00') || 0;
    if(voce.primoCereale) ultimoCarb[voce.primoCereale]=Math.max(ultimoCarb[voce.primoCereale]||0,ts);
    const ids=voce.modo==='multi'
      ? [voce.primoId,voce.secondoId,voce.contornoId].filter(Boolean)
      : [voce.ricettaId].filter(Boolean);
    for(const rid of ids){
      ultimoRicetta[rid]=Math.max(ultimoRicetta[rid]||0,ts);
      const r=ricById.get(rid);
      if(!r) continue;
      if(r.gruppoProteico) sottotipiTotali[r.gruppoProteico]=(sottotipiTotali[r.gruppoProteico]||0)+1;
      for(const ing of (r.ingredienti||[])){
        if(!ing.variantId) continue;
        const v=varById.get(ing.variantId), b=v?baseById.get(v.ingredienteId):null;
        if(b && b.gruppo==='verdura'){
          ultimoVerdura[v.id]=Math.max(ultimoVerdura[v.id]||0,ts);
        }
      }
    }
  }
  return {ultimoRicetta,ultimoCarb,ultimoVerdura,sottotipiTotali};
}

/* ---------- da motor-v9-2.js ---------- */
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

async function scegliCarboidratoMotore(stato, forzaJolly, giorno, categoria){
if(forzaJolly){
let pool=['pane','friselle'].filter(k=>CARBOIDRATI_PASTO[k]);
pool=pool.filter(k=>{
const c=CARBOIDRATI_PASTO[k];
return !c.limitato || (stato.carboidratiUsati[k]||0)<(c.tettoSettimanale||2);
});
if(!pool.length) pool=['pane'];
const nonUsati=pool.filter(k=>(stato.carboidratiUsati[k]||0)===0);
if(nonUsati.length) pool=nonUsati;
const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
if(stato.budgetCarb.residuo[scelta]>0) stato.budgetCarb.residuo[scelta]--;
return scelta;
}
const residui=Object.entries(stato.budgetCarb.residuo).filter(([k,n])=>Number(n)>0&&CARBOIDRATI_PASTO[k]);
let pool=residui.length?residui.map(([k])=>k):CARBOIDRATI_ROTAZIONE.filter(k=>CARBOIDRATI_PASTO[k]);
pool=pool.filter(k=>{
const c=CARBOIDRATI_PASTO[k];
return !c.limitato||(stato.carboidratiUsati[k]||0)<(c.tettoSettimanale||2);
});
if(!pool.length){
pool=CARBOIDRATI_ROTAZIONE.filter(k=>CARBOIDRATI_PASTO[k]);
}
if(!pool.length){
pool=['pane'];
}
const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
if(stato.budgetCarb.residuo[scelta]>0) stato.budgetCarb.residuo[scelta]--;
return scelta;
}

/* Override del compositore modulare: usa il nuovo stato di rotazione e la
   temporizzazione delle verdure. Mantiene la firma precedente con due parametri
   opzionali finali per compatibilità. */

/* ---------- da motor-v9-3.js ---------- */
componiPastoModulare = async function(gruppoProteico, giorno, escludiSugoId, escludiProteinaId, escludiContornoId, forzaJolly, preferenzeMotore, statoMotore){
  preferenzeMotore=preferenzeMotore||{};
  if(!statoMotore){
    statoMotore={
      storico:await costruisciStoricoConsumatiMotore(),
      ricetteUsateGenerazione:new Set(),
      preferiteVerdureUsate:new Set(),
      carboidratiUsati:{},
      budgetCarb:await preparaBudgetCarboidratiMotore()
    };
  }
  const categoriaLarga = gruppoProteico ? motoreCategoriaDiSottotipo(gruppoProteico) : null;

  // Affettati impone pane: scavalca la rotazione, non passa da scegliCarboidratoMotore.
  const carb = (gruppoProteico==='affettati')
    ? (statoMotore.carboidratiUsati['pane']=(statoMotore.carboidratiUsati['pane']||0)+1, 'pane')
    : await scegliCarboidratoMotore(statoMotore,!!forzaJolly,giorno,categoriaLarga);
  const carbCfg=CARBOIDRATI_PASTO[carb];
  if(!carbCfg) return null;

  if(carbCfg.soloSfiziosa){
    return {soloSfiziosa:true, primoCarboidrato:carb, categoriaLarga};
  }

  let sugo=null, primoRicettaRealeId=null;
  if(!carbCfg.jolly){
    const primoReale = await motoreV10ScegliPrimoReale(carb, statoMotore, preferenzeMotore);
    if(primoReale){
      primoRicettaRealeId = primoReale.id;
    }else if(carbCfg.haPoolSughi){
      const tuttiSughi = await cercaComponentiModulari('sugo');
      const compatibili = tuttiSughi.filter(s=>(s.carboidratiCompatibili||[]).includes(carb));
      const nonUsati = compatibili.filter(s=>s.id!==escludiSugoId);
      const pool = nonUsati.length?nonUsati:compatibili;
      sugo = scegliMenoRecenteMotore(pool, r=>statoMotore.storico.ultimoRicetta[r.id]||0, ()=>0);
    }
  }

  const proteina=gruppoProteico ? await scegliProteinaModulareMotore(gruppoProteico,statoMotore,escludiProteinaId) : null;
  const contorno=await scegliContornoMotore(giorno,statoMotore,preferenzeMotore,escludiContornoId);
  if(!proteina || !contorno) return null;

  const cottura=scegliCotturaStandard(proteina.gruppoProteico,proteina.nome);
  return {
    primoRicettaRealeId,
    primoNome: primoRicettaRealeId ? null : (sugo?componiNomePrimoModulare(carbCfg.label,sugo.nome):carbCfg.label),
    primoCarboidrato:carb,
    primoSugoId:sugo?sugo.id:null,
    primoEJolly:!!carbCfg.jolly,
    secondoNome:componiNomeSecondoModulare(proteina.nome,cottura,contorno.nome),
    proteinaId:proteina.id,
    cottura,
    contornoId:contorno.id
  };
};

async function caricaPreferenzeMotoreDaSet(scartoSettimane){
  const giorni=giorniSettimana(scartoSettimane||0);
  const recTab=await getOne('impostazioni','tabellaGiornoCategoria');
  const tabRaw=recTab&&recTab.valore?recTab.valore:{};
  const giornoCategoria={};
  giorni.forEach((g,i)=>{
    const a=tabRaw['giorno_'+i];
    if(a&&a.length) giornoCategoria[g]=a.slice(0,2);
  });

  const recLim=await getOne('impostazioni','setProteineLimitate');
  const recTempo=await getOne('impostazioni','setPocoTempo');
  const recPref=await getOne('impostazioni','setVerdurePreferite');
  const recOff=await getOne('impostazioni','setVerdureDisattivate');
  const recRic=await getOne('impostazioni','verduraRicorrente');
  const recRicPasti=await getOne('impostazioni','verduraRicorrentePasti');
  const varianti=await getAll('varianti');
  const prefNomi=new Set(recPref&&recPref.valore?recPref.valore:[]);
  const prefIds=varianti.filter(v=>prefNomi.has(v.nome)).map(v=>v.id);
  const tempo=Object.assign({pranzo:false,cena:false},recTempo&&recTempo.valore?recTempo.valore:{});
  return {
    giornoCategoria,
    proteineLimitate:recLim&&recLim.valore?recLim.valore:[],
    pocoTempoPranzo:!!tempo.pranzo,
    pocoTempoCena:!!tempo.cena,
    verdurePreferiteVariantIds:prefIds,
    verdureDisattivate:recOff&&recOff.valore?recOff.valore:[],
    verduraRicorrenteVariantId:recRic&&recRic.valore?recRic.valore:null,
    verduraRicorrentePasti:recRicPasti&&Array.isArray(recRicPasti.valore)?recRicPasti.valore:[]
  };
}

async function creaStatoMotoreSettimana(){
  const storico=await costruisciStoricoConsumatiMotore();
  // Lo storico reale alimenta la rotazione anche a livello di macrocategoria/sottotipo.
  const ultimoConsumoSottotipo=Object.assign({},storico.ultimoSottotipo||{});
  return {
    storico,
    ultimoConsumoSottotipo,
    conteggiSottotipi:{},
    ricetteUsateGenerazione:new Set(),
    preferiteVerdureUsate:new Set(),
    carboidratiUsati:{},
    budgetCarb:await preparaBudgetCarboidratiMotore(),
    errori:[],
    marcatori:[]
  };
}

async function scegliPrimoVelocePerCarbMotore(carb,stato){
  const tutte=await getAll('ricette');
  let pool=tutte.filter(r=>{
    if(r.esclusa||r.piattoSpeciale||(r.tipoPortata||'unico')!=='primo')return false;
    const nome=(r.nome||'').toLowerCase();
    const isFrisella=nome.includes('frisell');
    const isPane=nome.includes('bruschett')||nome.includes('pane')||(!isFrisella&&(r.ingredienti||[]).some(i=>(i.nomeLibero||'').toLowerCase()==='pane fresco'));
    return carb==='friselle'?isFrisella:(carb==='pane'?isPane:false);
  });
  if(!pool.length)return null;
  if(stato&&stato.ricetteUsateGenerazione){
    const nuove=pool.filter(r=>!stato.ricetteUsateGenerazione.has(r.id));if(nuove.length)pool=nuove;
  }
  const scelta=scegliMenoRecenteMotore(pool,r=>stato&&stato.storico?(stato.storico.ultimoRicetta[r.id]||0):0,()=>0);
  if(scelta&&stato&&stato.ricetteUsateGenerazione)stato.ricetteUsateGenerazione.add(scelta.id);
  return scelta;
}

async function generaPortateMotore(giorno,pasto,cella,preferenze,stato){
const categoria=cella.gruppoProteicoLargo;
const sottotipo=await scegliSottotipoMotore(categoria,stato);
const pocoTempo=(pasto==='pranzo'&&preferenze.pocoTempoPranzo)||(pasto==='cena'&&preferenze.pocoTempoCena);
const esito=await componiPastoModulare(sottotipo,giorno,null,null,null,pocoTempo,preferenze,stato);
if(!esito) return {voce:null,errore:'Nessuna combinazione completa per '+giorno+' '+pasto+' ('+categoria+'/'+sottotipo+')'};
let primoId=esito.primoRicettaRealeId||null;
if(pocoTempo&&!primoId){
const rapido=await scegliPrimoVelocePaneFriselle();
if(rapido) primoId=rapido.id;
}
if(!primoId&&esito.primoSugoId){
const template=await getOne('ricette',esito.primoSugoId);
if(template){
const composto=await componiPrimoModulare(template,esito.primoCarboidrato);
if(composto) primoId=composto.id;
}
}
return {
voce:{
id:giorno+'_'+pasto,modo:'multi',fascia:'facile',porzioni:1,
primoId,primoCereale:esito.primoCarboidrato,primoSugoId:esito.primoSugoId||null,
secondoId:esito.proteinaId,contornoId:esito.contornoId,cotturaSecondo:esito.cottura||null,
ricettaId:null,categoriaLargaE1:categoria,sottotipoProteicoMotore:sottotipo,
origineCategoriaMotore:cella.origine,pocoTempoMotore:!!pocoTempo,origine:'motore'
},
errore:null
};
}

/* Generatore unico v9. Non usa più E2 né il 50/50 unico/multi.
   Piatto unico, sfiziosa, speciale e Salvafrigo restano alternative scelte
   dall'utente dal pannello del pasto; Genera menu propone sempre portate. */
generaPianoSettimana = async function(scartoSettimane, opzioni){
  scartoSettimane=scartoSettimane||0;
  opzioni=opzioni||{};
  const forza=!!opzioni.forza;
  const giorni=giorniSettimana(scartoSettimane);
  const preferenze=opzioni.preferenze&&Object.keys(opzioni.preferenze).length
    ? Object.assign(await caricaPreferenzeMotoreDaSet(scartoSettimane),opzioni.preferenze)
    : await caricaPreferenzeMotoreDaSet(scartoSettimane);

  // LAYER 1: scelte esplicite Set. LAYER 2/3: preferenze + Bibbia completano solo i vuoti.
  // Le scelte utente non vengono mai rimpiazzate dal completamento automatico.
  const griglia=costruisciGrigliaMotore(giorni,preferenze.giornoCategoria||{},preferenze.proteineLimitate||[]);
  if(griglia.errori.length){
    await put('impostazioni',{chiave:'ultimoReportMotore',valore:{data:new Date().toISOString(),ok:false,errori:griglia.errori,conteggi:griglia.conteggi}});
    if(typeof avviso==='function') await avviso('Configurazione Set non compatibile con il percorso:\n'+griglia.errori.join('\n'));
    return {ok:false,errori:griglia.errori};
  }

  const stato=await creaStatoMotoreSettimana();
  const generati=[];
  for(const g of giorni){
    for(const pasto of ['pranzo','cena']){
      const id=g+'_'+pasto;
      let esistente=await getOne('piano',id);
      if(esistente&&esistente.consumato) continue;
      if(esistente&&esistente.bloccata) continue;
      if(esistente&&!forza){
        const completo=esistente.modo==='multi'
          ? (!!esistente.secondoId && !!esistente.contornoId && (!!esistente.primoId || !!esistente.primoCereale))
          : !!esistente.ricettaId;
        if(completo) continue;
      }

      const risultato=await generaPortateMotore(g,pasto,griglia.celle[g][pasto],preferenze,stato);
      if(!risultato.voce){
        stato.errori.push(risultato.errore);
        continue;
      }
      // Mantiene il lucchetto o altri metadati non nutrizionali dell'eventuale record.
      const nuova=Object.assign({},esistente||{},risultato.voce,{consumato:false});
      await put('piano',nuova);
      generati.push(nuova);
    }

    // Colazione: conserva la logica già prevista dal Set.
    const varianti=await getAll('varianti');
    const idCol=g+'_colazione';
    let col=await getOne('piano',idCol);
    if(!(col&&col.consumato)&&!(col&&col.bloccata)){
      if(forza&&col&&!col.colazioneSpecialeId) col=Object.assign({},col,{componenti:null});
      if(!col||(!col.componenti&&!col.colazioneSpecialeId)){
        const pref=await getOne('impostazioni','colazionePreferita');
        const gg=await getOne('impostazioni','colazionePreferitaGiorni');
        const giorniPref=gg&&gg.valore?gg.valore:[];
        const idx=giorni.indexOf(g);
        const giorniPrefNormalizzati=(giorniPref||[]).map(Number);
        const usa=!!(pref&&pref.valore) && (giorniPrefNormalizzati.length>=7 || giorniPrefNormalizzati.includes(idx));
        let componenti;
        if(usa){
          componenti=componentiColazioneDaSet(pref.valore,varianti);
        }else{
          const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
          const recEsclusiColazione=await getOne('impostazioni','colazioneIngredientiEsclusi');
          componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],recEsclusiColazione&&recEsclusiColazione.valore?recEsclusiColazione.valore:[]);
        }
        if(componenti) await put('piano',{id:idCol,componenti});
      }
    }
  }

  const report={
    data:new Date().toISOString(),
    ok:stato.errori.length===0,
    errori:stato.errori,
    conteggiProteici:griglia.conteggi,
    generati:generati.length,
    carboidratiUsati:stato.carboidratiUsati,
    sottotipiUsati:stato.conteggiSottotipi,
    verdurePreferiteUsate:[...stato.preferiteVerdureUsate]
  };
  await put('impostazioni',{chiave:'ultimoReportMotore',valore:report});
  if(scartoSettimane===0 && typeof renderPiano==='function') renderPiano();
  return report;
};

generaMenuDaConfigSet = async function(scartoSettimane){
  scartoSettimane=scartoSettimane||0;
  menuSettimanaScarto=scartoSettimane;
  mostraVista('menu');
  const preferenze=await caricaPreferenzeMotoreDaSet(scartoSettimane);
  const report=await generaPianoSettimana(scartoSettimane,{forza:true,preferenze});
  await renderMenuSettimanale();
  await renderPiano();
  return report;
};

/* Registrazione lacune libreria per la futura Review.
   Usa lo store impostazioni già esistente, così non richiede una migrazione IndexedDB. */
async function registraRichiestaRicettaReview(dati){
  const rec=await getOne('impostazioni','reviewRicetteMancanti');
  const lista=rec&&Array.isArray(rec.valore)?rec.valore:[];
  const norm=v=>(v||'').toString().trim().toLowerCase();
  const key=[
    dati.tipo||'piatto_unico',
    norm(dati.carboidrato),
    norm(dati.categoriaProteica),
    norm(dati.sottotipoProteico),
    norm(dati.verdura)
  ].join('|');
  let x=lista.find(r=>r.key===key);
  if(x){
    x.conteggio=(x.conteggio||0)+1;
    x.ultimaRichiesta=new Date().toISOString();
  }else{
    x=Object.assign({key,conteggio:1,primaRichiesta:new Date().toISOString(),ultimaRichiesta:new Date().toISOString()},dati);
    lista.push(x);
  }
  await put('impostazioni',{chiave:'reviewRicetteMancanti',valore:lista});
  return x;
}

/* La vecchia E2 può ancora essere richiamata da utility non attive: restituisce
   una struttura neutra invece di causare ReferenceError. */
async function sviluppaGrigliaCrossWeek(celle,giorni,tutteRicette,mappaVarianti,preferenze,storicoPerSlot,usatiPrecedente){
  return {celle,storicoPerSlot:storicoPerSlot||{},ripetizioniForzate:[],usatiSettimanaCorrente:new Set()};
}



/* ---------- da motor-v9-4.js ---------- */
/* SET v9 — consente configurazione parziale: ciò che manca viene completato dal motore. */
(function(){
  const fris=CONFIG_CARB_TIPI.find(x=>x.chiave==='friselle');
  if(fris) fris.maxIndividuale=1;

  aggiornaStatoConfigCarb = function(){
    const totale=contaTotaleCaselleCarb();
    const el=document.getElementById('cfgCarboidratiTotale');
    const btn=document.getElementById('btnSalvaConfigCarboidrati');
    if(el){
      el.textContent='Configurati: '+totale+' / 14 — le caselle mancanti saranno completate in rotazione';
      el.style.color=totale?'var(--accent)':'var(--text-dim)';
    }
    if(btn) btn.disabled=false;
  };

  renderSetTabellaGiorno = async function(){
    const el=document.getElementById('setTabellaGiorno'); if(!el)return;
    const rec=await getOne('impostazioni','tabellaGiornoCategoria');
    const tab=rec&&rec.valore?rec.valore:{};
    const giorni=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
    const cats=[
      {chiave:'carne',label:'Carne'},{chiave:'pesce',label:'Pesce'},
      {chiave:'formaggi',label:'Formaggi'},{chiave:'uova',label:'Uova'},{chiave:'legumi',label:'Legumi'}
    ];
    const head=giorni.map(g=>`<th style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;padding:4px 2px;min-width:26px;text-align:center;">${g}</th>`).join('');
    const rows=cats.map(c=>{
      const max=FREQUENZE_MOTORE_BIBBIA[c.chiave].max;
      const used=giorni.reduce((n,g,i)=>n+((tab['giorno_'+i]||[]).includes(c.chiave)?1:0),0);
      const cells=giorni.map((g,i)=>{
        const arr=tab['giorno_'+i]||[];
        const on=arr.includes(c.chiave);
        const dayFull=arr.length>=2&&!on;
        const capFull=used>=max&&!on;
        return `<td class="cella"><button data-set-cella="${i}|${c.chiave}" class="${on?'active':''} ${(dayFull||capFull)?'al-tetto':''}" ${dayFull||capFull?'disabled':''} style="min-height:36px;min-width:36px;"></button></td>`;
      }).join('');
      const lim=max>=14?'':` <span class="meta">(max ${max})</span>`;
      return `<tr><td class="riga-label">${c.label}${lim}</td>${cells}</tr>`;
    }).join('');
    el.innerHTML=`<table class="tabella-giorno"><tr><th class="col-label"></th>${head}</tr>${rows}</table>`;
    el.querySelectorAll('[data-set-cella]').forEach(b=>b.addEventListener('click',async()=>{
      const [ix,cat]=b.dataset.setCella.split('|'); const k='giorno_'+parseInt(ix);
      tab[k]=tab[k]||[]; const pos=tab[k].indexOf(cat);
      if(pos>=0) tab[k].splice(pos,1); else{
        const max=FREQUENZE_MOTORE_BIBBIA[cat].max;
        const used=giorni.reduce((n,g,i)=>n+((tab['giorno_'+i]||[]).includes(cat)?1:0),0);
        if(used>=max){await avviso('Massimo settimanale raggiunto per '+cat+'.');return;}
        if(tab[k].length>=2){await avviso('Massimo 2 fonti proteiche per giorno.');return;}
        tab[k].push(cat);
      }
      await put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:tab});
      renderSetTabellaGiorno();
    }));
  };

  // Sostituisce i due pulsanti di salvataggio che prima obbligavano a compilare 14 caselle.
  function abilitaSalvataggioParziale(){
    const old=document.getElementById('btnSalvaConfigCarboidrati');
    if(old&&!old.dataset.v9){
      const b=old.cloneNode(true); b.dataset.v9='1'; b.disabled=false; old.replaceWith(b);
      b.addEventListener('click',async()=>{
        await put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb});
        await avviso('✅ Configurazione carboidrati salvata. Le caselle non definite saranno completate dal motore.');
      });
    }
    const oldAll=document.getElementById('btnSalvaSetCompleto');
    if(oldAll&&!oldAll.dataset.v9){
      const b=oldAll.cloneNode(true); b.dataset.v9='1'; oldAll.replaceWith(b);
      b.addEventListener('click',async()=>{
        await put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb});
        const st=document.getElementById('setSalvaStato');
        if(st){st.textContent='✅ Configurazione salvata. Le parti non impostate saranno completate in rotazione.';st.style.color='var(--accent)';setTimeout(()=>st.textContent='',3000);}
      });
    }
    aggiornaStatoConfigCarb();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',abilitaSalvataggioParziale);
  else abilitaSalvataggioParziale();

  // Salvataggio live delle caselle carboidrati: rende realmente persistente anche un Set parziale.
  document.addEventListener('click',e=>{
    if(e.target&&e.target.closest&&e.target.closest('[data-casella-carb]')){
      setTimeout(()=>put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb}),0);
    }
  });
})();

/* Associazioni cottura validate — v10. */
COTTURE_STANDARD.carne_bianca=['alla piastra','al forno','al limone','a dadini','in padella'];
COTTURE_STANDARD.affettati=[];
COTTURE_STANDARD.pesce_conservato=[];
const COTTURE_PER_PROTEINA_V10={'bresaola':[],'prosciutto crudo':[],'tonno in scatola':[],'sgombro in scatola':[],'mozzarella':[],'parmigiano':[]};
scegliCotturaStandard=function(gruppoProteico,nomeProteina){
  const chiave=(nomeProteina||'').trim().toLowerCase();
  const cotture=Object.prototype.hasOwnProperty.call(COTTURE_PER_PROTEINA_V10,chiave)?COTTURE_PER_PROTEINA_V10[chiave]:COTTURE_STANDARD[gruppoProteico];
  if(!cotture||!cotture.length)return null;
  return cotture[Math.floor(Math.random()*cotture.length)];
};

/* ---------- da index.html, blocco <script> inline che stava tra
   motor-v9-4.js e motor-v10.js (patch "v17" verdura/contorno) ---------- */
function tierVerduraMotoreV17(v){return tierDisponibilitaVerdura(v);}
function ordineVerdureGiornoV17(indice){if(indice<=2)return ['fresco','fresco_duraturo','confezionato','surgelato'];if(indice<=4)return ['fresco_duraturo','fresco','confezionato','surgelato'];return ['confezionato','surgelato','fresco_duraturo','fresco'];}
poolDelGiorno=function(i){return ordineVerdureGiornoV17(i);};
contorniAmmessiPerPool=function(contorni,mappaVarianti,pool){for(const tier of (Array.isArray(pool)?pool:[])){const out=(contorni||[]).filter(r=>(r.ingredienti||[]).some(i=>{const v=mappaVarianti[i.variantId];return v&&v.gruppoBase==='verdura'&&tierVerduraMotoreV17(v)===tier;}));if(out.length)return out;}return [];};
motoreInfoVerduraContorno=async function(r,cache){for(const ing of (r.ingredienti||[])){const v=cache.vById.get(ing.variantId);if(!v)continue;const b=cache.bById.get(v.ingredienteId);if(b&&b.gruppo==='verdura')return {variantId:v.id,nome:v.nome,tier:tierVerduraMotoreV17(v)};}return null;};
scegliContornoMotore=async function(giorno,stato,preferenze,escludiId){const ricette=await getAll('ricette'),varianti=await getAll('varianti'),ingredienti=await getAll('ingredienti');const cache={vById:new Map(varianti.map(v=>[v.id,v])),bById:new Map(ingredienti.map(b=>[b.id,b]))};const off=new Set(preferenze.verdureDisattivate||[]),prefIds=new Set(preferenze.verdurePreferiteVariantIds||[]);let candidati=[];for(const r of ricette){if(r.tipoPortata!=='modulare'||r.sottoCategoriaModulare!=='contorno'||r.esclusa||r.id===escludiId)continue;const info=await motoreInfoVerduraContorno(r,cache);if(!info||off.has(info.variantId))continue;candidati.push({r,info});}if(!candidati.length)return null;const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7,ordine=ordineVerdureGiornoV17(idx);let pool=[];for(const t of ordine){pool=candidati.filter(x=>x.info.tier===t);if(pool.length)break;}if(!pool.length)pool=candidati;const preferite=pool.filter(x=>prefIds.has(x.info.variantId));if(preferite.length){const nuove=preferite.filter(x=>!stato.preferiteVerdureUsate.has(x.info.variantId));pool=nuove.length?nuove:preferite;const scelta=scegliMenoRecenteMotore(pool,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);stato.preferiteVerdureUsate.add(scelta.info.variantId);return scelta.r;}return motoreMescola(pool)[0].r;};

/* ---------- da motor-v10.js ---------- */
/* =========================================================
   MOTORE v10 — pipeline a layer
   Fonte: MOTORE-REGOLE.md + PERCORSO ALIMENTARE MIRIA SPILLER.pdf
   Questo file viene caricato per ultimo e corregge/coordina il motore v9
   senza eliminare le utility gia usate dall'interfaccia.
   ========================================================= */
(function(){
'use strict';

const MOTORE_V10_MAX_SPECIALI = 2;

function motoreV10VoceHaContenuto(v){
  if(!v) return false;
  if(v.colazioneSpecialeId || v.componenti) return true;
  if(v.modo==='multi') return !!(v.primoId || v.primoCereale || v.secondoId || v.contornoId);
  return !!v.ricettaId;
}
function motoreV10VoceCompleta(v){
  if(!v) return false;
  if(v.modo==='multi') return !!v.secondoId && !!v.contornoId && (!!v.primoId || !!v.primoCereale);
  return !!v.ricettaId;
}
function motoreV10Protetta(v){
  if(!motoreV10VoceHaContenuto(v)) return false;
  if(v.consumato || v.bloccata) return true;
  return v.origine !== 'motore' && v.origine !== 'motore_set';
}

function motoreV10GiorniSettimanaDaData(giorno){
  const d=new Date(giorno+'T12:00:00');
  const delta=(d.getDay()+6)%7;
  const lun=new Date(d); lun.setDate(d.getDate()-delta);
  const out=[];
  for(let i=0;i<7;i++){
    const x=new Date(lun); x.setDate(lun.getDate()+i);
    out.push(x.toISOString().slice(0,10));
  }
  return out;
}

async function motoreV10RicettaPrincipaleVoce(v, ricById){
  if(!v) return null;
  if(v.modo==='multi') return v.secondoId ? ricById.get(v.secondoId)||null : null;
  return v.ricettaId ? ricById.get(v.ricettaId)||null : null;
}
async function motoreV10VoceSpeciale(v, ricById){
  if(!v || v.modo==='multi' || !v.ricettaId) return false;
  const r=ricById.get(v.ricettaId);
  return !!(r && r.piattoSpeciale);
}

async function motoreV10ContaSpecialiSettimana(giorno, escludiPianoId){
  const giorni=new Set(motoreV10GiorniSettimanaDaData(giorno));
  const [piano,ricette]=await Promise.all([getAll('piano'),getAll('ricette')]);
  const ricById=new Map(ricette.map(r=>[r.id,r]));
  let n=0;
  for(const v of piano){
    if(!v || v.id===escludiPianoId) continue;
    const sep=(v.id||'').lastIndexOf('_'); if(sep<0) continue;
    const data=v.id.slice(0,sep), pasto=v.id.slice(sep+1);
    if(!giorni.has(data) || !['pranzo','cena'].includes(pasto)) continue;
    if(await motoreV10VoceSpeciale(v,ricById)) n++;
  }
  return n;
}

/* Limite speciale centralizzato: intercetta qualunque percorso che usa
   confermaConAllarme (Piano, alternativa completa, assegnazione dal Ricettario). */
if(typeof confermaConAllarme==='function' && !confermaConAllarme._motoreV10){
  const _confermaConAllarme=confermaConAllarme;
  const wrap=async function(pasto,giorno,ricetteCandidate){
    if(['pranzo','cena'].includes(pasto)){
      const speciale=(ricetteCandidate||[]).find(r=>r&&r.piattoSpeciale);
      if(speciale){
        const pianoId=giorno+'_'+pasto;
        const n=await motoreV10ContaSpecialiSettimana(giorno,pianoId);
        if(n>=MOTORE_V10_MAX_SPECIALI){
          if(typeof avviso==='function') await avviso('Puoi programmare al massimo 2 pasti speciali nella stessa settimana.');
          return false;
        }
      }
    }
    return _confermaConAllarme(pasto,giorno,ricetteCandidate);
  };
  wrap._motoreV10=true;
  confermaConAllarme=wrap;
}

/* Conteggi proteici dell'interfaccia/allarmi: i pasti speciali sono fuori
   dal conteggio ordinario e non generano compensazioni. */
async function motoreV10ConsumiProteici(consumatiSoltanto){
  const giorni=giorniSettimana();
  const gruppi={carne:0,pesce:0,formaggi:0,uova:0,legumi:0};
  const sottotipi={carne_rossa:0,affettati:0,pesce_grande:0,pesce_conservato:0};
  const [piano,ricette]=await Promise.all([getAll('piano'),getAll('ricette')]);
  const pById=new Map(piano.map(v=>[v.id,v]));
  const rById=new Map(ricette.map(r=>[r.id,r]));
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const voce=pById.get(g+'_'+p); if(!voce || (consumatiSoltanto&&!voce.consumato)) continue;
      if(await motoreV10VoceSpeciale(voce,rById)) continue;
      const ids=voce.modo==='multi'?[voce.secondoId].filter(Boolean):[voce.ricettaId].filter(Boolean);
      for(const id of ids){
        const r=rById.get(id); if(!r||!r.gruppoProteico||r.piattoSpeciale) continue;
        const s=r.gruppoProteico, m=motoreCategoriaDiSottotipo(s);
        if(gruppi[m]!==undefined) gruppi[m]++;
        if(sottotipi[s]!==undefined) sottotipi[s]++;
      }
    }
  }
  return {gruppi,sottotipi};
}
if(typeof getConsumiProteiciSettimana==='function') getConsumiProteiciSettimana=()=>motoreV10ConsumiProteici(false);
if(typeof getConsumiProteiciSettimanaConsumati==='function') getConsumiProteiciSettimanaConsumati=()=>motoreV10ConsumiProteici(true);

/* Storico del motore: usa solo pasti realmente consumati e NON usa i pasti
   speciali per guidare frequenze/rotazione del piano ordinario. */
costruisciStoricoConsumatiMotore = async function(){
  const [piano,ricette,varianti,ingredienti]=await Promise.all([getAll('piano'),getAll('ricette'),getAll('varianti'),getAll('ingredienti')]);
  const ricById=new Map(ricette.map(r=>[r.id,r]));
  const varById=new Map(varianti.map(v=>[v.id,v]));
  const baseById=new Map(ingredienti.map(i=>[i.id,i]));
  const ultimoRicetta={},ultimoCarb={},ultimoVerdura={},sottotipiTotali={},ultimoSottotipo={},ultimoCategoriaProteica={};
  for(const voce of piano){
    if(!voce||!voce.consumato) continue;
    if(await motoreV10VoceSpeciale(voce,ricById)) continue;
    const data=(voce.id||'').slice(0,10), ts=Date.parse(data+'T12:00:00')||0;
    if(voce.primoCereale) ultimoCarb[voce.primoCereale]=Math.max(ultimoCarb[voce.primoCereale]||0,ts);
    const ids=voce.modo==='multi'?[voce.primoId,voce.secondoId,voce.contornoId].filter(Boolean):[voce.ricettaId].filter(Boolean);
    for(const rid of ids){
      const r=ricById.get(rid); if(!r||r.piattoSpeciale) continue;
      ultimoRicetta[rid]=Math.max(ultimoRicetta[rid]||0,ts);
      if(r.gruppoProteico){
        sottotipiTotali[r.gruppoProteico]=(sottotipiTotali[r.gruppoProteico]||0)+1;
        ultimoSottotipo[r.gruppoProteico]=Math.max(ultimoSottotipo[r.gruppoProteico]||0,ts);
        const macro=motoreCategoriaDiSottotipo(r.gruppoProteico);
        if(macro) ultimoCategoriaProteica[macro]=Math.max(ultimoCategoriaProteica[macro]||0,ts);
      }
      for(const ing of (r.ingredienti||[])){
        if(!ing.variantId) continue;
        const v=varById.get(ing.variantId), b=v?baseById.get(v.ingredienteId):null;
        if(b&&b.gruppo==='verdura') ultimoVerdura[v.id]=Math.max(ultimoVerdura[v.id]||0,ts);
      }
    }
  }
  return {ultimoRicetta,ultimoCarb,ultimoVerdura,sottotipiTotali,ultimoSottotipo,ultimoCategoriaProteica};
};

/* Ripristina insieme: deperibilita v17 + verdura ricorrente HARD v30. */
scegliContornoMotore = async function(giorno,stato,preferenze,escludiId){
  const [ricette,varianti,ingredienti]=await Promise.all([getAll('ricette'),getAll('varianti'),getAll('ingredienti')]);
  const cache={vById:new Map(varianti.map(v=>[v.id,v])),bById:new Map(ingredienti.map(b=>[b.id,b]))};
  const off=new Set(preferenze.verdureDisattivate||[]), prefIds=new Set(preferenze.verdurePreferiteVariantIds||[]);
  let candidati=[];
  for(const r of ricette){
    if(r.tipoPortata!=='modulare'||r.sottoCategoriaModulare!=='contorno'||r.esclusa||r.id===escludiId) continue;
    if(r.gruppoProteico) continue; // il secondo copre già la proteina, il contorno non può portarne un'altra
    const info=await motoreInfoVerduraContorno(r,cache); if(!info||off.has(info.variantId)) continue;
    candidati.push({r,info});
  }
  if(!candidati.length) return null;
  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;
  const slot=(preferenze._pastoCorrente||'')+'_'+idx;
  if(preferenze.verduraRicorrenteVariantId && (preferenze.verduraRicorrentePasti||[]).includes(slot)){
    // Scelta esplicita user: è HARD e può volutamente derogare alla stagionalità,
    // ma non alla disponibilità (i Set contraddittori vengono bloccati in UI).
    const hard=candidati.filter(x=>x.info.variantId===preferenze.verduraRicorrenteVariantId);
    if(!hard.length) return null;
    const scelta=scegliMenoRecenteMotore(hard,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    return scelta?scelta.r:null;
  }
  // Filtro stagionale automatico: freschi e freschi duraturi devono essere
  // coerenti col mese; confezionati e surgelati restano disponibili tutto l'anno.
  if(typeof verdureDiStagione==='function'){
    const stag=new Set(verdureDiStagione(new Date(giorno+'T12:00:00'))||[]);
    if(stag.size){
      candidati=candidati.filter(x=>x.info.tier==='confezionato'||x.info.tier==='surgelato'||stag.has(x.info.nome));
      if(!candidati.length)return null;
    }
  }
  const ordine=(typeof ordineVerdureGiornoV17==='function')?ordineVerdureGiornoV17(idx):(idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']));
  let pool=[];
  for(const t of ordine){ pool=candidati.filter(x=>x.info.tier===t); if(pool.length) break; }
  if(!pool.length) pool=candidati;
  const preferite=pool.filter(x=>prefIds.has(x.info.variantId));
  if(preferite.length){
    const nuove=preferite.filter(x=>!stato.preferiteVerdureUsate.has(x.info.variantId));
    const p=nuove.length?nuove:preferite;
    const scelta=scegliMenoRecenteMotore(p,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    if(scelta) stato.preferiteVerdureUsate.add(scelta.info.variantId);
    return scelta?scelta.r:null;
  }
  return motoreMescola(pool)[0].r;
};

async function motoreV10CategoriaVoce(voce,ricById){
  const r=await motoreV10RicettaPrincipaleVoce(voce,ricById);
  return r&&r.gruppoProteico ? motoreCategoriaDiSottotipo(r.gruppoProteico) : null;
}

function motoreV10ScegliCategoria(candidati,conteggi,storico){
  if(!candidati.length) return null;
  let bestDef=-Infinity,pool=[];
  for(const c of candidati){
    const f=FREQUENZE_MOTORE_BIBBIA[c];
    const def=conteggi[c]<f.min?(f.min-conteggi[c])*100:(conteggi[c]<f.target?(f.target-conteggi[c])*10:1);
    if(def>bestDef){bestDef=def;pool=[c];}else if(def===bestDef)pool.push(c);
  }
  let oldest=Infinity,p2=[];
  for(const c of pool){
    const ts=(storico.ultimoCategoriaProteica||{})[c]||0;
    if(ts<oldest){oldest=ts;p2=[c];}else if(ts===oldest)p2.push(c);
  }
  return motoreMescola(p2)[0];
}

async function motoreV10CostruisciGriglia(giorni,preferenze,stato){
  const [piano,ricette]=await Promise.all([getAll('piano'),getAll('ricette')]);
  const pById=new Map(piano.map(v=>[v.id,v])), rById=new Map(ricette.map(r=>[r.id,r]));
  const celle={},errori=[];
  for(const g of giorni){
    celle[g]={};
    for(const p of ['pranzo','cena']){
      const voce=pById.get(g+'_'+p)||null;
      const speciale=await motoreV10VoceSpeciale(voce,rById);
      const protetta=motoreV10Protetta(voce);
      const completa=motoreV10VoceCompleta(voce);
      const categoria=(speciale||!protetta)?null:await motoreV10CategoriaVoce(voce,rById);
      celle[g][p]={gruppoProteicoLargo:categoria,origine:categoria&&protetta?'utente_pasto':null,stato:categoria?'definita':'libera',voce,protetta,speciale,completa};
    }
  }
  // Layer 1: Set. Una ricetta/pasto diretto sullo slot e' piu specifico e resta intatto.
  for(const g of giorni){
    const scelte=(preferenze.giornoCategoria&&preferenze.giornoCategoria[g])?(preferenze.giornoCategoria[g]||[]).slice(0,2):[];
    for(let i=0;i<scelte.length;i++){
      const p=i===0?'pranzo':'cena', cat=scelte[i], c=celle[g][p];
      if(!FREQUENZE_MOTORE_BIBBIA[cat]||c.speciale) continue;
      if(!c.gruppoProteicoLargo && !(c.protetta&&c.completa&&c.voce&&c.voce.modo!=='multi')){
        c.gruppoProteicoLargo=cat;c.origine='utente_set';c.stato='definita';
      }
    }
  }
  const conteggi={carne:0,pesce:0,formaggi:0,uova:0,legumi:0};
  for(const g of giorni)for(const p of ['pranzo','cena']){const c=celle[g][p].gruppoProteicoLargo;if(c&&conteggi[c]!==undefined)conteggi[c]++;}
  const limitate=new Set(preferenze.proteineLimitate||[]);
  let prev=null;
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const c=celle[g][p];
      if(c.speciale){prev=null;continue;}
      if(c.gruppoProteicoLargo){prev=c.gruppoProteicoLargo;continue;}
      // Un piatto unico scelto dall'utente senza categoria riconoscibile resta intatto e non viene completato.
      if(c.protetta&&c.completa&&c.voce&&c.voce.modo!=='multi') continue;
      let candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].min && conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max);
      if(!candidati.length) candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].target && conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max && !limitate.has(k));
      if(!candidati.length) candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].target && conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max);
      if(!candidati.length) candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max && !limitate.has(k));
      const alt=candidati.filter(k=>k!==prev); if(alt.length)candidati=alt;
      const scelta=motoreV10ScegliCategoria(candidati,conteggi,stato.storico);
      if(!scelta){errori.push(`Nessuna categoria proteica disponibile per ${g} ${p}`);continue;}
      c.gruppoProteicoLargo=scelta;c.origine='motore';c.stato='definita';conteggi[scelta]++;prev=scelta;
    }
  }
  return {celle,conteggi,errori};
}

async function motoreV10InferisciCarboidrato(voce,ricById,varById){
  if(!voce) return null;
  if(voce.primoCereale&&CARBOIDRATI_PASTO[voce.primoCereale]) return voce.primoCereale;
  const ids=voce.modo==='multi'?[voce.primoId].filter(Boolean):[voce.ricettaId].filter(Boolean);
  for(const id of ids){
    const r=ricById.get(id); if(!r)continue;
    if(r.cerealeUsato&&CARBOIDRATI_PASTO[r.cerealeUsato])return r.cerealeUsato;
    if(r.tipoCereale&&CARBOIDRATI_PASTO[r.tipoCereale])return r.tipoCereale;
    const nomi=[];
    for(const i of (r.ingredienti||[])){
      if(i.variantId&&varById.has(i.variantId))nomi.push((varById.get(i.variantId).nome||'').toLowerCase());
      if(i.nomeLibero)nomi.push(i.nomeLibero.toLowerCase());
    }
    for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){
      const target=(cfg.ingrediente||'').toLowerCase();
      if(target&&nomi.includes(target))return k;
    }
    const testo=nomi.join(' ');
    const mappa=[['friselle','friselle'],['cous_cous','cous cous'],['farro','farro'],['orzo','orzo'],['riso','riso'],['patate','patat'],['polenta','polenta'],['pane','pane'],['pasta','pasta']];
    for(const [k,t] of mappa)if(CARBOIDRATI_PASTO[k]&&testo.includes(t))return k;
  }
  return null;
}

async function motoreV10AssorbiQuoteProtette(giorni,griglia,stato){
  const [ricette,varianti]=await Promise.all([getAll('ricette'),getAll('varianti')]);
  const rById=new Map(ricette.map(r=>[r.id,r])), vById=new Map(varianti.map(v=>[v.id,v]));
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const c=griglia.celle[g][p], v=c.voce;
      if(!v||c.speciale||!c.protetta)continue;
      const k=await motoreV10InferisciCarboidrato(v,rById,vById);
      if(k){
        stato.carboidratiUsati[k]=(stato.carboidratiUsati[k]||0)+1;
        if(stato.budgetCarb.residuo[k]>0)stato.budgetCarb.residuo[k]--;
      }
    }
  }
}

async function motoreV10PreparaSlotCarbAutomatici(giorni,griglia,stato,forza){
  const [ricette,varianti]=await Promise.all([getAll('ricette'),getAll('varianti')]);
  const rById=new Map(ricette.map(r=>[r.id,r])),vById=new Map(varianti.map(v=>[v.id,v]));
  const ids=new Set();
  for(const g of giorni)for(const p of ['pranzo','cena']){
    const id=g+'_'+p,c=griglia.celle[g][p],v=c.voce;
    if(c.speciale||v&&v.consumato||v&&v.bloccata)continue;
    if(c.protetta&&motoreV10VoceCompleta(v))continue;
    if(!c.protetta&&!forza&&v&&motoreV10VoceCompleta(v))continue;
    const k=await motoreV10InferisciCarboidrato(v,rById,vById);
    if(c.protetta&&k)continue;
    ids.add(id);
  }
  stato.slotCarbAutomaticiIds=ids;
  stato.slotCarbAutomaticiResidui=ids.size;
  return ids;
}
function motoreV10ConsumaSlotCarb(stato,id){
  if(!stato.slotCarbAutomaticiIds||!stato.slotCarbAutomaticiIds.has(id))return;
  stato.slotCarbAutomaticiIds.delete(id);
  stato.slotCarbAutomaticiResidui=Math.max(0,(stato.slotCarbAutomaticiResidui||0)-1);
}
function motoreV10QuoteCarbResidue(stato){
  return Object.fromEntries(Object.entries(stato.budgetCarb.residuo||{}).filter(([,n])=>Number(n)>0));
}

async function motoreV10CompletaMulti(giorno,pasto,voce,cella,preferenze,stato){
  const nuova=Object.assign({},voce||{id:giorno+'_'+pasto,porzioni:1},{modo:'multi'});
  const categoria=cella.gruppoProteicoLargo;
  if(!nuova.secondoId){
    const sottotipo=await scegliSottotipoMotore(categoria,stato);
    const prot=await scegliProteinaModulareMotore(sottotipo,stato,null);
    if(!prot)return {voce:null,errore:`Nessuna proteina per ${giorno} ${pasto} (${categoria})`};
    nuova.secondoId=prot.id;nuova.sottotipoProteicoMotore=prot.gruppoProteico;nuova.cotturaSecondo=scegliCotturaStandard(prot.gruppoProteico,prot.nome);
  }else if(!nuova.cotturaSecondo){
    const r=await getOne('ricette',nuova.secondoId);if(r)nuova.cotturaSecondo=scegliCotturaStandard(r.gruppoProteico,r.nome);
  }
  if(!nuova.contornoId){
    const prefSlot=Object.assign({},preferenze,{_pastoCorrente:pasto});
    const cont=await scegliContornoMotore(giorno,stato,prefSlot,null);
    if(!cont)return {voce:null,errore:`Nessun contorno compatibile per ${giorno} ${pasto}`};
    nuova.contornoId=cont.id;
  }
  if(!nuova.primoId&&!nuova.primoCereale){
    const poco=(pasto==='pranzo'&&preferenze.pocoTempoPranzo)||(pasto==='cena'&&preferenze.pocoTempoCena);
    const k=await scegliCarboidratoMotore(stato,!!poco), cfg=CARBOIDRATI_PASTO[k];
    nuova.primoCereale=k;
    if(cfg&&cfg.haPoolSughi){
      const sugo=await scegliSugoMotore(stato,null);nuova.primoSugoId=sugo?sugo.id:null;
      if(sugo){const pr=await componiPrimoModulare(sugo,k);if(pr)nuova.primoId=pr.id;}
    }
  }else if(nuova.primoCereale&&!nuova.primoId){
    const cfg=CARBOIDRATI_PASTO[nuova.primoCereale];
    if(cfg&&cfg.haPoolSughi){
      let sugo=nuova.primoSugoId?await getOne('ricette',nuova.primoSugoId):null;
      if(!sugo)sugo=await scegliSugoMotore(stato,null);
      nuova.primoSugoId=sugo?sugo.id:null;
      if(sugo){const pr=await componiPrimoModulare(sugo,nuova.primoCereale);if(pr)nuova.primoId=pr.id;}
    }
  }
  nuova.categoriaLargaE1=categoria;nuova.origineCategoriaMotore=cella.origine;
  nuova.origine=voce&&voce.origine?voce.origine:'utente';
  nuova.consumato=!!(voce&&voce.consumato);
  if(!nuova.secondoId||!nuova.contornoId||(!nuova.primoId&&!nuova.primoCereale))return {voce:null,errore:`Pasto parziale non completabile per ${giorno} ${pasto}`};
  return {voce:nuova,errore:null};
}

function motoreV10SchemaColazioneCompatibile(schema,prefNomi,esclusi){
  for(const k of ['proteine','carboidrati','grassi','carboidrati_semplici']){
    const richiesto=prefNomi[k];
    if(richiesto && (schema[k]||'').toLowerCase()!==richiesto.toLowerCase())return false;
    if(esclusi.has((schema[k]||'').toLowerCase()))return false;
    // Nei gruppi facoltativi, nessuna selezione significa davvero "nessuno".
    if(!richiesto && (k==='grassi'||k==='carboidrati_semplici') && schema[k]) return false;
  }
  return true;
}
async function motoreV10ColazioneDaSetParziale(prefValore,varianti,esclusi,evitaFirme){
  const prefComp=componentiColazioneDaSet(prefValore||{},varianti);
  const prefNomi={};
  for(const g of COLAZIONE_GRUPPI){
    if(g.chiave==='bibita')continue;
    prefNomi[g.chiave]=prefComp[g.chiave]?nomeOpzioneColazione(g,prefComp[g.chiave],varianti):null;
  }
  const no=new Set((esclusi||[]).map(x=>(x||'').toLowerCase()));
  let pool=COLAZIONI_AUTOMATICHE_COHERENTI.filter(s=>motoreV10SchemaColazioneCompatibile(s,prefNomi,no));
  if(!pool.length){
    // Se la combinazione esplicita non ha template, non inventare abbinamenti.
    const espliciti=Object.values(prefComp).filter(Boolean);
    if(espliciti.length)return prefComp;
    return scegliColazioneAutomaticaCoerente(varianti,evitaFirme||[],esclusi||[]);
  }
  const candidati=pool.map(s=>componentiDaSchemaColazione(s,varianti)).filter(Boolean);
  const avoid=new Set(evitaFirme||[]), nuovi=candidati.filter(c=>!avoid.has(firmaComponentiColazione(c)));
  const scelto=motoreMescola(nuovi.length?nuovi:candidati)[0];
  if(scelto&&prefComp.bibita)scelto.bibita=prefComp.bibita;
  return scelto||null;
}

/* Generatore v10: preserva pasti scelti/programmati, esclude speciali dai conti,
   completa solo componenti libere e lascia la Bibbia lavorare soltanto sui vuoti. */
generaPianoSettimana = async function(scartoSettimane,opzioni){
  scartoSettimane=scartoSettimane||0;opzioni=opzioni||{};const forza=!!opzioni.forza;
  const giorni=giorniSettimana(scartoSettimane);
  const preferenze=opzioni.preferenze&&Object.keys(opzioni.preferenze).length?Object.assign(await caricaPreferenzeMotoreDaSet(scartoSettimane),opzioni.preferenze):await caricaPreferenzeMotoreDaSet(scartoSettimane);
  const stato=await creaStatoMotoreSettimana();
  const griglia=await motoreV10CostruisciGriglia(giorni,preferenze,stato);
  await motoreV10AssorbiQuoteProtette(giorni,griglia,stato);
  await motoreV10PreparaSlotCarbAutomatici(giorni,griglia,stato,forza);
  const generati=[];
  for(const g of giorni){
    for(const pasto of ['pranzo','cena']){
      const id=g+'_'+pasto,cella=griglia.celle[g][pasto];
      let esistente=await getOne('piano',id);
      if(cella.speciale||esistente&&esistente.consumato||esistente&&esistente.bloccata)continue;
      const protetta=motoreV10Protetta(esistente);
      if(protetta&&motoreV10VoceCompleta(esistente))continue;
      if(protetta&&esistente&&esistente.modo==='multi'){
        const r=await motoreV10CompletaMulti(g,pasto,esistente,cella,preferenze,stato);
        if(!r.voce){stato.errori.push(r.errore);continue;}
        await put('piano',r.voce);generati.push(r.voce);motoreV10ConsumaSlotCarb(stato,id);continue;
      }
      if(esistente&&!forza&&motoreV10VoceCompleta(esistente))continue;
      if(!cella.gruppoProteicoLargo){
        if(esistente&&protetta)continue;
        stato.errori.push(`Slot senza categoria proteica: ${g} ${pasto}`);continue;
      }
      const r=await generaPortateMotore(g,pasto,cella,preferenze,stato);
      if(!r.voce){stato.errori.push(r.errore);continue;}
      const nuova=Object.assign({},esistente||{},r.voce,{consumato:false,origine:'motore'});
      await put('piano',nuova);generati.push(nuova);motoreV10ConsumaSlotCarb(stato,id);
    }

    // Colazione: manuale HARD; Set parziale completato con combinazioni coerenti.
    const idCol=g+'_colazione'; let col=await getOne('piano',idCol);
    if(col&&col.consumato||col&&col.bloccata||col&&col.colazioneSpecialeId)continue;
    if(col&&col.origine==='utente'&&col.componenti)continue;
    const idx=giorni.indexOf(g);
    const premio=await getOne('impostazioni','contatoreColazioniMorigerate');
    const premioMaturo=(premio&&Number(premio.valore)>=5&&g===todayISO());
    if(premioMaturo){
      // Lo slot deve restare libero per mostrare la scelta Budino/standard nel Piano.
      if(col&&(col.origine==='motore'||col.origine==='motore_set'))await delKey('piano',idCol);
      continue;
    }
    const [pref,gg,recEsclusi,varianti]=await Promise.all([
      getOne('impostazioni','colazionePreferita'),getOne('impostazioni','colazionePreferitaGiorni'),getOne('impostazioni','colazioneIngredientiEsclusi'),getAll('varianti')
    ]);
    const giorniPref=(gg&&Array.isArray(gg.valore)?gg.valore:[]).map(Number), usa=!!(pref&&pref.valore)&&giorniPref.includes(idx);
    const esclusi=recEsclusi&&Array.isArray(recEsclusi.valore)?recEsclusi.valore:[];
    let comp=null;
    if(usa){
      comp=componentiColazioneDaSet(pref.valore,varianti);
    }else{
      const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
      comp=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],esclusi);
    }
    if(comp)await put('piano',{id:idCol,componenti:comp,origine:'motore_set'});
  }
  const report={data:new Date().toISOString(),versioneMotore:'10.3',ok:stato.errori.length===0,errori:[...griglia.errori,...stato.errori],conteggiProteici:griglia.conteggi,generati:generati.length,carboidratiUsati:stato.carboidratiUsati,quoteCarboidratiResidue:motoreV10QuoteCarbResidue(stato),sottotipiUsati:stato.conteggiSottotipi,verdurePreferiteUsate:[...stato.preferiteVerdureUsate]};
  await put('impostazioni',{chiave:'ultimoReportMotore',valore:report});
  if(scartoSettimane===0&&typeof renderPiano==='function')renderPiano();
  return report;
};

generaMenuDaConfigSet = async function(scartoSettimane){
  scartoSettimane=scartoSettimane||0;menuSettimanaScarto=scartoSettimane;mostraVista('menu');
  const preferenze=await caricaPreferenzeMotoreDaSet(scartoSettimane);
  const report=await generaPianoSettimana(scartoSettimane,{forza:true,preferenze});
  await renderMenuSettimanale();await renderPiano();return report;
};


/* v10: ricerca culinaria dopo la griglia alimentare.
   Unico/sfiziosa non devono imporre gli ingredienti al piano: devono rappresentare
   la funzione gia decisa. Match forte sugli ingredienti, fallback sulle macro.
   Una verdura ricorrente programmata resta invece HARD e va mantenuta esatta. */
async function motoreV10AnalizzaUnico(r,varianti,ingredienti){
  const vById=new Map(varianti.map(v=>[v.id,v]));
  const bById=new Map(ingredienti.map(b=>[b.id,b]));
  const nomi=[]; const verdure=[];
  for(const ing of (r.ingredienti||[])){
    if(ing.variantId){
      const v=vById.get(ing.variantId); if(!v)continue;
      const nome=(v.nome||'').toLowerCase(); nomi.push(nome);
      const b=bById.get(v.ingredienteId); if(b&&b.gruppo==='verdura')verdure.push(nome);
    }else if(ing.nomeLibero)nomi.push((ing.nomeLibero||'').toLowerCase());
  }
  const testo=nomi.join(' ');
  const carbKeys=[];
  for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){
    const target=(cfg.ingrediente||'').toLowerCase();
    if(target&&nomi.includes(target))carbKeys.push(k);
  }
  const euristiche=[['pasta','pasta'],['pasta_fresca','raviol'],['riso','riso'],['farro','farro'],['orzo','orzo'],['cous_cous','cous cous'],['pane','pane'],['friselle','frisell'],['patate','patat'],['polenta','polenta'],['piadina','piadin'],['crackers','cracker'],['taralli_grissini_crostini','grissin'],['taralli_grissini_crostini','tarall']];
  for(const [k,t] of euristiche)if(CARBOIDRATI_PASTO[k]&&testo.includes(t)&&!carbKeys.includes(k))carbKeys.push(k);
  return {nomi,verdure,carbKeys,categoria:motoreCategoriaDiSottotipo(r.gruppoProteico),sottotipo:r.gruppoProteico||null};
}

async function motoreV10VerduraHardSlot(giorno,pasto,varianti){
  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;
  const [rec,recP]=await Promise.all([getOne('impostazioni','verduraRicorrente'),getOne('impostazioni','verduraRicorrentePasti')]);
  const pasti=recP&&Array.isArray(recP.valore)?recP.valore:[];
  if(!rec||!rec.valore||!pasti.includes(pasto+'_'+idx))return null;
  const v=varianti.find(x=>x.id===rec.valore); return v?(v.nome||'').toLowerCase():null;
}


/* v35 — Unico per funzione, senza esplodere il DB.
   1) Se una ricetta unica ha proteina+verdura ma manca solo il carboidrato,
      la completa con il jolly pane.
   2) Se manca una ricetta unica idonea, compone a richiesta carboidrato +
      secondo + contorno già determinati dai layer precedenti.
   Le ricette composte sono lazy e deduplicate tramite chiaveComposta: non si
   pre-generano migliaia di combinazioni. */
function motoreV10MergeIngredienti(liste){
  const m=new Map(), liberi=[];
  for(const lista of liste){
    for(const ing of (lista||[])){
      if(ing.variantId){
        const k=ing.variantId, q=Number(ing.quantita)||0;
        if(!m.has(k))m.set(k,{variantId:k,nomeLibero:null,quantita:0});
        m.get(k).quantita+=q;
      }else if(ing.nomeLibero){
        const k=(ing.nomeLibero||'').trim().toLowerCase(), q=Number(ing.quantita)||0;
        let x=liberi.find(z=>(z.nomeLibero||'').trim().toLowerCase()===k);
        if(!x){x={variantId:null,nomeLibero:ing.nomeLibero,quantita:0};liberi.push(x);}
        x.quantita+=q;
      }
    }
  }
  return [...m.values(),...liberi].filter(x=>x.quantita>0);
}
async function motoreV10UpsertComposta(chiave,nome,gruppo,ingredienti,procedimento,fonteIds){
  const tutte=await getAll('ricette');
  let r=tutte.find(x=>x.fonte==='composta_runtime'&&x.chiaveComposta===chiave);
  if(!r)r={id:uid()};
  Object.assign(r,{nome,fascia:'facile',porzioni:1,gruppoProteico:gruppo||'',tipoPortata:'unico',fonte:'composta_runtime',chiaveComposta:chiave,fonteIds:fonteIds||[],ingredienti,procedimento:procedimento||[],nutrizioneManualeTotale:null,esclusa:false,piattoSpeciale:false});
  await put('ricette',r);return r;
}
async function motoreV10CompletaUnicoConPane(r,varianti){
  if(!r)return null;
  const cfg=CARBOIDRATI_PASTO.pane;if(!cfg)return null;
  const v=varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v)return null;
  const key='pane|'+r.id;
  const nome=/\bpane\b/i.test(r.nome||'')?r.nome:(r.nome+' con pane');
  const ingredienti=motoreV10MergeIngredienti([r.ingredienti,[{variantId:v.id,nomeLibero:null,quantita:cfg.porzione}]]);
  const procedimento=[...(r.procedimento||[]),'Servi il pane nella dose prevista insieme al piatto.'];
  return motoreV10UpsertComposta(key,nome,r.gruppoProteico,ingredienti,procedimento,[r.id]);
}
async function motoreV10CarboidratoDaDraft(draft,varianti){
  if(!draft)return null;
  if(draft.primoCereale&&CARBOIDRATI_PASTO[draft.primoCereale])return draft.primoCereale;
  if(!draft.primoId)return null;
  const r=await getOne('ricette',draft.primoId);if(!r)return null;
  if(r.cerealeUsato&&CARBOIDRATI_PASTO[r.cerealeUsato])return r.cerealeUsato;
  if(r.tipoCereale&&CARBOIDRATI_PASTO[r.tipoCereale])return r.tipoCereale;
  const vById=new Map((varianti||[]).map(v=>[v.id,v]));
  const nomi=(r.ingredienti||[]).map(i=>i.variantId&&vById.get(i.variantId)?(vById.get(i.variantId).nome||'').toLowerCase():(i.nomeLibero||'').toLowerCase());
  const testo=nomi.join(' ');
  for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){
    const target=(cfg.ingrediente||'').toLowerCase();
    if(target&&nomi.includes(target))return k;
  }
  const eur=[['pasta_fresca','raviol'],['cous_cous','cous cous'],['friselle','frisell'],['polenta','polenta'],['farro','farro'],['orzo','orzo'],['riso','riso'],['patate','patat'],['pane','pane'],['pasta','pasta']];
  for(const [k,t] of eur)if(CARBOIDRATI_PASTO[k]&&testo.includes(t))return k;
  return null;
}
/* v41 — prima della realizzazione culinaria completa SOLO le componenti
   ancora libere. Non tocca mai una scelta già presente nel draft. Serve a evitare
   il falso esito "nessun piatto compatibile" quando il DB possiede i moduli ma
   non una ricetta unica nominale. */
async function motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft){
  if(!draft)return draft;
  const preferenze=typeof caricaPreferenzeMotoreDaSet==='function'?await caricaPreferenzeMotoreDaSet(0):{};
  const stato=typeof creaStatoMotoreSettimana==='function'?await creaStatoMotoreSettimana():null;
  if(!draft.primoCereale && stato && typeof scegliCarboidratoMotore==='function'){
    draft.primoCereale=await scegliCarboidratoMotore(stato,false);
  }
  if(!draft.proteinaId && stato && typeof scegliProteinaModulareMotore==='function'){
    const categoria=draft.categoriaLarga||null;
    const sottotipo=draft.sottotipoProposto||(categoria&&typeof risolviSottotipoFine==='function'?risolviSottotipoFine(categoria,{}):null);
    if(sottotipo){
      const prot=await scegliProteinaModulareMotore(sottotipo,stato,null);
      if(prot){
        draft.proteinaId=prot.id;
        draft.sottotipoProposto=prot.gruppoProteico||sottotipo;
        if(!draft.cottura)draft.cottura=scegliCotturaStandard(prot.gruppoProteico,prot.nome);
      }
    }
  }
  if(!draft.contornoId && stato && typeof scegliContornoMotore==='function'){
    const prefSlot=Object.assign({},preferenze,{_pastoCorrente:pasto});
    const cont=await scegliContornoMotore(giorno,stato,prefSlot,null);
    if(cont)draft.contornoId=cont.id;
  }
  return draft;
}
window.motoreV10CompletaDraftPerRealizzazione=motoreV10CompletaDraftPerRealizzazione;

async function motoreV10ComponiUnicoDaDraft(draft,varianti){
  if(!draft||!draft.proteinaId||!draft.contornoId)return null;
  const [prot,cont]=await Promise.all([getOne('ricette',draft.proteinaId),getOne('ricette',draft.contornoId)]);
  if(!prot||!cont)return null;
  let carb=await motoreV10CarboidratoDaDraft(draft,varianti);
  if(!carb){
    const cous=CARBOIDRATI_PASTO.cous_cous;
    const vc=cous&&varianti.find(x=>(x.nome||'').toLowerCase()===(cous.ingrediente||'').toLowerCase());
    carb=vc?'cous_cous':'pane';
  }
  let cfg=CARBOIDRATI_PASTO[carb];
  let v=cfg&&varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v&&carb!=='pane'){
    carb='pane';cfg=CARBOIDRATI_PASTO.pane;
    v=cfg&&varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  }
  if(!cfg||!v)return null;
  const ingredienti=motoreV10MergeIngredienti([[{variantId:v.id,nomeLibero:null,quantita:cfg.porzione}],prot.ingredienti,cont.ingredienti]);
  const nome=(cfg.label||carb)+' con '+(prot.nome||'proteina').toLowerCase()+' e '+(cont.nome||'verdura').toLowerCase();
  const key=['draft',carb,prot.id,cont.id].join('|');
  const procedimento=[`Prepara ${cfg.label||carb} nella dose prevista.`,...(prot.procedimento||[]),...(cont.procedimento||[]),'Riunisci le componenti nello stesso piatto e servi come piatto unico.'];
  return motoreV10UpsertComposta(key,nome,prot.gruppoProteico||draft.sottotipoProposto||'',ingredienti,procedimento,[prot.id,cont.id]);
}

async function motoreV10ScoreFrigoRicetta(r){
  const score=new Map();
  try{
    const [scad,avanzi,inv]=await Promise.all([getScadenzeImminenti(),getAvanziScomodi(),getAll('inventario')]);
    for(const x of (scad||[]))if(x.variantId)score.set(x.variantId,100);
    for(const x of (avanzi||[]))if(x.variantId)score.set(x.variantId,Math.max(score.get(x.variantId)||0,80));
    for(const x of (inv||[]))if(x.variantId&&x.stato!=='esaurito'&&Number(x.quantita)>0)score.set(x.variantId,Math.max(score.get(x.variantId)||0,10));
  }catch(e){}
  let n=0; for(const i of (r&&r.ingredienti||[]))if(i.variantId&&score.has(i.variantId))n+=score.get(i.variantId);
  return n;
}

trovaPiattoUnicoCompatibileDraft = async function(pasto,giorno,draft,escludiId){
  const info=await infoCombinazioneDraft(draft);
  const [tutte,varianti,ingredienti,storico]=await Promise.all([getAll('ricette'),getAll('varianti'),getAll('ingredienti'),costruisciStoricoConsumatiMotore()]);
  const macroTarget=(draft&&draft.soggettoProteico)||info.categoriaProteica||null;
  const targetCarbKey=info.carboidrato||null;
  const targetCarbNome=(info.ingredienteCarboidrato||'').toLowerCase();
  const targetVerdure=new Set((info.verdure||[]).map(x=>(x||'').toLowerCase()));
  const hardVerdura=await motoreV10VerduraHardSlot(giorno,pasto,varianti);
  let best=-Infinity,compatibili=[];
  for(const r of tutte){
    if(r.id===escludiId||r.esclusa||r.piattoSpeciale||(r.tipoPortata||'unico')!=='unico')continue;
    const a=await motoreV10AnalizzaUnico(r,varianti,ingredienti);
    if(macroTarget&&a.categoria!==macroTarget)continue;
    if(!a.verdure.length)continue;  // la verdura non ha un jolly equivalente
    if(hardVerdura&&!a.verdure.includes(hardVerdura))continue;
    const mancaSoloCarb=!a.carbKeys.length;
    // Il layer alimentare viene prima della ricetta: un carboidrato già deciso non
    // può essere sostituito col jolly pane solo per adattarsi a un record unico.
    if(mancaSoloCarb&&targetCarbKey&&targetCarbKey!=='pane'&&targetCarbKey!=='patate')continue;
    let score=mancaSoloCarb?-25:0;
    score+=Math.min(await motoreV10ScoreFrigoRicetta(r), 15);
    if(targetCarbKey&&a.carbKeys.includes(targetCarbKey))score+=100;
    else if(targetCarbNome&&a.nomi.includes(targetCarbNome))score+=100;
    else score+=30;
    if(info.sottotipoProteico&&a.sottotipo===info.sottotipoProteico)score+=35;
    else if(macroTarget&&a.categoria===macroTarget)score+=20;
    if(hardVerdura)score+=100;
    else if(targetVerdure.size&&a.verdure.some(v=>targetVerdure.has(v)))score+=60;
    else score+=20; // verdura diversa ma stessa funzione, se non era hard
    if(score>best){best=score;compatibili=[r];}
    else if(score===best)compatibili.push(r);
  }
  if(compatibili.length){
    const nonCorrente=compatibili.filter(r=>r.id!==draft.ricettaId),pool=nonCorrente.length?nonCorrente:compatibili;
    let scelta=scegliMenoRecenteMotore(pool,r=>storico.ultimoRicetta[r.id]||0,()=>0);
    if(scelta){
      const a=await motoreV10AnalizzaUnico(scelta,varianti,ingredienti);
      if(!a.carbKeys.length){
        const conPane=await motoreV10CompletaUnicoConPane(scelta,varianti);
        if(conPane)return conPane;
      }
      return scelta;
    }
  }
  // Nessun record unico utile: prova la composizione funzionale già definita dai layer.
  let composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  // Se mancava soltanto una componente libera, completala senza toccare quelle già
  // scelte dall'utente e riprova. motoreV10UpsertComposta aggiunge la nuova
  // realizzazione allo store ricette, evitando un vicolo cieco nella UI.
  await motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft);
  composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  if(typeof registraRichiestaRicettaReview==='function')await registraRichiestaRicettaReview({
    tipo:draft&&draft.tabAttiva==='sfiziosa'?'ricetta_sfiziosa_mancante':'piatto_unico_mancante',
    carboidrato:info.carboidrato,categoriaProteica:macroTarget,sottotipoProteico:info.sottotipoProteico,
    verdura:(info.verdure||[]).join(' + '),pasto,giorno
  });
  return null;
};

window.MOTORE_V10_REGOLE={versione:'1.6',maxPastiSpeciali:MOTORE_V10_MAX_SPECIALI,pipeline:['scelte_user','preferenze_esclusioni','completamento_guida','rotazione_varieta','realizzazione_ricetta']};
})();

/* ---------- AGGIUNTA: funzioni mancanti (causavano il bottone
   'Genera menu' rotto) ---------- */

async function motoreV10ScegliPrimoReale(carb, stato, preferenze){
  const cfg = CARBOIDRATI_PASTO[carb];
  if(!cfg) return null;
  const target = (cfg.ingrediente||'').toLowerCase();
  const [tutte, varianti] = await Promise.all([getAll('ricette'), getAll('varianti')]);
  const vById = new Map(varianti.map(v=>[v.id,v]));

  let pool = tutte.filter(r=>{
    if(r.esclusa || (r.tipoPortata||'unico')!=='primo') return false;
    const nomi = (r.ingredienti||[]).map(i=>{
      if(i.variantId) return (vById.get(i.variantId)?.nome||'').toLowerCase();
      return (i.nomeLibero||'').toLowerCase();
    });
    return target && nomi.includes(target);
  });
  if(!pool.length) return null;

  const prefIds = new Set(preferenze?.ingredientiPreferitiVariantIds || []);
  if(prefIds.size){
    const conPreferenza = pool.filter(r=>(r.ingredienti||[]).some(i=>i.variantId && prefIds.has(i.variantId)));
    if(conPreferenza.length) pool = conPreferenza;
  }

  return scegliMenoRecenteMotore(pool, r=>stato.storico.ultimoRicetta[r.id]||0, ()=>0);
}

async function motoreV10CarboidratoFattibile(carb, giorno, categoria, stato){
  const cfg = CARBOIDRATI_PASTO[carb];
  if(!cfg) return false;

  if(cfg.limitato){
    const attivato = ((stato.budgetCarb && stato.budgetCarb.config && stato.budgetCarb.config[carb]) || 0) > 0;
    if(!attivato) return false;
    const usato = await contaCarboidratoSettimana(carb);
    if(usato >= (cfg.tettoSettimanale||2)) return false;
  }

  if(cfg.jolly) return true;

  if(cfg.soloSfiziosa){
    if(!categoria) return false;
    const tutte = await getAll('ricette');
    return tutte.some(r=>!r.esclusa && !r.piattoSpeciale && (r.tipoPortata||'unico')==='unico'
      && motoreCategoriaDiSottotipo(r.gruppoProteico)===categoria);
  }

  const primoReale = await motoreV10ScegliPrimoReale(carb, stato, {});
  if(primoReale) return true;

  if(cfg.haPoolSughi){
    const sughi = await cercaComponentiModulari('sugo');
    return sughi.some(s=>(s.carboidratiCompatibili||[]).includes(carb));
  }
  return false;
}


/* =========================================================
BATCH 1 — override proteina-first
La proteina viene scelta prima.
Il carboidrato viene scelto dopo e si adatta.
Nessun ramo soloSfiziosa nella composizione automatica.
========================================================= */
componiPastoModulare = async function(gruppoProteico, giorno, escludiSugoId, escludiProteinaId, escludiContornoId, forzaJolly, preferenzeMotore, statoMotore){
preferenzeMotore=preferenzeMotore||{};
if(!statoMotore){
statoMotore={
storico:await costruisciStoricoConsumatiMotore(),
ricetteUsateGenerazione:new Set(),
preferiteVerdureUsate:new Set(),
carboidratiUsati:{},
budgetCarb:await preparaBudgetCarboidratiMotore()
};
}
const categoriaLarga=gruppoProteico?motoreCategoriaDiSottotipo(gruppoProteico):null;

/* 1. PRIMA LA PROTEINA */
const proteina=gruppoProteico?await scegliProteinaModulareMotore(gruppoProteico,statoMotore,escludiProteinaId):null;
if(gruppoProteico&&!proteina) return null;

/* 2. POI IL CARBOIDRATO — si adatta alla proteina */
let carb;
if(gruppoProteico==='affettati'){
carb='pane';
statoMotore.carboidratiUsati['pane']=(statoMotore.carboidratiUsati['pane']||0)+1;
if(statoMotore.budgetCarb.residuo['pane']>0) statoMotore.budgetCarb.residuo['pane']--;
}else{
carb=await scegliCarboidratoMotore(statoMotore,!!forzaJolly,giorno,categoriaLarga);
}
const carbCfg=CARBOIDRATI_PASTO[carb];
if(!carbCfg) return null;

/* 3. REALIZZAZIONE DEL CARBOIDRATO — composizione DOPO la scelta */
let sugo=null,primoRicettaRealeId=null;
const primoReale=await motoreV10ScegliPrimoReale(carb,statoMotore,preferenzeMotore);
if(primoReale){
primoRicettaRealeId=primoReale.id;
}else if(carbCfg.haPoolSughi){
const tuttiSughi=await cercaComponentiModulari('sugo');
const compatibili=tuttiSughi.filter(s=>(s.carboidratiCompatibili||[]).includes(carb));
const nonUsati=compatibili.filter(s=>s.id!==escludiSugoId);
const pool=nonUsati.length?nonUsati:compatibili;
sugo=scegliMenoRecenteMotore(pool,r=>statoMotore.storico.ultimoRicetta[r.id]||0,()=>0);
}

/* 4. VERDURA — mantiene il sistema esistente */
const contorno=await scegliContornoMotore(giorno,statoMotore,preferenzeMotore,escludiContornoId);
if(!contorno) return null;

/* 5. COTTURA */
const cottura=proteina?scegliCotturaStandard(proteina.gruppoProteico,proteina.nome):null;

return {
primoRicettaRealeId,
primoNome:primoRicettaRealeId?null:(sugo?componiNomePrimoModulare(carbCfg.label,sugo.nome):carbCfg.label),
primoCarboidrato:carb,
primoSugoId:sugo?sugo.id:null,
primoEJolly:!primoRicettaRealeId&&!sugo,
secondoNome:proteina?componiNomeSecondoModulare(proteina.nome,cottura,contorno.nome):'',
proteinaId:proteina?proteina.id:null,
cottura,
contornoId:contorno.id
};
};
