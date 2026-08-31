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
  baseByName:new Map(),
  variantByName:new Map(),
  tracking:{ultimoUtilizzo:{}, utilizziSettimanali:{}, condimentoRotazione:{contatore:0,ultimo:{}}},
  propostaCicli:new Map()
};

function slug(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function uniq(a){ return [...new Set(a)]; }
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
  if(c.includes('V')||c.includes('V-')) return 'V';
  return c[0]||null;
}
function carbKeyNome(nome){return CARB_KEY_BY_NAME[String(nome||'').trim().toLowerCase()]||null;}
function carbKeysRicetta(r){return uniq((r&&r.ingredienti||[]).map(i=>carbKeyNome(i.nome)).filter(Boolean));}
function preparaBudgetCarboidrati(resolved){
  const plan=resolved&&resolved.carbohydrates||{},remaining=Object.assign({},plan.fixedCounts||{});
  return {selection:plan.selection||{},autoEligible:new Set(plan.autoEligibleKeys||[]),remaining,errors:[]};
}
function creaSequenzaCarboidrati(resolved,slotCount,rng,seedCounts){
  const plan=resolved&&resolved.carbohydrates||{},out=[];rng=rng||Math.random;
  seedCounts=seedCounts||{};
  for(const [key,count] of Object.entries(plan.fixedCounts||{})){const used=Number(seedCounts[key])||0;if(used>Number(count))return {valid:false,errors:['Il piano preservato supera il numero fisso di '+key+'.'],keys:[]};for(let i=used;i<Number(count)||0;i++)out.push(key);}
  if(out.length>slotCount)return {valid:false,errors:['I carboidrati fissi superano gli slot programmabili.'],keys:[]};
  const auto=(plan.autoEligibleKeys||[]).slice();
  if(out.length<slotCount&&!auto.length)return {valid:false,errors:['Nessun carboidrato AUTO disponibile per completare il piano.'],keys:[]};
  while(out.length<slotCount)out.push(auto[Math.floor(rng()*auto.length)]);
  for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return {valid:true,errors:[],keys:out};
}
function creaSequenzaProteine(resolved,slotRefs,tab,rng,seedCounts){
  rng=rng||Math.random;tab=tab||{};const freq=resolved.proteinFrequencies||{},forbidden=new Set(resolved.profile&&resolved.profile.forbiddenProteinMacros||[]),counts=Object.assign({},seedCounts||{}),targets=Array(slotRefs.length).fill(null),errors=[];
  const allowed=Object.keys(freq).filter(k=>!forbidden.has(k)&&freq[k].max!==0);
  for(let i=0;i<slotRefs.length;i++){const ref=slotRefs[i],fixed=(tab['giorno_'+ref.di]||[])[ref.pasto==='pranzo'?0:1];if(!fixed)continue;if(!allowed.includes(fixed)){errors.push('Proteina '+fixed+' non ammessa per '+ref.day+' '+ref.pasto+'.');continue;}targets[i]=fixed;counts[fixed]=(counts[fixed]||0)+1;}
  for(const key of allowed){const max=freq[key].max;if(max!==null&&max!==undefined&&(counts[key]||0)>Number(max))errors.push('Proteina '+key+' oltre il massimo settimanale.');}
  const empty=()=>targets.findIndex(x=>!x);
  for(const key of allowed){let need=Math.max(0,(Number(freq[key].min)||0)-(counts[key]||0));while(need-->0){const i=empty();if(i<0){errors.push('Slot insufficienti per i minimi proteici.');break;}targets[i]=key;counts[key]=(counts[key]||0)+1;}}
  while(empty()>=0){let pool=allowed.filter(k=>freq[k].max===null||freq[k].max===undefined||(counts[k]||0)<Number(freq[k].max));if(!pool.length){errors.push('Nessuna proteina ammessa per completare la settimana.');break;}const underTarget=pool.filter(k=>(counts[k]||0)<(Number(freq[k].target)||Number(freq[k].min)||0));if(underTarget.length)pool=underTarget;const key=pool[Math.floor(rng()*pool.length)],i=empty();targets[i]=key;counts[key]=(counts[key]||0)+1;}
  for(const key of allowed)if((counts[key]||0)<(Number(freq[key].min)||0))errors.push('Minimo proteico non raggiunto: '+key+'.');
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
    const c=copertura(r),carbOk=c.C||haCarbSeparato,verduraOk=(c.V&&!c.Vparziale)||haVerduraSeparata;
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
    if(s.categoria!=='C'){
      const componenti=s.ingrediente&&Array.isArray(s.ingrediente.componenti)&&s.ingrediente.componenti.length?s.ingrediente.componenti:(s.ingrediente?[s.ingrediente]:[]);
      for(const i of componenti)if(i&&i.nome&&Number(i.stack===undefined?s.ingrediente.stack:i.stack)!==0)keys.push('i:'+(i.categoria||s.categoria)+':'+i.nome);
      if(s.cottura&&s.cottura.nome&&Number(s.cottura.stack)!==0) keys.push('c:'+s.categoria+':'+s.cottura.nome);
    }
  }
  for(const g of combinazione.condimenti) for(const i of (g.ingredienti||[])) if(i.nome&&Number(i.stack)!==0) keys.push('cond:'+i.nome);
  if(!keys.length){
    for(const s of combinazione.slot){
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
    condimentoVarianteIndex:0,
    numeroVariantiCondimento:selezionata.numeroVariantiCondimento
  };
}

async function compilaContorniBaseCatalogo(){
  const out=[];
  for(const [nome,d] of Object.entries(state.ingredientiMap||{})){
    if(!d||d.gruppo!=='verdura')continue;
    const modello={
      id:'contorno_'+slug(nome),classe:'V',stackScope:'contorni_catalogo',
      gruppi:[{testo1:'',categoria:'V',ingredienti:[{nome,stack:1,roll:1}],cotture:[],testo2:'',mostraNomi:true}]
    };
    out.push(await compilaRicetta(modello,generaCombinazioni(modello)[0],0));
  }
  return out;
}
async function compilaProteineBaseCatalogo(){
  const out=[];
  for(const [nome,d] of Object.entries(state.ingredientiMap||{})){
    const token=d&&SUBTYPE_TO_TOKEN[d.sottotipo];if(!token)continue;
    const modello={
      id:'proteina_'+slug(nome),classe:token,stackScope:'proteine_catalogo',
      gruppi:[{testo1:'',categoria:token,ingredienti:[{nome,stack:1,roll:1}],cotture:[],testo2:'',mostraNomi:true}]
    };
    out.push(await compilaRicetta(modello,generaCombinazioni(modello)[0],0));
  }
  return out;
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
    const alta=d.deperibilita==='alta',surg=d.conservazione==='surgelato';
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
      categoria:surg?'surgelato':(alta?'fresco':'conf'),
      consistenza:d.gruppo==='grassi'?'gia_cotto':'da_cuocere',
      congelabile:surg?'si':(alta?'si':'no'),
      zona:surg?'freezer':(alta?'frigo':'dispensa'),
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

async function configRuntime(){
  const resolved=await caricaConfigurazioneNutrizionaleRisolta();
  return {
    resolved,
    allergie:resolved.safety.allergens,
    blockedIngredientIds:new Set(resolved.safety.blockedIngredientIds),
    vincoli:resolved.ingredientConstraints,
    weeklyLimits:resolved.subtypeCaps,
    maxProteinSourcesPerDay:resolved.maxProteinSourcesPerDay
  };
}

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
  return {
    tokens,
    C:tokens.has('C'),
    V:tokens.has('V'),
    Vparziale:tokens.has('V-'),
    P:[...tokens].some(t=>TOKEN_P.has(t)),
    proteinTokens:[...tokens].filter(t=>TOKEN_P.has(t))
  };
}
function scoreCopertura(r,targetToken){
  const c=copertura(r);
  let s=0;
  if(c.tokens.has(targetToken)) s+=10;
  if(c.C) s+=3;
  if(c.V) s+=3;
  if(c.Vparziale) s+=1;
  return s;
}
async function poolAmmesso(data,opts){
  const out=[];
  for(const r of state.ricetteConcrete) if(carbRicettaAmmesso(r,opts&&opts.carbBudget)&&await ricettaAmmessa(r,data,opts)) out.push(r);
  return out;
}
function scegliCasuale(pool){ return pool.length?pool[Math.floor(Math.random()*pool.length)]:null; }
function scegliCandidatoConMargine(pool,opts){
  if(!(pool||[]).length)return null;
  const priorita=Math.min(...pool.map(c=>Number(c.prioritaComposizione)||0));
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
  const min=Math.min(...pool.map(score)),migliori=pool.filter(c=>Math.abs(score(c)-min)<1e-9);
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
  return Math.max(...nomi.map(nome=>Number(ultimo[nome])||0));
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
  const [scad,avanzi,freezer]=await Promise.all([getScadenzeImminenti(),getAvanziScomodi(),getFreezerDisponibili()]);
  return [scad,avanzi,freezer]
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
function pastoCompletoPerToken(ricette,token){
  const tokens=new Set();
  for(const r of (ricette||[])) for(const t of copertura(r).tokens) tokens.add(t);
  return tokens.has(token) && tokens.has('C') && tokens.has('V');
}
function ingredienteVerduraQuantificabile(i){
  if(!i||i.condimento||i.categoria==='Condimenti'||!(Number(i.grammi)>0))return false;
  const gruppi=Array.isArray(i.gruppo)?i.gruppo:[i.gruppo];
  return i.macro==='verdura'||gruppi.includes('verdura');
}
function tipoPorzioneVerdura(i){
  const meta=metaIngrediente(i&&i.nome)||{};
  return Number(meta.porzione)>0&&Number(meta.porzione)<=100?'salad':'vegetable';
}
function righeCoperturaVerdura(ricette,escludiRicettaId){
  const out=[];
  for(const r of ricette||[]){
    if(escludiRicettaId&&r.id===escludiRicettaId)continue;
    for(const i of r.ingredienti||[])if(ingredienteVerduraQuantificabile(i))out.push({kind:tipoPorzioneVerdura(i),quantity:Number(i.grammi)||0});
  }
  return out;
}
function coperturaVerduraRicette(ricette,portionConfig){
  return N.vegetableCoverage(righeCoperturaVerdura(ricette),portionConfig);
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
function punteggioVerduraProgrammazione(r,data){
  const indice=indiceSettimana(data),verdure=(r.ingredienti||[]).filter(ingredienteVerduraQuantificabile);
  if(!verdure.length)return -999;
  const livelli={alta:0,media:1,bassa:2};
  const livello=Math.min(...verdure.map(i=>livelli[i.deperibilita]===undefined?1:livelli[i.deperibilita]));
  const preferito=indice<=2?0:(indice<=4?1:2);
  return -Math.abs(livello-preferito)*10-livello;
}
function ordinaVerdureProgrammazione(pool,data){
  return (pool||[]).slice().sort((a,b)=>punteggioVerduraProgrammazione(b,data)-punteggioVerduraProgrammazione(a,data));
}
function prioritaVerdureProgrammazionePasti(candidati,data){
  if(!(candidati||[]).length)return candidati||[];
  const indice=indiceSettimana(data),preferito=indice<=2?0:(indice<=4?1:2),livelli={alta:0,media:1,bassa:2};
  const score=c=>{
    const verdure=(c.ricette||[]).flatMap(r=>(r.ingredienti||[]).filter(ingredienteVerduraQuantificabile));
    if(!verdure.length)return -999;
    return -verdure.reduce((s,i)=>s+Math.abs((livelli[i.deperibilita]===undefined?1:livelli[i.deperibilita])-preferito),0)/verdure.length;
  };
  const max=Math.max(...candidati.map(score));
  return candidati.filter(c=>score(c)===max);
}
function completaResiduoVerduraRicette(ricette,pool,data,portionConfig){
  let out=(ricette||[]).slice();
  const totale=coperturaVerduraRicette(out,portionConfig);
  let dedicata=out.find(r=>{const c=copertura(r);return c.V&&!c.C&&!c.P&&righeCoperturaVerdura([r]).length;});
  if(totale.remainingFraction<=0&&!dedicata)return out;
  if(totale.remainingFraction<=0&&dedicata&&Math.abs(totale.rawFraction-1)<0.000001)return out;
  if(!dedicata){
    dedicata=ordinaVerdureProgrammazione((pool||[]).filter(r=>{const c=copertura(r);return c.V&&!c.C&&!c.P&&righeCoperturaVerdura([r]).length&&!out.some(x=>x.id===r.id);}),data)[0]||null;
    if(dedicata)out.push(dedicata);
  }
  if(!dedicata)return out;
  const altre=N.vegetableCoverage(righeCoperturaVerdura(out,dedicata.id),portionConfig);
  const frazioneDedicata=Math.max(0,1-altre.coveredFraction);
  if(frazioneDedicata<=0)return out.filter(r=>r.id!==dedicata.id);
  out=out.map(r=>r.id===dedicata.id?ridimensionaVerdureRicetta(r,frazioneDedicata,portionConfig):r);
  return out;
}
function risultatoPasto(token,ricette,prioritaComposizione){
  return {
    targetToken:token,
    prioritaComposizione:Number(prioritaComposizione)||0,
    firmaPasto:firmaPastoDaRicette(ricette),
    realizzazioni:realizzazioniDaRicette(ricette),
    ricette
  };
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
function carbPrincipaleRicette(ricette){for(const r of ricette||[]){const keys=carbKeysRicetta(r);if(keys.length)return keys[0];}return null;}
function pastoRispettaConteggi(ricette,cfg,ingredientCounts,subtypeCounts){
  const nextIngredients=Object.assign({},ingredientCounts),nextSubtypes=Object.assign({},subtypeCounts);accumulaConteggiPasto(ricette,nextIngredients,nextSubtypes);
  for(const [id,n] of Object.entries(nextIngredients)){const rule=cfg.vincoli[id];if(rule&&rule.max!==null&&rule.max!==undefined&&n>Number(rule.max))return false;}
  for(const [st,n] of Object.entries(nextSubtypes)){const cap=cfg.weeklyLimits[st];if(cap!==null&&cap!==undefined&&n>Number(cap))return false;}
  return true;
}
async function generaCandidatiPasto(target,data,opts){
  opts=opts||{};
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
    let carbChoices=[null];
    if(!copertura(primo).C){
      let carb=pool.filter(r=>copertura(r).C&&!copertura(r).P&&r.id!==primo.id);
      if(opts.usaInventario)carb=applicaPrioritaInventario(carb,livelli);
      carbChoices=carb.length?carb:[null];
    }

    for(const carb of carbChoices){
      const base=[primo].concat(carb?[carb]:[]);
      const haV=base.some(r=>copertura(r).V);
      const haVParziale=base.some(r=>copertura(r).Vparziale);
      let vegChoices=[null];

      if(!haV || haVParziale){
        let veg=pool.filter(r=>copertura(r).V&&!copertura(r).P&&!base.some(x=>x.id===r.id));
        if(opts.usaInventario)veg=applicaPrioritaInventario(veg,livelli);
        vegChoices=veg.length?veg:[null];
      }

      for(const veg of vegChoices){
        let ricette=base.concat(veg?[veg]:[]);
        if(!pastoCompletoPerToken(ricette,token)) continue;
        ricette=completaResiduoVerduraRicette(ricette,pool,data,opts.vegetablePortions);
        if(coperturaVerduraRicette(ricette,opts.vegetablePortions).remainingFraction>0.000001)continue;
        if(opts.requiredVegetableVariantId&&!ricette.some(r=>(r.ingredienti||[]).some(i=>i.variantId===opts.requiredVegetableVariantId)))continue;
        const firma=firmaPastoDaRicette(ricette);
        if(firme.has(firma)) continue;
        firme.add(firma);
        if(opts.runtimeConfig&&opts.weeklyIngredientCounts&&opts.weeklySubtypeCounts&&!pastoRispettaConteggi(ricette,opts.runtimeConfig,opts.weeklyIngredientCounts,opts.weeklySubtypeCounts))continue;
        risultati.push(risultatoPasto(token,ricette,copertura(primo).C?0:1));
      }
    }
  }
  return risultati;
}
async function generaPasto(target,data,opts){
  let candidati=await generaCandidatiPasto(target,data,opts||{});
  if(!(opts&&opts.usaInventario))candidati=prioritaVerdureProgrammazionePasti(candidati,data);
  const scelto=scegliCandidatoConMargine(candidati,opts||{});
  return scelto?await assegnaCondimentiRotazioneGlobale(scelto,data):null;
}

function chiaviStackPasto(candidato){
  return uniq((candidato&&candidato.ricette||[]).flatMap(r=>r.chiaviStack||[]));
}
function aggiungiConteggiCandidato(candidato,ingredientCounts,subtypeCounts){
  const nextI=Object.assign({},ingredientCounts),nextS=Object.assign({},subtypeCounts);
  accumulaConteggiPasto(candidato.ricette,nextI,nextS);
  return {ingredientCounts:nextI,subtypeCounts:nextS};
}
async function risolviSettimanaRicette(slotDefs,ctx){
  const pools=[];
  for(let i=0;i<slotDefs.length;i++){
    const s=slotDefs[i];
    let candidati=await generaCandidatiPasto(s.target,s.day,{
      carbBudget:{requiredKey:s.carbKey},vegetablePortions:ctx.vegetablePortions,
      requiredVegetableVariantId:s.requiredVegetableVariantId||null,runtimeConfig:ctx.runtimeConfig
    });
    candidati=candidati.sort((a,b)=>(a.prioritaComposizione-b.prioritaComposizione)||punteggioVerduraProgrammazione(b.ricette.find(r=>copertura(r).V)||{},s.day)-punteggioVerduraProgrammazione(a.ricette.find(r=>copertura(r).V)||{},s.day));
    pools.push(candidati);
  }
  if(pools.some(p=>!p.length))return {ok:false,motivo:'Almeno uno slot non possiede candidati completi compatibili con i vincoli del Set.'};
  const ordine=slotDefs.map((_,i)=>i).sort((a,b)=>pools[a].length-pools[b].length),scelte=Array(slotDefs.length).fill(null);
  let nodi=0;
  function cerca(pos,ingredientCounts,subtypeCounts,stackUsati){
    if(++nodi>250000)return false;
    if(pos>=ordine.length)return true;
    const idx=ordine[pos];
    const ordinati=pools[idx].slice().sort((a,b)=>chiaviStackPasto(a).filter(k=>stackUsati.has(k)).length-chiaviStackPasto(b).filter(k=>stackUsati.has(k)).length||a.prioritaComposizione-b.prioritaComposizione);
    for(const candidato of ordinati){
      if(!pastoRispettaConteggi(candidato.ricette,ctx.runtimeConfig,ingredientCounts,subtypeCounts))continue;
      const stack=chiaviStackPasto(candidato);
      const next=aggiungiConteggiCandidato(candidato,ingredientCounts,subtypeCounts),nextStack=new Set(stackUsati);
      stack.forEach(k=>nextStack.add(k));scelte[idx]=candidato;
      if(cerca(pos+1,next.ingredientCounts,next.subtypeCounts,nextStack))return true;
      scelte[idx]=null;
    }
    return false;
  }
  const ok=cerca(0,Object.assign({},ctx.weeklyIngredientCounts),Object.assign({},ctx.weeklySubtypeCounts),new Set(ctx.weeklyStackKeys||[]));
  return ok?{ok:true,scelte,nodi}:{ok:false,motivo:'Ricerca globale esaurita senza una settimana completa.',nodi};
}

async function generaPianoSettimana(scarto,opzioni){
  scarto=Number(scarto)||0; opzioni=opzioni||{};
  if(typeof giorniSettimana!=='function'||typeof put!=='function'||typeof getOne!=='function') throw new Error('index non pronto');
  const days=giorniSettimana(scarto), today=typeof todayISO==='function'?todayISO():isoDate(new Date()),resolved=await caricaConfigurazioneNutrizionaleRisolta();
  if(!resolved.valid)return {generati:[],errori:resolved.errors};
  const slotDaGenerare=[];
  for(let di=0;di<days.length;di++){const day=days[di];if(day<=today)continue;for(const pasto of ['pranzo','cena']){const old=await getOne('piano',day+'_'+pasto);if(old&&old.bloccata)continue;if(old&&!opzioni.forza&&old.realizzazioni&&old.realizzazioni.length)continue;slotDaGenerare.push({day,di,pasto});}}
  let tab={};
  try{const r=await getOne('impostazioni','tabellaGiornoCategoria');tab=r&&r.valore||{};}catch(e){}
  const runtimeConfig=await configRuntime(),weeklyIngredientCounts={},weeklySubtypeCounts={},weeklyStackKeys=new Set(),generatedIds=new Set(slotDaGenerare.map(x=>x.day+'_'+x.pasto)),seenSlots=new Set();
  const weeklyProteinCounts={},weeklyCarbCounts={};
  if(typeof getAll==='function'){
    const daySet=new Set(days),[log,piano]=await Promise.all([getAll('consumoGiorno'),getAll('piano')]);
    for(const row of log||[]){if(!daySet.has(row.giorno))continue;const key=row.giorno+'_'+(row.pasto||''),rr=ricetteDaIds(row.ricettaIds||[]);seenSlots.add(key);accumulaConteggiPasto(rr,weeklyIngredientCounts,weeklySubtypeCounts);rr.flatMap(r=>r.chiaviStack||[]).forEach(k=>weeklyStackKeys.add(k));const macro=row.categoriaTarget||macroProteicaRicette(rr),carb=row.carboidratoPianificato||row.primoCereale||carbPrincipaleRicette(rr);if(macro)weeklyProteinCounts[macro]=(weeklyProteinCounts[macro]||0)+1;if(carb)weeklyCarbCounts[carb]=(weeklyCarbCounts[carb]||0)+1;}
    for(const voce of piano||[]){if(generatedIds.has(voce.id)||seenSlots.has(voce.id))continue;const giorno=String(voce.id||'').slice(0,10);if(!daySet.has(giorno))continue;const rr=ricetteDaVocePiano(voce);seenSlots.add(voce.id);accumulaConteggiPasto(rr,weeklyIngredientCounts,weeklySubtypeCounts);rr.flatMap(r=>r.chiaviStack||[]).forEach(k=>weeklyStackKeys.add(k));const macro=voce.categoriaTarget||macroProteicaRicette(rr),carb=voce.carboidratoPianificato||voce.primoCereale||carbPrincipaleRicette(rr);if(macro)weeklyProteinCounts[macro]=(weeklyProteinCounts[macro]||0)+1;if(carb)weeklyCarbCounts[carb]=(weeklyCarbCounts[carb]||0)+1;}
  }
  let sequenza=null,proteine=null,abbinamento=null;
  const compatCache=new Map();
  for(let tentativo=0;tentativo<30;tentativo++){
    proteine=creaSequenzaProteine(resolved,slotDaGenerare,tab,null,weeklyProteinCounts);
    if(!proteine.valid)return {generati:[],errori:proteine.errors};
    const resolvedCoperto=await limitaCarboidratiAutoAllaCopertura(resolved,slotDaGenerare,proteine.targets,runtimeConfig,compatCache);
    sequenza=creaSequenzaCarboidrati(resolvedCoperto,slotDaGenerare.length,null,weeklyCarbCounts);
    if(!sequenza.valid)return {generati:[],errori:sequenza.errors};
    abbinamento=await assegnaCarboidratiCompatibili(slotDaGenerare,proteine.targets,sequenza.keys,resolved,runtimeConfig,compatCache);
    if(abbinamento.valid)break;
  }
  if(!abbinamento||!abbinamento.valid)return {generati:[],errori:abbinamento&&abbinamento.errors||['Nessun abbinamento C/P coperto dal nuovo ricettario.']};
  const [vrRec,vrPastiRec]=typeof getOne==='function'?await Promise.all([getOne('impostazioni','verduraRicorrente'),getOne('impostazioni','verduraRicorrentePasti')]):[null,null];
  const vrId=vrRec&&vrRec.valore||null,vrPasti=new Set(vrPastiRec&&Array.isArray(vrPastiRec.valore)?vrPastiRec.valore:[]);
  const slotDefs=slotDaGenerare.map((s,si)=>{const arr=tab['giorno_'+s.di]||[],mi=s.pasto==='pranzo'?0:1;return Object.assign({},s,{target:arr[mi]||proteine.targets[si],carbKey:abbinamento.keys[si],requiredVegetableVariantId:vrId&&vrPasti.has(s.pasto+'_'+s.di)?vrId:null});});
  const soluzione=await risolviSettimanaRicette(slotDefs,{runtimeConfig,weeklyIngredientCounts,weeklySubtypeCounts,weeklyStackKeys,vegetablePortions:resolved.vegetables});
  if(!soluzione.ok){
    const retry=Number(opzioni._retryCompatibilita)||0;
    if(retry<20)return generaPianoSettimana(scarto,Object.assign({},opzioni,{_retryCompatibilita:retry+1}));
    return {generati:[],errori:[soluzione.motivo]};
  }
  const generated=[],records=[];
  for(let si=0;si<slotDefs.length;si++){
      const {day,pasto,target}=slotDefs[si],id=day+'_'+pasto;
      const x=await assegnaCondimentiRotazioneGlobale(soluzione.scelte[si],day);
      records.push({
        id,modo:'multi',motoreNuovo:true,realizzazioni:x.realizzazioni,
        porzioni:1,origine:'motore-nuovo',programmatoIl:new Date().toISOString(),
        categoriaTarget:target,carboidratoPianificato:abbinamento.keys[si],
        carboidratoRichiesto:abbinamento.sostituzioni&&abbinamento.sostituzioni[si]?abbinamento.sostituzioni[si].richiesto:abbinamento.keys[si],
        avvisoProgrammazione:abbinamento.sostituzioni&&abbinamento.sostituzioni[si]||null
      });
      generated.push(id);
  }
  for(const record of records)await put('piano',record);
  return {generati:generated,errori:[],diagnostica:{nodiRicerca:soluzione.nodi,tentativoCompleto:Number(opzioni._retryCompatibilita)||0}};
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

async function rigeneraPasto(giorno,pasto,target,opzioni){
  opzioni=opzioni||{};
  const id=giorno+'_'+pasto;
  const old=typeof getOne==='function'?await getOne('piano',id):null;
  target=target||(old&&old.categoriaTarget)||'legumi';

  const correnti=(old&&old.realizzazioni||[])
    .map(x=>x&&x.ricettaId)
    .filter(Boolean)
    .map(rid=>state.ricetteById.get(rid))
    .filter(Boolean);
  const firmaCorrente=firmaPastoDaRicette(correnti);
  const chiave='pasto|'+giorno+'|'+pasto+'|'+target;
  let visti=getPropostaSet(chiave);
  if(firmaCorrente) visti.add(firmaCorrente);

  const requiredCarbKey=old&&old.carboidratoPianificato||null;
  const resolved=await caricaConfigurazioneNutrizionaleRisolta();
  const requiredVegetableVariantId=await verduraRicorrenteRichiesta(giorno,pasto);
  const opzioniCandidato={
    vegetablePortions:resolved.vegetables,
    usaInventario:!!opzioni.usaInventario,
    requiredVegetableVariantId
  };
  if(requiredCarbKey)opzioniCandidato.carbBudget={requiredKey:requiredCarbKey};
  const candidati=await generaCandidatiPasto(target,giorno,opzioniCandidato);
  let disponibili=candidati.filter(c=>!visti.has(c.firmaPasto));
  if(!opzioni.usaInventario)disponibili=prioritaVerdureProgrammazionePasti(disponibili,giorno);

  if(!disponibili.length){
    azzeraProposte(chiave);
    visti=getPropostaSet(chiave);
    if(firmaCorrente) visti.add(firmaCorrente);
    disponibili=candidati.filter(c=>!visti.has(c.firmaPasto));
    if(!opzioni.usaInventario)disponibili=prioritaVerdureProgrammazionePasti(disponibili,giorno);
    if(!disponibili.length) disponibili=candidati.slice();
  }

  let x=scegliCasuale(disponibili);
  if(!x) return null;
  x=await assegnaCondimentiRotazioneGlobale(x,giorno);

  getPropostaSet(chiave).add(x.firmaPasto);

  const voce=Object.assign({},old||{id},{
    modo:'multi',
    motoreNuovo:true,
    realizzazioni:x.realizzazioni,
    porzioni:old&&old.porzioni||1,
    origine:'motore-nuovo',
    programmatoIl:new Date().toISOString(),
    categoriaTarget:target
  });
  if(opzioni.usaInventario){
    voce.origine='alternativa-odierna';
    if(old&&!old.programmatoOriginale)voce.programmatoOriginale={
      realizzazioni:clone(old.realizzazioni||[]),
      categoriaTarget:old.categoriaTarget||target,
      carboidratoPianificato:old.carboidratoPianificato||null,
      programmatoIl:old.programmatoIl||null
    };
  }
  if(typeof put==='function') await put('piano',voce);
  return voce;
}

function templateRicetta(id){
  return state.dbRicette&&Array.isArray(state.dbRicette.ricette)
    ? state.dbRicette.ricette.find(r=>String(r.id)===String(id))
    : null;
}

async function materializzaRicetta(base,condimentoVarianteIndex){
  if(!base) return null;
  const ricetta=templateRicetta(base.recipeModelId);
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

async function alternativeRollV(base,giorno){
  if(!base) return [];
  const n=Number(base.numeroVariantiCondimento)||1;
  const out=[];
  for(let idx=0;idx<n;idx++){
    const x=await materializzaRicetta(base,idx);
    if(await ricettaAmmessa(x,giorno,{})) out.push(idx);
  }
  return out;
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

async function statoRollPasto(giorno,pasto){
  const voce=typeof getOne==='function'?await getOne('piano',giorno+'_'+pasto):null;
  if(!voce||!Array.isArray(voce.realizzazioni)) return {C:false,P:false,V:false};
  return {
    C:!!(await proprietarioRoll(voce,'C',giorno)),
    P:!!(await proprietarioRoll(voce,'P',giorno)),
    V:!!(await proprietarioRoll(voce,'V',giorno))
  };
}

async function ruotaPasto(giorno,pasto,tipo){
  tipo=String(tipo||'').toUpperCase();
  if(!['C','P','V'].includes(tipo)) return null;
  const id=giorno+'_'+pasto;
  const voce=typeof getOne==='function'?await getOne('piano',id):null;
  if(!voce||!Array.isArray(voce.realizzazioni)) return null;

  const owner=await proprietarioRoll(voce,tipo,giorno);
  if(!owner) return null;

  const real=clone(voce.realizzazioni[owner.indice]);
  const condIndex=Number(real.condimentoVarianteIndex)||0;

  if(tipo==='V'){
    const a=owner.alternative;
    const pos=a.indexOf(condIndex);
    real.condimentoVarianteIndex=a[(pos<0?0:pos+1)%a.length];
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
    origine:'motore-nuovo',
    programmatoIl:new Date().toISOString()
  });
  if(typeof put==='function') await put('piano',aggiornata);
  return aggiornata;
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
  const concrete=[];
  for(const r of (rdb.ricette||[])){
    const comb=generaCombinazioni(r);
    for(let i=0;i<comb.length;i++) concrete.push(await compilaRicetta(r,comb[i],i));
  }
  concrete.push(...await compilaContorniBaseCatalogo(),...await compilaProteineBaseCatalogo());
  state.ricetteConcrete=concrete;
  state.ricetteById=new Map(concrete.map(r=>[r.id,r]));
  await sincronizzaCacheRicette();
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
  getScadenzeImminenti,getAvanziScomodi,getCongelatiDaTempo,
  suggerisciCongelati,tempoScongelamento,salvafrigo,
  generaPasto,generaPianoSettimana,rigeneraPasto,statoRollPasto,ruotaPasto,materializzaRealizzazione,
  snapshotRealizzazione,
  applicaOverrideQuantitaRealizzazione,
  normalizzaRealizzazioniVerdura,
  assegnaCarboidratiCompatibili,
  limitaCarboidratiAutoAllaCopertura,
  chiaviStack,
  scegliCandidatoConMargine,
  ingredienteVerduraQuantificabile,coperturaVerduraRicette,ridimensionaVerdureRicetta,completaResiduoVerduraRicette,punteggioVerduraProgrammazione,ordinaVerdureProgrammazione,
  prioritaVerdureProgrammazionePasti,
  registraUtilizzo,copertura,caricaConfigurazioneNutrizionaleRisolta,selezioneCarboidratiPersistita,carbKeyNome,carbKeysRicetta,preparaBudgetCarboidrati,creaSequenzaCarboidrati,creaSequenzaProteine,carbRicettaAmmesso,consumaBudgetCarboidrati,accumulaConteggiPasto,pastoRispettaConteggi
};
})(typeof window!=='undefined'?window:globalThis);
