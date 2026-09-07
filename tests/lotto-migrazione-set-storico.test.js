'use strict';
/* Test mirato: migrazione dei carboidrati storici (configCarboidrati /
   configCarboidratiOrigini / configCarboidratiExplicitZeroKeys) verso
   l'unico stato canonico configCarboidratiStati, eseguita in un solo
   punto (migraStatoCarboidratiCanonicoSeNecessario, richiamato da
   DietaPlannerMotorV12.inizializza). Dopo la migrazione, Set e motore
   leggono esclusivamente lo stato canonico: nessuna reinterpretazione dei
   record legacy durante il funzionamento ordinario.

   Copre esattamente, come richiesto:
   1. database senza dati precedenti → stati canonici AUTO
   2. record canonico esistente → nessuna migrazione e nessuna modifica
   3. record legacy completo con origini miste → corretto FIXED utente
   4. record legacy con conteggio positivo e origini assenti/incoerenti →
      conteggio preservato come FIXED
   5. zero con marcatore esplicito → EXCLUDED
   6. zero senza marcatore → AUTO
   7. salvataggio effettivo di configCarboidratiStati
   8. nuova inizializzazione → stato identico
   9. seconda inizializzazione → nessuna nuova scrittura
   10. motore e Set leggono lo stesso stato canonico
   11. impostazioni estranee, piano e consumoGiorno restano invariati
   12. fallimento simulato durante la scrittura → nessuno stato canonico parziale

   Non genera settimane complete, nessun retry casuale. */
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

(async()=>{

  /* ============ 1. Database senza dati precedenti → stati canonici AUTO ============ */
  {
    resetStores();putSpy=null;
    await M.inizializza({basePath:''});
    const rec=await getOne('impostazioni','configCarboidratiStati');
    assert(rec&&rec.valore,'la migrazione deve scrivere lo stato canonico anche su database vuoto');
    for(const chiave of CHIAVI_CANONICHE){
      assert.deepEqual(rec.valore[chiave],{mode:'auto',count:0},'db vuoto: '+chiave+' deve essere AUTO');
    }
  }

  /* ============ 2. Record canonico esistente → nessuna migrazione e nessuna modifica ============ */
  {
    resetStores();putSpy=null;
    const canonicoEsistente={riso:{mode:'fixed',count:5}}; // volutamente parziale/diverso da ciò che il legacy produrrebbe
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:canonicoEsistente});
    // dati legacy CONTRADDITTORI: se venissero riletti, produrrebbero un risultato diverso
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:1}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente']}});

    await M.inizializza({basePath:''});

    const dopo=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(dopo.valore,canonicoEsistente,'stato canonico già presente: non deve essere né esteso né sovrascritto dal legacy');
    const legacyDopo=await getOne('impostazioni','configCarboidrati');
    assert.deepEqual(legacyDopo.valore,{riso:1},'il record legacy non deve essere toccato quando il canonico esiste già');
  }

  /* ============ 3. Record legacy completo con origini miste → corretto FIXED utente ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});
    await M.inizializza({basePath:''});
    const rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.riso,{mode:'fixed',count:2},'solo le 2 caselle utente sono un FIXED reale, non le 4 totali (2 erano completamento automatico)');
  }

  /* ============ 4. Record legacy con conteggio positivo e origini assenti/incoerenti → conteggio preservato come FIXED ============ */
  {
    // origini assenti
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await M.inizializza({basePath:''});
    let rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.riso,{mode:'fixed',count:4},'origini assenti: il conteggio storico positivo non va perso, resta FIXED 4');

    // origini incoerenti (lunghezza diversa dal conteggio)
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente']}});
    await M.inizializza({basePath:''});
    rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.riso,{mode:'fixed',count:4},'origini incoerenti: il conteggio storico positivo non va perso, resta FIXED 4');
  }

  /* ============ 5. Zero con marcatore esplicito → EXCLUDED ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{pane:0}});
    await put('impostazioni',{chiave:'configCarboidratiExplicitZeroKeys',valore:['pane']});
    await M.inizializza({basePath:''});
    const rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.pane,{mode:'excluded',count:0},'zero con marcatore esplicito deve diventare EXCLUDED');
  }

  /* ============ 6. Zero senza marcatore → AUTO ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{pane:0}});
    await M.inizializza({basePath:''});
    const rec=await getOne('impostazioni','configCarboidratiStati');
    assert.deepEqual(rec.valore.pane,{mode:'auto',count:0},'zero senza marcatore esplicito deve restare AUTO, non essere dedotto come EXCLUDED');
  }

  /* ============ 7. Salvataggio effettivo di configCarboidratiStati ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4,orzo:2}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema'],orzo:['utente','utente']}});
    await M.inizializza({basePath:''});
    const rec=await getOne('impostazioni','configCarboidratiStati');
    assert(rec&&rec.valore,'la migrazione deve scrivere davvero configCarboidratiStati nello store');
    assert.deepEqual(rec.valore.riso,{mode:'fixed',count:2});
    assert.deepEqual(rec.valore.orzo,{mode:'fixed',count:2});
    for(const chiave of CHIAVI_CANONICHE)assert(rec.valore[chiave],'lo stato scritto copre sempre l\'intero elenco canonico ('+chiave+' mancante)');
  }

  /* ============ 8. Nuova inizializzazione → stato identico ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});
    await M.inizializza({basePath:''});
    const primaLettura=(await getOne('impostazioni','configCarboidratiStati')).valore;
    await M.inizializza({basePath:''});
    const secondaLettura=(await getOne('impostazioni','configCarboidratiStati')).valore;
    assert.deepEqual(primaLettura,secondaLettura,'una nuova inizializzazione deve trovare lo stesso identico stato canonico');
  }

  /* ============ 9. Seconda inizializzazione → nessuna nuova scrittura ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});
    let scrittureStati=0;
    putSpy=async(name,value)=>{if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')scrittureStati++;return realPut(name,value);};

    await M.inizializza({basePath:''});
    assert.equal(scrittureStati,1,'la prima inizializzazione (canonico assente) deve scrivere lo stato esattamente una volta');

    scrittureStati=0;
    await M.inizializza({basePath:''});
    assert.equal(scrittureStati,0,'la seconda inizializzazione (canonico già presente) non deve scrivere nulla');
    putSpy=null;
  }

  /* ============ 10. Motore e Set leggono lo stesso stato canonico ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4,pane:0}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});
    await put('impostazioni',{chiave:'configCarboidratiExplicitZeroKeys',valore:['pane']});
    await M.inizializza({basePath:''});

    // Percorso "Set" (index.html:caricaConfigCarboidrati): legge SOLO configCarboidratiStati.
    const statoLettoDalSet=(await getOne('impostazioni','configCarboidratiStati')).valore;

    // Percorso motore: caricaConfigurazioneNutrizionaleRisolta → resolveNutritionConfig.
    const resolved=await M.caricaConfigurazioneNutrizionaleRisolta();

    for(const chiave of CHIAVI_CANONICHE){
      const set=statoLettoDalSet[chiave],motore=resolved.carbohydrates.selection[chiave];
      assert.equal(set.mode,motore.mode,'Set e motore devono concordare sul mode di '+chiave);
      const contoSet=set.mode==='fixed'?set.count:0,contoMotore=motore.mode==='fixed'?motore.count:0;
      assert.equal(contoSet,contoMotore,'Set e motore devono concordare sul count di '+chiave);
    }
  }

  /* ============ 11. Impostazioni estranee, piano e consumoGiorno restano invariati ============ */
  {
    resetStores();putSpy=null;
    await put('impostazioni',{chiave:'nonSpettante',valore:{marker:'non-toccare'}});
    await put('impostazioni',{chiave:'allergeniAttivi',valore:['glutine_finto_test']});
    await put('piano',{id:'2026-08-31_pranzo',marker:'piano-esistente'});
    await put('consumoGiorno',{id:'consumo-test',marker:'consumo-esistente'});
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});

    await M.inizializza({basePath:''});

    assert.deepEqual((await getOne('impostazioni','nonSpettante')).valore,{marker:'non-toccare'},'impostazione estranea non toccata dalla migrazione');
    assert.deepEqual((await getOne('impostazioni','allergeniAttivi')).valore,['glutine_finto_test'],'impostazione estranea non toccata dalla migrazione');
    assert.deepEqual(await getAll('piano'),[{id:'2026-08-31_pranzo',marker:'piano-esistente'}],'piano non toccato dalla migrazione');
    assert.deepEqual(await getAll('consumoGiorno'),[{id:'consumo-test',marker:'consumo-esistente'}],'consumoGiorno non toccato dalla migrazione');
  }

  /* ============ 12. Fallimento simulato durante la scrittura → nessuno stato canonico parziale ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema']}});

    putSpy=async(name,value)=>{
      if(name==='impostazioni'&&value.chiave==='configCarboidratiStati')throw new Error('scrittura simulata non riuscita');
      return realPut(name,value);
    };

    await assert.rejects(
      ()=>M.migraStatoCarboidratiCanonicoSeNecessario(),
      /scrittura simulata non riuscita/,
      'un fallimento nella scrittura deve risalire esplicito, mai essere inghiottito in silenzio'
    );

    putSpy=null;
    const rec=await getOne('impostazioni','configCarboidratiStati');
    assert.equal(rec,null,'nessuno stato canonico parziale deve restare dopo un fallimento di scrittura');
    const legacy=await getOne('impostazioni','configCarboidrati');
    assert.deepEqual(legacy.valore,{riso:4},'i record legacy restano intatti e disponibili per un tentativo successivo dopo il fallimento');
  }

  console.log('lotto migrazione Set storico: ok');
})().catch(error=>{console.error(error);process.exit(1);});
