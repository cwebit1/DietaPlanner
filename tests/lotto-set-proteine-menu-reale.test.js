'use strict';
/* Verifica (punti 6, 13, 14 del compito "Set -> Proteine -> Casuale/Completa"):
   con fonti proteiche/giorno=2 (default), il Menù generato dal motore reale
   non deve MAI avere la stessa macro proteica a pranzo e cena dello stesso
   giorno - controllando le macro REALMENTE presenti nelle realizzazioni
   (gruppoProteico di ogni ricetta effettivamente scelta), non soltanto
   categoriaTarget (che con una ricetta combinata puo' non rappresentare
   tutte le proteine davvero presenti nel pasto). */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const E=require('../engine-core.js');
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
  // Fonti proteiche/giorno=2, esplicito (anche se e' gia' il default).
  await global.put('impostazioni',{chiave:'configAvanzata',valore:{maxProteinSourcesPerDay:2}});

  let settimaneValide=0,violazioniCategoriaTarget=0,violazioniMacroReale=0;
  for(let tentativo=0;tentativo<20&&settimaneValide<10;tentativo++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    if(esito.errori.length)continue;
    settimaneValide++;
    const piano=await global.getAll('piano');
    const giorni={};
    for(const voce of piano){
      if(!voce.realizzazioni||!voce.realizzazioni.length)continue;
      const giorno=voce.id.slice(0,10);
      giorni[giorno]=giorni[giorno]||[];
      giorni[giorno].push(voce);
    }
    for(const [giorno,voci] of Object.entries(giorni)){
      if(voci.length!==2)continue;
      const [primo,secondo]=voci;
      // 1) categoriaTarget non deve mai coincidere (controllo di base)
      if(primo.categoriaTarget&&secondo.categoriaTarget&&primo.categoriaTarget===secondo.categoriaTarget){
        violazioniCategoriaTarget++;
        console.log('violazione categoriaTarget',giorno,primo.categoriaTarget,secondo.categoriaTarget);
      }
      // 2) macro REALMENTE presenti nelle realizzazioni (gruppoProteico di
      //    ogni ricetta scelta, mappato a macro con la stessa tabella
      //    canonica di engine-core.js) non devono avere intersezione fra
      //    i due pasti - copre anche le ricette combinate a doppia
      //    proteina, non solo la categoria dichiarata.
      const macroDi=voce=>new Set((voce.realizzazioni||[]).map(r=>r&&r.gruppoProteico&&E.SUBTYPE_TO_MACRO[r.gruppoProteico]).filter(Boolean));
      const macroPrimo=macroDi(primo),macroSecondo=macroDi(secondo);
      const intersezione=[...macroPrimo].filter(m=>macroSecondo.has(m));
      if(intersezione.length){
        violazioniMacroReale++;
        console.log('violazione macro reale',giorno,[...macroPrimo],[...macroSecondo]);
      }
    }
  }
  assert(settimaneValide>0,'nessuna settimana valida generata con fonti proteiche/giorno=2');
  assert.equal(violazioniCategoriaTarget,0,'con 2 fonti/giorno, categoriaTarget non deve mai coincidere a pranzo e cena dello stesso giorno');
  assert.equal(violazioniMacroReale,0,'con 2 fonti/giorno, le macro proteiche REALMENTE presenti nelle realizzazioni non devono mai coincidere a pranzo e cena, anche con ricette combinate');
  console.log('OK: generazione reale del Menu (motor-v12.js), '+settimaneValide+' settimane, 0 violazioni categoriaTarget, 0 violazioni macro reale con 2 fonti/giorno.');
})().catch(e=>{console.error(e);process.exit(1);});
