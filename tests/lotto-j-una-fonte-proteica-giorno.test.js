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
  // Margini larghi ma non piu' larghi del PDF (legumi resta senza tetto,
  // gli altri restano ai valori PDF): con "1 fonte/giorno" ogni giorno usato
  // brucia due unita' di una sola categoria, quindi serve piu' di una
  // settimana di tentativi per trovare un esito valido - e' un problema di
  // fattibilita' numerica gia' noto e non e' quello che questo test verifica.
  await global.put('impostazioni',{chiave:'configAvanzata',valore:{maxProteinSourcesPerDay:1}});

  let successi=0,violazioni=0,violazioniMacroSbagliata=0;
  for(let tentativo=0;tentativo<40&&successi<5;tentativo++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    if(esito.errori.length)continue;
    successi++;
    const piano=await global.getAll('piano');
    const giorni={};
    for(const voce of piano){
      const giorno=voce.id.slice(0,10);
      giorni[giorno]=giorni[giorno]||[];
      giorni[giorno].push(voce);
    }
    for(const [giorno,voci] of Object.entries(giorni)){
      const macroDistinte=new Set(voci.map(v=>v.categoriaTarget));
      if(macroDistinte.size>1){
        violazioni++;
        console.log('violazione categoriaTarget',giorno,':',[...macroDistinte]);
      }
      // Caso ambiguo (audit ChatGPT, 03/09/2026): se un pasto usa una
      // ricetta a doppia fonte proteica (es. id 8 carne+formaggio), il
      // secondo pasto dello stesso giorno deve ripetere la categoria
      // EFFETTIVAMENTE cercata per il primo, non una qualunque delle
      // macro incidentalmente presenti nella ricetta scelta.
      if(voci.length===2){
        const [primo,secondo]=voci;
        if(primo.categoriaTarget!==secondo.categoriaTarget){
          violazioniMacroSbagliata++;
          console.log('macro sbagliata ripetuta',giorno,':',primo.categoriaTarget,'->',secondo.categoriaTarget);
        }
      }
    }
  }
  assert(successi>0,'nessuna settimana valida trovata in 40 tentativi con 1 fonte/giorno');
  assert.equal(violazioni,0,'mai piu di una categoria proteica distinta nello stesso giorno con vincolo a 1');
  assert.equal(violazioniMacroSbagliata,0,'il secondo pasto deve ripetere la categoria effettivamente cercata nel primo, anche con ricette a doppia proteina');
  console.log('lotto J una fonte proteica al giorno: '+successi+' settimane valide su tentativi, 0 violazioni - ok');
})().catch(error=>{console.error(error);process.exit(1);});
