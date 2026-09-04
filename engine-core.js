(function(global){
'use strict';

const N=global.DietaPlannerNutritionConfig||(typeof module!=='undefined'&&module.exports?require('./nutrition-config.js'):null);
if(!N)throw new Error('DietaPlannerNutritionConfig non caricato');

const DEFAULTS=Object.freeze({
  proteinFrequencies:{
    carne:{min:N.PDF_BASELINE.proteinFrequencies.carne.min,max:N.PDF_BASELINE.proteinFrequencies.carne.max,target:N.APP_DEFAULTS.proteinTargets.carne},
    pesce:{min:N.PDF_BASELINE.proteinFrequencies.pesce.min,max:N.PDF_BASELINE.proteinFrequencies.pesce.max,target:N.APP_DEFAULTS.proteinTargets.pesce},
    formaggi:{min:N.PDF_BASELINE.proteinFrequencies.formaggi.min,max:N.PDF_BASELINE.proteinFrequencies.formaggi.max,target:N.APP_DEFAULTS.proteinTargets.formaggi},
    uova:{min:N.PDF_BASELINE.proteinFrequencies.uova.min,max:N.PDF_BASELINE.proteinFrequencies.uova.max,target:N.APP_DEFAULTS.proteinTargets.uova},
    legumi:{min:N.PDF_BASELINE.proteinFrequencies.legumi.min,max:N.PDF_BASELINE.proteinFrequencies.legumi.max,target:N.APP_DEFAULTS.proteinTargets.legumi}
  },
  subtypeCaps:Object.assign({},N.PDF_BASELINE.subtypeCaps),
  maxProteinSourcesPerDay:N.APP_DEFAULTS.maxProteinSourcesPerDay,
  carbSlots:N.APP_DEFAULTS.carbSlots,carbCellMax:N.APP_DEFAULTS.carbCellMax,limitedCarbTotalMax:N.APP_DEFAULTS.limitedCarbTotalMax,
  fruit:{min:N.PDF_BASELINE.fruit.dailyMin,max:N.PDF_BASELINE.fruit.dailyMax,portionMin:N.PDF_BASELINE.fruit.portionMinGrams,portionMax:N.PDF_BASELINE.fruit.portionMaxGrams},
  specialBreakfastMax:N.APP_DEFAULTS.specialBreakfastMax,specialMealsMax:N.APP_DEFAULTS.specialMealsMax,
  cooldownDays:Object.assign({},N.APP_DEFAULTS.cooldownDays),oilGramsPerMeal:N.APP_DEFAULTS.oilGramsPerMeal,
  deadlines:Object.assign({},N.APP_DEFAULTS.deadlines)
});

const SUBTYPE_TO_MACRO=Object.freeze({
  carne_bianca:'carne',carne_rossa:'carne',affettati:'carne',
  pesce_bianco:'pesce',pesce_azzurro:'pesce',pesce_grande:'pesce',
  pesce_conservato:'pesce',crostacei:'pesce',molluschi:'pesce',
  formaggio_fresco:'formaggi',formaggio_stagionato:'formaggi',
  uova:'uova',legumi:'legumi'
});

const PROTEIN_CODE=Object.freeze({carne:'PC',pesce:'PP',formaggi:'PF',uova:'PU',legumi:'PL'});

function copy(x){return JSON.parse(JSON.stringify(x));}
function mergeConfig(raw){
  const out=copy(DEFAULTS),r=raw||{};
  for(const k of Object.keys(r)){
    if(r[k]&&typeof r[k]==='object'&&!Array.isArray(r[k])&&out[k]&&typeof out[k]==='object') out[k]=Object.assign({},out[k],r[k]);
    else if(r[k]!==undefined) out[k]=r[k];
  }
  return out;
}
function macroOf(subtype){return SUBTYPE_TO_MACRO[subtype]||subtype||null;}
function seeded(seed){let s=(Number(seed)||1)>>>0;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function shuffle(items,rng){const a=(items||[]).slice(),random=rng||Math.random;for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function oldest(items,lastUsed,weeklyUse,rng){
  if(!items||!items.length)return null;
  let bestUse=Infinity,bestTs=Infinity,pool=[];
  for(const item of items){const key=typeof item==='string'?item:item.id;const use=weeklyUse&&weeklyUse[key]||0,ts=lastUsed&&lastUsed[key]||0;
    if(use<bestUse||(use===bestUse&&ts<bestTs)){bestUse=use;bestTs=ts;pool=[item];}
    else if(use===bestUse&&ts===bestTs)pool.push(item);
  }
  return shuffle(pool,rng)[0]||null;
}
function recipeBlocked(recipe,ctx){
  if(!recipe||recipe.esclusa)return true;
  if(ctx&&ctx.automatic&&recipe.soloManuale)return true;
  const blocked=new Set((ctx&&ctx.blockedIngredientIds)||[]),allergens=new Set((ctx&&ctx.activeAllergens)||[]);
  if((recipe.allergeniPresenti||[]).some(a=>allergens.has(a)))return true;
  for(const ing of recipe.ingredienti||[]){
    const id=ing.variantId||ing.nomeLibero||ing[0];
    if(blocked.has(id))return true;
    const meta=ctx&&ctx.ingredientMeta&&ctx.ingredientMeta[id];
    if(meta&&meta.bloccoManuale)return true;
    if(meta&&(meta.allergeni||[]).some(a=>allergens.has(a)))return true;
  }
  return false;
}
function parseCoverage(recipe){
  const raw=Array.isArray(recipe&&recipe.copertura)?recipe.copertura.join('+'):(recipe&&recipe.copertura||'');
  const set=new Set(String(raw).split(/[+,\s]+/).filter(Boolean));
  const proteinTokens=[...set].filter(x=>['PC','PP','PF','PU','PL'].includes(x));
  return {tokens:set,protein:proteinTokens[0]||null,proteinTokens,carb:set.has('C'),veg:set.has('V')};
}
function requiredCoverage(macro){const p=PROTEIN_CODE[macroOf(macro)];return new Set([p,'C','V'].filter(Boolean));}
function unionCoverage(recipes){const out=new Set();for(const r of recipes||[])for(const t of parseCoverage(r).tokens)out.add(t);return out;}
function missingCoverage(recipes,macro){const have=unionCoverage(recipes),out=[];for(const t of requiredCoverage(macro))if(!have.has(t))out.push(t);return out;}
function coverageSatisfies(recipes,macro){return missingCoverage(recipes,macro).length===0;}
function coverageForRecipe(recipe,ingredientMeta){
  const existing=parseCoverage(recipe);if(existing.tokens.size)return [...existing.tokens];
  const tokens=[],macro=macroOf(recipe&&recipe.gruppoProteico);if(PROTEIN_CODE[macro])tokens.push(PROTEIN_CODE[macro]);
  let carb=false,vegGrams=0,salad=0;
  for(const ing of recipe&&recipe.ingredienti||[]){const name=String(ing.nomeLibero||ing[0]||'').toLowerCase(),qty=Number(ing.quantita!==undefined?ing.quantita:ing[1])||0;const m=ingredientMeta&&ingredientMeta[ing.variantId||ing.nomeLibero||ing[0]]||{};
    const group=m.gruppo||'';if(group==='carboidrati'||/(pasta|riso|farro|orzo|cous|pane|patat|polenta|gnocch|piadin|frisell|cracker|tarall|sfoglia)/.test(name))carb=true;
    if(!/(aglio|basilico|peperoncino|prezzemolo)/.test(name)&&(group==='verdura'||/(zucchin|pomodor|insalat|radicch|carot|finocch|broccol|melanzan|peperon)/.test(name))){if(/insalata/.test(name))salad+=qty;else vegGrams+=qty;}
  }
  if(carb)tokens.push('C');if(salad>=70||vegGrams>=200)tokens.push('V');return tokens;
}
/* buildProteinGrid: costruisce (o valida) la tabella proteica dei 7 giorni
   x 2 pasti (pranzo/cena), rispettando SEMPRE contemporaneamente: minimi e
   massimi settimanali per categoria, target come preferenza morbida,
   categorie escluse (assenti da cfg.proteinFrequencies o con max=0),
   celle fissate a mano (userTable) e il numero di fonti proteiche
   giornaliere (cfg.maxProteinSourcesPerDay, letto dalla configurazione
   canonica passata dal chiamante - mai un default locale duplicato).
   Con maxProteinSourcesPerDay===2 (default): pranzo e cena dello stesso
   giorno devono avere SEMPRE categorie diverse, garantito con vero
   backtracking (mai un fallback che riusa la categoria precedente
   quando il pool alternativo e' temporaneamente vuoto - quella era la
   causa esatta del duplicato ['carne','carne']). Con
   maxProteinSourcesPerDay===1: una singola categoria vale per entrambi
   i pasti dello stesso giorno (stessa semantica di
   opzioniProteinaPerSlot in motor-v12.js) - non dedotto mai dal numero
   di caselle riempite, letto sempre e solo dalla configurazione.
   Se i vincoli sono realmente incompatibili tra loro, restituisce
   errors non vuoto e cells={} - mai una griglia formalmente completa
   ma invalida. */
function buildProteinGrid(days,userTable,config,history,rng){
  const cfg=mergeConfig(config);
  const maxPerDay=Math.max(1,Math.min(2,Number(cfg.maxProteinSourcesPerDay)||2));
  const categorie=Object.keys(cfg.proteinFrequencies).filter(m=>{
    const f=cfg.proteinFrequencies[m];return f&&f.max!==0;
  });
  const counts={};for(const m of Object.keys(cfg.proteinFrequencies))counts[m]=0;
  const errors=[];
  const stato={};
  for(const day of days){
    const scelte=(userTable&&userTable[day]||[]).slice(0,2);
    const pranzo=scelte[0]&&cfg.proteinFrequencies[scelte[0]]?scelte[0]:null;
    const cena=scelte[1]&&cfg.proteinFrequencies[scelte[1]]?scelte[1]:null;
    if(pranzo&&cena){
      if(maxPerDay===2&&pranzo===cena)errors.push(`${day}: la stessa categoria (${pranzo}) non puo' comparire due volte con fonti proteiche/giorno=2.`);
      if(maxPerDay===1&&pranzo!==cena)errors.push(`${day}: con fonti proteiche/giorno=1 pranzo e cena devono coincidere (trovati ${pranzo} e ${cena}).`);
    }
    stato[day]={pranzo,cena};
    if(pranzo)counts[pranzo]++;
    if(cena)counts[cena]++;
  }
  if(errors.length)return {cells:{},counts,errors};
  for(const m of categorie){
    const max=cfg.proteinFrequencies[m].max;
    if(max!=null&&counts[m]>max)errors.push(`${m}: superato il massimo settimanale (${counts[m]}/${max}) solo con le celle fissate.`);
  }
  if(errors.length)return {cells:{},counts,errors};

  const liberi=[];
  for(const day of days){
    if(!stato[day].pranzo)liberi.push({day,pasto:'pranzo'});
    if(!stato[day].cena)liberi.push({day,pasto:'cena'});
  }
  // controllo rapido di fattibilita' residua: se la somma dei deficit ai
  // minimi supera gli slot liberi disponibili, e' gia' impossibile,
  // nessun bisogno di avviare la ricerca.
  const deficitTotale=categorie.reduce((tot,m)=>tot+Math.max(0,Number(cfg.proteinFrequencies[m].min||0)-counts[m]),0);
  if(deficitTotale>liberi.length){
    errors.push('Impossibile rispettare i minimi settimanali con gli slot liberi rimasti: servirebbero almeno '+deficitTotale+' pasti liberi, ne restano '+liberi.length+'.');
    return {cells:{},counts,errors};
  }

  const ordinaCandidati=(candidati)=>{
    const mischiati=shuffle(candidati,rng);
    return mischiati.slice().sort((a,b)=>{
      const da=Math.max(0,Number(cfg.proteinFrequencies[a].min||0)-counts[a]);
      const db=Math.max(0,Number(cfg.proteinFrequencies[b].min||0)-counts[b]);
      if(db!==da)return db-da; // maggior deficit al minimo prima
      const la=(history&&history.lastMacro&&history.lastMacro[a])||0;
      const lb=(history&&history.lastMacro&&history.lastMacro[b])||0;
      return la-lb; // usato meno di recente prima
    });
  };
  // Backtracking limitato ai soli slot liberi (al massimo 14): mai un
  // retry casuale illimitato. Il budget e' un limite di sicurezza sui
  // tentativi di candidato esplorati, ampiamente sufficiente per lo
  // spazio di ricerca reale (5 categorie, max 14 incognite) e mai
  // raggiunto da una configurazione davvero fattibile.
  const budget={n:20000};
  const assegna=(idx)=>{
    if(idx>=liberi.length){
      for(const m of categorie){
        const min=Number(cfg.proteinFrequencies[m].min||0);
        if(counts[m]<min)return false;
      }
      return true;
    }
    const slot=liberi[idx],altro=slot.pasto==='pranzo'?stato[slot.day].cena:stato[slot.day].pranzo;
    let candidati=categorie.filter(m=>{
      const max=cfg.proteinFrequencies[m].max;
      if(max!=null&&counts[m]>=max)return false;
      if(altro!=null){
        if(maxPerDay===2&&m===altro)return false;
        if(maxPerDay===1&&m!==altro)return false;
      }
      return true;
    });
    candidati=ordinaCandidati(candidati);
    for(const macro of candidati){
      if(budget.n--<=0)return false;
      stato[slot.day][slot.pasto]=macro;counts[macro]++;
      if(assegna(idx+1))return true;
      counts[macro]--;stato[slot.day][slot.pasto]=null;
    }
    return false;
  };
  const risolto=assegna(0);
  if(!risolto){
    errors.push('Nessuna combinazione valida trovata per i vincoli attuali (minimi/massimi settimanali, categorie escluse, celle fissate, fonti proteiche/giorno).');
    return {cells:{},counts,errors};
  }
  const cells={};
  for(const day of days){
    const scelteOriginali=(userTable&&userTable[day]||[]).slice(0,2);
    cells[day]={
      pranzo:{macro:stato[day].pranzo,source:scelteOriginali[0]&&scelteOriginali[0]===stato[day].pranzo?'user':'auto'},
      cena:{macro:stato[day].cena,source:scelteOriginali[1]&&scelteOriginali[1]===stato[day].cena?'user':'auto'}
    };
  }
  return {cells,counts,errors:[]};
}
function validateCarbBudget(budget,carbConfig,config){
  const cfg=mergeConfig(config),errors=[],normalized={},defs=carbConfig||{};let total=0,limited=0;
  for(const [key,n0] of Object.entries(budget||{})){const n=Math.max(0,Math.trunc(Number(n0)||0)),d=defs[key];normalized[key]=n;total+=n;if(n>cfg.carbCellMax)errors.push(`${key}: massimo ${cfg.carbCellMax}`);if(d&&d.limitato){limited+=n;const cap=d.tettoSettimanale==null?2:d.tettoSettimanale;if(n>cap)errors.push(`${key}: massimo ${cap}`);}}
  if(total!==cfg.carbSlots)errors.push(`totale carboidrati ${total}/${cfg.carbSlots}`);if(limited>cfg.limitedCarbTotalMax)errors.push(`carboidrati limitati ${limited}/${cfg.limitedCarbTotalMax}`);
  return {ok:!errors.length,errors,total,limited,normalized};
}
function chooseCarb(state,carbConfig,options,rng){
  const opts=options||{},defs=carbConfig||{},used=state.carbsUsed||(state.carbsUsed={}),remaining=state.carbRemaining||(state.carbRemaining={});
  let pool=Object.keys(defs).filter(k=>(remaining[k]||0)>0);
  if(opts.quick){const quick=pool.filter(k=>['pane','friselle'].includes(k));if(quick.length)pool=quick;}
  if(opts.proteinSubtype==='affettati'&&defs.pane){
    if(!pool.includes('pane'))return null;
    pool=['pane'];
  }
  pool=pool.filter(k=>!defs[k].limitato||(used[k]||0)<(defs[k].tettoSettimanale||2));
  if(!pool.length)return null;
  const pick=shuffle(pool,rng)[0]||null;
  if(!pick)return null;
  used[pick]=(used[pick]||0)+1;
  remaining[pick]=Math.max(0,(remaining[pick]||0)-1);
  return pick;
}
function inventoryUrgency(recipe,inventoryByVariant,now){
  let score=0;const today=now||Date.now();for(const ing of recipe&&recipe.ingredienti||[]){const rows=inventoryByVariant&&inventoryByVariant[ing.variantId]||[];for(const row of rows){if(row.stato==='esaurito'||Number(row.quantita)<=0)continue;if(row.scadenza){const dd=(Date.parse(row.scadenza+'T12:00:00')-today)/86400000;if(dd<=2)score=Math.max(score,300);}if(row.avanzoScomodo)score=Math.max(score,200);if(row.zona==='freezer')score=Math.max(score,100);}}return score;
}
function chooseRecipe(pool,state,options,rng){
  const opts=options||{},used=state.recipesUsed||(state.recipesUsed=new Set());let candidates=(pool||[]).filter(r=>!recipeBlocked(r,{automatic:opts.automatic!==false,blockedIngredientIds:opts.blockedIngredientIds,activeAllergens:opts.activeAllergens,ingredientMeta:opts.ingredientMeta}));
  const fresh=candidates.filter(r=>!used.has(r.id));if(fresh.length)candidates=fresh;if(opts.quick){const q=candidates.filter(r=>r.richiedeCottura===false);if(q.length)candidates=q;}
  let best=-Infinity,top=[];for(const r of candidates){const urgent=inventoryUrgency(r,opts.inventoryByVariant,opts.now);const ts=state.history&&state.history.lastRecipe&&state.history.lastRecipe[r.id]||0;const score=urgent-ts/1e15;if(score>best){best=score;top=[r];}else if(score===best)top.push(r);}
  const picked=shuffle(top,rng)[0]||null;if(picked)used.add(picked.id);return picked;
}
function vegetableTier(meta){if(!meta)return 'surgelato';if(meta.categoria==='surgelato'||meta.zona==='freezer')return 'surgelato';if(meta.categoria==='fresco'&&meta.deperibilita==='alta')return 'fresco';if(meta.categoria==='fresco'||meta.deperibilita==='media')return 'fresco_duraturo';return 'confezionato';}
function chooseVegetable(candidates,state,options,rng){
  const opts=options||{},disabled=new Set(opts.disabledVariantIds||[]),usedDay=state.vegetablesUsedDay||(state.vegetablesUsedDay=new Set()),usedWeek=state.vegetablesUsedWeek||(state.vegetablesUsedWeek={});
  let pool=(candidates||[]).filter(x=>!disabled.has(x.variantId));if(opts.recurringVariantId){const hard=pool.filter(x=>x.variantId===opts.recurringVariantId);return hard.length?oldest(hard,state.history&&state.history.lastVegetable,usedWeek,rng):null;}
  pool=pool.map(x=>Object.assign({},x,{tier:x.tier||vegetableTier(x.meta),inStock:Number(x.quantity)>=(Number(x.portion)||(/insalata/i.test(x.name||'')?70:200))}));
  const stockedFresh=pool.filter(x=>x.inStock&&x.tier==='fresco');if(stockedFresh.length)pool=stockedFresh;else{const stocked=pool.filter(x=>x.inStock);if(stocked.length)pool=stocked;else if(opts.seasonalNames&&opts.seasonalNames.length){const season=new Set(opts.seasonalNames.map(x=>String(x).toLowerCase()));const seasonal=pool.filter(x=>season.has(String(x.name).toLowerCase())||['confezionato','surgelato'].includes(x.tier));if(seasonal.length)pool=seasonal;}}
  const notToday=pool.filter(x=>!usedDay.has(x.variantId));if(notToday.length)pool=notToday;const pick=oldest(pool,state.history&&state.history.lastVegetable,usedWeek,rng);if(pick){usedDay.add(pick.variantId);usedWeek[pick.variantId]=(usedWeek[pick.variantId]||0)+1;}return pick;
}
function composeMeal(input,state,rng){
  const protein=chooseRecipe(input.proteins,state,Object.assign({},input.options,{automatic:true}),rng);if(!protein)return {error:'proteina_non_disponibile'};
  const subtype=protein.gruppoProteico||input.subtype,macro=macroOf(subtype);let carbKey=chooseCarb(state,input.carbConfig,{quick:input.quick,proteinSubtype:subtype},rng);if(subtype==='affettati')carbKey='pane';if(!carbKey)return {error:'carboidrato_non_disponibile'};
  const coverage=parseCoverage(protein),potatoRule=(protein.ingredienti||[]).some(i=>/patat/i.test(String(i.nomeLibero||i[0]||'')));
  let vegetable=null;if(!coverage.veg&&!potatoRule)vegetable=chooseVegetable(input.vegetables,state,input.vegetableOptions,rng);
  if(!coverage.veg&&!potatoRule&&!vegetable)return {error:'verdura_non_disponibile'};
  return {protein,proteinSubtype:subtype,proteinMacro:macro,carbKey,vegetable,coverage:{protein:true,carb:true,veg:coverage.veg||potatoRule||!!vegetable},mode:potatoRule?'unico_completo':'multi'};
}
function automaticDayAllowed(day,today){return String(day)>String(today);}

function buildCarbGrid(days,meals,budget,carbConfig,rng){
  const slots=[];for(const day of days||[])for(const meal of meals||['pranzo','cena'])slots.push({day,meal});
  const validation=validateCarbBudget(budget,carbConfig);if(!validation.ok)return {cells:{},errors:validation.errors.slice()};
  const keys=[];for(const [key,n] of Object.entries(validation.normalized))for(let i=0;i<n;i++)keys.push(key);
  const shuffled=shuffle(keys,rng),cells={};slots.forEach((slot,i)=>{cells[slot.day]=cells[slot.day]||{};cells[slot.day][slot.meal]={carbKey:shuffled[i],source:'system'};});
  return {cells,errors:[]};
}
function recipeIngredientKeys(recipe){return (recipe&&recipe.ingredienti||[]).map(i=>i.variantId||i.nomeLibero||i[0]).filter(Boolean);}
function applyIngredientCaps(pool,weeklyCounts,caps){
  const limits=caps||{},counts=weeklyCounts||{},all=(pool||[]).slice();
  const allowed=all.filter(r=>recipeIngredientKeys(r).every(k=>limits[k]===undefined||(counts[k]||0)<Number(limits[k])));
  return {pool:allowed,exceeded:allowed.length<all.length,blockedAll:all.length>0&&!allowed.length};
}
function accumulateRecipeIngredients(recipe,counts){const out=counts||{};for(const k of new Set(recipeIngredientKeys(recipe)))out[k]=(out[k]||0)+1;return out;}
function shoppingDeficits(requirements,inventory,variantMeta){
  const available={};for(const row of inventory||[])if(row.stato==='disponibile'&&Number(row.quantita)>0)available[row.variantId]=(available[row.variantId]||0)+Number(row.quantita);
  const rows=[];for(const [variantId,required0] of Object.entries(requirements||{})){const required=Number(required0)||0,have=available[variantId]||0,missing=Math.max(0,required-have);if(!missing)continue;const meta=variantMeta&&variantMeta[variantId]||{},format=Number(meta.formato)||0,packages=format>0?Math.ceil(missing/format):1;rows.push({variantId,required,available:have,missing,packages,purchase:format>0?packages*format:missing});}return rows;
}
function hasMealContent(meal){return !!(meal&&((meal.realizzazioni&&meal.realizzazioni.length)||meal.primoId||meal.secondoId||meal.contornoId||meal.ricettaId||meal.primoCereale||meal.componenti||meal.colazioneSpecialeId));}
function automaticConsumptionAllowed(meal,deadlineMs){if(!hasMealContent(meal)||meal.consumato)return false;const planned=Date.parse(meal.programmatoIl||'');return Number.isFinite(planned)&&planned<=Number(deadlineMs);}
function countSpecialMeals(records){return (records||[]).filter(x=>x&&x.piattoSpeciale).length;}
function withinWeeklyCap(current,max){return max==null||Number(current)<Number(max);}
function profileAllowsRecipe(recipe,profile){const macro=macroOf(recipe&&recipe.gruppoProteico);if(profile==='vegano')return !['carne','pesce','formaggi','uova'].includes(macro);if(profile==='vegetariano')return !['carne','pesce'].includes(macro);return true;}

function resolveNutritionConfig(input){return N.resolveNutritionConfig(input);}
function vegetableCoverage(entries,portionConfig){return N.vegetableCoverage(entries,portionConfig);}
const api={DEFAULTS,SUBTYPE_TO_MACRO,PROTEIN_CODE,mergeConfig,macroOf,seeded,shuffle,oldest,recipeBlocked,parseCoverage,requiredCoverage,unionCoverage,missingCoverage,coverageSatisfies,coverageForRecipe,buildProteinGrid,validateCarbBudget,chooseCarb,inventoryUrgency,chooseRecipe,vegetableTier,chooseVegetable,composeMeal,automaticDayAllowed,buildCarbGrid,recipeIngredientKeys,applyIngredientCaps,accumulateRecipeIngredients,shoppingDeficits,hasMealContent,automaticConsumptionAllowed,countSpecialMeals,withinWeeklyCap,profileAllowsRecipe,resolveNutritionConfig,vegetableCoverage};
global.DietaPlannerEngine=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
