'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..');
const E=require('../engine-core.js');
const motor=fs.readFileSync(path.join(root,'motor.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

{
  assert.equal(E.DEFAULTS.proteinFrequencies.legumi.max,null);
  const r=E.resolveNutritionConfig({user:{carbohydrates:{counts:{friselle:2}}}});
  assert.equal(r.valid,true);
  assert.equal(r.carbohydrates.fixedCounts.friselle,2);
  assert.equal(r.carbohydrates.remainingSlots,12);
}

{
  const cfg={pasta:{limitato:false},pane:{limitato:false},friselle:{limitato:true,tettoSettimanale:2}};
  const state={carbRemaining:{pasta:0,pane:0,friselle:0},carbsUsed:{},history:{}};
  assert.equal(E.chooseCarb(state,cfg,{},E.seeded(1)),null,'budget zero: nessun fallback');
}

{
  const recipes=[{id:'a',ingredienti:[{variantId:'pom'}]}];
  const r=E.applyIngredientCaps(recipes,{pom:2},{pom:2});
  assert.equal(r.pool.length,0,'il tetto ingrediente deve restare hard');
  assert.equal(r.blockedAll,true);
}

{
  const cov=E.vegetableCoverage([{kind:'vegetable',quantity:80}],{vegetablePortionGrams:200,saladPortionGrams:70});
  assert.equal(cov.residualVegetableGrams,120);
}

assert(motor.includes('const N=global.DietaPlannerNutritionConfig'));
assert(motor.includes('caricaConfigurazioneNutrizionaleRisolta'));
assert(motor.includes('state.nutritionConfig'));
assert(motor.includes('subtypeWeeklyCounts'));
assert(motor.includes('costruisciConteggiVincoliSettimana'));
assert(motor.includes('famiglieLimitateRicetta'));
assert(motor.includes('segnaFamiglieLimitatePasto(unique,state)'));
assert(motor.includes("state=await creaStatoMotoreSettimana(days,{includeAllPlanned:!(opzioni&&opzioni.forza)})"));
assert(motor.includes('plan.autoEligibleKeys'));
assert(motor.includes('plan.fixedCounts'));
assert(motor.includes("'setVerdureDisattivate'"));
assert(!motor.includes("cfg.proteinFrequencies.formaggi={min:3,max:6,target:5}"));
assert(!motor.includes("cfg.proteinFrequencies.legumi={min:14,max:null,target:14}"));

const n=index.indexOf('nutrition-config.js?v=86');
const e=index.indexOf('engine-core.js?v=86');
const m=index.indexOf('motor.js?v=86');
assert(n>=0&&e>n&&m>e,'ordine script resolver -> engine -> motor');

console.log('lotto-c integration: ok');
