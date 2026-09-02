'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const stores={};
for(const name of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[name]=new Map();
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value?structuredClone(value):null;};
global.put=async(name,value)=>{stores[name].set(value.id??value.chiave,structuredClone(value));return value;};
global.delKey=async(name,key)=>stores[name].delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=> '2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

(async()=>{
  await M.inizializza({basePath:''});
  let pasti=0;
  for(let iterazione=0;iterazione<25;iterazione++){
    stores.piano.clear();
    const risultato=await M.generaPianoSettimana(0,{forza:true});
    assert.deepEqual(risultato.errori,[],`settimana stress ${iterazione+1}`);
    assert.equal(risultato.generati.length,14);
    for(const voce of await global.getAll('piano')){
      pasti++;
      assert(voce.bilancioVerdura&&voce.bilancioVerdura.coperturaCompleta,voce.id+' deve salvare copertura completa');
      assert.equal(voce.bilancioVerdura.residuoGrammi,0,voce.id+' non deve salvare residui');
      assert(voce.realizzazioni.every(r=>r.schemaQuantita===1&&Array.isArray(r.ingredientiEffettivi)&&r.nutrientiEffettivi));
      assert(!voce.realizzazioni.some(r=>(r.copertura||[]).includes('V-')),'nessuno snapshot deve contenere V-');
      const ricette=[];
      for(const real of voce.realizzazioni)ricette.push(await M.materializzaRealizzazione(real));
      const verifica=M.coperturaVerduraRicette(ricette,{vegetablePortionGrams:200,saladPortionGrams:70});
      assert(verifica.remainingFraction<0.000001,voce.id+' deve restare completo dopo rimaterializzazione');
    }
  }
  assert.equal(pasti,350);
  console.log('lotto J stress V/S/G: 25 settimane, 350 pasti ok');
})().catch(error=>{console.error(error);process.exit(1);});
