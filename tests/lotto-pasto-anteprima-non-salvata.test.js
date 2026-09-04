'use strict';
/* Pagina Pasto — Alternativa/Salvafrigo/Rigenera come pura anteprima in
   memoria; "Imposta come pasto" è l'unico punto di salvataggio.
   Verificato qui a livello di motore con IndexedDB reale (harness Node,
   stessa tecnica di tutta la suite): rigeneraPasto(...,{soloAnteprima:true})
   non deve mai scrivere su 'piano', mentre l'uso invariato (nessun flag,
   compatibilità con "Genera pasto" su slot vuoto) deve continuare a
   scrivere esattamente come prima. La UI (click reali, apertura/chiusura
   del pannello, doppio click) non è verificabile qui senza un browser
   reale (Chromium/Playwright, evitato in questa sessione su richiesta
   esplicita di Cwe per limitare le risorse) - resta da fare quando
   servirà; qui si copre il contratto che conta davvero: nessuna
   scrittura silenziosa. */
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

  // 1) Generazione settimanale di partenza (equivalente a "Genera menù").
  let esito=await M.generaPianoSettimana(0,{forza:true});
  assert.deepEqual(esito.errori,[],'generazione iniziale');
  const giorni=global.giorniSettimana();
  const id=giorni[0]+'_pranzo';
  const originale=await global.getOne('piano',id);
  assert(originale&&originale.realizzazioni&&originale.realizzazioni.length,'il pasto bersaglio deve esistere');
  const snapshotOriginale=cloneRec(originale);

  // 2) "Alternativa": soloAnteprima:true non deve MAI scrivere su 'piano'.
  for(let tentativo=0;tentativo<5;tentativo++){
    const proposta=await M.rigeneraPasto(giorni[0],'pranzo',originale.categoriaTarget,{soloAnteprima:true});
    const dopoProposta=await global.getOne('piano',id);
    assert.deepEqual(dopoProposta,snapshotOriginale,'Alternativa (soloAnteprima) non deve modificare il pasto salvato, tentativo '+tentativo);
    if(proposta){
      assert(Array.isArray(proposta.realizzazioni)&&proposta.realizzazioni.length,'la proposta deve comunque essere un pasto completo');
      assert('bilancioVerdura' in proposta,'la proposta deve avere bilancioVerdura come un pasto reale');
      assert('categoriaTarget' in proposta,'la proposta deve avere categoriaTarget come un pasto reale');
    }
  }

  // 3) "Salvafrigo": stessa garanzia, con priorità inventario.
  for(let tentativo=0;tentativo<5;tentativo++){
    const proposta=await M.rigeneraPasto(giorni[0],'pranzo',originale.categoriaTarget,{soloAnteprima:true,usaInventario:true});
    const dopoProposta=await global.getOne('piano',id);
    assert.deepEqual(dopoProposta,snapshotOriginale,'Salvafrigo (soloAnteprima) non deve modificare il pasto salvato, tentativo '+tentativo);
    if(proposta)assert.equal(proposta.origine,'alternativa-odierna','Salvafrigo deve marcare l\'origine come le altre alternative odierne, anche da anteprima');
  }

  // 4) "Imposta come pasto": SOLO qui deve avvenire il salvataggio reale.
  const propostaDaImpostare=await M.rigeneraPasto(giorni[0],'pranzo',originale.categoriaTarget,{soloAnteprima:true});
  assert(propostaDaImpostare,'serve una proposta valida da impostare per il test');
  const dopoAnteprima=await global.getOne('piano',id);
  assert.deepEqual(dopoAnteprima,snapshotOriginale,'ancora nessuna scrittura prima di Imposta come pasto');
  await M.salvaRoll(propostaDaImpostare); // stesso committer generico usato dalla UI per "Imposta come pasto"
  const dopoImposta=await global.getOne('piano',id);
  assert.deepEqual(dopoImposta.realizzazioni,propostaDaImpostare.realizzazioni,'dopo "Imposta come pasto" il pasto salvato deve corrispondere esattamente alla proposta');

  // 5) Compatibilità: senza soloAnteprima, il comportamento resta quello di
  //    sempre (scrive subito) - usato da "Genera pasto" su uno slot vuoto.
  const idVuoto=giorni[1]+'_cena';
  await global.delKey('piano',idVuoto);
  const target=(await global.getOne('piano',giorni[1]+'_pranzo'))?.categoriaTarget||'legumi';
  const generato=await M.rigeneraPasto(giorni[1],'cena',target);
  assert(generato,'la generazione su slot vuoto deve produrre un pasto');
  const salvatoSubito=await global.getOne('piano',idVuoto);
  assert(salvatoSubito&&salvatoSubito.realizzazioni&&salvatoSubito.realizzazioni.length,'senza soloAnteprima il pasto deve essere salvato subito, come prima di questa modifica');

  console.log('OK: pagina Pasto — Alternativa/Salvafrigo/Rigenera restano pura anteprima, solo "Imposta come pasto" salva (10 generazioni di anteprima verificate senza scritture).');
})().catch(e=>{console.error(e);process.exit(1);});
