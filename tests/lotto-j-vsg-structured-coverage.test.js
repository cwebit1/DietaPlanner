'use strict';
const assert=require('node:assert/strict');
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;
const cfg={vegetablePortionGrams:200,saladPortionGrams:70};
const ingrediente=(grammi,porzione=200)=>({nome:'Verdura test',grammi,macro:'verdura',gruppo:'verdura',porzione});
const ricetta=(classe,grammi,porzione)=>({classe,ingredienti:[ingrediente(grammi,porzione)]});

let c=M.coperturaVerduraRicette([],cfg);
assert.equal(c.richiestaGrammi,200,'senza componenti resta il riferimento ortaggi');
assert.deepEqual([c.grammiV,c.grammiS,c.grammiG,c.residuoGrammi],[0,0,0,200]);

c=M.coperturaVerduraRicette([ricetta(['C','S'],80)],cfg);
assert.deepEqual([c.richiestaGrammi,c.grammiV,c.grammiS,c.grammiG,c.residuoGrammi],[200,0,80,0,120]);
assert.equal(c.coperturaCompleta,false);

c=M.coperturaVerduraRicette([ricetta(['PP','G'],60)],cfg);
assert.deepEqual([c.richiestaGrammi,c.grammiV,c.grammiS,c.grammiG,c.residuoGrammi],[200,0,0,60,140]);

c=M.coperturaVerduraRicette([ricetta(['C','S'],80),ricetta(['PP','G'],80)],cfg);
assert.deepEqual([c.grammiS,c.grammiG,c.residuoGrammi],[80,80,40]);
assert.equal(c.coperturaCompleta,false);

c=M.coperturaVerduraRicette([ricetta('V',200)],cfg);
assert.deepEqual([c.grammiV,c.residuoGrammi,c.coperturaCompleta],[200,0,true]);

c=M.coperturaVerduraRicette([ricetta('V',70,70)],cfg);
assert.equal(c.tipoPorzioneRichiesta,'salad');
assert.deepEqual([c.richiestaGrammi,c.grammiV,c.residuoGrammi],[70,70,0]);

c=M.coperturaVerduraRicette([ricetta('V',70,70),ricetta(['C','S'],80)],cfg);
assert.equal(c.tipoPorzioneRichiesta,'vegetable');
assert.equal(c.grammiV,200,'in un pasto misto l’insalata completa è normalizzata alla porzione ortaggi');
assert.equal(c.residuoGrammi,0);
assert.deepEqual(c.grammiRealiPerRuolo,{V:70,S:80,G:0},'le quantità fisiche restano disponibili separatamente');

console.log('lotto J copertura quantitativa strutturata V/S/G: ok');
