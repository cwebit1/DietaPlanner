'use strict';
const assert=require('node:assert/strict');
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;
const cfg={vegetablePortionGrams:200,saladPortionGrams:70};
const verdura=(grammi,nome)=>({nome,grammi,quantita:grammi,macro:'verdura',gruppo:'verdura'});
const s={id:'s',classe:['C','S'],ingredienti:[verdura(80,'Sugo')]};
const g={id:'g',classe:['PP','G'],ingredienti:[verdura(80,'Guarnizione')]};
const v={id:'v',classe:'V',ingredienti:[verdura(200,'Contorno')]};

const sotto=M.completaResiduoVerduraRicette([s,g],[s,g,v],'2026-09-03',cfg);
assert.deepEqual(sotto.map(r=>r.id),['s','g'],'sotto 50 g non deve essere aggiunta V');
assert.equal(sotto[0].ingredienti[0].grammi,100,'metà residuo va a S');
assert.equal(sotto[1].ingredienti[0].grammi,100,'metà residuo va a G');
assert.equal(M.coperturaVerduraRicette(sotto,cfg).residuoGrammi,0);
assert.equal(M.pastoCompletoPerToken(sotto,'PP',cfg),true,'S e G redistribuiti chiudono quantitativamente il requisito');
assert.equal(s.ingredienti[0].grammi,80,'il template S non deve essere mutato');
assert.equal(g.ingredienti[0].grammi,80,'il template G non deve essere mutato');

const sopra=M.completaResiduoVerduraRicette([{...s,ingredienti:[verdura(80,'Sugo')]}],[s,g,v],'2026-09-03',cfg);
assert.equal(sopra.length,2,'da 50 g in su deve essere aggiunta V');
assert.equal(sopra[1].id,'v');
assert.equal(Math.round(sopra[1].ingredienti[0].grammi),120,'V deve compensare esattamente la differenza');
assert.equal(M.coperturaVerduraRicette(sopra,cfg).residuoGrammi,0);

const confine=M.completaResiduoVerduraRicette([
  {...s,ingredienti:[verdura(100,'Sugo')]},
  {...g,ingredienti:[verdura(50,'Guarnizione')]}
],[s,g,v],'2026-09-03',cfg);
assert.equal(confine.length,3,'50 g esatti richiedono V compensativa');
assert.equal(Math.round(confine[2].ingredienti[0].grammi),50);

console.log('lotto J soglia e redistribuzione V/S/G: ok');
