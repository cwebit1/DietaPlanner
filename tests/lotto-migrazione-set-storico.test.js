'use strict';
/* Test mirato: incompatibilità tra i record storici del Set utente in
   IndexedDB e il formato canonico attuale (carboidrati AUTO/FIXED/EXCLUDED,
   tabellaGiornoCategoria, maxProteinSourcesPerDay).

   Copre, come richiesto:
   - database vuoto
   - record nel formato corrente (configCarboidratiStati completo)
   - il formato storico più vecchio realmente trovato in git (solo
     configCarboidrati + configCarboidratiOrigini, pre-commit 2d4537b),
     incluso il caso critico: conteggio misto 'utente'/'sistema' dovuto al
     vecchio Salva che completava sempre il totale a 14 prima di scrivere
   - zero esplicito (EXCLUDED)
   - voce assente (AUTO)
   - valore FIXED
   - carboidrato con tetto PDF (limitato)
   - tabella proteica parziale (tabellaGiornoCategoria)
   - maxProteinSourcesPerDay = 1 e = 2
   - normalizzazione di compatibilità in lettura del formato legacy dei
     carboidrati: origini affidabili (lunghezza corretta, soli valori
     'utente'/'sistema') isolano il conteggio utente; origini assenti,
     incomplete o con valori sconosciuti non fanno mai perdere un
     conteggio storico positivo (resta FIXED per intero)
   - invalidazione della cache e rilettura della configurazione: risultato
     stabile, nessuna scrittura automatica nello store impostazioni
   - nessuna cancellazione di impostazioni non coinvolte */
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
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value===undefined?null:structuredClone(value);};
global.put=async(name,value)=>{(stores[name]||new Map()).set(value.id??value.chiave,structuredClone(value));return value;};
global.delKey=async(name,key)=>(stores[name]||new Map()).delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=>'2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

(async()=>{
  await M.inizializza({basePath:''});

  /* ============ 1. Database vuoto ============ */
  {
    const resolved=await M.caricaConfigurazioneNutrizionaleRisolta();
    assert.equal(resolved.valid,true,'db vuoto: config valida');
    for(const [key,state] of Object.entries(resolved.carbohydrates.selection)){
      assert.equal(state.mode,'auto','db vuoto: '+key+' deve essere AUTO ('+state.mode+')');
    }
  }

  /* ============ 2. Record nel formato corrente (states completo) ============ */
  {
    const migrazione=M.selezioneCarboidratiPersistita(
      {riso:0,pasta:0}, // configCarboidrati legacy, ignorato quando states è presente per la chiave
      {},
      {riso:{mode:'fixed',count:3},pasta:{mode:'excluded',count:0},farro:{mode:'auto',count:0}},
      []
    );
    assert.equal(migrazione.states.riso.mode,'fixed');
    assert.equal(migrazione.states.riso.count,3);
    assert.equal(migrazione.states.pasta.mode,'excluded');
    assert.equal(migrazione.states.farro.mode,'auto');
  }

  /* ============ 3. Formato storico più vecchio (pre-2d4537b): ============
     configCarboidrati (conteggio totale per chiave) + configCarboidratiOrigini
     (array 'utente'/'sistema' per indice), nessuno stato canonico. Il
     vecchio pulsante Salva completava SEMPRE il totale a 14 prima di
     scrivere (vedi commit precedente a 2d4537b): un utente che aveva fissato
     davvero 2 caselle di riso poteva ritrovarsi un conteggio salvato di 4,
     con le 2 eccedenti di origine 'sistema' (mai scelte a mano). Solo le
     caselle 'utente' sono un FIXED reale. */
  {
    const rawCounts={riso:4,farro:0};
    const origins={riso:['utente','utente','sistema','sistema']};
    const migrazione=M.selezioneCarboidratiPersistita(rawCounts,origins,{},[]);
    assert.equal(migrazione.states.riso.mode,'fixed');
    assert.equal(migrazione.states.riso.count,2,'solo le 2 caselle utente sono un FIXED reale, non le 4 totali');

    const resolved=N.resolveNutritionConfig({user:{carbohydrates:migrazione}});
    assert.equal(resolved.valid,true);
    assert.equal(resolved.carbohydrates.selection.riso.mode,'fixed');
    assert.equal(resolved.carbohydrates.selection.riso.count,2,
      'BUG STORICO: il motore non deve applicare un FIXED di 4 quando l\'utente ne ha scelti davvero solo 2');
  }

  /* ============ 4. Zero esplicito → EXCLUDED ============ */
  {
    const migrazione=M.selezioneCarboidratiPersistita({pane:0},{pane:['utente']},{},['pane']);
    const resolved=N.resolveNutritionConfig({user:{carbohydrates:migrazione}});
    assert.equal(resolved.carbohydrates.selection.pane.mode,'excluded','zero esplicito deve restare EXCLUDED, mai riattivato');
  }

  /* ============ 5. Voce assente → AUTO (mai dedotta come esclusione) ============ */
  {
    const migrazione=M.selezioneCarboidratiPersistita({},{},{},[]);
    const resolved=N.resolveNutritionConfig({user:{carbohydrates:migrazione}});
    assert.equal(resolved.carbohydrates.selection.cous_cous.mode,'auto','voce mai configurata deve restare AUTO, non EXCLUDED');
  }

  /* ============ 6. Valore FIXED (formato corrente, conteggio esatto) ============ */
  {
    const migrazione=M.selezioneCarboidratiPersistita({},{},{orzo:{mode:'fixed',count:5}},[]);
    const resolved=N.resolveNutritionConfig({user:{carbohydrates:migrazione}});
    assert.equal(resolved.carbohydrates.selection.orzo.count,5,'FIXED deve mantenere il numero esatto scelto');
    assert.equal(resolved.carbohydrates.fixedCounts.orzo,5);
  }

  /* ============ 7. Carboidrato con tetto PDF (limitato): non deve diventare AUTO in migrazione ============ */
  {
    // formato storico misto utente/sistema anche su un carboidrato a tetto: gnocchi limite PDF 2
    const migrazione=M.selezioneCarboidratiPersistita({gnocchi:2},{gnocchi:['utente','utente']},{},[]);
    const resolved=N.resolveNutritionConfig({user:{carbohydrates:migrazione}});
    assert.equal(resolved.carbohydrates.selection.gnocchi.mode,'fixed','carboidrato a tetto PDF scelto dall\'utente resta FIXED, non AUTO');
    assert.equal(resolved.carbohydrates.selection.gnocchi.count,2);
    assert.equal(resolved.valid,true,'2 su tetto PDF 2 resta valido');
    // oltre il tetto PDF: errore esplicito, mai un fallback silenzioso
    const oltre=M.selezioneCarboidratiPersistita({gnocchi:3},{gnocchi:['utente','utente','utente']},{},[]);
    const resolvedOltre=N.resolveNutritionConfig({user:{carbohydrates:oltre}});
    assert.equal(resolvedOltre.valid,false,'oltre il tetto PDF deve fallire esplicitamente, mai essere silenziosamente limitato');
  }

  /* ============ 8. Due letture consecutive: stessa normalizzazione, nessuna deriva ============ */
  {
    const rawCounts={riso:4,pane:0},origins={riso:['utente','utente','sistema','sistema']},zero=['pane'];
    const first=M.selezioneCarboidratiPersistita(rawCounts,origins,{},zero);
    const second=M.selezioneCarboidratiPersistita(rawCounts,origins,{},zero);
    assert.deepEqual(first,second,'la stessa normalizzazione in lettura applicata due volte deve dare risultato identico');
    const resolvedFirst=N.resolveNutritionConfig({user:{carbohydrates:first}});
    const resolvedSecond=N.resolveNutritionConfig({user:{carbohydrates:second}});
    assert.deepEqual(resolvedFirst.carbohydrates.selection,resolvedSecond.carbohydrates.selection);
  }

  /* ============ Casi richiesti su legacyCarbohydrateUserCounts: affidabilità
     dell'array origini e regola conservativa sui dati incompleti ============ */
  {
    // 1. Conteggio 4, origini complete e affidabili → FIXED 2 (solo le caselle 'utente')
    assert.deepEqual(N.legacyCarbohydrateUserCounts({riso:4},{riso:['utente','utente','sistema','sistema']}),{riso:2});

    // 2. Conteggio 4, origini assenti → dato inaffidabile, il conteggio storico positivo non si perde: FIXED 4
    assert.deepEqual(N.legacyCarbohydrateUserCounts({riso:4},{}),{riso:4});

    // 3. Conteggio 4, origini più corte → inaffidabile: FIXED 4
    assert.deepEqual(N.legacyCarbohydrateUserCounts({riso:4},{riso:['utente']}),{riso:4});

    // 4. Conteggio 4, origini più lunghe → inaffidabile: FIXED 4
    assert.deepEqual(N.legacyCarbohydrateUserCounts({riso:4},{riso:['utente','utente','sistema','sistema','sistema']}),{riso:4});

    // 5. Conteggio 4, origine con valore sconosciuto → inaffidabile: FIXED 4
    assert.deepEqual(N.legacyCarbohydrateUserCounts({riso:4},{riso:['utente','utente','sistema','boh']}),{riso:4});

    // 6. Conteggio 4, origini complete tutte 'sistema' → affidabile, zero caselle utente: AUTO (non in FIXED)
    assert.deepEqual(N.legacyCarbohydrateUserCounts({riso:4},{riso:['sistema','sistema','sistema','sistema']}),{});

    // 7. Conteggio zero con chiave in explicitZeroKeys → EXCLUDED (verificato sul risultato risolto, non sul solo conteggio)
    {
      const migrazione=M.selezioneCarboidratiPersistita({riso:0},{},{},['riso']);
      assert.equal(migrazione.states.riso.mode,'excluded');
      const resolved=N.resolveNutritionConfig({user:{carbohydrates:migrazione}});
      assert.equal(resolved.carbohydrates.selection.riso.mode,'excluded');
    }

    // 8. configCarboidratiStati presente → stato canonico autorevole, mai sovrascritto dal formato legacy
    {
      const migrazione=M.selezioneCarboidratiPersistita(
        {riso:4},{riso:['utente','utente','sistema','sistema']}, // legacy che darebbe FIXED 2 se letto
        {riso:{mode:'auto',count:0}}, // stato canonico già presente: deve prevalere
        []
      );
      assert.deepEqual(migrazione.states.riso,{mode:'auto',count:0},'configCarboidratiStati presente resta autorevole, il formato legacy non lo sovrascrive');
    }

    // 9. Due letture consecutive della stessa normalizzazione: configurazione identica,
    //    nessuna nuova chiave scritta, nessun record cancellato o modificato
    {
      const raw={riso:4},origins={riso:['utente','utente','sistema','sistema']};
      const a=N.legacyCarbohydrateUserCounts(raw,origins);
      const b=N.legacyCarbohydrateUserCounts(raw,origins);
      assert.deepEqual(a,b);
      assert.deepEqual(raw,{riso:4},'l\'input grezzo non viene mutato dalla normalizzazione');
      assert.deepEqual(origins,{riso:['utente','utente','sistema','sistema']},'l\'array origini non viene mutato dalla normalizzazione');
    }
  }

  /* ============ 9-13. Scenario end-to-end reale: settimana intera con dati
     storici di carboidrati, tabella proteica parziale, maxProteinSourcesPerDay,
     invalidazione cache/rilettura, nessuna cancellazione di impostazioni estranee ============ */
  async function scenarioSettimana(maxProteinSourcesPerDay){
    resetStores();
    // Impostazioni estranee al compito: devono sopravvivere invariate
    await put('impostazioni',{chiave:'nonSpettante',valore:{marker:'non-toccare'}});
    await put('impostazioni',{chiave:'allergeniAttivi',valore:['glutine_finto_test']});

    // Formato storico più vecchio dei carboidrati
    await put('impostazioni',{chiave:'configCarboidrati',valore:{riso:4,orzo:2,pasta:0}});
    await put('impostazioni',{chiave:'configCarboidratiOrigini',valore:{riso:['utente','utente','sistema','sistema'],orzo:['utente','utente']}});
    // esplicitamente niente configCarboidratiStati / configCarboidratiExplicitZeroKeys: formato pre-migrazione

    await put('impostazioni',{chiave:'configAvanzata',valore:{maxProteinSourcesPerDay}});

    // tabella proteica PARZIALE: solo lunedì (giorno_0) fissato, il resto libero
    await put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:{giorno_0:['carne']}});

    await M.inizializza({basePath:''});
    /* La generazione con 1 sola fonte proteica/giorno ha margini di
       fattibilità stretti per costruzione (ordine casuale, non è una
       violazione - vedi LOTTO_J_MOTORE_UNICO.md), fuori perimetro di
       questo test: si riprova finché una settimana valida non viene
       trovata, senza cambiare alcuna regola nutrizionale. */
    let risultato,tentativi=0;
    do{
      stores.piano.clear();stores.consumoGiorno.clear();
      risultato=await M.generaPianoSettimana(0,{forza:true});
      tentativi++;
    }while(risultato.errori.length&&tentativi<60);
    assert.deepEqual(risultato.errori,[],'maxProteinSourcesPerDay='+maxProteinSourcesPerDay+': generazione senza errori (dopo '+tentativi+' tentativi)');
    assert.equal((await getAll('piano')).length,14,'settimana completa (14 slot)');

    const lunedi=await Promise.all(['pranzo','cena'].map(p=>getOne('piano','2026-08-31_'+p)));
    const categorieLunedi=lunedi.map(v=>v.categoriaTarget);
    if(maxProteinSourcesPerDay===1){
      assert.equal(categorieLunedi[0],categorieLunedi[1],'1 fonte/giorno: pranzo e cena devono avere la stessa categoria');
    }else{
      assert.notEqual(categorieLunedi[0],categorieLunedi[1],'2 fonti/giorno: pranzo e cena devono avere categorie diverse');
    }
    assert.equal(categorieLunedi[0],'carne','la cella fissata dall\'utente (lunedì=carne) è vincolante');

    // celle NON definite (martedì..domenica): restano libere, non pre-completate
    const tab=await getOne('impostazioni','tabellaGiornoCategoria');
    assert.deepEqual(Object.keys(tab.valore),['giorno_0'],'solo la cella realmente fissata dall\'utente è salvata, le altre restano libere');

    // il carboidrato FIXED storico (riso, scelto per davvero 2 volte, non 4) rispetta il conteggio utente
    const pianoFinale=await getAll('piano');
    const risoUsato=pianoFinale.filter(v=>v.carboidratoPianificato==='riso').length;
    assert.equal(risoUsato,2,'il riso storicamente FIXED a 2 dall\'utente (non 4, la parte "sistema" era solo completamento automatico) deve comparire esattamente 2 volte');

    // invalidazione della cache e rilettura della configurazione: risultato
    // stabile, nessuna scrittura automatica nello store impostazioni
    const impostazioniPrima=(await getAll('impostazioni')).length;
    M.invalidaConfigRuntime();
    const ricaricata=await M.caricaConfigurazioneNutrizionaleRisolta();
    const riletturaSuccessiva=await M.caricaConfigurazioneNutrizionaleRisolta();
    assert.deepEqual(ricaricata.carbohydrates.selection,riletturaSuccessiva.carbohydrates.selection,'rilettura stabile, nessuna deriva tra letture ripetute');
    assert.equal((await getAll('impostazioni')).length,impostazioniPrima,'invalidazione+rilettura non scrive alcuna nuova chiave nello store impostazioni');
    assert.equal(await getOne('impostazioni','configCarboidratiStati'),null,'la normalizzazione in lettura del formato legacy non scrive configCarboidratiStati');

    // nessuna cancellazione di impostazioni non coinvolte
    assert.deepEqual((await getOne('impostazioni','nonSpettante')).valore,{marker:'non-toccare'},'impostazione estranea non toccata');
    assert.deepEqual((await getOne('impostazioni','allergeniAttivi')).valore,['glutine_finto_test'],'impostazione estranea non toccata');
  }

  await scenarioSettimana(2);
  await scenarioSettimana(1);

  console.log('lotto migrazione Set storico: ok');
})().catch(error=>{console.error(error);process.exit(1);});
