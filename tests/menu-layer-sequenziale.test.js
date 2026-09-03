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

function verificaDueClassiDistinte(records){
  for(const day of global.giorniSettimana()){
    const pasti=records.filter(x=>x.id.startsWith(day+'_'));
    assert.equal(pasti.length,2,day+' deve avere pranzo e cena');
    assert.notEqual(pasti[0].categoriaTarget,pasti[1].categoriaTarget,day+' non può ripetere la stessa classe proteica');
  }
}
async function verificaMacroRealiDistinte(records){
  for(const day of global.giorniSettimana()){
    const insiemi=[];
    for(const pasto of ['pranzo','cena']){
      const record=records.find(x=>x.id===day+'_'+pasto),tokens=new Set();
      for(const real of record.realizzazioni){
        const ricetta=await M.materializzaRealizzazione(real);
        for(const token of M.copertura(ricetta).proteinTokens)tokens.add(token);
      }
      insiemi.push(tokens);
    }
    assert.equal([...insiemi[0]].filter(x=>insiemi[1].has(x)).length,0,day+' non può ripetere una macro proteica reale tra pranzo e cena');
  }
}

(async()=>{
  await M.inizializza({basePath:''});
  const completa={
    giorno_0:['carne','pesce'],giorno_1:['formaggi','uova'],giorno_2:['legumi','pesce'],
    giorno_3:['carne','formaggi'],giorno_4:['legumi','pesce'],giorno_5:['carne','formaggi'],giorno_6:['uova','legumi']
  };
  await global.put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:completa});
  let esito=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(esito.errori,[],'tabella completa');
  let records=await global.getAll('piano');
  verificaDueClassiDistinte(records);
  await verificaMacroRealiDistinte(records);
  for(let di=0;di<7;di++){
    assert.equal(records.find(x=>x.id===global.giorniSettimana()[di]+'_pranzo').categoriaTarget,completa['giorno_'+di][0]);
    assert.equal(records.find(x=>x.id===global.giorniSettimana()[di]+'_cena').categoriaTarget,completa['giorno_'+di][1]);
  }

  stores.piano.clear();
  await global.put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:{giorno_0:['formaggi',null],giorno_3:[null,'uova']}});
  esito=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(esito.errori,[],'tabella parziale');
  records=await global.getAll('piano');
  verificaDueClassiDistinte(records);
  await verificaMacroRealiDistinte(records);
  assert.equal(records.find(x=>x.id==='2026-08-31_pranzo').categoriaTarget,'formaggi');
  assert.equal(records.find(x=>x.id==='2026-09-03_cena').categoriaTarget,'uova');

  stores.piano.clear();
  stores.impostazioni.delete('tabellaGiornoCategoria');
  esito=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(esito.errori,[],'tabella assente');
  records=await global.getAll('piano');
  verificaDueClassiDistinte(records);
  await verificaMacroRealiDistinte(records);
  console.log('menu a layer sequenziale: tabella completa/parziale/assente ok');
})().catch(error=>{console.error(error);process.exit(1);});
