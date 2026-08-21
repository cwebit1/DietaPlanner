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
{
  const cfg={pasta:{limitato:false},riso:{limitato:false},pane:{limitato:false},friselle:{limitato:true,tettoSettimanale:2}};
  const grid=E.buildCarbGrid(['lun','mar'],['pranzo','cena'],{pasta:1,riso:1,pane:1,friselle:1},cfg,E.seeded(7));
  assert.equal(grid.errors.length,1,'una griglia non da 14 deve essere rifiutata');
  const days=['1','2','3','4','5','6','7'],full=E.buildCarbGrid(days,['pranzo','cena'],{pasta:6,riso:6,friselle:2},cfg,E.seeded(7));
  assert.equal(full.errors.length,0);assert.equal(Object.values(full.cells).flatMap(x=>Object.values(x)).length,14);
}
{
  const recipes=[{id:'a',ingredienti:[{variantId:'pom'}]},{id:'b',ingredienti:[{variantId:'zuc'}]}];
  let r=E.applyIngredientCaps(recipes,{pom:2},{pom:2});assert.deepEqual(r.pool.map(x=>x.id),['b']);assert.equal(r.exceeded,false);
  r=E.applyIngredientCaps([recipes[0]],{pom:2},{pom:2});assert.equal(r.pool[0].id,'a');assert.equal(r.exceeded,true);
  assert.equal(E.accumulateRecipeIngredients(recipes[0],{}).pom,1);
}
{
  const rows=E.shoppingDeficits({a:300,b:80},[{variantId:'a',stato:'disponibile',quantita:100}],{a:{formato:250},b:{formato:0}});
  assert.deepEqual(rows.find(x=>x.variantId==='a'),{variantId:'a',required:300,available:100,missing:200,packages:1,purchase:250});
  assert.equal(rows.find(x=>x.variantId==='b').purchase,80);
}
{
  const meal={primoCereale:'riso',programmatoIl:'2026-08-21T10:00:00Z'};
  assert.equal(E.hasMealContent({}),false);assert.equal(E.hasMealContent(meal),true);
  assert.equal(E.automaticConsumptionAllowed(meal,Date.parse('2026-08-21T15:00:00Z')),true);
  assert.equal(E.automaticConsumptionAllowed({...meal,programmatoIl:'2026-08-21T16:00:00Z'},Date.parse('2026-08-21T15:00:00Z')),false);
}
{
  assert.equal(E.profileAllowsRecipe({gruppoProteico:'carne_bianca'},'vegetariano'),false);
  assert.equal(E.profileAllowsRecipe({gruppoProteico:'formaggio_fresco'},'vegetariano'),true);
  assert.equal(E.profileAllowsRecipe({gruppoProteico:'uova'},'vegano'),false);
  assert.equal(E.profileAllowsRecipe({gruppoProteico:'legumi'},'vegano'),true);
  assert.equal(E.countSpecialMeals([{piattoSpeciale:true},{piattoSpeciale:false}]),1);
}
{
  const candidates=[{id:'cold',richiedeCottura:false},{id:'hot',richiedeCottura:true}],state={history:{}};
  assert.equal(E.chooseRecipe(candidates,state,{automatic:true,quick:true},E.seeded(1)).id,'cold');
}
{
  const urgent=[{id:'exp',ingredienti:[{variantId:'x'}]},{id:'freezer',ingredienti:[{variantId:'y'}]}],state={history:{}};
  const inv={x:[{variantId:'x',stato:'disponibile',quantita:100,scadenza:'2026-08-22'}],y:[{variantId:'y',stato:'disponibile',quantita:100,zona:'freezer'}]};
  assert.equal(E.chooseRecipe(urgent,state,{automatic:true,inventoryByVariant:inv,now:Date.parse('2026-08-21T12:00:00Z')},E.seeded(1)).id,'exp');
}
{
  const disabled=E.chooseVegetable([{id:'a',variantId:'a',name:'A',tier:'fresco',quantity:200,portion:200},{id:'b',variantId:'b',name:'B',tier:'fresco',quantity:200,portion:200}],{history:{}},{disabledVariantIds:['a']},E.seeded(1));assert.equal(disabled.id,'b');
  const recurring=E.chooseVegetable([{id:'a',variantId:'a',name:'A',tier:'fresco',quantity:0,portion:200}],{history:{}},{recurringVariantId:'a'},E.seeded(1));assert.equal(recurring.id,'a');
}
for(let seed=1;seed<=100;seed++){
  const days=['1','2','3','4','5','6','7'],r=E.buildProteinGrid(days,{},null,{},E.seeded(seed));assert.equal(r.errors.length,0,`settimana ${seed}`);for(const d of days)assert.equal(Object.values(r.cells[d]).filter(x=>x.macro).length,2);
  for(const [m,c] of Object.entries(r.counts)){const lim=E.DEFAULTS.proteinFrequencies[m];assert(c>=lim.min,`${seed} ${m} min`);if(lim.max!==null)assert(c<=lim.max,`${seed} ${m} max`);}
}
console.log('engine-core: 100 settimane e regole pure ok');
