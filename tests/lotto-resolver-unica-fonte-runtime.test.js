'use strict';
/* Test mirato: nutrition-config.js:resolveNutritionConfig() deve restare
   l'unica fonte funzionale nutrizionale. Dimostra, con esecuzione reale
   (mai una reimplementazione), che i consumatori runtime osservano il
   valore RISOLTO e non un numero duplicato in index.html/motor-v12.js/
   engine-core.js, per:
   - maxProteinSourcesPerDay (consumatore: engine-core.js:buildProteinGrid);
   - specialBreakfastMax (consumatore: index.html:applicaConfigAvanzataRuntime,
     che alimenta il tetto colazioni speciali CAP_COLAZIONE_SPECIALE
     realmente controllato in renderPiano/salvaColazione);
   - fruit.min/max (stesso consumatore, alimenta FRUTTA_GIORNALIERA: bug
     reale trovato e corretto in questo intervento — era una costante
     indipendente mai normalizzata dal resolver, usata da un indicatore
     live in renderIndicatoreFrutta).

   Cap settimanale di sottotipo (es. carne_rossa): NON verificato qui.
   L'unico consumatore reale (motor-v12.js:ricettaAmmessa) non è
   un'API pubblica di DietaPlannerMotorV12, e non esiste un percorso
   pubblico deterministico per esercitarlo isolatamente — generaPasto/
   generaPianoSettimana selezionano il candidato con logica randomizzata
   (nessun parametro per forzare un sottotipo specifico), quindi non
   offrono una prova deterministica senza più tentativi/retry. Esportare
   ricettaAmmessa/configRuntime solo per questo test avrebbe ampliato
   l'API pubblica del motore per comodità del test (vedi
   docs/REGISTRO_MODIFICHE.md): rimosso, la copertura del cap di
   sottotipo resta nei test già dedicati (nutrition-config.test.js e
   gli altri test del motore che la esercitano tramite generazione).

   oilGramsPerMeal: NESSUN consumatore runtime trovato nella pipeline di
   generazione attuale (vedi docs/REGISTRO_MODIFICHE.md per l'analisi
   completa) - i soli riferimenti nel codice sono legacy, gated dietro
   condizioni ("voce.modo==='multi' && !voce.realizzazioni.length") mai
   prodotte dal motore attuale. Non essendoci un consumatore vivo da
   esercitare, questo test verifica che il resolver stesso produca il
   valore corretto (unica cosa dimostrabile oggi) e documenta l'assenza
   di un secondo, contraddittorio, hardcode in index.html che venga
   davvero letto da un pasto generato oggi. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const indexSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
const N=require('../nutrition-config.js');
const E=require('../engine-core.js');

const stores={};
function resetStores(){
  for(const name of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[name]=new Map();
}
resetStores();
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value===undefined?null:structuredClone(value);};
global.put=async(name,value)=>{(stores[name]||new Map()).set(value.id??value.chiave,structuredClone(value));return value;};
global.delKey=async(name,key)=>(stores[name]||new Map()).delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=>'2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

/* Estrae verbatim dal sorgente reale una singola dichiarazione (funzione o
   costante), mai una sua riscrittura. */
function estraiDichiarazione(firma){
  const inizio=indexSource.indexOf(firma);
  assert(inizio>=0,'dichiarazione non trovata in index.html: '+firma);
  if(firma.startsWith('const ')){
    const fine=indexSource.indexOf(';\n',inizio);
    return indexSource.slice(inizio,fine+1);
  }
  const inizioCorpo=indexSource.indexOf('{',inizio);
  let depth=0,j=inizioCorpo;
  do{ if(indexSource[j]==='{')depth++; else if(indexSource[j]==='}')depth--; j++; }while(depth>0);
  return indexSource.slice(inizio,j);
}

(async()=>{
  await M.inizializza({basePath:''});

  /* ============ 1. maxProteinSourcesPerDay: engine-core.buildProteinGrid osserva il valore risolto ============ */
  {
    const giorni=['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
    const tabellaUtente={'2026-08-31':['carne','carne']}; // stessa categoria pranzo/cena, solo il primo giorno fissato

    const resolved1=N.resolveNutritionConfig({nutritionist:{config:{maxProteinSourcesPerDay:1}}});
    assert.equal(resolved1.maxProteinSourcesPerDay,1);
    const esito1=E.buildProteinGrid(giorni,tabellaUtente,{maxProteinSourcesPerDay:resolved1.maxProteinSourcesPerDay},{},()=>0.5);
    assert.deepEqual(esito1.errors,[],'con maxProteinSourcesPerDay=1 risolto, pranzo=cena=carne deve essere ammesso');

    const resolved2=N.resolveNutritionConfig({nutritionist:{config:{maxProteinSourcesPerDay:2}}});
    assert.equal(resolved2.maxProteinSourcesPerDay,2);
    const esito2=E.buildProteinGrid(giorni,tabellaUtente,{maxProteinSourcesPerDay:resolved2.maxProteinSourcesPerDay},{},()=>0.5);
    assert(esito2.errors.length>0,'con maxProteinSourcesPerDay=2 risolto, pranzo=cena=carne deve essere rifiutato dallo stesso consumatore, senza cambiare la funzione');
  }

  /* ============ 2. specialBreakfastMax: index.html:applicaConfigAvanzataRuntime osserva il valore risolto ============
     Estrae ed esegue (non reimplementa) l'intera catena reale index.html:
     CONFIG_AVANZATA_DEFAULT -> configAvanzataDaRisolta -> risolviConfigNutrizionista
     -> configAvanzataDefaultCanonico/EffettivaSalvata -> applicaConfigAvanzataRuntime. */
  {
    const pezzi=[
      estraiDichiarazione('const CONFIG_AVANZATA_DEFAULT'),
      estraiDichiarazione('function cloneConfigurazione'),
      estraiDichiarazione('function configAvanzataDaRisolta'),
      estraiDichiarazione('function risolviConfigNutrizionista'),
      estraiDichiarazione('function configAvanzataDefaultCanonico'),
      estraiDichiarazione('function configAvanzataEffettivaSalvata'),
      'let CAP_SPUNTINO_SETTIMANALE={},CAP_SPUNTINO_GIORNALIERO={},FRUTTA_GIORNALIERA={},CAP_COLAZIONE_SPECIALE=1;',
      estraiDichiarazione('function applicaConfigAvanzataRuntime'),
      'return {applicaConfigAvanzataRuntime, get capColazioneSpeciale(){return CAP_COLAZIONE_SPECIALE;}, get fruttaGiornaliera(){return FRUTTA_GIORNALIERA;}};'
    ].join('\n');
    globalThis.DietaPlannerNutritionConfig=N; // stessa esposizione di index.html in produzione
    const modulo=new Function(pezzi)();

    modulo.applicaConfigAvanzataRuntime({specialBreakfastMax:1});
    assert.equal(modulo.capColazioneSpeciale,1,'con specialBreakfastMax=1 risolto, il tetto colazioni speciali osservato deve essere 1');

    modulo.applicaConfigAvanzataRuntime({specialBreakfastMax:2});
    assert.equal(modulo.capColazioneSpeciale,2,'con specialBreakfastMax=2 risolto (entro il massimo PDF), il tetto osservato deve diventare 2, stessa funzione');

    // Stessa dimostrazione per FRUTTA_GIORNALIERA (bug trovato e corretto in
    // questo intervento: era una costante indipendente, mai normalizzata).
    modulo.applicaConfigAvanzataRuntime({fruit:{min:2,max:3}});
    assert.equal(modulo.fruttaGiornaliera.min,2);assert.equal(modulo.fruttaGiornaliera.max,3);
    modulo.applicaConfigAvanzataRuntime({fruit:{min:3,max:3}});
    assert.equal(modulo.fruttaGiornaliera.min,3,'con fruit.min risolto a 3, lo stesso indicatore deve osservarlo, non restare fisso su 2');
    assert.equal(modulo.fruttaGiornaliera.max,3);
  }

  /* ============ 3. oilGramsPerMeal: nessun consumatore runtime nella pipeline attuale (documentato, non un difetto da correggere) ============ */
  {
    const resolvedOlioBase=N.resolveNutritionConfig({nutritionist:{config:{}}});
    assert.equal(resolvedOlioBase.oilGramsPerMeal,10,'default risolto invariato');
    const resolvedOlioPersonalizzato=N.resolveNutritionConfig({nutritionist:{config:{oilGramsPerMeal:15}}});
    assert.equal(resolvedOlioPersonalizzato.oilGramsPerMeal,15,'il resolver riflette correttamente un valore personalizzato entro il range PDF');

    // L'unico riferimento hardcoded (ALLOCAZIONE_CONDIMENTO_PASTO.olio_evo.grammi)
    // esiste, ma i suoi due soli consumatori sono testualmente gated dietro
    // una condizione mai prodotta dal motore attuale (voce.realizzazioni
    // sempre popolato dal motore nuovo) - controllo aggiuntivo, non prova
    // principale, per confermare l'assenza di duplicazione realmente attiva.
    assert(indexSource.includes("ALLOCAZIONE_CONDIMENTO_PASTO.olio_evo.grammi"),'riferimento legacy atteso, per la documentazione del punto');
    const bloccoSpesa=indexSource.slice(indexSource.indexOf('Condimento: se il secondo'),indexSource.indexOf('Condimento: se il secondo')+600);
    assert(bloccoSpesa.includes("!(voce.realizzazioni&&voce.realizzazioni.length)"),'il consumatore legacy deve restare gated dietro l\'assenza di realizzazioni (mai vero per il motore attuale)');
  }

  console.log('lotto resolver unica fonte runtime: ok');
})().catch(error=>{console.error(error);process.exit(1);});
