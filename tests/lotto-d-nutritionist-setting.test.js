'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const N=require('../nutrition-config.js');

assert(index.includes('function configAvanzataDefaultCanonico()'));
assert(index.includes('function configAvanzataEffettivaSalvata(raw)'));
assert(index.includes('risolviConfigNutrizionista(cfg,vincoliIngredientiNutrizionistaDraft'));
assert(index.includes("document.getElementById('configAvanzataStato').textContent='✅ Configurazione salvata senza modificare il catalogo ricette'"));
assert(!index.includes('applicaQuantitaNutrizionistaAlleRicette'));
assert(!index.includes('quantitaNutrizionistaInGrammi'));
assert(index.includes('data-vincolo-contesto'));
assert(index.includes('data-vincolo-contesto-campo="max"'));
assert(index.includes('data-vincolo-contesto-campo="quantita"'));
assert(index.includes('Regole applicative APP-CWE'));
assert(index.includes('PDF / piano nutrizionale'));
assert(index.includes("const def=configAvanzataDefaultCanonico();await put('impostazioni',{chiave:'configAvanzata',valore:def})"));
assert(index.includes('applicaConfigAvanzataRuntime(cfgEffettiva)'));

{
  const r=N.resolveNutritionConfig({
    nutritionist:{
      ingredientConstraints:{
        uova:{stato:'limitato',min:1,max:2,quantita:2,contesti:{
          colazione:{max:2,quantita:1},
          pastoPrincipale:{quantita:2}
        }}
      }
    }
  });
  assert.equal(r.valid,true);
  assert.deepEqual(r.ingredientConstraints.uova.contexts.colazione,{quantity:1,max:2});
  assert.deepEqual(r.ingredientConstraints.uova.contexts.pastoPrincipale,{quantity:2,max:null});
}

{
  const r=N.resolveNutritionConfig({
    nutritionist:{
      config:{
        proteinFrequencies:{carne:{min:0,max:9,target:9}},
        specialBreakfastMax:9,
        oilGramsPerMeal:99
      }
    }
  });
  assert.equal(r.valid,true);
  assert.equal(r.proteinFrequencies.carne.min,1);
  assert.equal(r.proteinFrequencies.carne.max,3);
  assert.equal(r.specialBreakfastMax,2);
  assert.equal(r.oilGramsPerMeal,15);
}

const n=index.indexOf('nutrition-config.js?v=87');
const e=index.indexOf('engine-core.js?v=87');
const m=index.indexOf('motor.js?v=87');
assert(n>=0&&e>n&&m>e,'ordine runtime v87 resolver -> engine -> motor');

console.log('lotto-d nutritionist setting: ok');
