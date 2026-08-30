'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const stores={};
for(const name of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[name]=new Map();
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value===undefined?null:structuredClone(value);};
global.put=async(name,value)=>{(stores[name]||new Map()).set(value.id??value.chiave,structuredClone(value));return value;};
global.delKey=async(name,key)=>(stores[name]||new Map()).delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=> '2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

async function resetPlanning(){
  stores.piano.clear();
  stores.consumoGiorno.clear();
}

(async()=>{
  await M.inizializza({basePath:''});

  const base=M.getRicette()[0];
  const legacy={ricettaId:base.id,recipeModelId:base.recipeModelId,condimentoVarianteIndex:0};
  const migrated=await M.materializzaRealizzazione(legacy);
  assert(migrated,'una realizzazione precedente allo schemaQuantita resta leggibile');
  assert(Array.isArray(migrated.ingredienti)&&migrated.ingredienti.length>0);

  const snap=M.snapshotRealizzazione(legacy,migrated);
  assert.equal(snap.schemaQuantita,1);
  const materialized=await M.materializzaRealizzazione(snap);
  assert.deepEqual(materialized.ingredienti,snap.ingredientiEffettivi);

  assert.deepEqual(
    M.selezioneCarboidratiPersistita({riso:0,pasta:2},{pasta:['utente']},{},['riso']),
    {states:{riso:{mode:'excluded',count:0},pasta:{mode:'fixed',count:2}},explicitZeroKeys:['riso']}
  );

  await resetPlanning();
  const first=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(first.errori,[]);
  assert.equal((await getAll('piano')).length,14,'settimana vuota');

  const preserved=(await getAll('piano'))[0];
  preserved.bloccata=true;
  preserved.marker='preserva';
  await put('piano',preserved);
  for(const record of (await getAll('piano')).slice(1,8))stores.piano.delete(record.id);
  const partial=await M.generaPianoSettimana(0,{});
  assert.deepEqual(partial.errori,[]);
  assert.equal((await getAll('piano')).length,14,'settimana parziale completata');
  assert.equal((await getOne('piano',preserved.id)).marker,'preserva','pasto bloccato preservato');

  const before=JSON.stringify(await getAll('piano'));
  const full=await M.generaPianoSettimana(0,{});
  assert.deepEqual(full.errori,[]);
  assert.equal(full.generati.length,0,'settimana piena non rigenerata senza forza');
  assert.equal(JSON.stringify(await getAll('piano')),before);

  for(const profile of ['vegetariano','vegano']){
    await resetPlanning();
    stores.impostazioni.delete('motoreNuovoTracking');
    await put('impostazioni',{chiave:'configAvanzata',valore:{dietProfile:profile}});
    await M.inizializza({basePath:''});
    const result=await M.generaPianoSettimana(0,{forza:true});
    assert.deepEqual(result.errori,[],profile+' genera una settimana completa');
    assert.equal(result.generati.length,14,profile);
    const forbidden=profile==='vegano'?new Set(['carne','pesce','formaggi','uova']):new Set(['carne','pesce']);
    for(const record of await getAll('piano'))for(const real of record.realizzazioni){
      const recipe=await M.materializzaRealizzazione(real);
      assert(!(recipe.ingredienti||[]).some(i=>forbidden.has(i.macro)),profile+' non usa macro vietate');
    }
  }

  console.log('lotto H stress e migrazioni: ok');
})().catch(error=>{console.error(error);process.exit(1);});
