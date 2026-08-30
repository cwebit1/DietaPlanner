'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const db=require('../db-ricette.json');
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

const cold=db.ricette.filter(r=>r.stackScope==='insalate_fredde_cereali');
assert.equal(cold.length,3);
assert.deepEqual(cold.map(r=>(Array.isArray(r.classe)?r.classe:[]).find(x=>['PF','PP','PL'].includes(x))).sort(),['PF','PL','PP']);
const fish=cold.find(r=>r.classe.includes('PP'));
assert.deepEqual(fish.gruppi.find(g=>g.categoria==='PP').ingredienti.map(i=>i.nome).sort(),['Salmone affumicato','Tonno']);
assert(!JSON.stringify(cold).includes('"Salmone"'));
for(const recipe of cold){
  const comps=recipe.gruppi.find(g=>g.categoria==='V').composizioni;
  assert.deepEqual(comps.map(c=>c.nome),['pomodorini e cetriolo','pomodorini e carote','pomodorini e peperoni']);
  for(const comp of comps){
    assert.equal(comp.ingredienti.reduce((sum,i)=>sum+i.dose,0),225);
    assert.equal(comp.ingredienti[0].nome,'Pomodorini');
  }
}

const sauces=db.ricette.find(r=>r.stackScope==='sughi_verdure');
assert(sauces);
const sauceComps=sauces.gruppi.find(g=>g.categoria==='V').composizioni;
assert.deepEqual(sauceComps.map(c=>c.nome),[
  'zucchine e melanzane','zucchine e carote','zucchine e pomodoro',
  'pomodoro e melanzane','piselli e carote','piselli e pomodoro fresco',
  'pomodoro e basilico','aglio, olio e pomodorini'
]);
assert(JSON.stringify(sauceComps).includes('Piselli surgelati'));
assert(!JSON.stringify(sauceComps).includes('Piselli in barattolo'));
for(const comp of sauceComps){
  const veg=comp.ingredienti.filter(i=>i.categoria==='V');
  assert(veg.reduce((sum,i)=>sum+i.dose,0)<=80,comp.nome+' deve restare un sugo parziale');
}

const eggPeas=db.ricette.find(r=>r.stackScope==='uovo_piselli');
assert(eggPeas);
assert.equal(eggPeas.gruppi.find(g=>g.categoria==='PU').ingredienti[0].dose,1);
assert.equal(eggPeas.gruppi.find(g=>g.categoria==='PL').ingredienti[0].dose,60);
assert.equal(eggPeas.gruppi.find(g=>g.categoria==='PL').ingredienti[0].nome,'Piselli surgelati');

(async()=>{
  await M.inizializza({basePath:''});
  const concrete=M.getRicette();
  const coldConcrete=concrete.filter(r=>r.stackScope==='insalate_fredde_cereali');
  assert(coldConcrete.length>0);
  for(const r of coldConcrete){
    const coverage=M.coperturaVerduraRicette([r],{vegetablePortionGrams:225,saladPortionGrams:75});
    assert.equal(coverage.remainingFraction,0,r.nome);
  }
  const sauceConcrete=concrete.filter(r=>r.stackScope==='sughi_verdure');
  assert(sauceConcrete.length>0);
  for(const r of sauceConcrete.slice(0,20)){
    const coverage=M.coperturaVerduraRicette([r],{vegetablePortionGrams:225,saladPortionGrams:75});
    assert(coverage.remainingFraction>0,r.nome+' deve richiedere residuo');
    assert(r.chiaviStack.every(k=>k.startsWith('s:sughi_verdure:')));
  }
  const eggConcrete=concrete.find(r=>r.stackScope==='uovo_piselli');
  assert(eggConcrete);
  assert.equal(eggConcrete.ingredienti.find(i=>i.nome==='Uova').quantita,1);
  assert.equal(eggConcrete.ingredienti.find(i=>i.nome==='Piselli surgelati').quantita,60);
  assert(M.coperturaVerduraRicette([eggConcrete],{vegetablePortionGrams:225,saladPortionGrams:75}).remainingFraction>0);
  console.log('lotto H conversione ricette approvate: ok');
})().catch(error=>{console.error(error);process.exit(1);});
