/* DietaPlanner - motor v12 basato su db-ricette.json + ingredienti-new.json
   Sorgente primaria: nuovo ricettario. IndexedDB dell'index viene usato solo
   come persistenza per inventario, piano, impostazioni e cache compilata. */
(function(global){
'use strict';

const N=global.DietaPlannerNutritionConfig||(typeof module!=='undefined'&&module.exports?require('./nutrition-config.js'):null);
if(!N) throw new Error('nutrition-config.js deve essere caricato prima di motor-v12.js');

const TOKEN_P = new Set(['PC','PP','PF','PU','PL']);
const TOKEN_ATTIVI = new Set(['C','PC','PP','PF','PU','PL','V']);
const CAT_TO_MACRO = {C:'C',V:'V',PC:'P',PP:'P',PF:'P',PU:'P',PL:'P'};
const PROTEIN_MACRO_TO_TOKEN = {
  carne:'PC', pesce:'PP', formaggi:'PF', uova:'PU', legumi:'PL'
};
const SUBTYPE_TO_TOKEN = {
  carne_bianca:'PC', carne_rossa:'PC', affettati:'PC',
  pesce_bianco:'PP', pesce_azzurro:'PP', pesce_grande:'PP',
  pesce_conservato:'PP', molluschi:'PP', crostacei:'PP',
  formaggio_fresco:'PF', formaggio_stagionato:'PF',
  uova:'PU', legumi:'PL'
};
const SOGLIA_CONGELATO_GIORNI = 30;
const COOLDOWN_GIORNI = 15;
const CARB_KEY_BY_NAME={
  'cous cous':'cous_cous','crackers':'crackers','farro perlato':'farro','friselle':'friselle','gallette di riso':'gallette','gnocchi':'gnocchi','noodles':'pasta','orzo perlato':'orzo','pane integrale':'pane','panino':'pane','pasta corta':'pasta','pasta integrale':'pasta','patate':'patate','piadina':'piadina','polenta':'polenta','pomodori gratinati':'pane','ravioli ricotta e spinaci':'pasta_ripiena','riso':'riso','tagliolini all\'uovo':'pasta_fresca','taralli':'taralli','mix cereali e legumi':'farro','spaghetti':'pasta','linguine':'pasta'
};

const state = {
  pronto:false,
  dbRicette:null,
  ingredientiMap:{},
  ricetteConcrete:[],
  ricetteById:new Map(),
  compatibilitaCP:new Map(),
  baseByName:new Map(),
  variantByName:new Map(),
  tracking:{ultimoUtilizzo:{}, utilizziSettimanali:{}, condimentoRotazione:{contatore:0,ultimo:{}}},
  propostaCicli:new Map(),
  runtimeConfigCache:null
};

function slug(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function uniq(a){ return [...new Set(a)]; }
function addGiorni(giorno,delta){
  const d=new Date(String(giorno)+'T12:00:00');
  d.setDate(d.getDate()+Number(delta||0));
  return isoDate(d);
}
function isoDate(d){
  const x = d instanceof Date ? d : new Date(d);
  return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
}
function startOfWeekISO(data){
  const d = new Date((typeof data==='string'?data:isoDate(data))+'T12:00:00');
  const dow=(d.getDay()+6)%7;
  d.setDate(d.getDate()-dow);
  return isoDate(d);
}
function giorniTra(a,b){
  const x=new Date(a), y=new Date(b);
  return Math.floor((x-y)/86400000);
}
function tokenClasse(ricetta){
  const c=Array.isArray(ricetta.classe)?ricetta.classe:[ricetta.classe];
  return c.filter(Boolean);
}
function macroCategoria(cat){ return CAT_TO_MACRO[cat]||null; }
function categoriaPrincipale(classe){
  const c=Array.isArray(classe)?classe:[classe];
  if(c.some(x=>TOKEN_P.has(x))) return c.find(x=>TOKEN_P.has(x));
  if(c.includes('C')) return 'C';
  if(c.includes('V')) return 'V';
  if(c.includes('S')) return 'S';
  if(c.includes('G')) return 'G';
  return c[0]||null;
}
function carbKeyNome(nome){return CARB_KEY_BY_NAME[String(nome||'').trim().toLowerCase()]||null;}
function carbKeysRicetta(r){return uniq((r&&r.ingredienti||[]).map(i=>carbKeyNome(i.nome)).filter(Boolean));}
function idsProteiciRicetta(r){return uniq((r&&r.ingredienti||[]).filter(i=>TOKEN_P.has(i.categoria)).map(i=>i.variantId||i.ingredienteId||i.nome).filter(Boolean));}
function sottotipiProteiciRicetta(r){return uniq((r&&r.ingredienti||[]).filter(i=>TOKEN_P.has(i.categoria)).map(i=>i.sottotipo).filter(Boolean));}
function creaMappaCompatibilitaCP(ricette){
  const mappa=new Map();
  for(const r of ricette||[]){
    const c=copertura(r);if(!c.C||!c.P)continue;
    const proteine=idsProteiciRicetta(r);
    for(const key of carbKeysRicetta(r)){
      if(!mappa.has(key))mappa.set(key,new Set());
      proteine.forEach(id=>mappa.get(key).add(id));
    }
  }
  return mappa;
}
function composizioneSeparataConsentita(proteina,carbKey){
  const sottotipi=sottotipiProteiciRicetta(proteina);
  if(sottotipi.includes('affettati'))return carbKey==='pane';
  if(carbKey!=='polenta')return true;
  const ammessi=state.compatibilitaCP.get(carbKey),ids=idsProteiciRicetta(proteina);
  return !!(ammessi&&ids.length&&ids.every(id=>ammessi.has(id)));
}
function preparaBudgetCarboidrati(resolved){
  const plan=resolved&&resolved.carbohydrates||{},remaining=Object.assign({},plan.fixedCounts||{});
  return {selection:plan.selection||{},autoEligible:new Set(plan.autoEligibleKeys||[]),remaining,errors:[]};
}
function creaSequenzaCarboidrati(resolved,slotRefs,rng,seedCounts){
  const plan=resolved&&resolved.carbohydrates||{};rng=rng||Math.random;
  seedCounts=seedCounts||{};
  const slotCount=slotRefs.length;
  const richiesti=[];
  for(const [key,count] of Object.entries(plan.fixedCounts||{})){const used=Number(seedCounts[key])||0;if(used>Number(count))return {valid:false,errors:['Il piano preservato supera il numero fisso di '+key+'.'],keys:[]};for(let i=used;i<Number(count)||0;i++)richiesti.push(key);}
  if(richiesti.length>slotCount){
    /* I fissi eccedono gli slot generabili: succede quando la settimana e'
       gia' iniziata e uno o piu' giorni non sono mai stati generati (ormai
       nel passato, irraggiungibili). Quei giorni riducono il fabbisogno
       fisso reale, non bloccano la generazione - si mescola e si taglia
       l'eccedenza in modo equo tra le chiavi, invece di restituire errore. */
    for(let i=richiesti.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[richiesti[i],richiesti[j]]=[richiesti[j],richiesti[i]];}
    richiesti.length=slotCount;
  }
  const auto=(plan.autoEligibleKeys||[]).slice();
  if(richiesti.length<slotCount&&!auto.length)return {valid:false,errors:['Nessun carboidrato AUTO disponibile per completare il piano.'],keys:[]};
  const numeroGiorni=new Set((slotRefs||[]).map(s=>s&&s.di)).size||slotCount;
  const conteggioChiave={};
  for(const k of richiesti)conteggioChiave[k]=(conteggioChiave[k]||0)+1;
  while(richiesti.length<slotCount){
    /* Tetto per chiave = numero di giorni: oltre non avrebbe senso provarci,
       ma NON basta da solo a garantire zero doppioni (la distribuzione
       potrebbe comunque concentrarsi) - la garanzia vera arriva dalla fase
       costruttiva sotto. Qui serve solo a non sprecare scelte impossibili. */
    const disponibili=auto.filter(k=>(conteggioChiave[k]||0)<numeroGiorni);
    const scelte=disponibili.length?disponibili:auto;
    const scelta=scelte[Math.floor(rng()*scelte.length)];
    richiesti.push(scelta);
    conteggioChiave[scelta]=(conteggioChiave[scelta]||0)+1;
  }

  /* Assegnazione COSTRUTTIVA per giorno, non "riempi a caso e sistema dopo":
     si raggruppano gli slot per giorno (slotRefs[i].di) e, per ogni giorno,
     si pesca dal pool residuo escludendo sempre la chiave gia' assegnata a
     quel giorno finche' esiste un'alternativa con scorta residua. Un doppione
     nello stesso giorno si verifica SOLO se, quando tocca l'ultima posizione
     di quel giorno, resta scorta unicamente della chiave gia' usata quel
     giorno stesso - caso che il tetto sopra rende raro ma non puo' escludere
     in astratto con conteggi fissi molto sbilanciati (l'utente puo' fissare
     anche 14 volte lo stesso carboidrato: in quel caso un doppione e' l'unica
     soluzione fisicamente possibile, non un difetto dell'algoritmo). */
  const giorniOrdine=[],slotPerGiorno=new Map();
  for(let idx=0;idx<slotRefs.length;idx++){
    const di=slotRefs[idx]&&slotRefs[idx].di;
    if(!slotPerGiorno.has(di)){slotPerGiorno.set(di,[]);giorniOrdine.push(di);}
    slotPerGiorno.get(di).push(idx);
  }
  const residuo={};
  for(const k of richiesti)residuo[k]=(residuo[k]||0)+1;
  const out=new Array(slotCount).fill(null);
  const giorniShuffled=giorniOrdine.slice();
  for(let i=giorniShuffled.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[giorniShuffled[i],giorniShuffled[j]]=[giorniShuffled[j],giorniShuffled[i]];}

  function pescaChiave(esclusa){
    const candidati=Object.keys(residuo).filter(k=>residuo[k]>0);
    if(!candidati.length)return null;
    /* Fondamentale: si sceglie sempre la chiave con PIU' scorta residua, non
       una a caso tra le disponibili. Scegliere a caso puo' esaurire per
       sfortuna una chiave troppo presto, lasciando solo un'altra chiave per
       l'ultimo giorno anche quando l'esclusione singola per giorno da sola
       non basterebbe a prevederlo (verificato con un caso reale fallito).
       Questo e' l'algoritmo dimostrato corretto per "riorganizza una
       sequenza senza due uguali adiacenti" (stesso principio di LeetCode
       767 "Reorganize String"), che qui si applica direttamente perche'
       pranzo+cena dello stesso giorno sono sempre posizioni consecutive.
       Tra chiavi a pari scorta si sceglie a caso, per varieta'. */
    let massimo=-1;
    for(const k of candidati)if(residuo[k]>massimo)massimo=residuo[k];
    let migliori=candidati.filter(k=>residuo[k]===massimo);
    if(migliori.length===1&&migliori[0]===esclusa){
      const alternative=candidati.filter(k=>k!==esclusa);
      if(!alternative.length)return esclusa; /* doppione inevitabile: nessun'altra scorta esiste */
      let massimoAlt=-1;
      for(const k of alternative)if(residuo[k]>massimoAlt)massimoAlt=residuo[k];
      migliori=alternative.filter(k=>residuo[k]===massimoAlt);
    }else{
      migliori=migliori.filter(k=>k!==esclusa);
      if(!migliori.length)migliori=[esclusa];
    }
    return migliori[Math.floor(rng()*migliori.length)];
  }

  for(const di of giorniShuffled){
    let precedente=null;
    for(const pos of slotPerGiorno.get(di)){
      const scelta=pescaChiave(precedente);
      if(scelta===null)break;
      out[pos]=scelta;
      residuo[scelta]--;
      precedente=scelta;
    }
  }
  return {valid:true,errors:[],keys:out};
}
function creaSequenzaProteine(resolved,slotRefs,tab,rng,seedCounts,slotTotaliSettimanaCompleta){
  rng=rng||Math.random;tab=tab||{};const freq=resolved.proteinFrequencies||{},forbidden=new Set(resolved.profile&&resolved.profile.forbiddenProteinMacros||[]),counts=Object.assign({},seedCounts||{}),targets=Array(slotRefs.length).fill(null),errors=[];
  const allowed=Object.keys(freq).filter(k=>!forbidden.has(k)&&freq[k].max!==0);
  for(let i=0;i<slotRefs.length;i++){const ref=slotRefs[i],fixed=(tab['giorno_'+ref.di]||[])[ref.pasto==='pranzo'?0:1];if(!fixed)continue;if(!allowed.includes(fixed)){errors.push('Proteina '+fixed+' non ammessa per '+ref.day+' '+ref.pasto+'.');continue;}targets[i]=fixed;counts[fixed]=(counts[fixed]||0)+1;}
  for(const key of allowed){const max=freq[key].max;if(max!==null&&max!==undefined&&(counts[key]||0)>Number(max))errors.push('Proteina '+key+' oltre il massimo settimanale.');}
  const empty=()=>targets.findIndex(x=>!x);
  for(const key of allowed){let need=Math.max(0,(Number(freq[key].min)||0)-(counts[key]||0));while(need-->0){const i=empty();if(i<0)break;/* slot insufficienti per il minimo: giorni gia' passati e mai generati lo rendono irraggiungibile questa settimana, non e' un errore bloccante */targets[i]=key;counts[key]=(counts[key]||0)+1;}}
  while(empty()>=0){let pool=allowed.filter(k=>freq[k].max===null||freq[k].max===undefined||(counts[k]||0)<Number(freq[k].max));if(!pool.length){errors.push('Nessuna proteina ammessa per completare la settimana.');break;}const underTarget=pool.filter(k=>(counts[k]||0)<(Number(freq[k].target)||Number(freq[k].min)||0));if(underTarget.length)pool=underTarget;const key=pool[Math.floor(rng()*pool.length)],i=empty();targets[i]=key;counts[key]=(counts[key]||0)+1;}
  /* Il minimo non raggiunto va segnalato SEMPRE, tranne per la quota
     esattamente spiegabile dai giorni gia' passati e mai generati (today+1).
     Non e' un condono generale: se lo scarto supera cio' che i giorni persi
     potrebbero giustificare, e' un problema di copertura reale (dati/regole
     insufficienti anche a settimana intera) e deve continuare a bloccare -
     altrimenti si nasconderebbe un errore vero dietro la scusa del tempo. */
  const slotPersi=Math.max(0,(Number(slotTotaliSettimanaCompleta)||slotRefs.length)-slotRefs.length);
  let scartoTotale=0;
  const scartoPerChiave={};
  for(const key of allowed){
    const mancano=Math.max(0,(Number(freq[key].min)||0)-(counts[key]||0));
    if(mancano>0){scartoPerChiave[key]=mancano;scartoTotale+=mancano;}
  }
  if(scartoTotale>slotPersi){
    for(const [key,mancano] of Object.entries(scartoPerChiave))errors.push('Minimo proteico non raggiunto: '+key+' (mancano '+mancano+').');
  }
  return {valid:errors.length===0,errors,targets,counts};
}

async function poolCompatibilitaGiorno(data,runtimeConfig,cache){
  cache=cache||new Map();if(cache.has(data))return cache.get(data);
  const pool=await poolAmmesso(data,{runtimeConfig});cache.set(data,pool);return pool;
}
function incrocioCopertoDaPool(pool,target,key){
  const token=PROTEIN_MACRO_TO_TOKEN[target]||SUBTYPE_TO_TOKEN[target]||target;
  const ammessi=(pool||[]).filter(r=>!copertura(r).C||carbKeysRicetta(r).includes(key));
  const proteine=ammessi.filter(r=>copertura(r).tokens.has(token));
  const haCarbSeparato=ammessi.some(r=>copertura(r).C&&!copertura(r).P&&carbKeysRicetta(r).includes(key));
  const haVerduraSeparata=ammessi.some(r=>copertura(r).V&&!copertura(r).P);
  return proteine.some(r=>{
    const c=copertura(r),carbOk=c.C||(haCarbSeparato&&composizioneSeparataConsentita(r,key)),verduraOk=c.V||haVerduraSeparata;
    return carbOk&&verduraOk;
  });
}
async function assegnaCarboidratiCompatibili(slotRefs,proteinTargets,carbKeys,resolved,runtimeConfig,compatCache){
  const counts={};for(const key of carbKeys||[])counts[key]=(counts[key]||0)+1;
  const plan=resolved&&resolved.carbohydrates||{},selection=plan.selection||{};
  const unique=Object.keys(counts),fallbackKeys=uniq([
    ...(plan.autoEligibleKeys||[]),
    ...Object.keys(selection).filter(k=>selection[k]&&selection[k].mode!=='excluded')
  ]),opzioni=[];
  for(let i=0;i<slotRefs.length;i++){
    const slot=slotRefs[i],target=proteinTargets[i],keys=[];
    for(const key of unique){
      const pool=await poolCompatibilitaGiorno(slot.day,runtimeConfig,compatCache);
      if(incrocioCopertoDaPool(pool,target,key))keys.push(key);
    }
    opzioni.push(keys);
  }
  const ordine=slotRefs.map((_,i)=>i).sort((a,b)=>opzioni[a].length-opzioni[b].length),out=Array(slotRefs.length);
  function assegna(pos){
    if(pos>=ordine.length)return true;
    const idx=ordine[pos],disponibili=opzioni[idx].filter(k=>counts[k]>0).sort((a,b)=>counts[a]-counts[b]);
    for(const key of disponibili){counts[key]--;out[idx]=key;if(assegna(pos+1))return true;counts[key]++;out[idx]=null;}
    return false;
  }
  if(assegna(0))return {valid:true,errors:[],keys:out,sostituzioni:Array(slotRefs.length).fill(null)};

  /* Nessun incastro perfetto: manteniamo inderogabili le proteine e troviamo
     il massimo numero possibile di carboidrati richiesti. Gli slot rimasti
     ricevono un carboidrato AUTO compatibile (mai uno escluso); la differenza
     viene restituita al chiamante per essere registrata e resa visibile. */
  out.fill(null);
  for(let i=0;i<slotRefs.length;i++){
    const slot=slotRefs[i],target=proteinTargets[i];
    for(const key of fallbackKeys){
      if(opzioni[i].includes(key))continue;
      const pool=await poolCompatibilitaGiorno(slot.day,runtimeConfig,compatCache);
      if(incrocioCopertoDaPool(pool,target,key))opzioni[i].push(key);
    }
  }
  if(opzioni.some(x=>!x.length))return {valid:false,errors:['Il ricettario non contiene alcun carboidrato compatibile con almeno una delle classi proteiche programmate.'],keys:[],sostituzioni:[]};
  const tokenRichiesti=[];
  for(const [key,n] of Object.entries(counts))for(let i=0;i<n;i++)tokenRichiesti.push(key);
  tokenRichiesti.sort((a,b)=>opzioni.filter(x=>x.includes(a)).length-opzioni.filter(x=>x.includes(b)).length);
  const slotPerToken=Array(tokenRichiesti.length).fill(-1),tokenPerSlot=Array(slotRefs.length).fill(-1);
  function abbinaToken(t,visti){
    const key=tokenRichiesti[t],slots=ordine.filter(i=>opzioni[i].includes(key));
    for(const slot of slots){
      if(visti.has(slot))continue;visti.add(slot);
      if(tokenPerSlot[slot]<0||abbinaToken(tokenPerSlot[slot],visti)){
        tokenPerSlot[slot]=t;slotPerToken[t]=slot;return true;
      }
    }
    return false;
  }
  for(let t=0;t<tokenRichiesti.length;t++)abbinaToken(t,new Set());
  for(let slot=0;slot<tokenPerSlot.length;slot++)if(tokenPerSlot[slot]>=0)out[slot]=tokenRichiesti[tokenPerSlot[slot]];
  const mancanti=tokenRichiesti.filter((_,t)=>slotPerToken[t]<0),sostituzioni=Array(slotRefs.length).fill(null);
  for(const slot of ordine){
    if(out[slot])continue;
    const compatibiliAuto=opzioni[slot].filter(k=>(plan.autoEligibleKeys||[]).includes(k));
    const usato=compatibiliAuto[0]||opzioni[slot][0];
    if(!usato)return {valid:false,errors:['Nessun carboidrato ammesso è compatibile con la proteina '+proteinTargets[slot]+'.'],keys:[],sostituzioni:[]};
    const richiesto=mancanti.shift()||null;
    out[slot]=usato;
    sostituzioni[slot]={
      tipo:'carboidrato_sostituito',richiesto,usato,
      messaggio:'Richiesto '+(richiesto||'un carboidrato programmato')+', sostituito con '+usato+' perché non esiste ancora una combinazione compatibile con la classe proteica '+proteinTargets[slot]+'.'
    };
  }
  return {valid:true,errors:[],keys:out,sostituzioni};
}
async function limitaCarboidratiAutoAllaCopertura(resolved,slotRefs,proteinTargets,runtimeConfig,compatCache){
  const plan=resolved&&resolved.carbohydrates||{},auto=plan.autoEligibleKeys||[];
  if(!auto.length)return resolved;
  const coperti=[];
  for(const key of auto){
    let disponibile=false;
    for(let i=0;i<slotRefs.length&&!disponibile;i++){
      const pool=await poolCompatibilitaGiorno(slotRefs[i].day,runtimeConfig,compatCache);
      disponibile=incrocioCopertoDaPool(pool,proteinTargets[i],key);
    }
    if(disponibile)coperti.push(key);
  }
  const copia=clone(resolved);
  copia.carbohydrates=Object.assign({},copia.carbohydrates,{autoEligibleKeys:coperti});
  return copia;
}
function carbRicettaAmmesso(r,budget){
  if(!budget)return true;const keys=carbKeysRicetta(r);if(!copertura(r).C)return true;
  if(budget.requiredKey)return keys.includes(budget.requiredKey);
  if(!keys.length)return false;
  return keys.every(k=>{const s=budget.selection[k]||{mode:'auto'};if(s.mode==='excluded')return false;if(s.mode==='fixed')return Number(budget.remaining[k])>0;return budget.autoEligible.has(k);});
}
function consumaBudgetCarboidrati(ricette,budget){if(!budget)return;for(const k of uniq((ricette||[]).flatMap(carbKeysRicetta))){const s=budget.selection[k]||{};if(s.mode==='fixed'&&Number(budget.remaining[k])>0)budget.remaining[k]--;}}

async function loadJson(url){
  const r=await fetch(url+(url.includes('?')?'&':'?')+'v='+Date.now(),{cache:'no-store'});
  if(!r.ok) throw new Error('HTTP '+r.status+' su '+url);
  return await r.json();
}

function groupOptions(g){
  if(!g || g.categoria==='Nessuno' || g.categoria==='Condimenti') return [];
  const ings=Array.isArray(g.ingredienti)?g.ingredienti:[];
  const composizioni=(Array.isArray(g.composizioni)?g.composizioni:[]).map(c=>({
    nome:c.nome,
    componenti:clone(c.ingredienti||[]),
    stack:c.stack===undefined?1:c.stack,
    roll:c.roll===undefined?1:c.roll,
    condimentiCompatibili:Array.isArray(c.condimentiCompatibili)?clone(c.condimentiCompatibili):undefined
  }));
  const cooks=Array.isArray(g.cotture)?g.cotture:[];
  const ingOpts=ings.concat(composizioni);
  if(!ingOpts.length)ingOpts.push(null);
  const cookOpts=cooks.length?cooks:[null];
  const out=[];
  for(const ingrediente of ingOpts){
    for(const cottura of cookOpts){
      out.push({
        categoria:g.categoria,
        ingrediente:ingrediente?clone(ingrediente):null,
        cottura:cottura?clone(cottura):null,
        testo1:g.testo1||'',
        testo2:g.testo2||'',
        mostraNomi:!!g.mostraNomi
      });
    }
  }
  return out;
}

function prodottoCartesiano(arrays){
  if(!arrays.length) return [[]];
  return arrays.reduce((acc,arr)=>{
    const out=[];
    for(const a of acc) for(const b of arr) out.push(a.concat([b]));
    return out;
  },[[]]);
}

function generaCombinazioni(ricetta){
  const gruppi=Array.isArray(ricetta.gruppi)?ricetta.gruppi:[];
  const attivi=gruppi.filter(g=>g && g.categoria!=='Nessuno' && g.categoria!=='Condimenti');
  const opzioni=attivi.map(groupOptions);
  const combinazioni=prodottoCartesiano(opzioni);
  const condimenti=gruppi.filter(g=>g && g.categoria==='Condimenti').map(g=>({
    categoria:'Condimenti',
    testo1:g.testo1||'',
    testo2:g.testo2||'',
    mostraNomi:!!g.mostraNomi,
    ingredienti:(g.ingredienti||[]).map(clone),
    cotture:(g.cotture||[]).map(clone)
  }));
  return combinazioni.map(x=>({slot:x,condimenti:clone(condimenti)}));
}

function variantiCondimento(combinazione){
  const gruppi=Array.isArray(combinazione&&combinazione.condimenti)?combinazione.condimenti:[];
  if(!gruppi.length) return [[]];

  const vincoli=(combinazione.slot||[])
    .map(s=>s&&s.ingrediente&&Array.isArray(s.ingrediente.condimentiCompatibili)
      ? new Set(s.ingrediente.condimentiCompatibili.map(String))
      : null)
    .filter(Boolean);

  const opzioni=gruppi.map(g=>{
    let a=(g.ingredienti||[]).filter(x=>x&&x.nome);
    if(vincoli.length) a=a.filter(x=>vincoli.every(v=>v.has(String(x.nome))));
    return a.length?a:[null];
  });
  return prodottoCartesiano(opzioni);
}

function combinazioneConCondimento(combinazione,indice){
  const tutte=variantiCondimento(combinazione);
  const n=tutte.length||1;
  const idx=((Number(indice)||0)%n+n)%n;
  const scelte=tutte[idx]||[];
  const condimenti=(combinazione.condimenti||[]).map((g,i)=>({
    categoria:'Condimenti',
    testo1:g.testo1||'',
    testo2:g.testo2||'',
    mostraNomi:!!g.mostraNomi,
    ingredienti:scelte[i]?[clone(scelte[i])]:[],
    cotture:(g.cotture||[]).map(clone)
  }));
  return {slot:clone(combinazione.slot||[]),condimenti,condimentoVarianteIndex:idx,numeroVariantiCondimento:n};
}

function estraiPartiRicetta(ricetta,combinazione){
  const parti=[];
  const gruppi=Array.isArray(ricetta.gruppi)?ricetta.gruppi:[];
  let indiceSlot=0;
  let indiceCondimenti=0;

  for(let indiceGruppo=0; indiceGruppo<gruppi.length; indiceGruppo++){
    const gruppo=gruppi[indiceGruppo]||{};
    const categoria=gruppo.categoria||'Nessuno';

    if(gruppo.testo1){
      parti.push({
        tipo:'testo1',
        valore:String(gruppo.testo1),
        gruppoIndex:indiceGruppo,
        categoria
      });
    }

    if(categoria==='Condimenti'){
      const gruppoSelezionato=(combinazione.condimenti||[])[indiceCondimenti++]||{ingredienti:[],cotture:[]};
      for(const ingrediente of (gruppoSelezionato.ingredienti||[])){
        if(!ingrediente||!ingrediente.nome) continue;
        parti.push({
          tipo:'ingrediente',
          valore:String(ingrediente.nome),
          gruppoIndex:indiceGruppo,
          categoria,
          dato:clone(ingrediente),
          mostraNomi:!!gruppo.mostraNomi
        });
      }
      for(const cottura of (gruppoSelezionato.cotture||[])){
        if(!cottura||!cottura.nome) continue;
        parti.push({
          tipo:'cottura',
          valore:String(cottura.nome),
          gruppoIndex:indiceGruppo,
          categoria,
          dato:clone(cottura)
        });
      }
    }else if(categoria!=='Nessuno'){
      const slot=combinazione.slot[indiceSlot++]||null;
      if(slot&&slot.ingrediente&&slot.ingrediente.nome){
        parti.push({
          tipo:'ingrediente',
          valore:String(slot.ingrediente.nome),
          gruppoIndex:indiceGruppo,
          categoria,
          dato:clone(slot.ingrediente),
          mostraNomi:!!gruppo.mostraNomi
        });
      }
      if(slot&&slot.cottura&&slot.cottura.nome){
        parti.push({
          tipo:'cottura',
          valore:String(slot.cottura.nome),
          gruppoIndex:indiceGruppo,
          categoria,
          dato:clone(slot.cottura)
        });
      }
    }

    if(gruppo.testo2){
      parti.push({
        tipo:'testo2',
        valore:String(gruppo.testo2),
        gruppoIndex:indiceGruppo,
        categoria
      });
    }
  }

  return parti;
}

function compilaPartiRicetta(parti){
  return (parti||[])
    .filter(p=>p&&p.valore!==undefined&&p.valore!==null&&String(p.valore)!=='')
    .map(p=>String(p.valore))
    .join(' ')
    .replace(/\s+/g,' ')
    .trim();
}

function costruisciNomeRicetta(ricetta,combinazione){
  if(ricetta&&ricetta.nomeFisso){
    const parti=[{tipo:'nomeFisso',valore:String(ricetta.nomeFisso)}];
    return {
      parti,
      display:String(ricetta.nomeFisso)
    };
  }
  const parti=estraiPartiRicetta(ricetta,combinazione);
  return {
    parti,
    display:compilaPartiRicetta(parti)
  };
}

function metaIngrediente(nome){ return state.ingredientiMap[nome]||null; }
function grammiDaQuantita(meta,q){
  q=Number(q)||0;
  if(!meta) return q;
  if(meta.unitaPorzione==='pezzi'){
    const porz=Number(meta.porzione)||0, peso=Number(meta.pesoPorzioneGrammi)||0;
    if(porz>0&&peso>0) return q*(peso/porz);
    if(Number(meta.pesoPezzo)>0) return q*Number(meta.pesoPezzo);
  }
  return q;
}
function quantitaDefault(meta){ return Number(meta&&meta.porzione)||0; }

async function quantitaConfigurata(nome,meta){
  if(typeof getOne!=='function') return quantitaDefault(meta);
  try{
    const rec=await getOne('impostazioni','vincoliIngredientiNutrizionista');
    const cfg=rec&&rec.valore||{};
    const base=state.baseByName.get(String(nome).toLowerCase());
    const v=base&&cfg[base.id];
    if(v && v.quantita!==undefined && v.quantita!==null && v.quantita!=='') return Number(v.quantita)||0;
  }catch(e){}
  return quantitaDefault(meta);
}

async function preparaIngredientiDettagliati(ricetta,combinazione){
  const macroCounts={};
  for(const s of combinazione.slot){
    const m=macroCategoria(s.categoria);
    if(m) macroCounts[m]=(macroCounts[m]||0)+1;
  }
  const out=[];
  let slotIndex=0;
  for(const s of combinazione.slot){
    const macro=macroCategoria(s.categoria);
    const componenti=s.ingrediente&&Array.isArray(s.ingrediente.componenti)&&s.ingrediente.componenti.length
      ?s.ingrediente.componenti
      :(s.ingrediente&&s.ingrediente.nome?[s.ingrediente]:[]);
    for(const componente of componenti){
      const nome=componente.nome, meta=metaIngrediente(nome)||{};
      const categoria=componente.categoria||s.categoria,macroComponente=macroCategoria(categoria);
      let q=componente.dose!==undefined&&componente.dose!==null&&componente.dose!==''
        ? Number(componente.dose)||0
        : await quantitaConfigurata(nome,meta);
      if((macroCounts[macro]||0)>1 && !(componente.dose!==undefined&&componente.dose!==null&&componente.dose!=='')) q=q/macroCounts[macro];
      const base=state.baseByName.get(nome.toLowerCase());
      const variante=state.variantByName.get(nome.toLowerCase());
      out.push({
        nome,
        categoria,
        macro:macroComponente,
        slotIndex,
        variantId:variante?variante.id:null,
        ingredienteId:base?base.id:null,
        quantita:q,
        grammi:grammiDaQuantita(meta,q),
        unita:meta.unitaPorzione==='pezzi'?'pz':'g',
        allergeni:Array.isArray(meta.allergeni)?meta.allergeni.slice():[],
        sottotipo:meta.sottotipo||null,
        gruppo:meta.gruppo||null,
        deperibilita:meta.deperibilita||null,
        conservazione:meta.conservazione||null,
        nonRichiedeInventario:!!meta.nonRichiedeInventario,
        carbRazionato:!!meta.carbRazionato,
        frequenzaSettimanale:meta.frequenzaSettimanale||null,
        cooldownGiorni:Number(meta.cooldownGiorni)||null,
        condimento:categoria==='Condimenti',
        stack:componente.stack===undefined?(s.ingrediente.stack===undefined?1:s.ingrediente.stack):componente.stack,
        roll:componente.roll===undefined?(s.ingrediente.roll===undefined?1:s.ingrediente.roll):componente.roll
      });
    }
    slotIndex++;
  }
  for(const g of combinazione.condimenti){
    for(const x of (g.ingredienti||[])){
      const nome=x.nome, meta=metaIngrediente(nome)||{};
      const base=state.baseByName.get(nome.toLowerCase());
      const variante=state.variantByName.get(nome.toLowerCase());
      let q=x.dose!==undefined&&x.dose!==null&&x.dose!==''?Number(x.dose)||0:await quantitaConfigurata(nome,meta);
      out.push({
        nome,categoria:'Condimenti',macro:null,slotIndex:null,
        variantId:variante?variante.id:null,ingredienteId:base?base.id:null,
        quantita:q,grammi:grammiDaQuantita(meta,q),
        unita:meta.unitaPorzione==='pezzi'?'pz':'g',
        allergeni:Array.isArray(meta.allergeni)?meta.allergeni.slice():[],
        sottotipo:meta.sottotipo||null,gruppo:meta.gruppo||null,
        deperibilita:meta.deperibilita||null,conservazione:meta.conservazione||null,
        nonRichiedeInventario:!!meta.nonRichiedeInventario,
        cooldownGiorni:Number(meta.cooldownGiorni)||null,
        condimento:true,stack:x.stack===undefined?1:x.stack,roll:x.roll===undefined?1:x.roll
      });
    }
  }
  return out;
}

function calcolaNutrienti(ingredienti){
  let kcal=0,proteine=0,carboidrati=0,grassi=0;
  for(const i of ingredienti){
    const m=metaIngrediente(i.nome); if(!m) continue;
    const f=(Number(i.grammi)||0)/100;
    kcal+=(Number(m.kcal)||0)*f;
    proteine+=(Number(m.proteine)||0)*f;
    carboidrati+=(Number(m.carboidrati)||0)*f;
    grassi+=(Number(m.grassi)||0)*f;
  }
  return {kcal,proteine,carboidrati,grassi};
}
function gruppoProteicoDaIngredienti(ingredienti,classe){
  const p=ingredienti.find(i=>TOKEN_P.has(i.categoria));
  if(p&&p.sottotipo) return p.sottotipo;
  const token=(Array.isArray(classe)?classe:[classe]).find(x=>TOKEN_P.has(x));
  return token||null;
}
function chiaviStack(combinazione,modelId,stackScope){
  const keys=[];
  for(const s of combinazione.slot){
    if(s.categoria!=='C'&&s.categoria!=='V'){
      const componenti=s.ingrediente&&Array.isArray(s.ingrediente.componenti)&&s.ingrediente.componenti.length?s.ingrediente.componenti:(s.ingrediente?[s.ingrediente]:[]);
      for(const i of componenti)if(i&&i.nome&&Number(i.stack===undefined?s.ingrediente.stack:i.stack)!==0)keys.push('i:'+(i.categoria||s.categoria)+':'+i.nome);
      if(s.cottura&&s.cottura.nome&&Number(s.cottura.stack)!==0) keys.push('c:'+s.categoria+':'+s.cottura.nome);
    }
  }
  for(const g of combinazione.condimenti) for(const i of (g.ingredienti||[])) if(i.nome&&Number(i.stack)!==0) keys.push('cond:'+i.nome);
  if(!keys.length){
    for(const s of combinazione.slot){
      if(s.categoria==='V')continue;
      const componenti=s.ingrediente&&Array.isArray(s.ingrediente.componenti)&&s.ingrediente.componenti.length?s.ingrediente.componenti:(s.ingrediente?[s.ingrediente]:[]);
      for(const i of componenti)if(i&&i.nome&&Number(i.stack===undefined?s.ingrediente.stack:i.stack)!==0)keys.push('i:'+(i.categoria||s.categoria)+':'+i.nome);
      if(s.cottura&&s.cottura.nome&&Number(s.cottura.stack)!==0) keys.push('c:'+s.categoria+':'+s.cottura.nome);
    }
  }
  const prefisso=stackScope?'s:'+String(stackScope):'m'+modelId;
  return uniq(keys.map(k=>prefisso+':'+k));
}

async function compilaRicetta(ricetta,combinazione,index){
  const selezionata=combinazioneConCondimento(combinazione,0);
  const n=costruisciNomeRicetta(ricetta,selezionata);
  const ingredienti=await preparaIngredientiDettagliati(ricetta,selezionata);
  const nut=calcolaNutrienti(ingredienti);
  const classe=tokenClasse(ricetta);
  const id='nr_'+ricetta.id+'_'+index;
  return {
    id,
    recipeModelId:ricetta.id,
    comboIndex:index,
    nome:n.display,
    partiRicetta:n.parti,
    classe:clone(ricetta.classe),
    categoriaPrincipale:categoriaPrincipale(classe),
    gruppoProteico:gruppoProteicoDaIngredienti(ingredienti,classe),
    ingredienti,
    nutrienti:nut,
    nutrizioneManualeTotale:{kcal:nut.kcal,prot:nut.proteine,carb:nut.carboidrati,grassi:nut.grassi},
    porzioni:1,
    fonte:'nuovo-db-compilato',
    motoreNuovo:true,
    stackScope:ricetta.stackScope||null,
    chiaviStack:chiaviStack(selezionata,ricetta.id,ricetta.stackScope),
    slot:clone(combinazione.slot),
    condimenti:clone(selezionata.condimenti),
    condimentiDisponibili:clone(combinazione.condimenti),
    /* Snapshot necessario ai Roll: dopo la compilazione il runtime non deve
       tornare a cercare il template nel JSON sorgente. */
    templateOrigine:clone(ricetta),
    condimentoVarianteIndex:0,
    numeroVariantiCondimento:selezionata.numeroVariantiCondimento
  };
}

async function sincronizzaIngredientiIndexedDB(){
  if(typeof getAll!=='function'||typeof put!=='function') return;
  const [basi,varianti]=await Promise.all([getAll('ingredienti'),getAll('varianti')]);
  const baseByName=new Map((basi||[]).map(x=>[String(x.nome||'').toLowerCase(),x]));
  const varByName=new Map((varianti||[]).map(x=>[String(x.nome||'').toLowerCase(),x]));
  for(const [nome,d] of Object.entries(state.ingredientiMap)){
    const key=nome.toLowerCase();
    let b=baseByName.get(key);
    if(!b) b={id:'nri_'+slug(nome),nome};
    Object.assign(b,{
      nome,gruppo:d.gruppo||'altro',sottotipo:d.sottotipo||null,
      sottoCategoriaColazione:d.sottoCategoriaColazione||null,
      deperibilita:d.deperibilita||'bassa',conservazione:d.conservazione||null,
      porzione:d.porzione||null,unitaPorzione:d.unitaPorzione||null,
      pesoPorzioneGrammi:d.pesoPorzioneGrammi||null,pesoPezzo:d.pesoPezzo||null,
      gradimento:d.gradimento===undefined?1:d.gradimento,stock:d.stock===undefined?1:d.stock,
      cooldownGiorni:Number(d.cooldownGiorni)||null,
      formatoRiordino:d.formatoRiordino||{valore:null,unita:null},
      allergeni:Array.isArray(d.allergeni)?d.allergeni:[],
      bloccoManuale:!!d.bloccoManuale,nonRichiedeInventario:!!d.nonRichiedeInventario,
      motoreNuovo:true
    });
    await put('ingredienti',b); baseByName.set(key,b);
    let v=varByName.get(key);
    if(!v) v={id:'nrv_'+slug(nome),ingredienteId:b.id,nome};
    const alta=d.deperibilita==='alta',surg=d.conservazione==='surgelato',fresco=d.conservazione==='fresco';
    Object.assign(v,{
      ingredienteId:b.id,nome,
      /* Il selettore della colazione lavora sulle varianti, mentre la fonte
         autorevole conserva questi due dati sull'ingrediente. Li materializziamo
         qui ad ogni sincronizzazione, così un'installazione pulita e una già
         esistente ricevono esattamente le stesse opzioni. */
      colazioneGruppo:d.sottoCategoriaColazione||null,
      porzioneColazione:d.sottoCategoriaColazione?d.porzione||null:null,
      kcal100:Number(d.kcal)||0,prot100:Number(d.proteine)||0,
      carb100:Number(d.carboidrati)||0,grassi100:Number(d.grassi)||0,
      categoria:surg?'surgelato':(fresco||alta?'fresco':'conf'),
      consistenza:d.gruppo==='grassi'?'gia_cotto':'da_cuocere',
      congelabile:surg?'si':(alta?'si':'no'),
      zona:surg?'freezer':(fresco||alta?'frigo':'dispensa'),
      formato:Number(d.formato&&d.formato.valore||d.formatoRiordino&&d.formatoRiordino.valore)||0,
      unitaPezzo:d.unitaPorzione==='pezzi',
      pesoPezzo:Number(d.pesoPezzo||(d.unitaPorzione==='pezzi'&&d.pesoPorzioneGrammi&&d.porzione?d.pesoPorzioneGrammi/d.porzione:0))||null,
      motoreNuovo:true
    });
    await put('varianti',v); varByName.set(key,v);
  }
  state.baseByName=baseByName;
  state.variantByName=varByName;
}

async function sincronizzaCacheRicette(){
  if(typeof getAll!=='function'||typeof put!=='function'||typeof delKey!=='function') return;
  const esistenti=await getAll('ricette');
  const valid=new Set(state.ricetteConcrete.map(r=>r.id));
  for(const r of esistenti||[]){
    if(r&&r.fonte==='nuovo-db-compilato'&&!valid.has(r.id)) await delKey('ricette',r.id);
  }
  for(const r of state.ricetteConcrete) await put('ricette',clone(r));
}

async function caricaTracking(){
  if(typeof getOne!=='function') return;
  try{
    const r=await getOne('impostazioni','motoreNuovoTracking');
    if(r&&r.valore) state.tracking=Object.assign({ultimoUtilizzo:{},utilizziSettimanali:{},condimentoRotazione:{contatore:0,ultimo:{}}},r.valore);
  }catch(e){}
}
async function salvaTracking(){
  if(typeof put!=='function') return;
  await put('impostazioni',{chiave:'motoreNuovoTracking',valore:clone(state.tracking)});
}
function usiSettimanali(nome,data){
  const k=nome+'_'+startOfWeekISO(data);
  return Number(state.tracking.utilizziSettimanali[k])||0;
}
function usiSettimanaliSottotipo(sottotipo,data){
  return usiSettimanali('@sottotipo:'+sottotipo,data);
}
function giorniUltimo(key,data){
  const u=state.tracking.ultimoUtilizzo[key];
  if(!u) return Infinity;
  return giorniTra(new Date((typeof data==='string'?data:isoDate(data))+'T12:00:00'),new Date(u));
}
function cooldownOk(r,data){
  if(!(r.chiaviStack||[]).every(k=>giorniUltimo(k,data)>=COOLDOWN_GIORNI)) return false;
  for(const i of (r.ingredienti||[])){
    const giorni=Number(i.cooldownGiorni)||0;
    if(giorni>0 && giorniUltimo('@ingrediente:'+i.nome,data)<giorni) return false;
  }
  return true;
}
async function registraUtilizzo(r,data){
  const d=(data instanceof Date)?data:new Date((data||isoDate(new Date()))+'T12:00:00');
  const when=d.toISOString();
  for(const k of (r.chiaviStack||[])) state.tracking.ultimoUtilizzo[k]=when;
  const settimana=startOfWeekISO(d);
  let haAffettati=false;
  for(const i of r.ingredienti||[]){
    const k=i.nome+'_'+settimana;
    state.tracking.utilizziSettimanali[k]=(Number(state.tracking.utilizziSettimanali[k])||0)+1;
    if((Number(i.cooldownGiorni)||0)>0) state.tracking.ultimoUtilizzo['@ingrediente:'+i.nome]=when;
    if(i.sottotipo==='affettati') haAffettati=true;
  }
  if(haAffettati){
    const k='@sottotipo:affettati_'+settimana;
    state.tracking.utilizziSettimanali[k]=(Number(state.tracking.utilizziSettimanali[k])||0)+1;
  }
  await salvaTracking();
}

async function configRuntime(forzaRicalcolo){
  /* Il profilo alimentare (allergie, esclusioni, vegano/ecc.) non cambia
     durante l'uso normale dell'app: lo si calcola una volta e lo si tiene
     in memoria per tutta la sessione, non ad ogni ricetta/condimento/pasto.
     Si ricalcola SOLO quando le impostazioni vengono davvero salvate
     (vedi invalidaConfigRuntime, chiamata dall'interfaccia al commit di
     Set/Nutrizionista) - mai per abitudine o "per sicurezza". */
  if(!forzaRicalcolo&&state.runtimeConfigCache) return state.runtimeConfigCache;
  const resolved=await caricaConfigurazioneNutrizionaleRisolta();
  state.runtimeConfigCache={
    resolved,
    allergie:resolved.safety.allergens,
    blockedIngredientIds:new Set(resolved.safety.blockedIngredientIds),
    vincoli:resolved.ingredientConstraints,
    weeklyLimits:resolved.subtypeCaps,
    maxProteinSourcesPerDay:resolved.maxProteinSourcesPerDay
  };
  return state.runtimeConfigCache;
}
function invalidaConfigRuntime(){ state.runtimeConfigCache=null; }

function selezioneCarboidratiPersistita(counts,origins,states,explicitZeroKeys){
  counts=counts||{};origins=origins||{};states=states||{};
  if(Object.keys(states).length)return {states:clone(states),explicitZeroKeys:(explicitZeroKeys||[]).slice()};
  const migrated={};
  for(const [key,value] of Object.entries(counts)){
    const n=Math.max(0,Math.trunc(Number(value)||0)),source=Array.isArray(origins[key])?origins[key]:null;
    if(n>0&&(!source||source.some(x=>x==='utente')))migrated[key]={mode:'fixed',count:n};
    else migrated[key]={mode:'auto',count:0};
  }
  for(const key of explicitZeroKeys||[])migrated[key]={mode:'excluded',count:0};
  return {states:migrated,explicitZeroKeys:(explicitZeroKeys||[]).slice()};
}

async function caricaConfigurazioneNutrizionaleRisolta(){
  if(typeof getOne!=='function') return N.resolveNutritionConfig({});
  try{
    const [a,v,c,b,u,cc,co,cs,cz]=await Promise.all([
      getOne('impostazioni','allergeniAttivi'),
      getOne('impostazioni','vincoliIngredientiNutrizionista'),
      getOne('impostazioni','configAvanzata'),
      getOne('impostazioni','ingredientiBloccati'),
      getOne('impostazioni','tettiIngredienteSettimanali'),
      getOne('impostazioni','configCarboidrati'),
      getOne('impostazioni','configCarboidratiOrigini'),
      getOne('impostazioni','configCarboidratiStati'),
      getOne('impostazioni','configCarboidratiExplicitZeroKeys')
    ]);
    const carbohydrates=selezioneCarboidratiPersistita(cc&&cc.valore,co&&co.valore,cs&&cs.valore,cz&&cz.valore);
    return N.resolveNutritionConfig({
      nutritionist:{
        config:c&&c.valore||{},
        ingredientConstraints:v&&v.valore||{},
        allergens:a&&a.valore||[],
        blockedIngredientIds:b&&b.valore||[]
      },
      user:{
        ingredientWeeklyCaps:u&&u.valore||{},
        carbohydrates
      }
    });
  }catch(e){ return N.resolveNutritionConfig({}); }
}

async function ricettaAmmessa(r,data,opts){
  opts=opts||{};
  const cfg=opts.runtimeConfig||await configRuntime();
  if(!cfg.resolved.valid) return false;
  for(const i of r.ingredienti||[]){
    if(i.allergeni&&i.allergeni.some(a=>cfg.allergie.includes(a))) return false;
    const base=i.ingredienteId && [...state.baseByName.values()].find(b=>b.id===i.ingredienteId);
    if(base&&base.bloccoManuale) return false;
    if(base&&cfg.blockedIngredientIds.has(base.id)) return false;
    const vin=base&&(cfg.vincoli[base.id]||cfg.vincoli[slug(base.nome)]);
    if(vin&&vin.state==='excluded') return false;
    if(vin&&vin.max!==undefined&&vin.max!==null&&vin.max!==''){
      const usi=opts.weeklyIngredientCounts&&base?Number(opts.weeklyIngredientCounts[base.id])||0:usiSettimanali(i.nome,data);
      if(usi>=Number(vin.max)) return false;
    }
    const st=i.sottotipo;
    const cap=st&&cfg.weeklyLimits[st];
    if(cap!==undefined&&cap!==null){
      const usi=opts.weeklySubtypeCounts?Number(opts.weeklySubtypeCounts[st])||0:(st==='affettati'?usiSettimanaliSottotipo(st,data):usiSettimanali(i.nome,data));
      if(usi>=Number(cap)) return false;
    }
  }
  const forbidden=new Set(cfg.resolved.profile.forbiddenProteinMacros||[]);
  for(const i of r.ingredienti||[]){
    const macro=Object.keys(PROTEIN_MACRO_TO_TOKEN).find(k=>PROTEIN_MACRO_TO_TOKEN[k]===SUBTYPE_TO_TOKEN[i.sottotipo]);
    if(macro&&forbidden.has(macro)) return false;
  }
  if(!opts.ignoraCooldown && !cooldownOk(r,data)) return false;
  return true;
}

async function getScadenzeImminenti(){
  if(typeof getAll!=='function') return [];
  const inv=await getAll('inventario'), oggi=new Date(isoDate(new Date())+'T12:00:00'), out=[];
  for(const item of inv||[]){
    if(item.stato==='esaurito'||Number(item.quantita)<=0||item.zona!=='frigo') continue;
    let scadenza=item.dataScadenza||null;
    if(!scadenza&&item.dataApertura){
      const v=[...state.variantByName.values()].find(x=>x.id===item.variantId);
      const b=v&&[...state.baseByName.values()].find(x=>x.id===v.ingredienteId);
      const dep=b&&b.deperibilita;
      const gg=dep==='alta'?3:(dep==='media'?5:7);
      const d=new Date(item.dataApertura+'T12:00:00'); d.setDate(d.getDate()+gg); scadenza=isoDate(d);
    }
    if(!scadenza) continue;
    const giorni=Math.ceil((new Date(scadenza+'T12:00:00')-oggi)/86400000);
    if(giorni<=2){
      const v=[...state.variantByName.values()].find(x=>x.id===item.variantId);
      out.push({variantId:item.variantId,nome:v?v.nome:'?',giorniRimanenti:giorni,itemId:item.id});
    }
  }
  return out.sort((a,b)=>a.giorniRimanenti-b.giorniRimanenti);
}

async function getAvanziScomodi(){
  if(typeof getAll!=='function') return [];
  const inv=await getAll('inventario'), out=[];
  for(const item of inv||[]){
    if(item.stato==='esaurito'||Number(item.quantita)<=0) continue;
    const v=[...state.variantByName.values()].find(x=>x.id===item.variantId);
    if(!v||!Number(v.formato)||!['fresco','surgelato'].includes(v.categoria)) continue;
    if(Number(item.quantita)>=Number(v.formato)) continue;
    out.push({variantId:item.variantId,nome:v.nome,quantita:Number(item.quantita),itemId:item.id});
  }
  return out;
}
async function getCongelatiDaTempo(){
  if(typeof getAll!=='function') return [];
  const inv=await getAll('inventario'), oggi=new Date(), out=[];
  for(const item of inv||[]){
    if(item.zona!=='freezer'||item.stato==='esaurito'||Number(item.quantita)<=0||!item.dataCongelamento) continue;
    const gg=giorniTra(oggi,new Date(item.dataCongelamento));
    if(gg>=SOGLIA_CONGELATO_GIORNI){
      const v=[...state.variantByName.values()].find(x=>x.id===item.variantId);
      out.push({variantId:item.variantId,nome:v?v.nome:'?',giorniCongelato:gg,itemId:item.id});
    }
  }
  return out.sort((a,b)=>b.giorniCongelato-a.giorniCongelato);
}
function tempoScongelamento(variantId){
  const v=[...state.variantByName.values()].find(x=>x.id===variantId);
  const b=v&&[...state.baseByName.values()].find(x=>x.id===v.ingredienteId);
  if(!b) return 12;
  const st=b.sottotipo||'';
  if(st.includes('carne')||st==='affettati') return 24;
  if(st.includes('pesce')||st==='molluschi'||st==='crostacei') return 12;
  if(b.gruppo==='verdura') return 6;
  if(b.gruppo==='carboidrati') return 2;
  return 12;
}
async function ricetteConVariantIds(ids){
  const s=new Set(ids||[]);
  return state.ricetteConcrete.filter(r=>(r.ingredienti||[]).some(i=>i.variantId&&s.has(i.variantId)));
}
async function getFreezerDisponibili(){
  if(typeof getAll!=='function') return [];
  const inv=await getAll('inventario'),out=[];
  for(const item of inv||[]){
    if(item.zona!=='freezer'||item.stato==='esaurito'||Number(item.quantita)<=0)continue;
    const v=[...state.variantByName.values()].find(x=>x.id===item.variantId);
    out.push({variantId:item.variantId,nome:v?v.nome:'?',quantita:Number(item.quantita)||0,itemId:item.id,dataCongelamento:item.dataCongelamento||null});
  }
  return out;
}
async function getInventarioDisponibile(){
  if(typeof getAll!=='function') return [];
  const inv=await getAll('inventario'),out=[];
  for(const item of inv||[]){
    if(item.stato==='esaurito'||Number(item.quantita)<=0)continue;
    const v=[...state.variantByName.values()].find(x=>x.id===item.variantId);
    if(!v)continue;
    const b=[...state.baseByName.values()].find(x=>x.id===v.ingredienteId);
    out.push({
      variantId:item.variantId,nome:v.nome,quantita:Number(item.quantita)||0,itemId:item.id,
      deperibilita:b&&b.deperibilita||'bassa',zona:item.zona||v.zona||'dispensa'
    });
  }
  const peso={alta:0,media:1,bassa:2};
  return out.sort((a,b)=>(peso[a.deperibilita]??2)-(peso[b.deperibilita]??2));
}
async function salvafrigo(){
  const [scad,avanzi,vecchi,freezerTutti]=await Promise.all([getScadenzeImminenti(),getAvanziScomodi(),getCongelatiDaTempo(),getFreezerDisponibili()]);
  let src=scad,origine='scadenza';
  if(!src.length){src=avanzi;origine='avanzo';}
  if(!src.length){src=vecchi.length?vecchi:freezerTutti;origine='freezer';}
  const ricette=await ricetteConVariantIds(src.map(x=>x.variantId));
  return {origine,ingredienti:src,ricette};
}
async function suggerisciCongelati(){
  const x=await getCongelatiDaTempo();
  return await ricetteConVariantIds(x.map(i=>i.variantId));
}

function copertura(r){
  const tokens=new Set((Array.isArray(r.classe)?r.classe:[r.classe]).filter(Boolean));
  const ruoliVerdura=ruoliVerduraDaClasse([...tokens]);
  return {
    tokens,
    C:tokens.has('C'),
    V:ruoliVerdura.V,
    S:ruoliVerdura.S,
    G:ruoliVerdura.G,
    P:[...tokens].some(t=>TOKEN_P.has(t)),
    proteinTokens:[...tokens].filter(t=>TOKEN_P.has(t))
  };
}

/* Contratto matematico V/S/G. Questa funzione e' deliberatamente pura e non
   modifica ancora la pipeline di generazione: il Blocco 1 congela semantica,
   soglia e casi aperti prima della riclassificazione del catalogo. */
function ruoliVerduraDaClasse(classe){
  const tokens=new Set((Array.isArray(classe)?classe:[classe]).filter(Boolean));
  return {V:tokens.has('V'),S:tokens.has('S'),G:tokens.has('G')};
}
function calcolaBilancioVSG(valori){
  valori=valori||{};
  const nonNegativo=n=>Math.max(0,Number.isFinite(Number(n))?Number(n):0);
  const richiestaGrammi=nonNegativo(valori.richiestaGrammi);
  const grammiV=nonNegativo(valori.grammiV);
  const grammiS=nonNegativo(valori.grammiS);
  const grammiG=nonNegativo(valori.grammiG);
  const residuoCalcolato=Math.max(0,richiestaGrammi-grammiV-grammiS-grammiG);
  const residuoGrammi=residuoCalcolato<0.000001?0:residuoCalcolato;
  let strategia='nessuna';
  if(residuoGrammi>=50)strategia='v_dedicata';
  else if(residuoGrammi>0&&grammiS>0&&grammiG>0)strategia='redistribuzione_sg';
  return {
    richiestaGrammi,grammiV,grammiS,grammiG,residuoGrammi,
    coperturaCompleta:residuoGrammi===0,
    strategia
  };
}
function scoreCopertura(r,targetToken){
  const c=copertura(r);
  let s=0;
  if(c.tokens.has(targetToken)) s+=10;
  if(c.C) s+=3;
  if(c.V) s+=3;
  if(c.S) s+=1;
  if(c.G) s+=1;
  return s;
}
async function poolAmmesso(data,opts){
  const out=[];
  for(const r of state.ricetteConcrete){
    /* Rete di sicurezza ridondante: le voci sintetiche a ingrediente singolo
       (stackScope 'contorni_catalogo'/'proteine_catalogo') non vengono più
       generate a monte (compilaContorniBaseCatalogo/compilaProteineBaseCatalogo
       sono state rimosse), quindi questo filtro oggi non esclude mai nulla.
       Lasciato per sicurezza nel caso quel tipo di voce tornasse in futuro. */
    if(r.stackScope==='contorni_catalogo'||r.stackScope==='proteine_catalogo')continue;
    if(carbRicettaAmmesso(r,opts&&opts.carbBudget)&&await ricettaAmmessa(r,data,opts)) out.push(r);
  }
  return out;
}
function scegliCasuale(pool){ return pool.length?pool[Math.floor(Math.random()*pool.length)]:null; }
function scegliCandidatoConMargine(pool,opts){
  if(!(pool||[]).length)return null;
  const priorita=pool.map(c=>Number(c.prioritaComposizione)||0).reduce((a,b)=>Math.min(a,b),Infinity);
  pool=pool.filter(c=>(Number(c.prioritaComposizione)||0)===priorita);
  const cfg=opts&&opts.runtimeConfig,subCounts=opts&&opts.weeklySubtypeCounts||{},ingCounts=opts&&opts.weeklyIngredientCounts||{};
  if(!cfg)return scegliCasuale(pool);
  const score=c=>{
    const ingredienti=new Set(),subtypes=new Set();
    for(const r of c.ricette||[])for(const i of r.ingredienti||[]){if(i.ingredienteId)ingredienti.add(i.ingredienteId);if(i.sottotipo)subtypes.add(i.sottotipo);}
    let penalita=0;
    for(const st of subtypes){const max=cfg.weeklyLimits[st];if(max!==null&&max!==undefined)penalita+=100/(Math.max(0,Number(max)-(Number(subCounts[st])||0))+1);}
    for(const id of ingredienti){const rule=cfg.vincoli[id];if(rule&&rule.max!==null&&rule.max!==undefined)penalita+=10/(Math.max(0,Number(rule.max)-(Number(ingCounts[id])||0))+1);}
    return penalita;
  };
  const min=pool.map(score).reduce((a,b)=>Math.min(a,b),Infinity),migliori=pool.filter(c=>Math.abs(score(c)-min)<1e-9);
  return scegliCasuale(migliori);
}

function firmaCopertura(r){
  return Array.from(copertura(r).tokens).sort().join('|');
}
function getPropostaSet(chiave){
  if(!state.propostaCicli.has(chiave)) state.propostaCicli.set(chiave,new Set());
  return state.propostaCicli.get(chiave);
}
function azzeraProposte(chiave){
  state.propostaCicli.delete(chiave);
}
function snapshotRealizzazione(realizzazione,ricetta){
  const real=clone(realizzazione||{});
  if(!ricetta)return real;
  real.schemaQuantita=1;
  real.nomeEffettivo=ricetta.nome||null;
  real.ingredientiEffettivi=clone(ricetta.ingredienti||[]);
  real.nutrientiEffettivi=clone(ricetta.nutrienti||calcolaNutrienti(real.ingredientiEffettivi));
  real.gruppoProteico=ricetta.gruppoProteico||null;
  real.ruoloVerdura=ruoliVerduraDaClasse(ricetta.classe);
  if(ricetta.residuoVerdura)real.residuoVerdura=clone(ricetta.residuoVerdura);
  else delete real.residuoVerdura;
  if(ricetta.redistribuzioneVerdura)real.redistribuzioneVerdura=clone(ricetta.redistribuzioneVerdura);
  else delete real.redistribuzioneVerdura;
  return real;
}
function applicaOverrideQuantitaRealizzazione(ricetta,realizzazione){
  const copia=clone(ricetta),override=realizzazione&&realizzazione.ingredientiEffettivi||[];
  for(const eff of override){
    if(!eff.overrideQuantita)continue;
    const target=(copia.ingredienti||[]).find(i=>i.nome===eff.nome&&i.categoria===eff.categoria&&i.slotIndex===eff.slotIndex);
    if(!target)continue;
    target.quantita=Number(eff.quantita)||0;
    target.grammi=Number(eff.grammi)||0;
    target.overrideQuantita=eff.overrideQuantita;
  }
  copia.nutrienti=calcolaNutrienti(copia.ingredienti||[]);
  copia.nutrizioneManualeTotale={kcal:copia.nutrienti.kcal,prot:copia.nutrienti.proteine,carb:copia.nutrienti.carboidrati,grassi:copia.nutrienti.grassi};
  if(realizzazione&&realizzazione.residuoVerdura)copia.residuoVerdura=clone(realizzazione.residuoVerdura);
  if(realizzazione&&realizzazione.redistribuzioneVerdura)copia.redistribuzioneVerdura=clone(realizzazione.redistribuzioneVerdura);
  return copia;
}
function realizzazioniDaRicette(ricette){
  return (ricette||[]).map(r=>snapshotRealizzazione({
    ricettaId:r.id,
    recipeModelId:r.recipeModelId,
    copertura:Array.from(copertura(r).tokens),
    condimentoVarianteIndex:Number(r.condimentoVarianteIndex)||0
  },r));
}
function nomiVarianteCondimento(raw,indice){
  const tutte=variantiCondimento(raw);
  const v=tutte[indice]||[];
  return v.map(x=>x&&x.nome?String(x.nome):'').filter(Boolean);
}
function punteggioRecenzaCondimento(nomi,rotazione){
  if(!nomi.length) return -1;
  const ultimo=rotazione&&rotazione.ultimo||{};
  return nomi.map(nome=>Number(ultimo[nome])||0).reduce((a,b)=>Math.max(a,b),-Infinity);
}
async function scegliCondimentoGlobale(base,data){
  if(!base) return 0;
  const raw={slot:clone(base.slot||[]),condimenti:clone(base.condimentiDisponibili||base.condimenti||[])};
  const tutte=variantiCondimento(raw);
  if(tutte.length<=1) return 0;

  const valide=[];
  for(let idx=0;idx<tutte.length;idx++){
    const x=await materializzaRicetta(base,idx);
    if(await ricettaAmmessa(x,data,{})) valide.push(idx);
  }
  if(valide.length<=1) return valide.length?valide[0]:0;

  if(!state.tracking.condimentoRotazione) state.tracking.condimentoRotazione={contatore:0,ultimo:{}};
  const rot=state.tracking.condimentoRotazione;
  let scelto=valide[0], score=punteggioRecenzaCondimento(nomiVarianteCondimento(raw,scelto),rot);

  for(const idx of valide.slice(1)){
    const s=punteggioRecenzaCondimento(nomiVarianteCondimento(raw,idx),rot);
    if(s<score){
      scelto=idx;
      score=s;
    }
  }
  return scelto;
}
async function assegnaCondimentiRotazioneGlobale(risultato,data){
  if(!risultato||!Array.isArray(risultato.realizzazioni)) return risultato;
  if(!state.tracking.condimentoRotazione) state.tracking.condimentoRotazione={contatore:0,ultimo:{}};

  const realizzazioni=[];
  let cambiato=false;
  for(const real of risultato.realizzazioni){
    const copia=clone(real);
    const base=state.ricetteById.get(copia&&copia.ricettaId);
    if(base){
      const raw={slot:clone(base.slot||[]),condimenti:clone(base.condimentiDisponibili||base.condimenti||[])};
      const tutte=variantiCondimento(raw);
      if(tutte.length>1){
        const idx=await scegliCondimentoGlobale(base,data);
        copia.condimentoVarianteIndex=idx;
        const nomi=nomiVarianteCondimento(raw,idx);
        if(nomi.length){
          const rot=state.tracking.condimentoRotazione;
          rot.contatore=(Number(rot.contatore)||0)+1;
          for(const nome of nomi) rot.ultimo[nome]=rot.contatore;
          cambiato=true;
        }
      }else{
        copia.condimentoVarianteIndex=0;
      }
      let materializzata=await materializzaRicetta(base,copia.condimentoVarianteIndex);
      if(materializzata){
        materializzata=applicaOverrideQuantitaRealizzazione(materializzata,copia);
        Object.assign(copia,snapshotRealizzazione(copia,materializzata));
      }
    }
    realizzazioni.push(copia);
  }
  risultato.realizzazioni=realizzazioni;
  if(cambiato) await salvaTracking();
  return risultato;
}

async function livelliPrioritaInventario(){
  const [scad,avanzi,freezer,disponibili]=await Promise.all([getScadenzeImminenti(),getAvanziScomodi(),getFreezerDisponibili(),getInventarioDisponibile()]);
  // Salvafrigo usa prima urgenze, avanzi e freezer; se non bastano, considera
  // comunque tutta la scorta disponibile ordinata per deperibilita. In questo modo
  // una scorta fresca compatibile non viene ignorata a favore di un nuovo acquisto.
  return [scad,avanzi,freezer,disponibili]
    .filter(src=>src.length)
    .map(src=>new Set(src.map(x=>x.variantId)));
}
function applicaPrioritaInventario(pool,livelli){
  for(const ids of (livelli||[])){
    const p=pool.filter(r=>(r.ingredienti||[]).some(i=>i.variantId&&ids.has(i.variantId)));
    if(p.length)return p;
  }
  return pool;
}
async function prioritaInventario(pool){
  return applicaPrioritaInventario(pool,await livelliPrioritaInventario());
}
function firmaPastoDaRicette(ricette){
  return (ricette||[]).map(r=>r.id).sort().join('||');
}
function pastoCompletoPerToken(ricette,token,portionConfig){
  const coperture=(ricette||[]).map(copertura);
  const proteina=coperture.some(c=>c.tokens.has(token));
  const carboidrato=coperture.some(c=>c.C);
  const verdura=coperture.some(c=>c.V)||(portionConfig&&coperturaVerduraRicette(ricette,portionConfig).coperturaCompleta);
  return !!(proteina&&carboidrato&&verdura);
}
function ingredienteVerduraQuantificabile(i){
  if(!i||i.condimento||i.categoria==='Condimenti'||!(Number(i.grammi)>0))return false;
  const gruppi=Array.isArray(i.gruppo)?i.gruppo:[i.gruppo];
  return i.macro==='verdura'||gruppi.includes('verdura');
}
function tipoPorzioneVerdura(i){
  const meta=metaIngrediente(i&&i.nome)||{};
  const porzione=Number(i&&i.porzione)||Number(meta.porzione);
  return porzione>0&&porzione<=100?'salad':'vegetable';
}
function righeCoperturaVerdura(ricette,escludiRicettaId){
  const out=[];
  for(const r of ricette||[]){
    if(escludiRicettaId&&r.id===escludiRicettaId)continue;
    const ruoli=ruoliVerduraDaClasse(r.classe);
    const ruolo=ruoli.V?'V':(ruoli.S?'S':(ruoli.G?'G':null));
    for(const i of r.ingredienti||[])if(ingredienteVerduraQuantificabile(i))out.push({kind:tipoPorzioneVerdura(i),quantity:Number(i.grammi)||0,ruolo});
  }
  return out;
}
function coperturaVerduraRicette(ricette,portionConfig){
  const cfg=Object.assign({vegetablePortionGrams:200,saladPortionGrams:70},portionConfig||{});
  const righe=righeCoperturaVerdura(ricette);
  const frazioni=N.vegetableCoverage(righe,cfg);
  const riferimento=righe.length&&righe.every(r=>r.kind==='salad')?'salad':'vegetable';
  const richiestaGrammi=riferimento==='salad'?Number(cfg.saladPortionGrams):Number(cfg.vegetablePortionGrams);
  const grammi={V:0,S:0,G:0};
  const grammiReali={V:0,S:0,G:0};
  for(const riga of righe){
    if(!Object.prototype.hasOwnProperty.call(grammi,riga.ruolo))continue;
    const reali=Math.max(0,Number(riga.quantity)||0);
    const porzioneRiga=riga.kind==='salad'?Number(cfg.saladPortionGrams):Number(cfg.vegetablePortionGrams);
    grammiReali[riga.ruolo]+=reali;
    if(porzioneRiga>0)grammi[riga.ruolo]+=(reali/porzioneRiga)*richiestaGrammi;
  }
  const bilancio=calcolaBilancioVSG({
    richiestaGrammi,
    grammiV:grammi.V,
    grammiS:grammi.S,
    grammiG:grammi.G
  });
  return Object.assign({},frazioni,bilancio,{
    tipoPorzioneRichiesta:riferimento,
    grammiRealiPerRuolo:grammiReali
  });
}
function ridimensionaVerdureRicetta(ricetta,frazioneRichiesta,portionConfig){
  const copia=clone(ricetta),cfg=portionConfig||{};
  const righe=righeCoperturaVerdura([copia]);
  const corrente=N.vegetableCoverage(righe,cfg).rawFraction;
  if(!(corrente>0))return copia;
  const fattore=Math.max(0,Number(frazioneRichiesta)||0)/corrente;
  for(const i of copia.ingredienti||[]){
    if(!ingredienteVerduraQuantificabile(i))continue;
    i.quantita=(Number(i.quantita)||0)*fattore;
    i.grammi=(Number(i.grammi)||0)*fattore;
    i.overrideQuantita='residuo_verdura';
  }
  copia.nutrienti=calcolaNutrienti(copia.ingredienti||[]);
  copia.nutrizioneManualeTotale={kcal:copia.nutrienti.kcal,prot:copia.nutrienti.proteine,carb:copia.nutrienti.carboidrati,grassi:copia.nutrienti.grassi};
  copia.residuoVerdura={frazione:Number(frazioneRichiesta)||0,fattoreApplicato:fattore};
  return copia;
}
function indiceSettimana(data){
  const d=new Date(String(data)+'T12:00:00');
  return Number.isNaN(d.getTime())?0:(d.getDay()+6)%7;
}
function punteggioVerduraProgrammazione(r,data,variantiPrioritarie){
  const indice=indiceSettimana(data),verdure=(r.ingredienti||[]).filter(ingredienteVerduraQuantificabile);
  if(!verdure.length)return -999;
  if(variantiPrioritarie&&variantiPrioritarie.size&&verdure.some(i=>variantiPrioritarie.has(i.variantId))) return 1000;
  const livelli={alta:0,media:1,bassa:2};
  const livello=verdure.map(i=>livelli[i.deperibilita]===undefined?1:livelli[i.deperibilita]).reduce((a,b)=>Math.min(a,b),Infinity);
  const preferito=indice<=2?0:(indice<=4?1:2);
  return -Math.abs(livello-preferito)*10-livello;
}
function ordinaVerdureProgrammazione(pool,data,variantiPrioritarie){
  return (pool||[]).slice().sort((a,b)=>punteggioVerduraProgrammazione(b,data,variantiPrioritarie)-punteggioVerduraProgrammazione(a,data,variantiPrioritarie));
}
function prioritaVerdureProgrammazionePasti(candidati,data,variantiPrioritarie){
  if(!(candidati||[]).length)return candidati||[];
  const indice=indiceSettimana(data),preferito=indice<=2?0:(indice<=4?1:2),livelli={alta:0,media:1,bassa:2};
  const score=c=>{
    const verdure=(c.ricette||[]).flatMap(r=>(r.ingredienti||[]).filter(ingredienteVerduraQuantificabile));
    if(!verdure.length)return -999;
    if(variantiPrioritarie&&variantiPrioritarie.size&&verdure.some(i=>variantiPrioritarie.has(i.variantId))) return 1000;
    return -verdure.reduce((s,i)=>s+Math.abs((livelli[i.deperibilita]===undefined?1:livelli[i.deperibilita])-preferito),0)/verdure.length;
  };
  /* Math.max(...array) va in stack overflow su array molto grandi (verificato
     oltre le ~100mila voci). reduce() e' equivalente ma sempre sicuro,
     qualunque sia la dimensione di candidati. */
  const max=candidati.map(score).reduce((a,b)=>Math.max(a,b),-Infinity);
  return candidati.filter(c=>score(c)===max);
}
function completaResiduoVerduraRicette(ricette,pool,data,portionConfig,variantiPrioritarie){
  let out=(ricette||[]).slice();
  const totale=coperturaVerduraRicette(out,portionConfig);
  let dedicata=out.find(r=>{const c=copertura(r);return c.V&&!c.C&&!c.P&&righeCoperturaVerdura([r]).length;});
  if(totale.residuoGrammi>0&&totale.residuoGrammi<50){
    if(!(totale.grammiS>0&&totale.grammiG>0)){
      /* Caso strutturale raro (una proteina con sola G abbinata a un
         carboidrato senza S, o viceversa): la redistribuzione richiede
         entrambi i ruoli e qui non sono presenti insieme. Non si blocca la
         generazione - il residuo resta scoperto e si segnala soltanto,
         invece di lanciare un'eccezione che ferma l'intero pasto. */
      return out.map(r=>Object.assign(clone(r),{avvisoResiduoVerdura:true}));
    }
    const meta={
      strategia:'redistribuzione_sg',
      residuoOriginaleGrammi:totale.residuoGrammi,
      incrementoSGrammi:totale.residuoGrammi/2,
      incrementoGGrammi:totale.residuoGrammi/2
    };
    for(const ruolo of ['S','G']){
      const corrente=ruolo==='S'?totale.grammiS:totale.grammiG;
      const incremento=totale.residuoGrammi/2;
      const fattore=(corrente+incremento)/corrente;
      out=out.map(r=>{
        if(!ruoliVerduraDaClasse(r.classe)[ruolo])return r;
        const copia=clone(r);
        for(const i of copia.ingredienti||[]){
          if(!ingredienteVerduraQuantificabile(i))continue;
          i.quantita=(Number(i.quantita)||0)*fattore;
          i.grammi=(Number(i.grammi)||0)*fattore;
          i.overrideQuantita='redistribuzione_'+ruolo.toLowerCase();
        }
        copia.nutrienti=calcolaNutrienti(copia.ingredienti||[]);
        copia.nutrizioneManualeTotale={kcal:copia.nutrienti.kcal,prot:copia.nutrienti.proteine,carb:copia.nutrienti.carboidrati,grassi:copia.nutrienti.grassi};
        copia.redistribuzioneVerdura=clone(meta);
        return copia;
      });
    }
    return out;
  }
  if(totale.remainingFraction<=0&&!dedicata)return out;
  if(totale.remainingFraction<=0&&dedicata&&Math.abs(totale.rawFraction-1)<0.000001)return out;
  if(!dedicata){
    dedicata=ordinaVerdureProgrammazione((pool||[]).filter(r=>{const c=copertura(r);return c.V&&!c.C&&!c.P&&righeCoperturaVerdura([r]).length&&!out.some(x=>x.id===r.id);}),data,variantiPrioritarie)[0]||null;
    if(dedicata)out.push(dedicata);
  }
  if(!dedicata)return out;
  const altre=N.vegetableCoverage(righeCoperturaVerdura(out,dedicata.id),portionConfig);
  const frazioneDedicata=Math.max(0,1-altre.coveredFraction);
  if(frazioneDedicata<=0)return out.filter(r=>r.id!==dedicata.id);
  out=out.map(r=>r.id===dedicata.id?ridimensionaVerdureRicetta(r,frazioneDedicata,portionConfig):r);
  return out;
}
function risultatoPasto(token,ricette,prioritaComposizione,avviso,portionConfig){
  const out={
    targetToken:token,
    prioritaComposizione:Number(prioritaComposizione)||0,
    firmaPasto:firmaPastoDaRicette(ricette),
    realizzazioni:realizzazioniDaRicette(ricette),
    ricette
  };
  if(portionConfig)out.bilancioVerdura=coperturaVerduraRicette(ricette,portionConfig);
  if(avviso)out.avviso=avviso;
  return out;
}
function accumulaConteggiPasto(ricette,ingredientCounts,subtypeCounts){
  const ingredientIds=new Set(),subtypes=new Set();
  for(const r of ricette||[])for(const i of r&&r.ingredienti||[]){if(i.ingredienteId)ingredientIds.add(i.ingredienteId);if(i.sottotipo&&['carne_rossa','affettati','pesce_grande','pesce_conservato'].includes(i.sottotipo))subtypes.add(i.sottotipo);}
  for(const id of ingredientIds)ingredientCounts[id]=(Number(ingredientCounts[id])||0)+1;
  for(const st of subtypes)subtypeCounts[st]=(Number(subtypeCounts[st])||0)+1;
}
function ricetteDaIds(ids){return uniq(ids||[]).map(id=>state.ricetteById.get(id)).filter(Boolean);}
function ricetteDaVocePiano(voce){return ricetteDaIds((voce&&voce.realizzazioni||[]).map(x=>x&&x.ricettaId).filter(Boolean));}
function macroProteicaRicette(ricette){for(const r of ricette||[])for(const token of copertura(r).proteinTokens){const found=Object.keys(PROTEIN_MACRO_TO_TOKEN).find(k=>PROTEIN_MACRO_TO_TOKEN[k]===token);if(found)return found;}return null;}
function macroProteicheRicette(ricette){
  const out=new Set();
  for(const r of ricette||[])for(const token of copertura(r).proteinTokens){
    const found=Object.keys(PROTEIN_MACRO_TO_TOKEN).find(k=>PROTEIN_MACRO_TO_TOKEN[k]===token);
    if(found)out.add(found);
  }
  return out;
}
function carbPrincipaleRicette(ricette){for(const r of ricette||[]){const keys=carbKeysRicetta(r);if(keys.length)return keys[0];}return null;}
function pastoRispettaConteggi(ricette,cfg,ingredientCounts,subtypeCounts){
  const nextIngredients=Object.assign({},ingredientCounts),nextSubtypes=Object.assign({},subtypeCounts);accumulaConteggiPasto(ricette,nextIngredients,nextSubtypes);
  for(const [id,n] of Object.entries(nextIngredients)){const rule=cfg.vincoli[id];if(rule&&rule.max!==null&&rule.max!==undefined&&n>Number(rule.max))return false;}
  for(const [st,n] of Object.entries(nextSubtypes)){const cap=cfg.weeklyLimits[st];if(cap!==null&&cap!==undefined&&n>Number(cap))return false;}
  return true;
}
async function generaCandidatiPasto(target,data,opts){
  opts=opts||{};
  const variantiPrioritarie=opts.usaInventario?new Set():await variantiPrioritarieDeperimento();
  const token=PROTEIN_MACRO_TO_TOKEN[target]||SUBTYPE_TO_TOKEN[target]||target;
  const exclude=new Set(opts.excludeRecipeIds||[]);
  const pool=(await poolAmmesso(data,opts)).filter(r=>!exclude.has(r.id));
  let prot=pool.filter(r=>copertura(r).tokens.has(token));
  if(!prot.length) return [];

  /* Ordine funzionale: prima una ricetta che copre insieme la proteina e il
     carboidrato richiesto; se non esiste, proteina e carboidrato separati.
     Nessuna alternativa viene eliminata solo perché copre meno caselle. */
  prot.sort((a,b)=>Number(copertura(b).C)-Number(copertura(a).C)||scoreCopertura(b,token)-scoreCopertura(a,token));

  const livelli=opts.usaInventario?await livelliPrioritaInventario():[];
  if(opts.usaInventario)prot=applicaPrioritaInventario(prot,livelli);

  const risultati=[];
  const firme=new Set();

  for(const primo of prot){
    let carbChoices=[null],carboidratoForzato=false;
    if(!copertura(primo).C){
      let carb=pool.filter(r=>copertura(r).C&&!copertura(r).P&&r.id!==primo.id);
      if(opts.usaInventario)carb=applicaPrioritaInventario(carb,livelli);
      if(carb.length){
        carbChoices=carb;
      }else{
        /* Layer 2b: nessuna fonte C compatibile con la programmazione/budget
           indicativo del giorno. La tabella carboidrati e' indicativa per
           dare varieta', NON vincolante: si ignora qui SOLO carbRicettaAmmesso
           (continuita' con quanto gia' programmato). I vincoli duri restano
           intatti: ricettaAmmessa(r,data,opts) applica comunque tetti
           settimanali sui carboidrati limitati, allergie ed esclusioni
           cliniche, che non vanno MAI bypassati. Si marca il candidato con
           un avviso per l'utente.

           IMPORTANTE: il campione va limitato (max 8, come una normale pool
           di carboidrati compatibili) e non lasciato a tutto il catalogo -
           con molte proteine candidate in parallelo, ogni proteina x tutto
           il catalogo forzato produce un'esplosione combinatoria reale
           (verificato: 140.548 candidati con ~260 proteine x 540 ricette),
           che manda in stack overflow prioritaVerdureProgrammazionePasti
           (Math.max su spread di un array enorme). */
        let forzata=[];
        for(const r of state.ricetteConcrete){
          if(copertura(r).C&&!copertura(r).P&&r.id!==primo.id&&await ricettaAmmessa(r,data,opts)){
            forzata.push(r);
            if(forzata.length>=40)break; /* campione sufficiente da cui scegliere, mai tutto il catalogo */
          }
        }
        forzata=ordinaPerStackPoiCaso(forzata,new Set()).slice(0,8);
        if(opts.usaInventario)forzata=applicaPrioritaInventario(forzata,livelli);
        carbChoices=forzata.length?forzata:[null];
        carboidratoForzato=forzata.length>0;
      }
    }

    for(const carb of carbChoices){
      const base=[primo].concat(carb?[carb]:[]);
      if(carb&&!composizioneSeparataConsentita(primo,carbKeysRicetta(carb)[0]))continue;
      const haV=base.some(r=>copertura(r).V);
      const bilancioBase=coperturaVerduraRicette(base,opts.vegetablePortions);
      let vegChoices=[null];

      if(!haV&&bilancioBase.residuoGrammi>=50){
        /* Stesso principio del campione forzato sui carboidrati (Layer 2b,
           poco sopra): senza un tetto, ogni combinazione proteina+carboidrato
           viene moltiplicata per l'intero pool di verdure compatibili. Con
           ~2000 combinazioni P+C e ~40 verdure compatibili il prodotto supera
           le 80.000 iterazioni, ognuna clonata in memoria come pasto completo
           (verificato: ~900MB e 12-17s per una singola rigenerazione). Si
           campiona quindi un numero gestibile di verdure, mai tutto il pool. */
        let veg=pool.filter(r=>copertura(r).V&&!copertura(r).P&&!base.some(x=>x.id===r.id));
        veg=ordinaPerStackPoiCaso(veg,new Set()).slice(0,8);
        if(opts.usaInventario)veg=applicaPrioritaInventario(veg,livelli);
        vegChoices=veg.length?veg:[null];
      }

      for(const veg of vegChoices){
        let ricette=base.concat(veg?[veg]:[]);
        const bilancioPrimaDelResiduo=coperturaVerduraRicette(ricette,opts.vegetablePortions);
        if(bilancioPrimaDelResiduo.residuoGrammi>0&&bilancioPrimaDelResiduo.residuoGrammi<50&&!(bilancioPrimaDelResiduo.grammiS>0&&bilancioPrimaDelResiduo.grammiG>0))continue;
        ricette=completaResiduoVerduraRicette(ricette,pool,data,opts.vegetablePortions,variantiPrioritarie);
        if(!pastoCompletoPerToken(ricette,token,opts.vegetablePortions)) continue;
        if(coperturaVerduraRicette(ricette,opts.vegetablePortions).remainingFraction>0.000001)continue;
        if(opts.requiredVegetableVariantId&&!ricette.some(r=>(r.ingredienti||[]).some(i=>i.variantId===opts.requiredVegetableVariantId)))continue;
        const firma=firmaPastoDaRicette(ricette);
        if(firme.has(firma)) continue;
        firme.add(firma);
        if(opts.runtimeConfig&&opts.weeklyIngredientCounts&&opts.weeklySubtypeCounts&&!pastoRispettaConteggi(ricette,opts.runtimeConfig,opts.weeklyIngredientCounts,opts.weeklySubtypeCounts))continue;
        risultati.push(risultatoPasto(token,ricette,copertura(primo).C?0:1,carboidratoForzato?'Ricetta per carboidrato definito non disponibile':null,opts.vegetablePortions));
      }
    }
  }
  return risultati;
}
async function contestoConteggiSettimana(giorno){
  const runtimeConfig=await configRuntime();
  const weeklyIngredientCounts={},weeklySubtypeCounts={},weeklyStackKeys=new Set(),weeklyCarbCounts={},carboidratoGiorno=new Map();
  const registraCarboGiorno=(g,chiave)=>{if(!chiave||!g)return;if(!carboidratoGiorno.has(g))carboidratoGiorno.set(g,new Set());carboidratoGiorno.get(g).add(chiave);};
  if(typeof getAll==='function'){
    const settimana=startOfWeekISO(new Date((giorno||isoDate(new Date()))+'T12:00:00'));
    const [log,piano]=await Promise.all([getAll('consumoGiorno'),getAll('piano')]);
    for(const row of log||[]){
      if(startOfWeekISO(new Date((row.giorno||'')+'T12:00:00'))!==settimana)continue;
      const rr=ricetteDaIds(row.ricettaIds||[]);
      accumulaConteggiPasto(rr,weeklyIngredientCounts,weeklySubtypeCounts);
      rr.flatMap(r=>r.chiaviStack||[]).forEach(k=>weeklyStackKeys.add(k));
      const carb=row.carboidratoPianificato||carbPrincipaleRicette(rr);
      if(carb){weeklyCarbCounts[carb]=(weeklyCarbCounts[carb]||0)+1;registraCarboGiorno(row.giorno,carb);}
    }
    for(const voce of piano||[]){
      const giornoVoce=String(voce.id||'').slice(0,10);
      if(!giornoVoce||startOfWeekISO(new Date(giornoVoce+'T12:00:00'))!==settimana)continue;
      const rr=ricetteDaVocePiano(voce);
      accumulaConteggiPasto(rr,weeklyIngredientCounts,weeklySubtypeCounts);
      rr.flatMap(r=>r.chiaviStack||[]).forEach(k=>weeklyStackKeys.add(k));
      const carb=voce.carboidratoPianificato||carbPrincipaleRicette(rr);
      if(carb){weeklyCarbCounts[carb]=(weeklyCarbCounts[carb]||0)+1;registraCarboGiorno(giornoVoce,carb);}
    }
  }
  return {runtimeConfig,weeklyIngredientCounts,weeklySubtypeCounts,weeklyStackKeys,weeklyCarbCounts,carboidratoGiorno,variantiPrioritarie:await variantiPrioritarieDeperimento()};
}
/* Risolve UN singolo slot pasto su richiesta (fuori dal flusso di generazione
   settimanale in blocco), con la stessa costruzione sequenziale P->C->V
   usata dalla settimana. target = token proteico/gruppo richiesto (es.
   'PC','PP','carne'...). opzioni.carbKey forza un carboidrato specifico;
   altrimenti si prova l'intero pool AUTO ammesso, in ordine casuale, coerente
   con carboidratiCandidatiSlot. */
async function risolviSlotSingolo(giorno,pasto,target,opzioni){
  opzioni=opzioni||{};
  const resolved=await caricaConfigurazioneNutrizionaleRisolta();
  if(!resolved.valid)return null;
  const ctx=await contestoConteggiSettimana(giorno);
  ctx.vegetablePortions=resolved.vegetables;
  const auto=(resolved.carbohydrates&&resolved.carbohydrates.autoEligibleKeys||[]).slice();
  const carbCandidati=opzioni.carbKey?[opzioni.carbKey]:mescolaValori(auto,Math.random);
  if(!carbCandidati.length)return null;
  ctx.requiredVegetableVariantId=opzioni.requiredVegetableVariantId!==undefined?opzioni.requiredVegetableVariantId:(typeof verduraRicorrenteRichiesta==='function'?await verduraRicorrenteRichiesta(giorno,pasto):null);
  ctx.todayStackKeys=new Set();
  const token=PROTEIN_MACRO_TO_TOKEN[target]||SUBTYPE_TO_TOKEN[target]||target;
  const pool=await poolAmmesso(giorno,{runtimeConfig:ctx.runtimeConfig});
  const candidato=await costruisciPastoSequenziale(token,giorno,carbCandidati,pool,ctx);
  return candidato;
}
async function generaPasto(target,data,opts){
  let candidati=await generaCandidatiPasto(target,data,opts||{});
  if(!(opts&&opts.usaInventario))candidati=prioritaVerdureProgrammazionePasti(candidati,data,await variantiPrioritarieDeperimento());
  const scelto=scegliCandidatoConMargine(candidati,opts||{});
  return scelto?await assegnaCondimentiRotazioneGlobale(scelto,data):null;
}

function chiaviStackPasto(candidato){
  return uniq((candidato&&candidato.ricette||[]).flatMap(r=>r.chiaviStack||[]));
}
function chiaviGiornoRicetta(r){
  /* Come chiaviStack, ma SENZA esclusioni di categoria (chiaviStack esclude
     apposta C e V, che servono al cooldown settimanale per motivi diversi -
     qui serve invece sapere, per QUALSIASI categoria, cosa e' gia' stato
     messo nel menu OGGI, cosi' da non ripeterlo nello stesso giorno. */
  const keys=[];
  for(const i of (r&&r.ingredienti||[])) if(i&&i.nome) keys.push('i:'+(i.categoria||'')+':'+i.nome);
  return uniq(keys);
}
function chiaviGiornoPasto(candidato){
  return uniq((candidato&&candidato.ricette||[]).flatMap(r=>chiaviGiornoRicetta(r)));
}
function aggiungiConteggiCandidato(candidato,ingredientCounts,subtypeCounts){
  const nextI=Object.assign({},ingredientCounts),nextS=Object.assign({},subtypeCounts);
  accumulaConteggiPasto(candidato.ricette,nextI,nextS);
  return {ingredientCounts:nextI,subtypeCounts:nextS};
}
function mescolaCandidati(pool){
  const out=(pool||[]).slice();
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function ordinaPerStackPoiCaso(pool,stackUsati){
  const casuali=mescolaCandidati(pool),score=r=>(r.chiaviStack||[]).filter(k=>stackUsati.has(k)).length;
  return casuali.sort((a,b)=>score(a)-score(b));
}
function componiBasiProteinaCarboidrato(proteine,fontiCarboidrato){
  const out=[],fonti=fontiCarboidrato||[];
  let indiceFonte=0;
  for(const proteina of proteine||[]){
    if(copertura(proteina).C){out.push([proteina]);continue;}
    if(fonti.length){out.push([proteina,fonti[indiceFonte%fonti.length]]);indiceFonte++;}
  }
  return out;
}
/* Costruzione sequenziale di un singolo pasto: una proteina, un tentativo
   di carboidrato alla volta (mai un incrocio esaustivo di pool indipendenti
   - vietato dalla specifica, sezione 6). Ogni proteina candidata viene
   provata in ordine; per ciascuna si cerca prima una ricetta che copra
   gia' proteina+carboidrato insieme, poi una coppia proteina separata +
   carboidrato separato fra i candidati ammessi in ordine di priorita', poi
   in ultima istanza la sola proteina. La prima combinazione che chiude con
   una verdura valida e rispetta i conteggi settimanali vince: nessuna
   enumerazione delle alternative scartate. */
async function chiudiPastoConVerdura(base,token,giorno,pool,ctx){
  const ricette=completaResiduoVerduraRicette(base,pool,giorno,ctx.vegetablePortions,ctx.variantiPrioritarie);
  if(!pastoCompletoPerToken(ricette,token,ctx.vegetablePortions))return null;
  if(ctx.requiredVegetableVariantId&&!ricette.some(r=>(r.ingredienti||[]).some(i=>i.variantId===ctx.requiredVegetableVariantId)))return null;
  if(ctx.forbiddenProteinMacros&&[...macroProteicheRicette(ricette)].some(k=>ctx.forbiddenProteinMacros.has(k)))return null;
  if(!pastoRispettaConteggi(ricette,ctx.runtimeConfig,ctx.weeklyIngredientCounts,ctx.weeklySubtypeCounts))return null;
  /* Il pasto si chiude qui, per intero, in un solo passaggio: la
     rotazione condimento fa parte della chiusura, non un passaggio
     successivo che riapre un pasto gia' considerato completo. La
     rotazione puo' spostare i grammi di S/G di una ricetta (varianti
     diverse hanno quantita' diverse) e rompere una copertura V appena
     validata sopra: si ricontrolla qui, subito, sulla forma finale. Se
     non regge, questa combinazione non era valida e si scarta - il
     chiamante (costruisciPastoSequenziale) prova gia' la prossima
     proteina/carboidrato candidato nello stesso ciclo, senza alcun
     nuovo meccanismo di ripetizione. */
  let risultato=await assegnaCondimentiRotazioneGlobale(risultatoPasto(token,ricette,0,null,ctx.vegetablePortions),giorno);
  risultato.realizzazioni=await normalizzaRealizzazioniVerdura(risultato.realizzazioni,giorno,ctx.vegetablePortions);
  risultato.bilancioVerdura=await bilancioVerduraDaRealizzazioni(risultato.realizzazioni,ctx.vegetablePortions);
  if(!risultato.bilancioVerdura.coperturaCompleta)return null;
  return risultato;
}
async function costruisciPastoSequenziale(token,giorno,carbCandidati,pool,ctx){
  const oggi=ctx.todayStackKeys||new Set();
  const usataOggi=r=>chiaviGiornoRicetta(r).some(k=>oggi.has(k));
  let proteine=pool.filter(r=>copertura(r).tokens.has(token)&&!usataOggi(r));
  if(!proteine.length)proteine=pool.filter(r=>copertura(r).tokens.has(token));
  proteine=ordinaPerStackPoiCaso(proteine,ctx.weeklyStackKeys);
  /* Salvafrigo (ctx.livelliInventario presente): a parita' di token, le
     ricette che usano scorte urgenti/avanzi/freezer vengono provate prima -
     stesso meccanismo a livelli di applicaPrioritaInventario gia' usato nel
     resto del motore, qui applicato al pool proteico e a ciascun pool
     carboidrato candidato. Nessun effetto quando assente (settimana,
     rigenerazione ordinaria). */
  if(ctx.livelliInventario)proteine=applicaPrioritaInventario(proteine,ctx.livelliInventario);

  for(const proteina of proteine){
    if(copertura(proteina).C){
      const chiave=carbKeysRicetta(proteina).find(k=>carbCandidati.includes(k));
      if(!chiave)continue;
      const esito=await chiudiPastoConVerdura([proteina],token,giorno,pool,ctx);
      if(esito)return Object.assign(esito,{carbKeyUsato:chiave,avviso:null});
      continue;
    }
    for(const chiave of carbCandidati){
      if(!composizioneSeparataConsentita(proteina,chiave))continue;
      let carboScelte=ordinaPerStackPoiCaso(pool.filter(r=>copertura(r).C&&!copertura(r).P&&carbKeysRicetta(r).includes(chiave)),ctx.weeklyStackKeys);
      if(ctx.livelliInventario)carboScelte=applicaPrioritaInventario(carboScelte,ctx.livelliInventario);
      if(!carboScelte.length)continue;
      const esito=await chiudiPastoConVerdura([proteina,carboScelte[0]],token,giorno,pool,ctx);
      if(esito)return Object.assign(esito,{
        carbKeyUsato:chiave,
        avviso:chiave!==carbCandidati[0]?('Carboidrato '+carbCandidati[0]+' non disponibile per questa proteina: usato '+chiave+' al suo posto.'):null
      });
    }
    /* Nessun carboidrato fra i candidati e' compatibile con questa
       proteina: si procede senza, invece di bloccare il pasto o forzare
       una combinazione incompatibile. Segnalato con avviso per capire
       quali ricette mancano nel catalogo. */
    const esito=await chiudiPastoConVerdura([proteina],token,giorno,pool,ctx);
    if(esito)return Object.assign(esito,{carbKeyUsato:null,avviso:'Nessun carboidrato compatibile trovato per questa proteina in questo pasto.'});
  }
  return null;
}

function mescolaValori(valori,rng){
  const out=(valori||[]).slice();rng=rng||Math.random;
  for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function targetTabellaPerSlot(tab,slot){
  const riga=tab&&tab['giorno_'+slot.di];
  return Array.isArray(riga)?riga[slot.pasto==='pranzo'?0:1]||null:null;
}
function contaTargetTabellaFuturi(tab,slots,daIndice){
  const out={};
  for(let i=daIndice;i<slots.length;i++){
    const target=targetTabellaPerSlot(tab,slots[i]);
    if(target)out[target]=(out[target]||0)+1;
  }
  return out;
}
function opzioniProteinaPerSlot(resolved,tab,slots,indice,counts,usateGiorno,rng){
  const slot=slots[indice],freq=resolved.proteinFrequencies||{};
  const forbidden=new Set(resolved.profile&&resolved.profile.forbiddenProteinMacros||[]);
  const allowed=Object.keys(freq).filter(k=>!forbidden.has(k)&&freq[k].max!==0);
  /* "Fonti proteiche/giorno" (Configurazione nutrizionista) impostato a 1
     significa: un solo giorno, una sola categoria per entrambi i pasti -
     non "al massimo due", ma esattamente una. A 2 (default) resta la
     regola di sempre: mai la stessa categoria due volte nello stesso
     giorno. Va rispettato sia quando la cella e' fissata a mano in
     tabella sia quando la sceglie il motore per le celle libere. */
  const unaSolaFonteAlGiorno=Number(resolved.maxProteinSourcesPerDay)===1;
  const fissata=targetTabellaPerSlot(tab,slot);
  if(fissata){
    if(!allowed.includes(fissata))return {errors:['Proteina '+fissata+' non ammessa per '+slot.day+' '+slot.pasto+'.'],targets:[]};
    if(!unaSolaFonteAlGiorno&&usateGiorno.has(fissata))return {errors:['La tabella proteine assegna due volte '+fissata+' nello stesso giorno ('+slot.day+').'],targets:[]};
    if(unaSolaFonteAlGiorno&&usateGiorno.size&&!usateGiorno.has(fissata))return {errors:['La tabella proteine assegna due categorie diverse per '+slot.day+', ma il piano ammette una sola fonte proteica al giorno.'],targets:[]};
    const max=freq[fissata].max;
    if(max!==null&&max!==undefined&&(Number(counts[fissata])||0)>=Number(max))return {errors:['Proteina '+fissata+' oltre il massimo settimanale.'],targets:[]};
    return {errors:[],targets:[fissata]};
  }
  if(unaSolaFonteAlGiorno&&usateGiorno.size){
    const oggi=[...usateGiorno][0];
    if(!allowed.includes(oggi))return {errors:['Nessuna classe proteica ammessa per '+slot.day+' '+slot.pasto+' (la fonte gia\' usata oggi non e\' piu\' disponibile).'],targets:[]};
    const max=freq[oggi].max;
    if(max!==null&&max!==undefined&&(Number(counts[oggi])||0)>=Number(max))return {errors:['Proteina '+oggi+' oltre il massimo settimanale.'],targets:[]};
    return {errors:[],targets:[oggi]};
  }
  const prenotate=contaTargetTabellaFuturi(tab,slots,indice+1);
  let pool=allowed.filter(k=>{
    if(usateGiorno.has(k))return false;
    const max=freq[k].max;
    return max===null||max===undefined||(Number(counts[k])||0)+1+(Number(prenotate[k])||0)<=Number(max);
  });
  if(!pool.length&&allowed.length>3)return {errors:['Nessuna classe proteica distinta e ammessa per '+slot.day+' '+slot.pasto+'.'],targets:[]};
  if(!pool.length)pool=allowed.filter(k=>{
    const max=freq[k].max;
    return max===null||max===undefined||(Number(counts[k])||0)+1+(Number(prenotate[k])||0)<=Number(max);
  });
  if(!pool.length)return {errors:['Nessuna classe proteica ammessa per '+slot.day+' '+slot.pasto+'.'],targets:[]};
  const sottoMinimo=pool.filter(k=>(Number(counts[k])||0)+(Number(prenotate[k])||0)<(Number(freq[k].min)||0));
  if(sottoMinimo.length)pool=sottoMinimo;
  return {errors:[],targets:mescolaValori(pool,rng)};
}
function residuiCarboidratiFissi(resolved,seedCounts){
  const out={},errors=[];
  for(const [key,n] of Object.entries(resolved.carbohydrates&&resolved.carbohydrates.fixedCounts||{})){
    const residuo=Number(n)-(Number(seedCounts&&seedCounts[key])||0);
    if(residuo<0)errors.push('Il piano preservato supera il numero fisso di '+key+'.');
    out[key]=Math.max(0,residuo);
  }
  return {remaining:out,errors};
}
function carboidratiCandidatiSlot(resolved,residui,slotsRimasti,cooldownEsclusi,rng){
  /* Due meccanismi distinti, non vanno confusi:
     - i fissi (tetto PDF 0-2/settimana: gnocchi, pasta ripiena, gallette,
       crackers, friselle, taralli/grissini/crostini, piadina, sfoglia)
       restano legati al loro conteggio settimanale, invariato;
     - i carboidrati AUTO (senza tetto) qui in piu' rispettano un cooldown
       di un giorno: lo stesso cereale non ricompare lo stesso giorno ne'
       il giorno successivo, cosi' da evitare sia la ridondanza pranzo/cena
       sia sequenze di piu' giorni consecutivi con lo stesso carboidrato. */
  const fissi=Object.keys(residui).filter(k=>residui[k]>0),totaleFissi=fissi.reduce((s,k)=>s+residui[k],0);
  const auto=(resolved.carbohydrates&&resolved.carbohydrates.autoEligibleKeys||[]).slice();
  if(totaleFissi>=slotsRimasti)return mescolaValori(fissi,rng);
  const autoEleggibile=auto.filter(k=>!cooldownEsclusi.has(k));
  /* Se il cooldown esaurisce tutte le voci AUTO (catalogo con pochi
     cereali distinti), si riapre l'intero pool invece di bloccare il
     pasto: e' un vincolo di varieta', non un vincolo clinico. */
  const base=autoEleggibile.length?autoEleggibile:auto;
  return mescolaValori(fissi.concat(base.filter(k=>!fissi.includes(k))),rng);
}
function validaMinimiProteici(resolved,counts,slotPersi){
  const errors=[],freq=resolved.proteinFrequencies||{},forbidden=new Set(resolved.profile&&resolved.profile.forbiddenProteinMacros||[]);
  let scarto=0;
  for(const [key,rule] of Object.entries(freq))if(!forbidden.has(key)&&rule.max!==0)scarto+=Math.max(0,(Number(rule.min)||0)-(Number(counts[key])||0));
  if(scarto>slotPersi){
    for(const [key,rule] of Object.entries(freq)){
      if(forbidden.has(key)||rule.max===0)continue;
      const manca=Math.max(0,(Number(rule.min)||0)-(Number(counts[key])||0));
      if(manca)errors.push('Minimo proteico non raggiunto: '+key+' (mancano '+manca+').');
    }
  }
  return errors;
}
async function risolviSettimanaSequenziale(slotRefs,ctx){
  const scelte=[],slotDefs=[],residuiInfo=residuiCarboidratiFissi(ctx.resolved,ctx.weeklyCarbCounts);
  if(residuiInfo.errors.length)return {ok:false,errori:residuiInfo.errors,completati:0};
  const residui=residuiInfo.remaining,proteineGiorno=ctx.proteineGiorno||new Map();
  /* Un pasto chiude prima che il successivo inizi la propria ricerca -
     mai batch, mai risolutore globale (specifica sezione 6). carboidratoGiorno
     traccia, per ciascun giorno gia' passato, quali chiavi carboidrato sono
     state usate: serve al cooldown di un giorno sulle voci AUTO. */
  const carboidratoGiorno=new Map();
  for(let i=0;i<slotRefs.length;i++){
    const slot=slotRefs[i];
    if(!proteineGiorno.has(slot.day))proteineGiorno.set(slot.day,new Set());
    ctx.todayStackKeys=new Set();
    for(const precedente of slotDefs)if(precedente.day===slot.day)chiaviGiornoPasto(scelte[slotDefs.indexOf(precedente)]).forEach(k=>ctx.todayStackKeys.add(k));

    const proteine=opzioniProteinaPerSlot(ctx.resolved,ctx.tabella,slotRefs,i,ctx.weeklyProteinCounts,proteineGiorno.get(slot.day),ctx.rng);
    if(proteine.errors.length)return {ok:false,errori:proteine.errors,completati:i};

    const cooldownEsclusi=new Set([
      ...(carboidratoGiorno.get(slot.day)||[]),
      ...(carboidratoGiorno.get(addGiorni(slot.day,-1))||[])
    ]);
    const carbCandidati=carboidratiCandidatiSlot(ctx.resolved,residui,slotRefs.length-i,cooldownEsclusi,ctx.rng);
    if(!carbCandidati.length)return {ok:false,errori:['Nessun carboidrato ammesso per '+slot.day+' '+slot.pasto+'.'],completati:i};

    const pool=await poolAmmesso(slot.day,{runtimeConfig:ctx.runtimeConfig});
    const futureFissiGiorno=new Set(slotRefs.slice(i+1).filter(s=>s.day===slot.day).map(s=>targetTabellaPerSlot(ctx.tabella,s)).filter(Boolean));
    let candidato=null,target=null;
    for(const p of proteine.targets){
      const vietate=new Set([...proteineGiorno.get(slot.day)].filter(k=>k!==p));
      for(const k of futureFissiGiorno)if(k!==p)vietate.add(k);
      const token=PROTEIN_MACRO_TO_TOKEN[p]||SUBTYPE_TO_TOKEN[p]||p;
      const ctxPasto=Object.assign({},ctx,{forbiddenProteinMacros:vietate,requiredVegetableVariantId:ctx.requiredVegetable(slot)});
      candidato=await costruisciPastoSequenziale(token,slot.day,carbCandidati,pool,ctxPasto);
      if(candidato){target=p;break;}
    }
    if(!candidato)return {ok:false,errori:['Nessuna composizione valida per '+slot.day+' '+slot.pasto+' rispettando tabella e carboidrati configurati.'],completati:i};

    const definizione=Object.assign({},slot,{target,carbKey:candidato.carbKeyUsato,requiredVegetableVariantId:ctx.requiredVegetable(slot)});
    scelte.push(candidato);slotDefs.push(definizione);
    ctx.weeklyProteinCounts[target]=(ctx.weeklyProteinCounts[target]||0)+1;
    if(candidato.carbKeyUsato){
      if(residui[candidato.carbKeyUsato]>0)residui[candidato.carbKeyUsato]--;
      ctx.weeklyCarbCounts[candidato.carbKeyUsato]=(ctx.weeklyCarbCounts[candidato.carbKeyUsato]||0)+1;
      if(!carboidratoGiorno.has(slot.day))carboidratoGiorno.set(slot.day,new Set());
      carboidratoGiorno.get(slot.day).add(candidato.carbKeyUsato);
    }
    macroProteicheRicette(candidato.ricette).forEach(k=>proteineGiorno.get(slot.day).add(k));
    accumulaConteggiPasto(candidato.ricette,ctx.weeklyIngredientCounts,ctx.weeklySubtypeCounts);
    chiaviStackPasto(candidato).forEach(k=>ctx.weeklyStackKeys.add(k));
    if(typeof ctx.onProgress==='function')ctx.onProgress({completati:i+1,totale:slotRefs.length,giorno:slot.day,pasto:slot.pasto});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  const fissiMancanti=Object.entries(residui).filter(([,n])=>n>0);
  if(fissiMancanti.length)return {ok:false,errori:fissiMancanti.map(([k,n])=>'Carboidrato fisso non collocato: '+k+' (mancano '+n+').'),completati:scelte.length};
  const minimi=validaMinimiProteici(ctx.resolved,ctx.weeklyProteinCounts,Math.max(0,ctx.slotTotaliSettimanaCompleta-slotRefs.length));
  if(minimi.length)return {ok:false,errori:minimi,completati:scelte.length};
  return {ok:true,scelte,slotDefs,completati:scelte.length};
}
async function generaPianoSettimana(scarto,opzioni){
  scarto=Number(scarto)||0; opzioni=opzioni||{};
  if(typeof giorniSettimana!=='function'||typeof put!=='function'||typeof getOne!=='function') throw new Error('index non pronto');
  const days=giorniSettimana(scarto), today=typeof todayISO==='function'?todayISO():isoDate(new Date()),resolved=await caricaConfigurazioneNutrizionaleRisolta();
  if(!resolved.valid)return {generati:[],errori:resolved.errors};
  const slotDaGenerare=[];
  const pastiOggiChiusi=opzioni.pastiOggiChiusi instanceof Set?opzioni.pastiOggiChiusi:new Set();
  for(let di=0;di<days.length;di++){const day=days[di];if(day<today)continue;for(const pasto of ['pranzo','cena']){const old=await getOne('piano',day+'_'+pasto);if(old&&old.bloccata)continue;if(old&&old.consumato)continue;if(day===today&&!old&&pastiOggiChiusi.has(pasto))continue;if(old&&!opzioni.forza&&old.realizzazioni&&old.realizzazioni.length)continue;slotDaGenerare.push({day,di,pasto});}}
  let tab={};
  try{const r=await getOne('impostazioni','tabellaGiornoCategoria');tab=r&&r.valore||{};}catch(e){}
  const runtimeConfig=await configRuntime(),weeklyIngredientCounts={},weeklySubtypeCounts={},weeklyStackKeys=new Set(),generatedIds=new Set(slotDaGenerare.map(x=>x.day+'_'+x.pasto)),seenSlots=new Set(),proteineGiorno=new Map();
  const weeklyProteinCounts={},weeklyCarbCounts={};
  const registraProteinaGiorno=(giorno,macro)=>{if(!macro)return;if(!proteineGiorno.has(giorno))proteineGiorno.set(giorno,new Set());proteineGiorno.get(giorno).add(macro);};
  if(typeof getAll==='function'){
    const daySet=new Set(days),[log,piano]=await Promise.all([getAll('consumoGiorno'),getAll('piano')]);
    for(const row of log||[]){if(!daySet.has(row.giorno))continue;const key=row.giorno+'_'+(row.pasto||''),rr=ricetteDaIds(row.ricettaIds||[]);seenSlots.add(key);accumulaConteggiPasto(rr,weeklyIngredientCounts,weeklySubtypeCounts);rr.flatMap(r=>r.chiaviStack||[]).forEach(k=>weeklyStackKeys.add(k));const macro=row.categoriaTarget||macroProteicaRicette(rr),carb=row.carboidratoPianificato||row.primoCereale||carbPrincipaleRicette(rr);if(macro){weeklyProteinCounts[macro]=(weeklyProteinCounts[macro]||0)+1;registraProteinaGiorno(row.giorno,macro);}if(carb)weeklyCarbCounts[carb]=(weeklyCarbCounts[carb]||0)+1;}
    for(const voce of piano||[]){if(generatedIds.has(voce.id)||seenSlots.has(voce.id))continue;const giorno=String(voce.id||'').slice(0,10);if(!daySet.has(giorno))continue;const rr=ricetteDaVocePiano(voce);seenSlots.add(voce.id);accumulaConteggiPasto(rr,weeklyIngredientCounts,weeklySubtypeCounts);rr.flatMap(r=>r.chiaviStack||[]).forEach(k=>weeklyStackKeys.add(k));const macro=voce.categoriaTarget||macroProteicaRicette(rr),carb=voce.carboidratoPianificato||voce.primoCereale||carbPrincipaleRicette(rr);if(macro){weeklyProteinCounts[macro]=(weeklyProteinCounts[macro]||0)+1;registraProteinaGiorno(giorno,macro);}if(carb)weeklyCarbCounts[carb]=(weeklyCarbCounts[carb]||0)+1;}
  }
  const [vrRec,vrPastiRec]=typeof getOne==='function'?await Promise.all([getOne('impostazioni','verduraRicorrente'),getOne('impostazioni','verduraRicorrentePasti')]):[null,null];
  const vrId=vrRec&&vrRec.valore||null,vrPasti=new Set(vrPastiRec&&Array.isArray(vrPastiRec.valore)?vrPastiRec.valore:[]);
  const variantiPrioritarie=await variantiPrioritarieDeperimento();
  const soluzione=await risolviSettimanaSequenziale(slotDaGenerare,{
    resolved,runtimeConfig,tabella:tab,weeklyIngredientCounts,weeklySubtypeCounts,weeklyStackKeys,
    weeklyProteinCounts,weeklyCarbCounts,proteineGiorno,vegetablePortions:resolved.vegetables,
    variantiPrioritarie,onProgress:opzioni.onProgress,slotTotaliSettimanaCompleta:days.length*2,
    requiredVegetable:s=>vrId&&vrPasti.has(s.pasto+'_'+s.di)?vrId:null
  });
  if(!soluzione.ok){
    /* Niente retry sull'intera settimana: ogni slot ha già esaurito
       deterministicamente tutte le proteine e i carboidrati candidati
       dentro risolviSettimanaSequenziale. Rifare tutto da capo non
       cambia l'esito nella quasi totalità dei casi e moltiplica solo
       l'attesa (fino a 20x su IndexedDB reale) senza risolvere nulla:
       se non c'è una combinazione valida, va segnalato subito e con
       precisione, non nascosto dietro un loop lungo. */
    return {generati:[],errori:soluzione.errori||['Nessuna composizione settimanale valida.']};
  }
  const slotDefs=soluzione.slotDefs;
  const generated=[],records=[];
  for(let si=0;si<slotDefs.length;si++){
      const {day,pasto,target}=slotDefs[si],id=day+'_'+pasto;
      const x=soluzione.scelte[si];
      records.push({
        id,modo:'multi',motoreNuovo:true,realizzazioni:x.realizzazioni,bilancioVerdura:x.bilancioVerdura||null,
        porzioni:1,origine:'motore-nuovo',programmatoIl:new Date().toISOString(),
        categoriaTarget:target,carboidratoPianificato:slotDefs[si].carbKey,
        carboidratoRichiesto:slotDefs[si].carbKey,avvisoProgrammazione:null,
        avvisoCarboidrato:soluzione.scelte[si].avviso||null
      });
      generated.push(id);
  }
  for(const record of records)await put('piano',record);
  return {generati:generated,errori:[],diagnostica:{pastiCompletati:soluzione.completati}};
}

async function verduraRicorrenteRichiesta(giorno,pasto){
  if(typeof getOne!=='function')return null;
  const data=new Date(giorno+'T12:00:00');
  const indiceGiorno=(data.getDay()+6)%7;
  const [scelta,pasti]=await Promise.all([
    getOne('impostazioni','verduraRicorrente'),
    getOne('impostazioni','verduraRicorrentePasti')
  ]);
  const selezionati=new Set(pasti&&Array.isArray(pasti.valore)?pasti.valore:[]);
  return scelta&&scelta.valore&&selezionati.has(pasto+'_'+indiceGiorno)?scelta.valore:null;
}

/* "Proponi nuovo pasto": stessa costruzione sequenziale P->C->V della
   settimana, ma esclude fin da subito soltanto la ricetta P specifica
   gia' nel piano (non l'intera classe) - es. pranzo con "Sogliola ai
   ferri" (PP): la query propone un'altra ricetta PP qualsiasi, con C e V
   ricalcolati da capo (il carboidrato attuale puo' restare se ancora
   compatibile/nel cooldown, o cambiare). Lo storico "proposte gia' viste"
   resta e si estende: ogni pressione esclude anche tutte le proteine gia'
   proposte in questa sessione, non solo quella originale - altrimenti si
   rischia di riproporre la stessa alternativa appena vista. */
async function rigeneraPasto(giorno,pasto,target,opzioni){
  opzioni=opzioni||{};
  const id=giorno+'_'+pasto;
  const old=typeof getOne==='function'?await getOne('piano',id):null;
  target=target||(old&&old.categoriaTarget)||'legumi';
  const token=PROTEIN_MACRO_TO_TOKEN[target]||SUBTYPE_TO_TOKEN[target]||target;

  const ricettaAttualeId=(old&&old.realizzazioni||[]).map(x=>x&&x.ricettaId).find(rid=>rid&&state.ricetteById.has(rid)&&copertura(state.ricetteById.get(rid)).tokens.has(token))||null;
  const chiave='pastoP|'+giorno+'|'+pasto+'|'+target;
  const visti=getPropostaSet(chiave);
  if(ricettaAttualeId)visti.add(ricettaAttualeId);

  const resolved=await caricaConfigurazioneNutrizionaleRisolta();
  if(!resolved.valid)return null;
  const requiredVegetableVariantId=await verduraRicorrenteRichiesta(giorno,pasto);
  const ctx=await contestoConteggiSettimana(giorno);
  ctx.vegetablePortions=resolved.vegetables;
  ctx.requiredVegetableVariantId=requiredVegetableVariantId;
  ctx.todayStackKeys=new Set();

  const cooldownEsclusi=new Set([
    ...(ctx.carboidratoGiorno.get(giorno)||[]),
    ...(ctx.carboidratoGiorno.get(addGiorni(giorno,-1))||[])
  ]);
  const residuiInfo=residuiCarboidratiFissi(resolved,ctx.weeklyCarbCounts);
  if(opzioni.usaInventario)ctx.livelliInventario=await livelliPrioritaInventario();
  const carbCandidati=carboidratiCandidatiSlot(resolved,residuiInfo.remaining,Infinity,cooldownEsclusi,Math.random);

  const pool=(await poolAmmesso(giorno,{runtimeConfig:ctx.runtimeConfig})).filter(r=>!(copertura(r).tokens.has(token)&&visti.has(r.id)));

  let x=await costruisciPastoSequenziale(token,giorno,carbCandidati,pool,ctx);
  if(!x){
    /* Storico esaurito (tutte le proteine di questa classe gia' proposte
       in sessione): si riparte, come per il resto del motore non si
       blocca l'azione dell'utente. */
    azzeraProposte(chiave);
    const poolCompleto=await poolAmmesso(giorno,{runtimeConfig:ctx.runtimeConfig});
    x=await costruisciPastoSequenziale(token,giorno,carbCandidati,poolCompleto,ctx);
  }
  if(!x)return null;

  const ricettaScelta=(x.realizzazioni||[]).map(r=>r.ricettaId).find(rid=>rid&&state.ricetteById.has(rid)&&copertura(state.ricetteById.get(rid)).tokens.has(token));
  if(ricettaScelta)getPropostaSet(chiave).add(ricettaScelta);

  const voce=Object.assign({},old||{id},{
    modo:'multi',
    motoreNuovo:true,
    realizzazioni:x.realizzazioni,
    bilancioVerdura:x.bilancioVerdura||null,
    porzioni:old&&old.porzioni||1,
    origine:'motore-nuovo',
    programmatoIl:new Date().toISOString(),
    categoriaTarget:target,
    carboidratoPianificato:x.carbKeyUsato||null,
    avvisoCarboidrato:x.avviso||null
  });
  if(opzioni.usaInventario){
    voce.origine='alternativa-odierna';
    if(old&&!old.programmatoOriginale)voce.programmatoOriginale={
      realizzazioni:clone(old.realizzazioni||[]),
      bilancioVerdura:clone(old.bilancioVerdura||null),
      categoriaTarget:old.categoriaTarget||target,
      carboidratoPianificato:old.carboidratoPianificato||null,
      programmatoIl:old.programmatoIl||null
    };
  }
  if(typeof put==='function') await put('piano',voce);
  return voce;
}

async function materializzaRicetta(base,condimentoVarianteIndex){
  if(!base) return null;
  const ricetta=base.templateOrigine||null;
  if(!ricetta) return clone(base);
  const raw={
    slot:clone(base.slot||[]),
    condimenti:clone(base.condimentiDisponibili||base.condimenti||[])
  };
  const selezionata=combinazioneConCondimento(raw,condimentoVarianteIndex);
  const n=costruisciNomeRicetta(ricetta,selezionata);
  const ingredienti=await preparaIngredientiDettagliati(ricetta,selezionata);
  const nut=calcolaNutrienti(ingredienti);
  return Object.assign({},clone(base),{
    nome:n.display,
    partiRicetta:n.parti,
    ingredienti,
    nutrienti:nut,
    nutrizioneManualeTotale:{kcal:nut.kcal,prot:nut.proteine,carb:nut.carboidrati,grassi:nut.grassi},
    condimenti:clone(selezionata.condimenti),
    condimentoVarianteIndex:selezionata.condimentoVarianteIndex,
    numeroVariantiCondimento:selezionata.numeroVariantiCondimento,
    stackScope:ricetta.stackScope||null,
    chiaviStack:chiaviStack(selezionata,ricetta.id,ricetta.stackScope)
  });
}

async function materializzaRealizzazione(realizzazione){
  if(!realizzazione||!realizzazione.ricettaId) return null;
  const base=state.ricetteById.get(realizzazione.ricettaId);
  const ricetta=await materializzaRicetta(base,Number(realizzazione.condimentoVarianteIndex)||0);
  if(!ricetta)return null;
  if(Array.isArray(realizzazione.ingredientiEffettivi)){
    const ingredienti=clone(realizzazione.ingredientiEffettivi);
    const nutrienti=realizzazione.nutrientiEffettivi
      ?clone(realizzazione.nutrientiEffettivi)
      :calcolaNutrienti(ingredienti);
    return Object.assign({},ricetta,{
      nome:realizzazione.nomeEffettivo||ricetta.nome,
      ingredienti,
      nutrienti,
      nutrizioneManualeTotale:{kcal:nutrienti.kcal,prot:nutrienti.proteine,carb:nutrienti.carboidrati,grassi:nutrienti.grassi}
    });
  }
  return ricetta;
}

async function normalizzaRealizzazioniVerdura(realizzazioni,giorno,portionConfig){
  const materializzate=[];
  for(const real of realizzazioni||[]){const r=await materializzaRealizzazione(real);if(r)materializzate.push(r);}
  const pool=await poolAmmesso(giorno,{}),complete=completaResiduoVerduraRicette(materializzate,pool,giorno,portionConfig);
  const usati=new Set();
  return complete.map(r=>{
    const indice=(realizzazioni||[]).findIndex((real,i)=>!usati.has(i)&&real.ricettaId===r.id);
    if(indice>=0){usati.add(indice);return snapshotRealizzazione(realizzazioni[indice],r);}
    return snapshotRealizzazione({ricettaId:r.id,recipeModelId:r.recipeModelId,copertura:Array.from(copertura(r).tokens),condimentoVarianteIndex:Number(r.condimentoVarianteIndex)||0},r);
  });
}
async function bilancioVerduraDaRealizzazioni(realizzazioni,portionConfig){
  const ricette=[];
  for(const real of realizzazioni||[]){
    const ricetta=await materializzaRealizzazione(real);
    if(ricetta)ricette.push(ricetta);
  }
  return coperturaVerduraRicette(ricette,portionConfig);
}

function firmaPerRollC(r){
  return (r.slot||[]).map((s,i)=>{
    const cat=s.categoria||'';
    const ing=cat==='C'?'*':(s.ingrediente&&s.ingrediente.nome||'');
    const cot=s.cottura&&s.cottura.nome||'';
    return i+':'+cat+':'+ing+':'+cot;
  }).join('|');
}
function firmaPerRollP(r){
  return (r.slot||[]).map((s,i)=>{
    const cat=s.categoria||'';
    const ing=s.ingrediente&&s.ingrediente.nome||'';
    const cot=TOKEN_P.has(cat)?'*':(s.cottura&&s.cottura.nome||'');
    return i+':'+cat+':'+ing+':'+cot;
  }).join('|');
}

async function alternativeRollC(base,giorno,condimentoIndex){
  if(!base) return [];
  const pool=state.ricetteConcrete
    .filter(r=>r.recipeModelId===base.recipeModelId)
    .filter(r=>firmaPerRollC(r)===firmaPerRollC(base));
  const out=[];
  for(const r of pool){
    const x=await materializzaRicetta(r,condimentoIndex);
    if(await ricettaAmmessa(x,giorno,{})) out.push(r);
  }
  return out.sort((a,b)=>a.comboIndex-b.comboIndex);
}

async function alternativeRollP(base,giorno,condimentoIndex){
  if(!base) return [];
  const pool=state.ricetteConcrete
    .filter(r=>r.recipeModelId===base.recipeModelId)
    .filter(r=>firmaPerRollP(r)===firmaPerRollP(base));
  const out=[];
  for(const r of pool){
    const x=await materializzaRicetta(r,condimentoIndex);
    if(await ricettaAmmessa(x,giorno,{})) out.push(r);
  }
  return out.sort((a,b)=>a.comboIndex-b.comboIndex);
}

async function variantiPrioritarieDeperimento(){
  try{
    const [scadenze,avanzi]=await Promise.all([getScadenzeImminenti(),getAvanziScomodi()]);
    return new Set([...scadenze,...avanzi].map(v=>v.variantId).filter(Boolean));
  }catch(e){ return new Set(); }
}
async function alternativeRollV(base,giorno){
  if(!base) return [];
  const c=copertura(base);
  if(!c.V) return [];
  const out=[];
  /* Stesso ingrediente verdura, condimenti compatibili diversi (comportamento
     preesistente, preservato). */
  const nVarianti=Number(base.numeroVariantiCondimento)||1;
  for(let idx=0;idx<nVarianti;idx++){
    const x=await materializzaRicetta(base,idx);
    if(x&&await ricettaAmmessa(x,giorno,{})) out.push({ricetta:base,condimentoVarianteIndex:idx,x});
  }
  /* Verdura diversa (template diverso), condimento di base - vera query
     su alternativa verdura, non solo sul condimento. Coerente con
     "V cambia soltanto verdura/condimento compatibile" della specifica. */
  const pool=state.ricetteConcrete.filter(r=>{
    const cr=copertura(r);
    return cr.V&&!cr.P&&!cr.C&&r.id!==base.id;
  });
  for(const r of pool){
    const x=await materializzaRicetta(r,0);
    if(x&&await ricettaAmmessa(x,giorno,{})) out.push({ricetta:r,condimentoVarianteIndex:0,x});
  }
  /* Priorita' al materiale in deperimento/avanzo: la verdura e' la
     categoria piu' a rischio spreco, quindi il Roll V (non solo il
     pulsante Salvafrigo dedicato) deve proporre per primi i candidati
     che usano scadenze imminenti o avanzi scomodi gia' in inventario. */
  const variantiPrioritarie=await variantiPrioritarieDeperimento();
  const usaPrioritario=item=>variantiPrioritarie.size>0&&(item.x.ingredienti||[]).some(i=>variantiPrioritarie.has(i.variantId));
  out.sort((a,b)=>{
    const pa=usaPrioritario(a)?0:1,pb=usaPrioritario(b)?0:1;
    if(pa!==pb)return pa-pb;
    return 0;
  });
  return out.map(({ricetta,condimentoVarianteIndex})=>({ricetta,condimentoVarianteIndex}));
}

async function proprietarioRoll(voce,tipo,giorno){
  for(let i=0;i<(voce.realizzazioni||[]).length;i++){
    const real=voce.realizzazioni[i];
    const base=state.ricetteById.get(real&&real.ricettaId);
    if(!base) continue;
    const idx=Number(real.condimentoVarianteIndex)||0;
    if(tipo==='C'){
      const a=await alternativeRollC(base,giorno,idx);
      if(a.length>1) return {indice:i,base,alternative:a};
    }else if(tipo==='P'){
      const a=await alternativeRollP(base,giorno,idx);
      if(a.length>1) return {indice:i,base,alternative:a};
    }else if(tipo==='V'){
      const a=await alternativeRollV(base,giorno);
      if(a.length>1) return {indice:i,base,alternative:a};
    }
  }
  return null;
}

async function statoRollPasto(giorno,pasto,vocePendente){
  const voce=vocePendente||(typeof getOne==='function'?await getOne('piano',giorno+'_'+pasto):null);
  if(!voce||!Array.isArray(voce.realizzazioni)) return {C:false,P:false,V:false};
  return {
    C:!!(await proprietarioRoll(voce,'C',giorno)),
    P:!!(await proprietarioRoll(voce,'P',giorno)),
    V:!!(await proprietarioRoll(voce,'V',giorno))
  };
}

async function ruotaPasto(giorno,pasto,tipo,vocePendente){
  tipo=String(tipo||'').toUpperCase();
  if(!['C','P','V'].includes(tipo)) return null;
  const id=giorno+'_'+pasto;
  const voce=vocePendente||(typeof getOne==='function'?await getOne('piano',id):null);
  if(!voce||!Array.isArray(voce.realizzazioni)) return null;

  const owner=await proprietarioRoll(voce,tipo,giorno);
  if(!owner) return null;

  const real=clone(voce.realizzazioni[owner.indice]);
  const condIndex=Number(real.condimentoVarianteIndex)||0;

  if(tipo==='V'){
    const a=owner.alternative;
    const pos=a.findIndex(x=>x.ricetta.id===real.ricettaId&&x.condimentoVarianteIndex===condIndex);
    const prossimo=a[(pos<0?0:pos+1)%a.length];
    real.ricettaId=prossimo.ricetta.id;
    real.recipeModelId=prossimo.ricetta.recipeModelId;
    real.copertura=Array.from(copertura(prossimo.ricetta).tokens);
    real.condimentoVarianteIndex=prossimo.condimentoVarianteIndex;
  }else{
    const a=owner.alternative;
    const pos=a.findIndex(r=>r.id===real.ricettaId);
    const prossimo=a[(pos<0?0:pos+1)%a.length];
    real.ricettaId=prossimo.id;
    real.recipeModelId=prossimo.recipeModelId;
    real.copertura=Array.from(copertura(prossimo).tokens);
    real.condimentoVarianteIndex=condIndex;
  }

  const baseAggiornata=state.ricetteById.get(real.ricettaId);
  const materializzata=await materializzaRicetta(baseAggiornata,real.condimentoVarianteIndex);
  if(materializzata)Object.assign(real,snapshotRealizzazione(real,materializzata));

  let realizzazioni=voce.realizzazioni.map((x,i)=>i===owner.indice?real:x);
  const resolved=await caricaConfigurazioneNutrizionaleRisolta();
  realizzazioni=await normalizzaRealizzazioniVerdura(realizzazioni,giorno,resolved.vegetables);
  const requiredVegetableVariantId=await verduraRicorrenteRichiesta(giorno,pasto);
  if(requiredVegetableVariantId){
    let mantieneVincolo=false;
    for(const realizzazione of realizzazioni){
      const ricetta=await materializzaRealizzazione(realizzazione);
      if(ricetta&&(ricetta.ingredienti||[]).some(i=>i.variantId===requiredVegetableVariantId)){mantieneVincolo=true;break;}
    }
    if(!mantieneVincolo)return null;
  }
  const aggiornata=Object.assign({},voce,{
    realizzazioni,
    bilancioVerdura:await bilancioVerduraDaRealizzazioni(realizzazioni,resolved.vegetables),
    origine:'motore-nuovo',
    programmatoIl:new Date().toISOString()
  });
  return aggiornata;
}
/* Passo esplicito di salvataggio, separato da ruotaPasto: il risultato di
   un Roll resta provvisorio (solo in memoria lato UI) finche' non si
   chiama questa funzione - coerente con "la ricetta passa sul piano
   alimentare solo quando si clicca Salva". */
async function salvaRoll(voce){
  if(!voce||typeof put!=='function') return voce;
  await put('piano',voce);
  return voce;
}

async function inizializza(opts){
  opts=opts||{};
  const base=opts.basePath||'';
  const [rdb,idb]=await Promise.all([
    loadJson(base+'db-ricette.json'),
    loadJson(base+'ingredienti-new.json')
  ]);
  state.dbRicette=rdb;
  state.ingredientiMap=idb.ingredienti||{};
  state.propostaCicli=new Map();
  await sincronizzaIngredientiIndexedDB();

  /* Il JSON e' soltanto la sorgente di compilazione. Il catalogo operativo e'
     sempre lo store IndexedDB "ricette": a versione invariata lo si legge
     direttamente; a versione cambiata lo si sostituisce e poi lo si rilegge. */
  const versioneCache=String(rdb.versione||0)+'_'+String(idb.versione||0)+'_indexeddb-only-v1';
  let cacheValida=false;
  if(typeof getOne==='function'&&typeof getAll==='function'){
    try{
      const [rec,registrate]=await Promise.all([
        getOne('impostazioni','versioneRicetteCache'),
        getAll('ricette')
      ]);
      const compilate=(registrate||[]).filter(r=>r&&r.fonte==='nuovo-db-compilato');
      const contieneFallback=compilate.some(r=>r.stackScope==='contorni_catalogo'||r.stackScope==='proteine_catalogo');
      cacheValida=!!(rec&&rec.valore===versioneCache&&compilate.length&&!contieneFallback);
    }catch(e){}
  }
  if(!cacheValida){
    const compilate=[];
    for(const r of (rdb.ricette||[])){
      const comb=generaCombinazioni(r);
      for(let i=0;i<comb.length;i++) compilate.push(await compilaRicetta(r,comb[i],i));
    }
    state.ricetteConcrete=compilate;
    await sincronizzaCacheRicette();
    if(typeof put==='function') await put('impostazioni',{chiave:'versioneRicetteCache',valore:versioneCache});
  }
  const concrete=(await getAll('ricette')||[])
    .filter(r=>r&&r.fonte==='nuovo-db-compilato'&&r.stackScope!=='contorni_catalogo'&&r.stackScope!=='proteine_catalogo');
  if(!concrete.length) throw new Error('Catalogo ricette IndexedDB vuoto dopo la sincronizzazione.');
  state.compatibilitaCP=creaMappaCompatibilitaCP(concrete);
  state.ricetteConcrete=concrete;
  state.ricetteById=new Map(concrete.map(r=>[r.id,r]));
  await caricaTracking();
  state.pronto=true;
  return {versioneRicette:rdb.versione||0,versioneIngredienti:idb.versione||0,template:(rdb.ricette||[]).length,concrete:concrete.length};
}

function getRicette(){ return state.ricetteConcrete.slice(); }
function getRicetta(id){ return state.ricetteById.get(id)||null; }
function stato(){ return {pronto:state.pronto,versioneRicette:state.dbRicette&&state.dbRicette.versione||0,ricetteConcrete:state.ricetteConcrete.length}; }

global.DietaPlannerMotorV12={
  inizializza,stato,getRicette,getRicetta,
  generaCombinazioni,estraiPartiRicetta,compilaPartiRicetta,costruisciNomeRicetta,
  getScadenzeImminenti,getAvanziScomodi,getCongelatiDaTempo,getInventarioDisponibile,
  suggerisciCongelati,tempoScongelamento,salvafrigo,
  generaPasto,generaPianoSettimana,rigeneraPasto,risolviSlotSingolo,statoRollPasto,ruotaPasto,salvaRoll,materializzaRealizzazione,
  snapshotRealizzazione,
  applicaOverrideQuantitaRealizzazione,
  normalizzaRealizzazioniVerdura,
  bilancioVerduraDaRealizzazioni,
  assegnaCarboidratiCompatibili,
  componiBasiProteinaCarboidrato,
  limitaCarboidratiAutoAllaCopertura,
  creaMappaCompatibilitaCP,composizioneSeparataConsentita,
  chiaviStack,
  scegliCandidatoConMargine,
  ingredienteVerduraQuantificabile,coperturaVerduraRicette,ridimensionaVerdureRicetta,completaResiduoVerduraRicette,punteggioVerduraProgrammazione,ordinaVerdureProgrammazione,
  prioritaVerdureProgrammazionePasti,
  registraUtilizzo,categoriaPrincipale,copertura,scoreCopertura,pastoCompletoPerToken,ruoliVerduraDaClasse,calcolaBilancioVSG,caricaConfigurazioneNutrizionaleRisolta,selezioneCarboidratiPersistita,carbKeyNome,carbKeysRicetta,preparaBudgetCarboidrati,creaSequenzaCarboidrati,creaSequenzaProteine,carbRicettaAmmesso,consumaBudgetCarboidrati,accumulaConteggiPasto,pastoRispettaConteggi,
  invalidaConfigRuntime
};
})(typeof window!=='undefined'?window:globalThis);
