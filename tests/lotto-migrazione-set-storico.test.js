'use strict';
/* Test mirato: unica verità funzionale dei carboidrati del Set
   (configCarboidratiStati), scritta dal punto unico di migrazione
   (motor-v12.js:migraStatoCarboidratiCanonicoSeNecessario, richiamato da
   inizializza) e dal salvataggio del Set (index.html:salvaConfigCarboidratiSet).
   I record legacy (configCarboidrati/configCarboidratiOrigini/
   configCarboidratiExplicitZeroKeys) restano solo archivio storico
   inerte: non letti, non aggiornati, non riscritti dopo la migrazione.

   Copre esattamente, come richiesto:
   1. migrazione legacy → canonico completo
   2. canonico completo valido → zero scritture
   3. canonico parziale ma valido → chiavi mancanti completate AUTO con una sola scrittura
   4. modalità sconosciuta → errore esplicito e nessuna scrittura
   5. FIXED non numerico → errore e nessuna scrittura
   6. FIXED zero, negativo o decimale → errore e nessuna scrittura
   7. salvataggio Set → scrive lo stato canonico e non aggiorna le tre chiavi legacy
   8. seconda inizializzazione → zero scritture
   9. Set e motore leggono esclusivamente lo stato canonico

   Non genera settimane, nessun retry casuale. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const N=require('../nutrition-config.js');

const stores={};
function resetStores(){
  for(const name of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[name]=new Map();
}
resetStores();

let putSpy=null; // quando impostata, intercetta le put (per contare scritture o simulare un fallimento)
const realPut=async(name,value)=>{(stores[name]||new Map()).set(value.id??value.chiave,structuredClone(value));return value;};
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value===undefined?null:structuredClone(value);};
global.put=async(name,value)=>putSpy?putSpy(name,value):realPut(name,value);
global.delKey=async(name,key)=>(stores[name]||new Map()).delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=>'2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

const CHIAVI_CANONICHE=[...N.PDF_BASELINE.carbohydrateUncapped,...Object.keys(N.PDF_BASELINE.carbohydrateWeeklyCaps)];
function statoCompletoAuto(){const s={};for(const k of CHIAVI_CANONICHE)s[k]={mode:'auto',count:0};return s;}

(async()=>{

  /* ============ 1. Migrazione legacy → canonico completo ============ */
  {
    // 1a. database senza alcun dato precedente: canonico completo, tutto AUTO
    resetStores();putSpy=null;
    await M.inizializza({basePath:''});
    let rec=await getOne('impostazioni','configCarboidratiStati');
    assert(rec&&rec.valore,'la migrazione deve scrivere lo stato canonico anche su database vuoto');
    for(const chiave of CHIAVI_CANONICHE)assert.deepEqual(rec.valore[chiave],{mode:'auto',count:0},'db vuoto: '+chiave+' deve essere AUTO');

    // 1b. origini complete e affidabili: isola le sole caselle utente (2, non le 4 totali)
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});
    await M.inizializza({basePath:''});
    rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.riso,{mode:'fixed',count:2},'origini miste: solo le 2 caselle utente sono un FIXED reale');

    // 1c. origini assenti o incoerenti: il conteggio storico positivo non va perso
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await M.inizializza({basePath:''});
    rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.riso,{mode:'fixed',count:4},'origini assenti: il conteggio storico positivo resta FIXED per intero');

    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente']}});
    await M.inizializza({basePath:''});
    rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.riso,{mode:'fixed',count:4},'origini incoerenti: il conteggio storico positivo resta FIXED per intero');

    // 1d. zero con marcatore esplicito → EXCLUDED; zero senza marcatore → AUTO
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{pane:0}});
    await put('impostazioni',{chiave:'configCarboidratiExplicitZeroKeys',valore:['pane']});
    await M.inizializza({basePath:''});
    rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.pane,{mode:'excluded',count:0},'zero con marcatore esplicito deve diventare EXCLUDED');

    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{pane:0}});
    await M.inizializza({basePath:''});
    rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.pane,{mode:'auto',count:0},'zero senza marcatore esplicito deve restare AUTO');

    // copertura completa dell'elenco canonico anche con legacy parziale
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4,orzo:2}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema'],orzo:['utente','utente']}});
    await M.inizializza({basePath:''});
    rec=await getOne('impostazioni','configCarboidratiStati');
    for(const chiave of CHIAVI_CANONICHE)assert(rec.valore[chiave],'lo stato migrato copre sempre l\'intero elenco canonico ('+chiave+' mancante)');
  }

  /* ============ 2. Canonico completo valido → zero scritture ============ */
  {
    resetStores();
    const canonico=statoCompletoAuto();canonico.riso={mode:'fixed',count:3};canonico.gnocchi={mode:'excluded',count:0};
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:canonico});
    let scritture=0;
    putSpy=async(name,value)=>{if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')scritture++;return realPut(name,value);};
    await M.inizializza({basePath:''});
    assert.equal(scritture,0,'canonico completo e valido: nessuna scrittura');
    const dopo=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(dopo.valore,canonico,'il canonico completo e valido non deve essere modificato');
    putSpy=null;
  }

  /* ============ 3. Canonico parziale ma valido → chiavi mancanti completate AUTO, una sola scrittura ============ */
  {
    resetStores();
    const parziale={riso:{mode:'fixed',count:3}}; // solo una chiave delle tante canoniche, ma valida
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:parziale});
    // legacy CONTRADDITTORIO presente: se venisse riletto produrrebbe un risultato diverso da riso:3
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:1}});
    let scritture=0;
    putSpy=async(name,value)=>{if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')scritture++;return realPut(name,value);};

    await M.inizializza({basePath:''});
    assert.equal(scritture,1,'canonico parziale ma valido: esattamente una scrittura di completamento');

    const dopo=(await getOne('impostazioni','configCarboidratiStati')).valore;
    assert.deepEqual(dopo.riso,{mode:'fixed',count:3},'la chiave già presente e valida non viene toccata dal legacy');
    for(const chiave of CHIAVI_CANONICHE){
      if(chiave==='riso')continue;
      assert.deepEqual(dopo[chiave],{mode:'auto',count:0},'chiave mancante completata come AUTO: '+chiave);
    }
    const legacyDopo=await getOne('impostazioni','configCarboidrati');
    assert.deepEqual(legacyDopo.valore,{riso:1},'il legacy non viene letto né toccato quando il canonico esiste già, anche solo parziale');
    putSpy=null;
  }

  /* ============ 4. Modalità sconosciuta → errore esplicito, nessuna scrittura ============ */
  {
    resetStores();
    const invalido=statoCompletoAuto();invalido.riso={mode:'boh',count:0};
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:invalido});
    let scritture=0;
    putSpy=async(name,value)=>{if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')scritture++;return realPut(name,value);};
    await assert.rejects(()=>M.inizializza({basePath:''}),/riso/,'modalità sconosciuta: errore esplicito che indica la chiave');
    assert.equal(scritture,0,'modalità sconosciuta: nessuna scrittura');
    const dopo=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(dopo.valore,invalido,'il record non valido non viene toccato/corretto silenziosamente');
    putSpy=null;
  }

  /* ============ 5. FIXED non numerico → errore, nessuna scrittura ============ */
  {
    resetStores();
    const invalido=statoCompletoAuto();invalido.riso={mode:'fixed',count:'due'};
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:invalido});
    let scritture=0;
    putSpy=async(name,value)=>{if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')scritture++;return realPut(name,value);};
    await assert.rejects(()=>M.inizializza({basePath:''}),/riso/,'FIXED non numerico: errore esplicito che indica la chiave');
    assert.equal(scritture,0,'FIXED non numerico: nessuna scrittura');
    putSpy=null;
  }

  /* ============ 6. FIXED zero, negativo o decimale → errore, nessuna scrittura ============ */
  {
    for(const count of [0,-1,1.5]){
      resetStores();
      const invalido=statoCompletoAuto();invalido.riso={mode:'fixed',count};
      await put('impostazioni',{chiave:'configCarboidratiStati',valore:invalido});
      let scritture=0;
      putSpy=async(name,value)=>{if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')scritture++;return realPut(name,value);};
      await assert.rejects(()=>M.inizializza({basePath:''}),/riso/,'FIXED count='+count+': errore esplicito che indica la chiave');
      assert.equal(scritture,0,'FIXED count='+count+': nessuna scrittura');
      putSpy=null;
    }
  }

  /* ============ 7. Salvataggio Set → scrive lo stato canonico, non aggiorna le tre chiavi legacy ============ */
  {
    const sorgente=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const inizio=sorgente.indexOf('async function salvaConfigCarboidratiSet(');
    assert(inizio>=0,'salvaConfigCarboidratiSet deve esistere in index.html');
    const fine=sorgente.indexOf('\n}\n',inizio);
    const corpo=sorgente.slice(inizio,fine);
    assert(corpo.includes("chiave:'configCarboidratiStati'"),'il salvataggio Set deve scrivere lo stato canonico');
    assert(!corpo.includes("chiave:'configCarboidrati'"),'il salvataggio Set non deve più aggiornare configCarboidrati');
    assert(!corpo.includes("chiave:'configCarboidratiOrigini'"),'il salvataggio Set non deve più aggiornare configCarboidratiOrigini');
    assert(!corpo.includes("chiave:'configCarboidratiExplicitZeroKeys'"),'il salvataggio Set non deve più aggiornare configCarboidratiExplicitZeroKeys');
  }

  /* ============ 8. Seconda inizializzazione → zero scritture ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});
    let scritture=0;
    putSpy=async(name,value)=>{if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')scritture++;return realPut(name,value);};

    await M.inizializza({basePath:''});
    assert.equal(scritture,1,'prima inizializzazione (canonico assente): esattamente una scrittura');

    scritture=0;
    await M.inizializza({basePath:''});
    assert.equal(scritture,0,'seconda inizializzazione (canonico già presente e completo): nessuna scrittura');
    putSpy=null;
  }

  /* ============ 9. Set e motore leggono esclusivamente lo stato canonico ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4,pane:0}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});
    await put('impostazioni',{chiave:'configCarboidratiExplicitZeroKeys',valore:['pane']});
    await M.inizializza({basePath:''});

    // Percorso "Set" (index.html:caricaConfigCarboidrati): legge SOLO configCarboidratiStati.
    const statoLettoDalSet=(await getOne('impostazioni','configCarboidratiStati')).valore;
    // Percorso motore: caricaConfigurazioneNutrizionaleRisolta → resolveNutritionConfig, sola lettura del canonico.
    const resolved=await M.caricaConfigurazioneNutrizionaleRisolta();

    for(const chiave of CHIAVI_CANONICHE){
      const set=statoLettoDalSet[chiave],motore=resolved.carbohydrates.selection[chiave];
      assert.equal(set.mode,motore.mode,'Set e motore devono concordare sul mode di '+chiave);
      const contoSet=set.mode==='fixed'?set.count:0,contoMotore=motore.mode==='fixed'?motore.count:0;
      assert.equal(contoSet,contoMotore,'Set e motore devono concordare sul count di '+chiave);
    }

    // conferma statica: nessuno dei due percorsi ordinari rilegge il legacy per decidere
    const motorSrc=fs.readFileSync(path.join(root,'motor-v12.js'),'utf8');
    const inizioCarica=motorSrc.indexOf('async function caricaConfigurazioneNutrizionaleRisolta(');
    const fineCarica=motorSrc.indexOf('\n}\n',inizioCarica);
    const corpoCarica=motorSrc.slice(inizioCarica,fineCarica);
    assert(!corpoCarica.includes("'configCarboidrati'")&&!corpoCarica.includes("'configCarboidratiOrigini'")&&!corpoCarica.includes("'configCarboidratiExplicitZeroKeys'"),'caricaConfigurazioneNutrizionaleRisolta non deve rileggere il legacy');

    const htmlSrc=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const inizioSet=htmlSrc.indexOf('async function caricaConfigCarboidrati(');
    const fineSet=htmlSrc.indexOf('\n}\n',inizioSet);
    const corpoSet=htmlSrc.slice(inizioSet,fineSet);
    assert(!corpoSet.includes("'configCarboidrati'")&&!corpoSet.includes("'configCarboidratiOrigini'")&&!corpoSet.includes("'configCarboidratiExplicitZeroKeys'"),'caricaConfigCarboidrati (Set) non deve rileggere il legacy');
  }

  console.log('lotto migrazione Set storico: ok');
})().catch(error=>{console.error(error);process.exit(1);});
