'use strict';
/* Test mirato: regola definitiva di Cwe sulla scelta delle categorie
   proteiche - "pranzo = una categoria, cena = una categoria diversa" -
   applicata correttamente per profilo. La regola vale sempre per
   l'onnivoro; per vegetariano/vegano i limiti ordinari (pensati per il
   pool di 5 categorie dell'onnivoro) non vengono più ereditati
   automaticamente, e la diversificazione pranzo/cena si applica solo
   quando il profilo dispone di almeno due categorie funzionali (mai con
   una sola, es. vegano oggi: solo "legumi").

   Regola della tabella utente per ogni giorno (quando la diversificazione
   si applica):
   - 0 categorie scelte -> il sistema ne sceglie automaticamente due,
     ammesse, differenti, compatibili con frequenze e profilo;
   - 1 categoria scelta -> resta vincolante, la seconda viene scelta
     automaticamente tra le ammesse e differenti;
   - 2 categorie scelte -> entrambe restano vincolanti.

   Verifica con la pipeline reale: engine-core.js:buildProteinGrid per
   0/1/2 scelte ed esclusioni (stessa funzione richiamata sia dal
   pulsante Casuale/Completa del Set sia utilizzabile per la generazione
   del Menù - nessuna duplicazione della logica nel test), e
   motor-v12.js:generaPianoSettimana (pipeline completa reale) per la
   settimana intera nei tre profili. Casualità controllata (rng seedato
   o tentativi limitati, mai migliaia di generazioni). */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../engine-core.js');
const N=require('../nutrition-config.js');

const GIORNI=['giorno_0','giorno_1','giorno_2','giorno_3','giorno_4','giorno_5','giorno_6'];

(function(){
  /* ============ 0/1/2 scelte, config predefinita onnivoro (5 categorie ammesse) ============ */
  const userTable={
    giorno_0:[],                 // 0 scelte
    giorno_1:['carne'],          // 1 scelta
    giorno_2:['pesce','legumi']  // 2 scelte
  };
  const risolto=N.resolveNutritionConfig({});
  assert.equal(risolto.valid,true,'la configurazione predefinita deve restare valida');
  const r=E.buildProteinGrid(GIORNI,userTable,{proteinFrequencies:risolto.proteinFrequencies,proteinDailyDiversificationRequired:risolto.profile.proteinDailyDiversificationRequired},{},E.seeded(42));
  assert.deepEqual(r.errors,[],'la pipeline reale non deve produrre errori con una configurazione fattibile');

  // 0 scelte -> due categorie ammesse e differenti, entrambe scelte dal sistema
  assert(r.cells.giorno_0.pranzo.macro,'0 scelte: il sistema deve scegliere una categoria per il pranzo');
  assert(r.cells.giorno_0.cena.macro,'0 scelte: il sistema deve scegliere una categoria per la cena');
  assert.notEqual(r.cells.giorno_0.pranzo.macro,r.cells.giorno_0.cena.macro,'0 scelte: le due categorie scelte automaticamente devono essere differenti');
  assert.equal(r.cells.giorno_0.pranzo.source,'auto');
  assert.equal(r.cells.giorno_0.cena.source,'auto');

  // 1 scelta -> preservata per il pranzo, la seconda scelta automaticamente e diversa
  assert.equal(r.cells.giorno_1.pranzo.macro,'carne','1 scelta: la categoria scelta dall\'utente resta vincolante');
  assert.equal(r.cells.giorno_1.pranzo.source,'user');
  assert(r.cells.giorno_1.cena.macro,'1 scelta: il sistema deve completare la seconda categoria');
  assert.notEqual(r.cells.giorno_1.cena.macro,'carne','1 scelta: la seconda categoria deve essere differente da quella già scelta');
  assert.equal(r.cells.giorno_1.cena.source,'auto');

  // 2 scelte -> entrambe restano vincolanti, usate esattamente per i due pasti
  assert.equal(r.cells.giorno_2.pranzo.macro,'pesce');
  assert.equal(r.cells.giorno_2.pranzo.source,'user');
  assert.equal(r.cells.giorno_2.cena.macro,'legumi');
  assert.equal(r.cells.giorno_2.cena.source,'user');

  console.log('OK: 0/1/2 scelte onnivoro rispettate (pranzo!==cena sempre, source user/auto corretto).');
})();

(function(){
  /* ============ Vegetariano: nessun tetto onnivoro ereditato, settimana intera fattibile (7 giorni/14 slot) ============
     Prima di questa correzione, formaggi(max3 onnivoro)+uova(max2 onnivoro)
     rendevano la settimana intera infattibile (capacità 12/14) pur
     restando "valid" secondo il solo conteggio delle categorie: il difetto
     esatto segnalato da Cwe. Ora vegetariano ha il proprio spazio di
     configurazione (nessun massimo automatico ereditato), quindi l'intera
     settimana deve essere fattibile senza bisogno di alcuna
     configurazione aggiuntiva del nutrizionista. */
  const risolto=N.resolveNutritionConfig({nutritionist:{config:{dietProfile:'vegetariano'}}});
  assert.equal(risolto.valid,true,'il profilo vegetariano deve restare valido con i soli valori di default (nessun tetto onnivoro ereditato)');
  assert.equal(risolto.proteinFrequencies.formaggi.max,null,'nessun massimo onnivoro ereditato automaticamente per formaggi in vegetariano');
  assert.equal(risolto.proteinFrequencies.uova.max,null,'nessun massimo onnivoro ereditato automaticamente per uova in vegetariano');
  const forbidden=new Set(risolto.profile.forbiddenProteinMacros);
  const frequenzeConEsclusioni={};
  for(const [k,v] of Object.entries(risolto.proteinFrequencies))frequenzeConEsclusioni[k]=forbidden.has(k)?Object.assign({},v,{min:0,max:0,target:0}):Object.assign({},v);
  const r=E.buildProteinGrid(GIORNI,{},{proteinFrequencies:frequenzeConEsclusioni,proteinDailyDiversificationRequired:risolto.profile.proteinDailyDiversificationRequired},{},E.seeded(7));
  assert.deepEqual(r.errors,[],'la settimana intera (14 slot) deve essere fattibile per il profilo vegetariano coi soli valori di default');
  for(const day of GIORNI){
    const p=r.cells[day].pranzo.macro,c=r.cells[day].cena.macro;
    assert.notEqual(p,c,day+': pranzo e cena devono restare categorie diverse (vegetariano ha 3 categorie ammesse)');
    assert(!forbidden.has(p)&&!forbidden.has(c),day+': nessuna categoria esclusa dal profilo (carne/pesce) deve mai comparire nel risultato');
  }
  console.log('OK: vegetariano completa i 14 slot della settimana intera senza ereditare i tetti onnivori, nessuna categoria esclusa nel risultato.');
})();

(function(){
  /* ============ Capacità realmente insufficiente (non solo conteggio categorie): rifiutata prima della generazione ============
     Scenario con una sola categoria (vegano: solo "legumi", diversificazione
     non richiesta) ma con un tetto esplicito del nutrizionista troppo
     basso per completare 14 pasti: la fattibilità reale deve essere
     verificata, non solo che esista almeno una categoria. */
  const risolto=N.resolveNutritionConfig({nutritionist:{config:{dietProfile:'vegano',proteinFrequenciesByProfile:{vegano:{legumi:{max:5}}}}}});
  assert.equal(risolto.valid,false,'un tetto di 5 per l\'unica categoria disponibile non basta per 14 pasti: deve essere respinto');
  assert(risolto.errors.some(e=>/capacità/.test(e)),'l\'errore deve indicare esplicitamente il problema di capacità, non un generico conteggio di categorie');
  console.log('OK: una capacità realmente insufficiente viene rifiutata anche con una sola categoria ammessa (vincolo verificato, non solo contato).');
})();

/* ============ Settimana intera reale (motor-v12.js:generaPianoSettimana) nei tre profili ============ */
(async()=>{
  const root=path.join(__dirname,'..');
  const stores={};
  function resetStores(){for(const n of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[n]=new Map();}
  resetStores();
  global.getAll=async name=>[...(stores[name]||new Map()).values()].map(v=>structuredClone(v));
  global.getOne=async(name,key)=>{const v=(stores[name]||new Map()).get(key);return v===undefined?null:structuredClone(v);};
  global.put=async(name,value)=>{(stores[name]||new Map()).set(value.id??value.chiave,structuredClone(value));return value;};
  global.delKey=async(name,key)=>(stores[name]||new Map()).delete(key);
  global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
  global.todayISO=()=>'2026-08-30';
  global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
  require('../motor-v12.js');
  const M=global.DietaPlannerMotorV12;

  for(const profilo of ['onnivoro','vegetariano','vegano']){
    resetStores();
    if(profilo!=='onnivoro')await put('impostazioni',{chiave:'configAvanzata',valore:{dietProfile:profilo}});
    await M.inizializza({basePath:''});
    let ok=false,ultimoErrore=null;
    for(let tentativo=0;tentativo<10&&!ok;tentativo++){
      const esito=await M.generaPianoSettimana(0,{forza:true});
      if(!esito.errori.length)ok=true;else ultimoErrore=esito.errori;
    }
    assert(ok,profilo+': la settimana intera (14 pasti principali) deve completarsi entro 10 tentativi - '+JSON.stringify(ultimoErrore));
    const piano=await getAll('piano');
    assert.equal(piano.length,14,profilo+': devono risultare esattamente 14 slot (7 giorni x pranzo/cena)');

    const risolto=await M.caricaConfigurazioneNutrizionaleRisolta();
    const forbidden=new Set(risolto.profile.forbiddenProteinMacros);
    for(const voce of piano){
      assert(!forbidden.has(voce.categoriaTarget),profilo+': nessuna categoria esclusa dal profilo deve comparire in categoriaTarget, trovato "'+voce.categoriaTarget+'" in '+voce.id);
    }
    if(risolto.profile.proteinDailyDiversificationRequired){
      const giorni={};
      for(const voce of piano){const g=voce.id.slice(0,10);(giorni[g]=giorni[g]||[]).push(voce);}
      for(const [g,voci] of Object.entries(giorni)){
        const p=voci.find(v=>v.id.endsWith('_pranzo')),c=voci.find(v=>v.id.endsWith('_cena'));
        if(p&&c)assert.notEqual(p.categoriaTarget,c.categoriaTarget,profilo+' '+g+': pranzo e cena devono avere categorie diverse');
      }
    }
    console.log('OK: '+profilo+' completa i 14 slot della settimana reale, nessuna categoria esclusa nel risultato.');
  }

  console.log('lotto proteine autocompletamento: ok');
})().catch(error=>{console.error(error);process.exit(1);});
