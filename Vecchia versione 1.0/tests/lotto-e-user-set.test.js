const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const motor=fs.readFileSync(path.join(root,'motor.js'),'utf8');
const Nutrition=require(path.join(root,'nutrition-config.js'));

function has(text,needle,message){assert(text.includes(needle),message||`manca: ${needle}`);}

// Il Set deve usare il modello canonico, non un secondo resolver.
has(index,'async function risolviSetUtenteCorrente(userOverride)');
has(index,'DietaPlannerNutritionConfig.resolveNutritionConfig');
has(index,"getOne('impostazioni','tettiIngredienteSettimanali')");
has(index,"chiave:'configCarboidratiStati'");
has(index,"chiave:'configCarboidratiExplicitZeroKeys'");

// I tre stati devono essere realmente selezionabili e persistenti.
has(index,"['auto','excluded','fixed'].includes(st.mode)");
has(index,"st.mode==='excluded'?'0 · ESCLUSO'");
has(index,"st.mode==='fixed'?'FISSO '+st.count:'AUTO'");
has(index,"if(st.mode==='fixed')impostaModalitaCarb(key,'auto');else if(st.mode==='auto')impostaModalitaCarb(key,'excluded');else impostaModalitaCarb(key,'auto')");

// Il riempimento del Set non può introdurre autonomamente carboidrati limitati.
has(index,"CONFIG_CARB_TIPI.filter(t=>!t.limitato&&modalitaCarb(t.chiave).mode!=='excluded'");
has(index,"Configurazione carboidrati non valida: ");

// Il motore deve leggere gli stessi stati persistiti dal Set.
has(motor,"'configCarboidratiStati'");
has(motor,"'configCarboidratiExplicitZeroKeys'");
has(motor,'estraiSelezioneCarboidratiUtente');

// Contratto resolver: AUTO completa 14 senza limitati; zero resta hard; fisso resta esatto.
const defaults=Nutrition.resolveNutritionConfig({user:{carbohydrates:{states:{}}}});
assert.equal(defaults.valid,true);
assert.equal(defaults.carbohydrates.fixedTotal,0);
assert.equal(defaults.carbohydrates.remainingSlots,14);
for(const key of Object.keys(Nutrition.PDF_BASELINE.carbohydrateWeeklyCaps)){
  assert(!defaults.carbohydrates.autoEligibleKeys.includes(key),`${key} limitato non deve entrare in AUTO`);
}

const custom=Nutrition.resolveNutritionConfig({user:{carbohydrates:{states:{
  friselle:{mode:'fixed',count:2},
  piadina:{mode:'excluded',count:0}
}}}});
assert.equal(custom.valid,true);
assert.equal(custom.carbohydrates.fixedCounts.friselle,2);
assert.equal(custom.carbohydrates.selection.piadina.mode,'excluded');
assert.equal(custom.carbohydrates.remainingSlots,12);

// I cap personali possono soltanto restringere il massimo clinico.
const capped=Nutrition.resolveNutritionConfig({
  nutritionist:{ingredientConstraints:{speck:{stato:'limitato',min:0,max:1}}},
  user:{ingredientWeeklyCaps:{speck:0}}
});
assert.equal(capped.valid,true);
assert.equal(capped.ingredientConstraints.speck.max,0);

const invalid=Nutrition.resolveNutritionConfig({
  nutritionist:{ingredientConstraints:{x:{stato:'limitato',min:1,max:3}}},
  user:{ingredientWeeklyCaps:{x:0}}
});
assert.equal(invalid.valid,false);

// Il Set deve derivare disabilitazioni cliniche e conservare il salvataggio unico.
has(index,'ingredienteEsclusoClinicamenteNelSet');
has(index,'renderSetLimitiPersonaliIngredienti');
has(index,'salvaLimitiPersonaliSet');
has(index,"document.getElementById('btnSalvaSetCompleto')");

console.log('lotto-e user set: ok');
