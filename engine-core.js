(function(global){
'use strict';

const DEFAULTS=Object.freeze({
  proteinFrequencies:{
    carne:{min:1,max:3,target:3},pesce:{min:2,max:3,target:3},
    formaggi:{min:2,max:3,target:3},uova:{min:1,max:2,target:2},
    legumi:{min:2,max:null,target:3}
  },
  subtypeCaps:{carne_rossa:1,affettati:1,pesce_grande:1,pesce_conservato:1},
  maxProteinSourcesPerDay:2,
  carbSlots:14,carbCellMax:6,limitedCarbTotalMax:3,
  fruit:{min:2,max:3,portionMin:150,portionMax:200},
  specialBreakfastMax:1,specialMealsMax:2,
  cooldownDays:{carboidrati:7,verdure:2},oilGramsPerMeal:10,
  deadlines:{pranzo:'15:00',cena:'22:00'}
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
function buildProteinGrid(days,userTable,config,history,rng){
  const cfg=mergeConfig(config),cells={},counts={carne:0,pesce:0,formaggi:0,uova:0,legumi:0},errors=[];
  for(const day of days){cells[day]={pranzo:{macro:null,source:'auto'},cena:{macro:null,source:'auto'}};const chosen=(userTable&&userTable[day]||[]).slice(0,2);chosen.forEach((macro,i)=>{if(!cfg.proteinFrequencies[macro])return;const meal=i?'cena':'pranzo';cells[day][meal]={macro,source:'user'};counts[macro]++;});}
  for(const [m,n] of Object.entries(counts)){const max=cfg.proteinFrequencies[m].max;if(max!==null&&n>max)errors.push(`${m}: ${n} > ${max}`);}
  let previous=null;
  for(const day of days)for(const meal of ['pranzo','cena']){const cell=cells[day][meal];if(cell.macro){previous=cell.macro;continue;}
    let pool=Object.keys(cfg.proteinFrequencies).filter(m=>counts[m]<cfg.proteinFrequencies[m].min);
    if(!pool.length)pool=Object.keys(cfg.proteinFrequencies).filter(m=>counts[m]<(cfg.proteinFrequencies[m].target||cfg.proteinFrequencies[m].min)&&(cfg.proteinFrequencies[m].max===null||counts[m]<cfg.proteinFrequencies[m].max));
    if(!pool.length)pool=Object.keys(cfg.proteinFrequencies).filter(m=>cfg.proteinFrequencies[m].max===null||counts[m]<cfg.proteinFrequencies[m].max);
    const alt=pool.filter(m=>m!==previous);if(alt.length)pool=alt;
    pool.sort((a,b)=>((history&&history.lastMacro&&history.lastMacro[a])||0)-((history&&history.lastMacro&&history.lastMacro[b])||0));
    const macro=pool.length?shuffle(pool.filter(x=>((history&&history.lastMacro&&history.lastMacro[x])||0)===((history&&history.lastMacro&&history.lastMacro[pool[0]])||0)),rng)[0]:null;
    if(!macro){errors.push(`nessuna proteina per ${day} ${meal}`);continue;}cell.macro=macro;counts[macro]++;previous=macro;
  }
  return {cells,counts,errors};
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
  if(opts.proteinSubtype==='affettati'&&defs.pane)pool=['pane'];
  if(!pool.length)pool=Object.keys(defs).filter(k=>!defs[k].limitato||(used[k]||0)<(defs[k].tettoSettimanale||2));
  pool=pool.filter(k=>!defs[k].limitato||(used[k]||0)<(defs[k].tettoSettimanale||2));if(!pool.length)return null;
  const pick=oldest(pool,state.history&&state.history.lastCarb,used,rng);used[pick]=(used[pick]||0)+1;if((remaining[pick]||0)>0)remaining[pick]--;return pick;
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
  return {pool:allowed.length?allowed:all,exceeded:!allowed.length&&all.length>0};
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

const api={DEFAULTS,SUBTYPE_TO_MACRO,PROTEIN_CODE,mergeConfig,macroOf,seeded,shuffle,oldest,recipeBlocked,parseCoverage,requiredCoverage,unionCoverage,missingCoverage,coverageSatisfies,coverageForRecipe,buildProteinGrid,validateCarbBudget,chooseCarb,inventoryUrgency,chooseRecipe,vegetableTier,chooseVegetable,composeMeal,automaticDayAllowed,buildCarbGrid,recipeIngredientKeys,applyIngredientCaps,accumulateRecipeIngredients,shoppingDeficits,hasMealContent,automaticConsumptionAllowed,countSpecialMeals,withinWeeklyCap,profileAllowsRecipe};
global.DietaPlannerEngine=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
