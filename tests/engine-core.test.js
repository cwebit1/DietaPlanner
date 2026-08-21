'use strict';
const assert=require('assert');
const E=require('../engine-core.js');
const rng=E.seeded(42);

{
  const cfg={pasta:{limitato:false},pane:{limitato:false},friselle:{limitato:true,tettoSettimanale:2}};
  const v=E.validateCarbBudget({pasta:6,pane:6,friselle:2},cfg);
  assert.equal(v.ok,true);assert.equal(v.total,14);
  assert.equal(E.validateCarbBudget({pasta:7,pane:7},cfg).ok,false);
}
{
  const state={carbRemaining:{pasta:3,pane:2},carbsUsed:{},history:{}};
  const meal=E.composeMeal({subtype:'affettati',proteins:[{id:'bresaola',gruppoProteico:'affettati',ingredienti:[]}],carbConfig:{pasta:{},pane:{}},vegetables:[{id:'ins',variantId:'ins',name:'Insalata',tier:'fresco',quantity:100,portion:70}],vegetableOptions:{}},state,rng);
  assert.equal(meal.carbKey,'pane');assert.equal(meal.protein.id,'bresaola');
}
{
  const state={carbRemaining:{riso:1},carbsUsed:{},history:{}};
  const meal=E.composeMeal({subtype:'pesce_bianco',proteins:[{id:'merluzzo',gruppoProteico:'pesce_bianco',ingredienti:[['Patate',300]]}],carbConfig:{riso:{}},vegetables:[],vegetableOptions:{}},state,rng);
  assert.equal(meal.mode,'unico_completo');assert.equal(meal.coverage.veg,true);
}
{
  const state={history:{},vegetablesUsedDay:new Set(),vegetablesUsedWeek:{}};
  const first=E.chooseVegetable([{id:'f',variantId:'z',name:'Zucchine',tier:'fresco',quantity:200,portion:200},{id:'s',variantId:'p',name:'Piselli',tier:'surgelato',quantity:500,portion:120}],state,{seasonalNames:[]},rng);
  assert.equal(first.variantId,'z');
  const second=E.chooseVegetable([{id:'f',variantId:'z',name:'Zucchine',tier:'fresco',quantity:200,portion:200},{id:'r',variantId:'r',name:'Radicchio',tier:'fresco',quantity:100,portion:70}],state,{seasonalNames:[]},rng);
  assert.equal(second.variantId,'r');
}
{
  const recipes=[{id:'manual',soloManuale:true},{id:'normal'}],state={history:{}};
  assert.equal(E.chooseRecipe(recipes,state,{automatic:true},rng).id,'normal');
}
{
  const recipe={id:'latte',allergeniPresenti:['latte'],ingredienti:[{variantId:'v-latte'}]};
  assert.equal(E.recipeBlocked(recipe,{activeAllergens:['latte'],ingredientMeta:{'v-latte':{allergeni:['latte']}}}),true);
  assert.equal(E.recipeBlocked(recipe,{blockedIngredientIds:['v-latte'],ingredientMeta:{'v-latte':{allergeni:[]}}}),true);
  assert.equal(E.recipeBlocked(recipe,{activeAllergens:[],blockedIngredientIds:[],ingredientMeta:{'v-latte':{allergeni:['latte']}}}),false);
}
{
  assert.equal(E.automaticDayAllowed('2026-08-22','2026-08-21'),true);
  assert.equal(E.automaticDayAllowed('2026-08-21','2026-08-21'),false);
}
console.log('engine-core: ok');
