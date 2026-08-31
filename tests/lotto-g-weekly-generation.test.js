'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const stores={};
for(const name of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[name]=new Map();
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value?structuredClone(value):null;};
global.put=async(name,value)=>{(stores[name]||new Map()).set(value.id??value.chiave,structuredClone(value));return value;};
global.delKey=async(name,key)=>(stores[name]||new Map()).delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=> '2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

(async()=>{
  const init=await M.inizializza({basePath:''});
  assert.equal(init.template,40);
  assert(init.concrete>40);

  const breakfastVariants=(await global.getAll('varianti')).filter(v=>v.colazioneGruppo);
  assert(breakfastVariants.length>=9,'la sincronizzazione deve materializzare le opzioni della colazione');
  for(const group of ['proteine','carboidrati','grassi','carboidrati_semplici']){
    assert(breakfastVariants.some(v=>v.colazioneGruppo===group),'gruppo colazione mancante: '+group);
  }
  assert(breakfastVariants.filter(v=>v.colazioneGruppo!=='spuntino').every(v=>v.porzioneColazione),'ogni opzione della colazione deve mantenere la propria porzione');

  const secondoConCarboidrato=await M.assegnaCarboidratiCompatibili(
    [{day:'2026-09-01',di:1,pasto:'pranzo'}],['carne'],['patate'],
    {vegetables:{},carbohydrates:{selection:{patate:{mode:'fixed'},pasta:{mode:'auto'}},autoEligibleKeys:['pasta']}}
  );
  assert.equal(secondoConCarboidrato.valid,true,'ogni carboidrato attivato deve poter accompagnare un secondo');
  assert.equal(secondoConCarboidrato.keys[0],'patate');
  assert.equal(secondoConCarboidrato.sostituzioni[0],null,'un componente C autonomo non deve produrre falsi fallback');
  for(const carb of ['pane','gallette','pasta','riso','patate','piadina','friselle','crackers','taralli','polenta']){
    for(const protein of ['carne','pesce','formaggi','uova','legumi']){
      const cross=await M.assegnaCarboidratiCompatibili([{day:'2026-09-01',di:1,pasto:'pranzo'}],[protein],[carb],{vegetables:{},carbohydrates:{selection:{[carb]:{mode:'fixed'}},autoEligibleKeys:[]}});
      assert.equal(cross.valid,true,protein+' deve poter essere composto con '+carb);
      assert.equal(cross.keys[0],carb);
    }
  }

  for(let iteration=0;iteration<1;iteration++){
    const result=await M.generaPianoSettimana(0,{forza:true});
    assert.deepEqual(result.errori,[],`generazione ${iteration+1}`);
    assert.equal(result.generati.length,14);
    const records=await global.getAll('piano');
    assert.equal(records.length,14);
    for(const record of records){
      assert(record.realizzazioni.length);
      assert(record.realizzazioni.every(r=>r.schemaQuantita===1));
      const recipes=[];
      for(const real of record.realizzazioni){
        const recipe=await M.materializzaRealizzazione(real);
        assert(recipe);
        recipes.push(recipe);
        assert.deepEqual(recipe.ingredienti,real.ingredientiEffettivi);
        assert.deepEqual(recipe.nutrienti,real.nutrientiEffettivi);
      }
      const coverage=M.coperturaVerduraRicette(recipes,{vegetablePortionGrams:200,saladPortionGrams:70});
      assert(coverage.remainingFraction<0.000001,record.id+' residuo verdura non completato');
    }
  }

  const pomodoro=(await global.getAll('varianti')).find(v=>v.nome==='Pomodoro fresco');
  assert(pomodoro,'variante Pomodoro fresco');
  await global.put('impostazioni',{chiave:'verduraRicorrente',valore:pomodoro.id});
  await global.put('impostazioni',{chiave:'verduraRicorrentePasti',valore:['pranzo_0','pranzo_1','pranzo_2','pranzo_3','pranzo_4','pranzo_5','pranzo_6']});
  stores.piano.clear();
  const conPomodoro=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(conPomodoro.errori,[],'generazione con verdura ricorrente');
  for(const day of global.giorniSettimana()){
    const voce=await global.getOne('piano',day+'_pranzo');
    assert(voce&&voce.realizzazioni.length,day+' pranzo generato');
    const ricette=[];for(const real of voce.realizzazioni)ricette.push(await M.materializzaRealizzazione(real));
    assert(ricette.some(r=>(r.ingredienti||[]).some(i=>i.variantId===pomodoro.id)),day+' deve contenere Pomodoro fresco');
  }
  const pranzoDaCambiare='2026-09-02';
  const primaCambio=await global.getOne('piano',pranzoDaCambiare+'_pranzo');
  const cambiato=await M.rigeneraPasto(pranzoDaCambiare,'pranzo',primaCambio.categoriaTarget);
  assert(cambiato&&cambiato.realizzazioni.length,'la proposta alternativa deve esistere');
  const ricetteCambiate=[];for(const real of cambiato.realizzazioni)ricetteCambiate.push(await M.materializzaRealizzazione(real));
  assert(ricetteCambiate.some(r=>(r.ingredienti||[]).some(i=>i.variantId===pomodoro.id)),'Proponi nuovo pasto deve mantenere la verdura ricorrente del Set');

  assert.equal((await global.getAll('inventario')).length,0,'inventario vuoto non blocca la programmazione');
  console.log('lotto G generazione settimanale nuovo DB: ok');
})().catch(error=>{console.error(error);process.exit(1);});
