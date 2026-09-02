'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;
const cfg={vegetablePortionGrams:200,saladPortionGrams:70};
const verdura=(grammi,nome)=>({nome,categoria:'V',slotIndex:0,grammi,quantita:grammi,macro:'verdura',gruppo:'verdura'});
const s={id:'s',classe:['C','S'],ingredienti:[verdura(80,'Sugo')],nutrienti:{kcal:1,proteine:0,carboidrati:0,grassi:0}};
const g={id:'g',classe:['PP','G'],ingredienti:[verdura(80,'Guarnizione')],nutrienti:{kcal:1,proteine:0,carboidrati:0,grassi:0}};
const v={id:'v',classe:'V',ingredienti:[verdura(200,'Contorno')],nutrienti:{kcal:1,proteine:0,carboidrati:0,grassi:0}};

const redistribuite=M.completaResiduoVerduraRicette([s,g],[s,g,v],'2026-09-03',cfg);
const snapshotS=M.snapshotRealizzazione({ricettaId:'s'},redistribuite[0]);
const snapshotG=M.snapshotRealizzazione({ricettaId:'g'},redistribuite[1]);
assert.equal(snapshotS.ingredientiEffettivi[0].grammi,100);
assert.equal(snapshotG.ingredientiEffettivi[0].grammi,100);
assert.equal(snapshotS.ruoloVerdura.S,true);
assert.equal(snapshotG.ruoloVerdura.G,true);
assert.equal(snapshotS.redistribuzioneVerdura.residuoOriginaleGrammi,40);
assert.deepEqual(snapshotS.nutrientiEffettivi,redistribuite[0].nutrienti,'nutrienti e quantità devono appartenere allo stesso snapshot');

redistribuite[0].ingredienti[0].grammi=999;
assert.equal(snapshotS.ingredientiEffettivi[0].grammi,100,'lo snapshot non deve seguire mutazioni successive');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert.match(html,/bilancioVerdura:voce\.bilancioVerdura\?structuredClone\(voce\.bilancioVerdura\):null/,'lo storico deve congelare anche il bilancio V/S/G');
assert.match(html,/ricettaNuovoDaRealizzazione\(real\)[\s\S]{0,180}scalaInventarioPerRicetta/,'l’inventario deve leggere la realizzazione materializzata dallo snapshot');
assert.match(html,/real\s*&&\s*real\.nutrientiEffettivi/,'la nutrizione programmata deve leggere i nutrienti dello snapshot');

console.log('lotto J snapshot atomico e propagazione V/S/G: ok');
