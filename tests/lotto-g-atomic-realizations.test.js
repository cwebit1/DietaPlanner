'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const motorSource=fs.readFileSync(path.join(root,'motor-v12.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

const recipe={
  nome:'Pasto prova',
  ingredienti:[{nome:'Zucchine',quantita:80,grammi:80,gruppo:'verdura',macro:'verdura'}],
  nutrienti:{kcal:20,proteine:1,carboidrati:3,grassi:0}
};
const real=M.snapshotRealizzazione({ricettaId:'r1'},recipe);
recipe.ingredienti[0].quantita=999;
assert.equal(real.schemaQuantita,1);
assert.equal(real.ingredientiEffettivi[0].quantita,80,'lo snapshot non dipende da future mutazioni');
assert.equal(real.nutrientiEffettivi.kcal,20);

const mixed={id:'mixed',classe:['C','V'],ingredienti:[{nome:'Zucchine',quantita:80,grammi:80,gruppo:'verdura',macro:'verdura',deperibilita:'alta'}]};
const side={id:'side',classe:['V'],ingredienti:[{nome:'Broccoli',quantita:200,grammi:200,gruppo:'verdura',macro:'verdura',deperibilita:'media'}]};
const portions={vegetablePortionGrams:200,saladPortionGrams:70};
const complete=M.completaResiduoVerduraRicette([mixed],[mixed,side],'2026-08-31',portions);
assert.equal(complete.length,2);
assert.equal(Math.round(complete[1].ingredienti[0].quantita),120);
assert.equal(complete[1].ingredienti[0].overrideQuantita,'residuo_verdura');
assert(Math.abs(M.coperturaVerduraRicette(complete,portions).remainingFraction)<1e-9);
const fullMixed={id:'full',classe:['C','V'],ingredienti:[{nome:'Zucchine',quantita:200,grammi:200,gruppo:'verdura',macro:'verdura'}]};
assert.deepEqual(M.completaResiduoVerduraRicette([fullMixed,side],[fullMixed,side],'2026-08-31',portions).map(r=>r.id),['full'],'un contorno divenuto superfluo deve essere rimosso dopo un Roll');

const fragile={id:'fragile',ingredienti:[{grammi:200,gruppo:'verdura',macro:'verdura',deperibilita:'alta'}]};
const durable={id:'durable',ingredienti:[{grammi:200,gruppo:'verdura',macro:'verdura',deperibilita:'bassa'}]};
assert.equal(M.ordinaVerdureProgrammazione([durable,fragile],'2026-08-31')[0].id,'fragile');
assert.equal(M.ordinaVerdureProgrammazione([fragile,durable],'2026-09-06')[0].id,'durable');

assert(motorSource.includes('const livelli=opts.usaInventario?await livelliPrioritaInventario():[]'));
assert(index.includes('realizzazioni:voce.realizzazioni?structuredClone(voce.realizzazioni):[]'));
assert(index.includes('if(!ing.variantId||ing.nonRichiedeInventario)continue'));
assert(index.includes("const ICONE_VSG={C:'🍞',P:'🥩',V:'🥬'}"),'le icone C/P/V devono restare definite in un unico punto condiviso');
assert(index.includes('function righeVsgUniche(materializzate)'),'una ricetta a piu ruoli deve essere raggruppata in una riga sola, non ripetuta');
assert(index.includes('righeVsgUniche(materializzate)')&&(index.match(/righeVsgUniche\(materializzate\)/g)||[]).length>=2,'Menù e Pasto devono condividere la stessa logica di raggruppamento C/P/V');
assert(index.includes('data-menu-macro'));
assert(index.includes('grid-template-columns:72px minmax(0,1fr) 34px'),'Menù e Pasto devono usare la griglia compatta icone/testo/comando');
assert(index.includes('riepilogoGrigliaPastoMenu(g,pasto)'),'il Menù deve rendere C/P/V su tre righe strutturate');
assert(index.includes("LABEL_PASTO[pasto].toUpperCase()+':'"),'Pasto deve mostrare PRANZO/CENA su una riga propria');
assert(index.includes('await generaColazioniSettimanaCorrente(scartoSettimane,opzioni)'),'la generazione corrente deve includere le colazioni');
assert(index.includes("getOne('impostazioni','colazionePreferitaGiorni')"),'le colazioni generate devono rispettare i giorni ricorrenti del Set');
assert(index.includes("modalita==='salvafrigo'?{soloAnteprima:true,usaInventario:true}:{soloAnteprima:true}")&&index.includes('rigeneraPasto(giorno,pasto,target,opzioni)'),'Salvafrigo (pagina Pasto) deve attivare la stessa rigenerazione con priorità inventario, come anteprima non salvata');
assert(index.includes('programmatoOriginale'));

for(const block of index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(block[1].trim())new Function(block[1]);
}
console.log('lotto G realizzazioni atomiche e UI: ok');
