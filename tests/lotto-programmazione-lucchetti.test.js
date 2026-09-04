'use strict';
/* Programmazione Menù — lucchetto per singola realizzazione (P/C/V):
   "Rigenera" deve conservare esattamente le realizzazioni bloccate e
   rigenerare soltanto quelle libere; se i blocchi rendono impossibile
   completare il Menù, deve fallire con un errore preciso senza mai
   sbloccarle automaticamente. Verificato qui a livello di motore
   (generaPianoSettimana + il flag real.bloccata sui record 'piano'),
   lo stesso meccanismo che il lucchetto della UI attiva scrivendo quel
   campo sulla bozza menuDraft. */
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

function cloneRec(x){return JSON.parse(JSON.stringify(x));}

(async()=>{
  await M.inizializza({basePath:''});

  // 1) Generazione ordinaria di partenza.
  let esito=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(esito.errori,[],'generazione iniziale');
  const giorni=global.giorniSettimana();

  // 2) Blocco parziale: una sola realizzazione bloccata nel pranzo del
  //    primo giorno; il resto del pasto deve restare libero.
  const idBersaglio=giorni[0]+'_pranzo';
  let vocePrima=await global.getOne('piano',idBersaglio);
  assert(vocePrima&&vocePrima.realizzazioni&&vocePrima.realizzazioni.length,'il pasto bersaglio deve esistere');
  const realizzazioneDaBloccare=cloneRec(vocePrima.realizzazioni[0]);
  vocePrima.realizzazioni[0].bloccata=true;
  await global.put('piano',vocePrima);
  const snapshotBloccata=cloneRec(vocePrima.realizzazioni[0]);

  // 3) "Rigenera" (stessa chiamata del pulsante footer del Menù).
  for(let iterazione=0;iterazione<5;iterazione++){
    esito=await M.generaPianoSettimana(0,{forza:true});
    assert.deepEqual(esito.errori,[],'rigenerazione con blocco parziale, iterazione '+iterazione);
    const voceDopo=await global.getOne('piano',idBersaglio);
    const realBloccataDopo=voceDopo.realizzazioni.find(r=>r.ricettaId===realizzazioneDaBloccare.ricettaId);
    assert(realBloccataDopo,'la realizzazione bloccata deve essere ancora presente dopo Rigenera');
    assert.equal(realBloccataDopo.bloccata,true,'deve restare marcata come bloccata');
    assert.equal(realBloccataDopo.condimentoVarianteIndex,snapshotBloccata.condimentoVarianteIndex,'condimento invariato');
    assert.deepEqual(realBloccataDopo.ingredientiEffettivi,snapshotBloccata.ingredientiEffettivi,'ingredienti/quantità invariati: una realizzazione bloccata non va mai ridimensionata');
    assert.deepEqual(realBloccataDopo.nutrientiEffettivi,snapshotBloccata.nutrientiEffettivi,'nutrienti invariati di conseguenza');
    // il pasto deve comunque chiudersi correttamente (verdura completa)
    assert(voceDopo.bilancioVerdura&&voceDopo.bilancioVerdura.coperturaCompleta,'il pasto con blocco parziale deve chiudersi con copertura verdura completa, iterazione '+iterazione);
    // mantieni il blocco per la prossima iterazione (put già scrive bloccata:true di suo)
  }

  // 4) Blocco totale del pasto: OGNI realizzazione bloccata -> il record
  //    non deve proprio essere toccato dalla rigenerazione (stesso
  //    comportamento del vecchio blocco a livello di pasto).
  const idTotale=giorni[1]+'_cena';
  let voceTotale=await global.getOne('piano',idTotale);
  assert(voceTotale&&voceTotale.realizzazioni&&voceTotale.realizzazioni.length,'il pasto per il blocco totale deve esistere');
  for(const r of voceTotale.realizzazioni)r.bloccata=true;
  await global.put('piano',voceTotale);
  const snapshotTotale=cloneRec(voceTotale);
  esito=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(esito.errori,[],'rigenerazione con pasto interamente bloccato');
  const voceTotaleDopo=await global.getOne('piano',idTotale);
  assert.deepEqual(voceTotaleDopo.realizzazioni,snapshotTotale.realizzazioni,'un pasto con ogni realizzazione bloccata deve restare byte-per-byte identico dopo Rigenera');

  // 5) Caso impossibile: si forza via tabellaGiornoCategoria che pranzo e
  //    cena dello stesso giorno richiedano la stessa macro proteica (vietato
  //    con "Fonti proteiche/giorno"=2, il default) mentre il pranzo di quel
  //    giorno ha la proteina bloccata su quella macro: deve fallire con un
  //    errore preciso, senza toccare nulla (nessuna scrittura silenziosa,
  //    nessuno sblocco automatico).
  const giornoImpossibile=giorni[2];
  const voceImpossibile=await global.getOne('piano',giornoImpossibile+'_pranzo');
  const macroBloccata=voceImpossibile.categoriaTarget;
  assert(macroBloccata,'serve una categoria target riconoscibile per costruire il caso impossibile');
  for(const r of voceImpossibile.realizzazioni)r.bloccata=true;
  await global.put('piano',voceImpossibile);
  const indiceGiorno=giorni.indexOf(giornoImpossibile);
  await global.put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:{['giorno_'+indiceGiorno]:[null,macroBloccata]}});
  const snapshotPrimaErrore=cloneRec(await global.getAll('piano'));
  const esitoImpossibile=await M.generaPianoSettimana(0,{forza:true});
  assert(esitoImpossibile.errori.length>0,'deve fallire con un errore, non sbloccare o forzare in silenzio');
  const dopoErrore=cloneRec(await global.getAll('piano'));
  assert.deepEqual(dopoErrore,snapshotPrimaErrore,'un fallimento non deve scrivere nulla: nessun blocco perso, nessuna scrittura parziale');

  console.log('OK: lucchetto per realizzazione — blocco parziale conservato esattamente, blocco totale invariato, fallimento preciso senza sblocchi automatici.');
})().catch(e=>{console.error(e);process.exit(1);});
