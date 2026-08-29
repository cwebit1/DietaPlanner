/* DietaPlanner - nuovo motore basato su db-ricette.json + ingredienti-new.json
   Sorgente primaria: nuovo ricettario. IndexedDB dell'index viene usato solo
   come persistenza per inventario, piano, impostazioni e cache compilata. */
(function(global){
'use strict';

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

const state = {
  pronto:false,
  dbRicette:null,
  ingredientiMap:{},
  ricetteConcrete:[],
  ricetteById:new Map(),
  baseByName:new Map(),
  variantByName:new Map(),
  tracking:{ultimoUtilizzo:{}, utilizziSettimanali:{}},
  rollCicli:new Map()
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

async function loadJson(url){
  const r=await fetch(url+(url.includes('?')?'&':'?')+'v='+Date.now(),{cache:'no-store'});
  if(!r.ok) throw new Error('HTTP '+r.status+' su '+url);
  return await r.json();
}

function groupOptions(g){
  if(!g || g.categoria==='Nessuno' || g.categoria==='Condimenti') return [];
  const ings=Array.isArray(g.ingredienti)?g.ingredienti:[];
  const cooks=Array.isArray(g.cotture)?g.cotture:[];
  const ingOpts=ings.length?ings:[null];
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

function estraiPartiRicetta(ricetta,combinazione){
  const parti=[];
  const gruppi=Array.isArray(ricetta.gruppi)?ricetta.gruppi:[];
  let indiceSlot=0;

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
      for(const ingrediente of (gruppo.ingredienti||[])){
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
      for(const cottura of (gruppo.cotture||[])){
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
    if(s.ingrediente&&s.ingrediente.nome){
      const nome=s.ingrediente.nome, meta=metaIngrediente(nome)||{};
      let q=s.ingrediente.dose!==undefined&&s.ingrediente.dose!==null&&s.ingrediente.dose!==''
        ? Number(s.ingrediente.dose)||0
        : await quantitaConfigurata(nome,meta);
      if((macroCounts[macro]||0)>1 && !(s.ingrediente.dose!==undefined&&s.ingrediente.dose!==null&&s.ingrediente.dose!=='')) q=q/macroCounts[macro];
      const base=state.baseByName.get(nome.toLowerCase());
      const variante=state.variantByName.get(nome.toLowerCase());
      out.push({
        nome,
        categoria:s.categoria,
        macro,
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
        carbRazionato:!!meta.carbRazionato,
        frequenzaSettimanale:meta.frequenzaSettimanale||null,
        stack:s.ingrediente.stack===undefined?1:s.ingrediente.stack,
        roll:s.ingrediente.roll===undefined?1:s.ingrediente.roll
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
function chiaviStack(combinazione,modelId){
  const keys=[];
  for(const s of combinazione.slot){
    if(s.categoria!=='C'){
      if(s.ingrediente&&s.ingrediente.nome) keys.push('i:'+s.categoria+':'+s.ingrediente.nome);
      if(s.cottura&&s.cottura.nome) keys.push('c:'+s.categoria+':'+s.cottura.nome);
    }
  }
  for(const g of combinazione.condimenti) for(const i of (g.ingredienti||[])) if(i.nome) keys.push('cond:'+i.nome);
  if(!keys.length){
    for(const s of combinazione.slot){
      if(s.ingrediente&&s.ingrediente.nome) keys.push('i:'+s.categoria+':'+s.ingrediente.nome);
      if(s.cottura&&s.cottura.nome) keys.push('c:'+s.categoria+':'+s.cottura.nome);
    }
  }
  return uniq(keys.map(k=>'m'+modelId+':'+k));
}

async function compilaRicetta(ricetta,combinazione,index){
  const n=costruisciNomeRicetta(ricetta,combinazione);
  const ingredienti=await preparaIngredientiDettagliati(ricetta,combinazione);
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
    chiaviStack:chiaviStack(combinazione,ricetta.id),
    slot:clone(combinazione.slot),
    condimenti:clone(combinazione.condimenti)
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
      deperibilita:d.deperibilita||'bassa',conservazione:d.conservazione||null,
      porzione:d.porzione||null,unitaPorzione:d.unitaPorzione||null,
      pesoPorzioneGrammi:d.pesoPorzioneGrammi||null,pesoPezzo:d.pesoPezzo||null,
      gradimento:d.gradimento===undefined?1:d.gradimento,stock:d.stock===undefined?1:d.stock,
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
    if(r&&r.valore) state.tracking=Object.assign({ultimoUtilizzo:{},utilizziSettimanali:{}},r.valore);
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
function giorniUltimo(key,data){
  const u=state.tracking.ultimoUtilizzo[key];
  if(!u) return Infinity;
  return giorniTra(new Date((typeof data==='string'?data:isoDate(data))+'T12:00:00'),new Date(u));
}
function cooldownOk(r,data){
  return (r.chiaviStack||[]).every(k=>giorniUltimo(k,data)>=COOLDOWN_GIORNI);
}
async function registraUtilizzo(r,data){
  const d=(data instanceof Date)?data:new Date((data||isoDate(new Date()))+'T12:00:00');
  const when=d.toISOString();
  for(const k of (r.chiaviStack||[])) state.tracking.ultimoUtilizzo[k]=when;
  const settimana=startOfWeekISO(d);
  for(const i of r.ingredienti||[]){
    const k=i.nome+'_'+settimana;
    state.tracking.utilizziSettimanali[k]=(Number(state.tracking.utilizziSettimanali[k])||0)+1;
  }
  await salvaTracking();
}

async function configRuntime(){
  const cfg={allergie:[],vincoli:{},weeklyLimits:{carne_rossa:1,affettati:1,pesce_conservato:1,pesce_grande:1},maxProteinSourcesPerDay:2};
  if(typeof getOne!=='function') return cfg;
  try{
    const [a,v,c]=await Promise.all([
      getOne('impostazioni','allergeniAttivi'),
      getOne('impostazioni','vincoliIngredientiNutrizionista'),
      getOne('impostazioni','configAvanzata')
    ]);
    cfg.allergie=a&&a.valore||[];
    cfg.vincoli=v&&v.valore||{};
    const x=c&&c.valore||{};
    cfg.maxProteinSourcesPerDay=Number(x.maxProteinSourcesPerDay)||2;
    if(x.subtypeCaps) cfg.weeklyLimits=Object.assign(cfg.weeklyLimits,x.subtypeCaps);
  }catch(e){}
  return cfg;
}

async function ricettaAmmessa(r,data,opts){
  opts=opts||{};
  const cfg=await configRuntime();
  for(const i of r.ingredienti||[]){
    if(i.allergeni&&i.allergeni.some(a=>cfg.allergie.includes(a))) return false;
    const base=i.ingredienteId && [...state.baseByName.values()].find(b=>b.id===i.ingredienteId);
    if(base&&base.bloccoManuale) return false;
    const vin=base&&cfg.vincoli[base.id];
    if(vin&&vin.stato==='escluso') return false;
    if(vin&&vin.stato==='limitato'&&vin.max!==undefined&&vin.max!==null&&vin.max!==''){
      if(usiSettimanali(i.nome,data)>=Number(vin.max)) return false;
    }
    const st=i.sottotipo;
    const cap=st&&cfg.weeklyLimits[st];
    if(cap!==undefined&&cap!==null&&usiSettimanali(i.nome,data)>=Number(cap)) return false;
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
  for(const r of state.ricetteConcrete) if(await ricettaAmmessa(r,data,opts)) out.push(r);
  return out;
}
function scegliCasuale(pool){ return pool.length?pool[Math.floor(Math.random()*pool.length)]:null; }

function firmaCopertura(r){
  return Array.from(copertura(r).tokens).sort().join('|');
}
function getRollSet(chiave){
  if(!state.rollCicli.has(chiave)) state.rollCicli.set(chiave,new Set());
  return state.rollCicli.get(chiave);
}
function azzeraRoll(chiave){
  state.rollCicli.delete(chiave);
}
function realizzazioniDaRicette(ricette){
  return (ricette||[]).map(r=>({
    ricettaId:r.id,
    recipeModelId:r.recipeModelId,
    copertura:Array.from(copertura(r).tokens)
  }));
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
function risultatoPasto(token,ricette){
  return {
    targetToken:token,
    firmaPasto:firmaPastoDaRicette(ricette),
    realizzazioni:realizzazioniDaRicette(ricette),
    ricette
  };
}
async function generaCandidatiPasto(target,data,opts){
  opts=opts||{};
  const token=PROTEIN_MACRO_TO_TOKEN[target]||SUBTYPE_TO_TOKEN[target]||target;
  const exclude=new Set(opts.excludeRecipeIds||[]);
  const pool=(await poolAmmesso(data,opts)).filter(r=>!exclude.has(r.id));
  let prot=pool.filter(r=>copertura(r).tokens.has(token));
  if(!prot.length) return [];

  const maxScore=Math.max(...prot.map(r=>scoreCopertura(r,token)));
  prot=prot.filter(r=>scoreCopertura(r,token)===maxScore);

  const livelli=await livelliPrioritaInventario();
  prot=applicaPrioritaInventario(prot,livelli);

  const risultati=[];
  const firme=new Set();

  for(const primo of prot){
    let carbChoices=[null];
    if(!copertura(primo).C){
      let carb=pool.filter(r=>copertura(r).C&&!copertura(r).P&&r.id!==primo.id);
      carb=applicaPrioritaInventario(carb,livelli);
      carbChoices=carb.length?carb:[null];
    }

    for(const carb of carbChoices){
      const base=[primo].concat(carb?[carb]:[]);
      const haV=base.some(r=>copertura(r).V);
      const haVParziale=base.some(r=>copertura(r).Vparziale);
      let vegChoices=[null];

      if(!haV || haVParziale){
        let veg=pool.filter(r=>copertura(r).V&&!copertura(r).P&&!base.some(x=>x.id===r.id));
        veg=applicaPrioritaInventario(veg,livelli);
        vegChoices=veg.length?veg:[null];
      }

      for(const veg of vegChoices){
        const ricette=base.concat(veg?[veg]:[]);
        if(!pastoCompletoPerToken(ricette,token)) continue;
        const firma=firmaPastoDaRicette(ricette);
        if(firme.has(firma)) continue;
        firme.add(firma);
        risultati.push(risultatoPasto(token,ricette));
      }
    }
  }
  return risultati;
}
async function generaPasto(target,data,opts){
  const candidati=await generaCandidatiPasto(target,data,opts||{});
  return scegliCasuale(candidati);
}

async function generaPianoSettimana(scarto,opzioni){
  scarto=Number(scarto)||0; opzioni=opzioni||{};
  if(typeof giorniSettimana!=='function'||typeof put!=='function'||typeof getOne!=='function') throw new Error('index non pronto');
  const days=giorniSettimana(scarto), today=typeof todayISO==='function'?todayISO():isoDate(new Date());
  let tab={};
  try{const r=await getOne('impostazioni','tabellaGiornoCategoria');tab=r&&r.valore||{};}catch(e){}
  const defaults=['carne','pesce','formaggi','uova','legumi','pesce','formaggi','carne','legumi','uova','pesce','formaggi','carne','legumi'];
  const generated=[];
  for(let di=0;di<days.length;di++){
    const day=days[di]; if(day<=today) continue;
    const arr=tab['giorno_'+di]||[];
    for(let mi=0;mi<2;mi++){
      const pasto=mi===0?'pranzo':'cena', id=day+'_'+pasto;
      const old=await getOne('piano',id);
      if(old&&old.bloccata) continue;
      if(old&&!opzioni.forza&&old.realizzazioni&&old.realizzazioni.length) continue;
      const target=arr[mi]||defaults[di*2+mi];
      const x=await generaPasto(target,day,{});
      if(!x) continue;
      await put('piano',{
        id,modo:'multi',motoreNuovo:true,realizzazioni:x.realizzazioni,
        porzioni:1,origine:'motore-nuovo',programmatoIl:new Date().toISOString(),
        categoriaTarget:target
      });
      generated.push(id);
    }
  }
  return {generati:generated};
}

async function rigeneraPasto(giorno,pasto,target){
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
  let visti=getRollSet(chiave);
  if(firmaCorrente) visti.add(firmaCorrente);

  const candidati=await generaCandidatiPasto(target,giorno,{});
  let disponibili=candidati.filter(c=>!visti.has(c.firmaPasto));

  if(!disponibili.length){
    azzeraRoll(chiave);
    visti=getRollSet(chiave);
    if(firmaCorrente) visti.add(firmaCorrente);
    disponibili=candidati.filter(c=>!visti.has(c.firmaPasto));
    if(!disponibili.length) disponibili=candidati.slice();
  }

  const x=scegliCasuale(disponibili);
  if(!x) return null;

  getRollSet(chiave).add(x.firmaPasto);

  const voce=Object.assign({},old||{id},{
    modo:'multi',
    motoreNuovo:true,
    realizzazioni:x.realizzazioni,
    porzioni:old&&old.porzioni||1,
    origine:'motore-nuovo',
    programmatoIl:new Date().toISOString(),
    categoriaTarget:target
  });
  if(typeof put==='function') await put('piano',voce);
  return voce;
}

async function rollMirato(giorno,pasto,ricettaId){
  const id=giorno+'_'+pasto;
  const voce=typeof getOne==='function'?await getOne('piano',id):null;
  if(!voce||!Array.isArray(voce.realizzazioni)||!voce.realizzazioni.length) return null;

  const corrente=state.ricetteById.get(ricettaId);
  if(!corrente) return null;

  const firma=firmaCopertura(corrente);
  const chiave='mirato|'+giorno+'|'+pasto+'|'+firma;
  const visti=getRollSet(chiave);

  const altriIds=new Set(
    voce.realizzazioni
      .map(x=>x&&x.ricettaId)
      .filter(Boolean)
      .filter(x=>x!==ricettaId)
  );
  visti.add(ricettaId);

  let pool=(await poolAmmesso(giorno,{}))
    .filter(r=>firmaCopertura(r)===firma)
    .filter(r=>!altriIds.has(r.id))
    .filter(r=>!visti.has(r.id));

  pool=await prioritaInventario(pool);
  let nuovo=scegliCasuale(pool);

  if(!nuovo){
    azzeraRoll(chiave);
    pool=(await poolAmmesso(giorno,{}))
      .filter(r=>firmaCopertura(r)===firma)
      .filter(r=>!altriIds.has(r.id))
      .filter(r=>r.id!==ricettaId);
    pool=await prioritaInventario(pool);
    nuovo=scegliCasuale(pool);
    if(!nuovo){
      pool=(await poolAmmesso(giorno,{}))
        .filter(r=>firmaCopertura(r)===firma)
        .filter(r=>!altriIds.has(r.id));
      pool=await prioritaInventario(pool);
      nuovo=scegliCasuale(pool);
    }
  }
  if(!nuovo) return null;

  getRollSet(chiave).add(nuovo.id);
  const nuove=voce.realizzazioni.map(x=>{
    if(!x||x.ricettaId!==ricettaId) return x;
    return realizzazioniDaRicette([nuovo])[0];
  });
  const aggiornata=Object.assign({},voce,{
    realizzazioni:nuove,
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
  state.rollCicli=new Map();
  await sincronizzaIngredientiIndexedDB();
  const concrete=[];
  for(const r of (rdb.ricette||[])){
    const comb=generaCombinazioni(r);
    for(let i=0;i<comb.length;i++) concrete.push(await compilaRicetta(r,comb[i],i));
  }
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

global.DietaPlannerNuovoMotore={
  inizializza,stato,getRicette,getRicetta,
  generaCombinazioni,estraiPartiRicetta,compilaPartiRicetta,costruisciNomeRicetta,
  getScadenzeImminenti,getAvanziScomodi,getCongelatiDaTempo,
  suggerisciCongelati,tempoScongelamento,salvafrigo,
  generaPasto,generaPianoSettimana,rigeneraPasto,rollMirato,
  registraUtilizzo,copertura
};
})(window);
