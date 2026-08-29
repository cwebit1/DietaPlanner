'use strict';

const assert=require('assert');
const path=require('path');
const fs=require('fs');

const N=require('../nutrition-config.js');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','nutrition-baseline-v1.json'),'utf8'));

assert.equal(N.VERSION,fixture.version);
assert.deepEqual(N.PDF_BASELINE.proteinFrequencies,fixture.proteinFrequencies);
assert.equal(N.PDF_BASELINE.subtypeCaps.affettati,fixture.subtypeCaps.affettati);
assert.deepEqual(
  Object.keys(N.PDF_BASELINE.carbohydrateWeeklyCaps).sort(),
  fixture.carbohydrates.limitedByPdf.slice().sort()
);
assert.deepEqual(
  N.PDF_BASELINE.carbohydrateUncapped.slice().sort(),
  fixture.carbohydrates.notLimitedByPdf.slice().sort()
);

{
  const r=N.resolveNutritionConfig({});
  assert.equal(r.valid,true);
  assert.deepEqual(r.proteinFrequencies.legumi,{min:2,max:null,target:3,quantita:null});
  assert.equal(r.specialBreakfastMax,1);
  assert.equal(r.oilGramsPerMeal,10);
  assert.equal(r.carbohydrates.fixedTotal,0);
  assert.equal(r.carbohydrates.remainingSlots,14);
  assert.equal(r.carbohydrates.autoInsertWeeklyCapped,false);
  assert.deepEqual(r.carbohydrates.autoEligibleKeys.slice().sort(),fixture.carbohydrates.notLimitedByPdf.slice().sort());
  for(const k of fixture.carbohydrates.limitedByPdf) assert(!r.carbohydrates.autoEligibleKeys.includes(k),k+' non deve entrare nel riempimento AUTO');
}

{
  const r=N.resolveNutritionConfig({
    user:{carbohydrates:{counts:{friselle:2}}}
  });
  assert.equal(r.valid,true);
  assert.equal(r.carbohydrates.fixedCounts.friselle,2);
  assert.equal(r.carbohydrates.fixedTotal,2);
  assert.equal(r.carbohydrates.remainingSlots,12);
  assert(!r.carbohydrates.autoEligibleKeys.includes('friselle'));
  assert.equal(r.carbohydrates.randomizeNature,true);
  assert.equal(r.carbohydrates.randomizePlacement,true);
}

{
  const r=N.resolveNutritionConfig({
    user:{carbohydrates:{counts:{piadina:0},explicitZeroKeys:['piadina']}}
  });
  assert.equal(r.valid,true);
  assert.equal(r.carbohydrates.selection.piadina.mode,'excluded');
  assert(r.carbohydrates.excludedKeys.includes('piadina'));
  assert(!r.carbohydrates.autoEligibleKeys.includes('piadina'));
}

{
  const r=N.resolveNutritionConfig({
    user:{carbohydrates:{counts:{piadina:0}}}
  });
  assert.equal(r.valid,true);
  assert.equal(r.carbohydrates.selection.piadina.mode,'auto','0 legacy senza marcatore esplicito deve restare AUTO');
}

{
  const r=N.resolveNutritionConfig({
    user:{carbohydrates:{states:{piadina:{mode:'fixed',count:3}}}}
  });
  assert.equal(r.valid,false);
  assert(r.errors.some(x=>x.includes('piadina')&&x.includes('tetto PDF 2')));
}

{
  const r=N.resolveNutritionConfig({
    user:{carbohydrates:{states:{
      friselle:{mode:'fixed',count:2},
      piadina:{mode:'fixed',count:2}
    }}}
  });
  assert.equal(r.valid,false);
  assert(r.errors.some(x=>x.includes('tetto applicativo totale 3')));
}

{
  const states={};
  for(const k of fixture.carbohydrates.notLimitedByPdf) states[k]='excluded';
  const r=N.resolveNutritionConfig({user:{carbohydrates:{states}}});
  assert.equal(r.valid,false);
  assert(r.errors.some(x=>x.includes('nessuna voce AUTO')));
}

{
  const input={
    nutritionist:{
      config:{
        dietProfile:'vegetariano',
        proteinFrequencies:{
          carne:{min:1,max:2,target:2},
          legumi:{min:3,max:4,target:4}
        }
      }
    }
  };
  const before=JSON.stringify(input);
  const r=N.resolveNutritionConfig(input);
  assert.equal(JSON.stringify(input),before,'resolver non deve mutare gli input');
  assert.deepEqual(r.profile.forbiddenProteinMacros,['carne','pesce']);
  assert.equal(r.proteinFrequencies.carne.max,2);
  assert.equal(r.proteinFrequencies.legumi.min,3);
  assert.equal(r.proteinFrequencies.legumi.max,4);
  assert.equal(r.proteinFrequencies.formaggi.min,2,'il profilo non deve inventare frequenze');
}

{
  const r=N.resolveNutritionConfig({
    nutritionist:{
      config:{
        proteinFrequencies:{
          carne:{min:0,max:9,target:9}
        },
        subtypeCaps:{affettati:7},
        specialBreakfastMax:8,
        snackWeeklyCaps:{granita_spuntino:9},
        oilGramsPerMeal:40
      }
    }
  });
  assert.equal(r.valid,true);
  assert.equal(r.proteinFrequencies.carne.min,1);
  assert.equal(r.proteinFrequencies.carne.max,3);
  assert.equal(r.proteinFrequencies.carne.target,3);
  assert.equal(r.subtypeCaps.affettati,1);
  assert.equal(r.specialBreakfastMax,2);
  assert.equal(r.snackWeeklyCaps.granita_spuntino,3);
  assert.equal(r.oilGramsPerMeal,15);
  assert(r.warnings.length>=5);
}

{
  const r=N.resolveNutritionConfig({
    nutritionist:{
      ingredientConstraints:{
        speck:{stato:'limitato',min:0,max:1,quantita:60},
        escluso:{stato:'escluso'}
      }
    },
    user:{
      ingredientWeeklyCaps:{speck:0,escluso:5,pasta:2}
    }
  });
  assert.equal(r.valid,true);
  assert.equal(r.ingredientConstraints.speck.max,0);
  assert.equal(r.ingredientConstraints.speck.min,0);
  assert.equal(r.ingredientConstraints.speck.quantity,60);
  assert.equal(r.ingredientConstraints.escluso.state,'excluded');
  assert.equal(r.ingredientConstraints.escluso.max,0);
  assert.equal(r.ingredientConstraints.pasta.max,2);
}

{
  const r=N.resolveNutritionConfig({
    nutritionist:{
      ingredientConstraints:{
        x:{stato:'limitato',min:1,max:3,quantita:100}
      }
    },
    user:{ingredientWeeklyCaps:{x:0}}
  });
  assert.equal(r.valid,false);
  assert.equal(r.ingredientConstraints.x.max,1,'il minimo clinico deve restare soddisfacibile');
  assert(r.errors.some(x=>x.includes('sotto il minimo clinico')));
}

{
  const cov=N.vegetableCoverage([{kind:'vegetable',quantity:80}],{vegetablePortionGrams:200,saladPortionGrams:70});
  assert.equal(cov.coveredFraction,0.4);
  assert.equal(cov.remainingFraction,0.6);
  assert.equal(cov.residualVegetableGrams,120);
  assert.equal(cov.residualSaladGrams,42);
}

{
  const cov=N.vegetableCoverage([
    {kind:'vegetable',quantity:100},
    {kind:'salad',quantity:35}
  ],{vegetablePortionGrams:200,saladPortionGrams:70});
  assert.equal(cov.coveredFraction,1);
  assert.equal(cov.remainingFraction,0);
  assert.equal(cov.residualVegetableGrams,0);
}

{
  const r=N.resolveNutritionConfig({
    nutritionist:{
      allergens:['latte','uova','latte'],
      blockedIngredientIds:['a','a','b']
    }
  });
  assert.deepEqual(r.safety.allergens,['latte','uova']);
  assert.deepEqual(r.safety.blockedIngredientIds,['a','b']);
}

{
  const r=N.resolveNutritionConfig({
    nutritionist:{config:{fruit:{min:9,max:9,portionMin:999,portionMax:999}}}
  });
  assert.equal(r.valid,false);
  assert.equal(r.fruit.min,3);
  assert.equal(r.fruit.max,3);
  assert.equal(r.fruit.portionMin,200);
  assert.equal(r.fruit.portionMax,200);
}

console.log('nutrition-config resolver: ok');
