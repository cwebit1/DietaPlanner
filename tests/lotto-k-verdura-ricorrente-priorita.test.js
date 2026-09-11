'use strict';
/* Test mirato e deterministico (correzione verdura ricorrente, settembre
   2026), a livello della funzione che sceglie la verdura di completamento
   residuo (completaResiduoVerduraRicette). Costruisce il caso peggiore per
   la ricorrente: nello stesso pool esiste una verdura diversa che è
   CONTEMPORANEAMENTE preferita dal Set utente e urgente in dispensa
   (scadenza/avanzo) - le due priorità più alte dell'ordinamento esistente,
   che porterebbero quella verdura in cima con punteggio massimo. La
   ricorrente deve comunque vincere sempre, perché il controllo avviene
   prima di quell'ordinamento, non dentro di esso.

   Dimostrazione per confronto diretto, sulla stessa identica situazione:
   - CON requiredVegetableVariantId impostato -> deve risultare la ricorrente
     (Pomodoro fresco).
   - SENZA requiredVegetableVariantId (comportamento del solo ordinamento
     esistente, quello usato prima della correzione per la stessa scelta)
     -> risulta la verdura preferita/urgente (Carote), a conferma che senza
     il controllo esplicito la ricorrente non avrebbe alcuna garanzia di
     vittoria e la correzione non e' vuota. */
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
global.todayISO=()=>'2026-08-30';
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

(async()=>{
  await M.inizializza({basePath:''});
  const ricette=M.getRicette();
  const pureV=ricette.filter(r=>{const c=M.copertura(r);return c.V&&!c.C&&!c.P;});
  const ricettaPomodoro=pureV.find(r=>(r.ingredienti||[]).some(i=>i.variantId==='nrv_pomodoro_fresco'));
  const ricettaCarote=pureV.find(r=>(r.ingredienti||[]).some(i=>i.variantId==='nrv_carote'));
  const base=ricette.find(r=>{const c=M.copertura(r);return c.tokens&&c.tokens.has('PP')&&c.C&&!c.V;});
  assert(ricettaPomodoro&&ricettaCarote&&base,'fixture del catalogo reale presenti');

  const pool=pureV;
  const data='2026-09-03';
  const portionConfig={vegetablePortionGrams:200,saladPortionGrams:70};

  const variantiPrioritarie=new Set(['nrv_carote']);
  const verdurePreferiteVariantIds=new Set(['nrv_carote']);

  const conRicorrente=M.completaResiduoVerduraRicette([base],pool,data,portionConfig,variantiPrioritarie,undefined,verdurePreferiteVariantIds,'nrv_pomodoro_fresco');
  const scelteConRicorrente=conRicorrente.filter(r=>r.id!==base.id);
  assert.equal(scelteConRicorrente.length,1,'deve essere aggiunta esattamente una V dedicata');
  assert.equal(scelteConRicorrente[0].id,ricettaPomodoro.id,'con la ricorrente impostata deve vincere sempre Pomodoro fresco, anche contro una Carote preferita e urgente');
  console.log('OK 1: la ricorrente (Pomodoro fresco) vince su una verdura contemporaneamente preferita e urgente.');

  const senzaRicorrente=M.completaResiduoVerduraRicette([base],pool,data,portionConfig,variantiPrioritarie,undefined,verdurePreferiteVariantIds,null);
  const scelteSenzaRicorrente=senzaRicorrente.filter(r=>r.id!==base.id);
  assert.equal(scelteSenzaRicorrente.length,1,'deve essere aggiunta esattamente una V dedicata anche senza ricorrente');
  assert.equal(scelteSenzaRicorrente[0].id,ricettaCarote.id,'senza ricorrente il solo ordinamento esistente deve scegliere la verdura preferita/urgente (Carote), a riprova che il controllo esplicito e\' necessario');
  console.log('OK 2: senza ricorrente impostata, la stessa situazione sceglie Carote (preferita+urgente) - conferma che il controllo esplicito e\' la causa della vittoria della ricorrente.');

  const poolInvertito=pool.slice().reverse();
  const ripetuto=M.completaResiduoVerduraRicette([base],poolInvertito,data,portionConfig,variantiPrioritarie,undefined,verdurePreferiteVariantIds,'nrv_pomodoro_fresco');
  const scelteRipetuto=ripetuto.filter(r=>r.id!==base.id);
  assert(scelteRipetuto.length===1&&(scelteRipetuto[0].ingredienti||[]).some(i=>i.variantId==='nrv_pomodoro_fresco'),'la vittoria della ricorrente non deve dipendere dall\u2019ordine del pool');
  console.log('OK 3: la ricorrente vince indipendentemente dall\u2019ordine di iterazione del pool.');

  console.log('lotto K verdura ricorrente priorita\': ok');
})().catch(error=>{console.error(error);process.exit(1);});
