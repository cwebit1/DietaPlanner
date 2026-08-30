'use strict';
const assert=require('assert');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..'),index=fs.readFileSync(path.join(root,'index.html'),'utf8'),N=require('../nutrition-config.js');
for(const marker of ['function configAvanzataDefaultCanonico()','function configAvanzataEffettivaSalvata(raw)','data-vincolo-contesto','Regole applicative APP-CWE','PDF / piano nutrizionale','Contesti PDF aggiuntivi','aggiornaCampiProfiloNutrizionista','Configurazione salvata senza modificare il catalogo ricette'])assert(index.includes(marker),marker);
assert(!index.includes('applicaQuantitaNutrizionistaAlleRicette'));assert(!index.includes('quantitaNutrizionistaInGrammi'));
const u=N.contextDefaultsForIngredient({nome:'Uova',sottotipo:'uova'}),s=N.contextDefaultsForIngredient({nome:'Speck',sottotipo:'affettati'});assert.equal(u.colazione.quantityDefault,1);assert.equal(s.colazione.quantityDefault,40);assert.equal(s.pastoPrincipale.quantityDefault,60);
console.log('lotto-d root nutritionist setting: ok');
