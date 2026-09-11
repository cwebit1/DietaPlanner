'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const stores={};
for(const nome of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[nome]=new Map();
global.getAll=async nome=>[...(stores[nome]||new Map()).values()].map(v=>structuredClone(v));
global.getOne=async(nome,chiave)=>{const v=(stores[nome]||new Map()).get(chiave);return v?structuredClone(v):null;};
global.put=async(nome,valore)=>{(stores[nome]||new Map()).set(valore.id??valore.chiave,structuredClone(valore));return valore;};
global.delKey=async(nome,chiave)=>(stores[nome]||new Map()).delete(chiave);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});

require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

(async()=>{
  const init=await M.inizializza({basePath:''});
  const visual=JSON.parse(fs.readFileSync(path.join(root,'db-visuale.json'),'utf8'));
  const idsVisual=visual.ricette.map(r=>r.idRicetta);
  const idsConcrete=M.getRicette().map(r=>r.id);

  assert.equal(init.concrete,420);
  assert.equal(new Set(idsVisual).size,idsVisual.length,'db-visuale.json non deve contenere ID duplicati');
  assert.deepEqual(new Set(idsVisual),new Set(idsConcrete),'il catalogo visuale deve coprire esattamente le ricette concrete');
  for(const row of visual.ricette){
    assert.deepEqual(Object.keys(row),['idRicetta','percorsoImmagine','ricettaTestuale','disponibile']);
    assert.equal(typeof row.disponibile,'boolean');
  }

  const target=M.getRicette()[0];
  const altro=M.getRicette()[1];
  await M.applicaDisponibilitaCatalogoVisuale(M.getRicette(),{
    ricette:[{idRicetta:target.id,percorsoImmagine:'',ricettaTestuale:'',disponibile:false}]
  });
  assert.equal(M.getRicetta(target.id).disponibile,false,'la ricetta disattivata deve restare risolvibile per storico e dettagli');
  assert(!M.getRicetteDisponibili().some(r=>r.id===target.id),'la ricetta disattivata non deve essere proponibile');
  assert.equal(M.getRicetta(altro.id).disponibile,true,'un ID visuale assente deve restare disponibile');
  assert.equal(await M.ricettaAmmessa(M.getRicetta(target.id),'2026-09-11',{}),false,'il filtro comune deve respingere la ricetta disattivata');
  assert.equal((await global.getOne('ricette',target.id)).disponibile,false,'il flag deve essere sincronizzato nella cache IndexedDB');

  await assert.rejects(
    M.applicaDisponibilitaCatalogoVisuale(M.getRicette(),{ricette:[{idRicetta:target.id},{idRicetta:target.id}]}),
    /ID duplicato/
  );

  const manager=fs.readFileSync(path.join(root,'gestore-ricette.html'),'utf8');
  assert(manager.includes('data-field="disponibile"'));
  assert(manager.includes("a.download='db-visuale.json'"));
  console.log('catalogo visuale e disponibilita ricette: ok');
})().catch(error=>{console.error(error);process.exit(1);});
