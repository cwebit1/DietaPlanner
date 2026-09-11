'use strict';

const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const target=path.join(root,'db-visuale.json');
const stores={};
for(const nome of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[nome]=new Map();

global.getAll=async nome=>[...(stores[nome]||new Map()).values()].map(valore=>structuredClone(valore));
global.getOne=async(nome,chiave)=>{
  const valore=(stores[nome]||new Map()).get(chiave);
  return valore?structuredClone(valore):null;
};
global.put=async(nome,valore)=>{
  (stores[nome]||new Map()).set(valore.id??valore.chiave,structuredClone(valore));
  return valore;
};
global.delKey=async(nome,chiave)=>(stores[nome]||new Map()).delete(chiave);
global.fetch=async url=>({
  ok:true,
  json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))
});

require('../motor-v12.js');

(async()=>{
  const precedente=JSON.parse(fs.readFileSync(target,'utf8'));
  const perId=new Map((precedente.ricette||[]).map(r=>[String(r.idRicetta),r]));
  await global.DietaPlannerMotorV12.inizializza({basePath:''});
  const ricette=global.DietaPlannerMotorV12.getRicette().map(r=>{
    const prima=perId.get(r.id)||{};
    return {
      idRicetta:r.id,
      percorsoImmagine:String(prima.percorsoImmagine||''),
      ricettaTestuale:String(prima.ricettaTestuale||''),
      disponibile:prima.disponibile!==false
    };
  });
  const output={versione:Number(precedente.versione)||1,ricette};
  fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
  console.log('db-visuale.json sincronizzato: '+ricette.length+' ricette concrete');
})().catch(error=>{console.error(error);process.exit(1);});
