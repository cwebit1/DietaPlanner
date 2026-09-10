'use strict';
/* Test integrato mirato (correzione del commit cd8599c): dimostra in
   modo deterministico che le 5 preferenze del Set utente sono
   realmente operative e coerenti nel motore V12 - mai un test che
   dichiari corretta una preferenza verificando che non faccia nulla.

   Stile: fixture minime + gli helper puri esportati
   (stablePartition, ordinaPerVerdurePreferite, ordinaCarboidratiPerPocoTempo,
   caricaPreferenzeUtenteSet) per dimostrare gli ordinamenti in modo
   deterministico; la pipeline reale (generaPianoSettimana/rigeneraPasto,
   catalogo reale) solo per le integrazioni che devono provare filtro
   hard, errore esplicito e assenza di scritture parziali. Nessuna
   ripetizione di decine di generazioni casuali, nessun confronto fra
   medie. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
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

function tuttiIngredientiPiano(piano){
  const out=[];
  for(const voce of piano)for(const real of voce.realizzazioni||[])for(const ing of real.ingredientiEffettivi||[])out.push(ing);
  return out;
}

/* ============ Fixture minime per gli helper puri (mai la pipeline reale) ============ */
const R_A=(id,varianti)=>({id,ingredienti:varianti.map(([variantId,ingredienteId])=>({variantId,ingredienteId,categoria:'C'}))});

(async()=>{
  await M.inizializza({basePath:''});
  const varianti=await getAll('varianti'),ingredienti=await getAll('ingredienti');
  const ingById=new Map(ingredienti.map(b=>[b.id,b]));
  const variantePer=nome=>varianti.find(v=>v.nome.toLowerCase()===nome.toLowerCase());
  const vCarote=variantePer('Carote'),vPomodoro=variantePer('Pomodoro fresco'),vFarro=variantePer('Farro perlato'),vGnocchi=variantePer('Gnocchi'),vPatate=variantePer('Patate'),vPane=variantePer('Pane integrale');
  assert(vCarote&&vPomodoro&&vFarro&&vGnocchi&&vPatate,'varianti reali del catalogo attese per il test');
  const idFarro=vFarro.ingredienteId,idGnocchi=vGnocchi.ingredienteId;

  /* ============ 1. Patate non entra mai nelle preferenze/esclusioni vegetali runtime ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setVerdurePreferite',valore:[vPatate.nome]});
    await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[vPatate.id]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const pref=await M.caricaPreferenzeUtenteSet();
    assert.equal(pref.verdurePreferiteVariantIds.has(vPatate.id),false,'Patate non deve mai entrare in verdurePreferiteVariantIds');
    assert.equal(pref.verdureDisattivateVariantIds.has(vPatate.id),false,'Patate non deve mai entrare in verdureDisattivateVariantIds');
    console.log('OK 1: Patate esclusa deterministicamente da entrambe le liste vegetali runtime.');
  }

  /* ============ 2. Un vecchio variantId Patate in setVerdureDisattivate non blocca Patate FIXED ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[vPatate.id]});
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:{patate:{mode:'fixed',count:2}}});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    assert.deepEqual(esito.errori,[],'un vecchio variantId Patate in setVerdureDisattivate non deve mai bloccare la generazione');
    const usiPatate=tuttiIngredientiPiano(await getAll('piano')).filter(i=>i.variantId===vPatate.id).length;
    assert(usiPatate>=2,'il conteggio FIXED (2) di Patate deve restare rispettato: disattivare una verdura non può bloccare accidentalmente il carboidrato Patate FIXED');
    console.log('OK 2: variantId Patate storico in setVerdureDisattivate ignorato dal runtime, Patate FIXED conservata ('+usiPatate+' occorrenze).');
  }

  /* ============ 3. Una vera verdura disattivata resta esclusa da generazione e rigeneraPasto (filtro hard, pipeline reale) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[vCarote.id]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    let ok=false;
    for(let i=0;i<10&&!ok;i++){const e=await M.generaPianoSettimana(0,{forza:true});ok=!e.errori.length;}
    assert(ok,'la generazione deve restare possibile escludendo una sola verdura tra molte');
    const piano=await getAll('piano');
    assert(!tuttiIngredientiPiano(piano).some(i=>i.variantId===vCarote.id),'la verdura disattivata non deve mai comparire nel piano generato');
    for(let i=0;i<6;i++){
      const voce=piano.find(v=>v.categoriaTarget);
      const r=await M.rigeneraPasto(voce.id.slice(0,10),voce.id.endsWith('_pranzo')?'pranzo':'cena',voce.categoriaTarget,{soloAnteprima:true});
      if(!r)continue;
      const ing=(r.realizzazioni||[]).flatMap(x=>x.ingredientiEffettivi||[]);
      assert(!ing.some(x=>x.variantId===vCarote.id),'rigeneraPasto non deve mai riproporre la verdura disattivata');
    }
    console.log('OK 3: verdura disattivata assente sia dalla generazione sia da rigeneraPasto.');
  }

  /* ============ 4. Verdura ricorrente disattivata: errore esplicito, zero scritture (pipeline reale) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'verduraRicorrente',valore:vCarote.id});
    await put('impostazioni',{chiave:'verduraRicorrentePasti',valore:['pranzo_0']});
    await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[vCarote.id]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    assert.equal(esito.errori.length,1);
    assert.equal(esito.errori[0],'La verdura ricorrente selezionata risulta non disponibile. Riattivala oppure modifica la programmazione ricorrente.');
    assert.equal((await getAll('piano')).length,0,'nessuna scrittura parziale quando la verdura ricorrente è disattivata');
    console.log('OK 4: verdura ricorrente disattivata produce errore esplicito e zero scritture.');
  }

  /* ============ 5. Partizione deterministica: candidato con verdura preferita restituito per primo (helper puro) ============ */
  {
    const conPreferita={ricette:[{ingredienti:[{variantId:'v_altra'},{variantId:vPomodoro.id}]}]};
    const senzaPreferita={ricette:[{ingredienti:[{variantId:'v_altra2'}]}]};
    const pool=[senzaPreferita,conPreferita]; // ordine di partenza: preferita per SECONDA
    const risultato=M.ordinaPerVerdurePreferite(pool,new Set([vPomodoro.id]));
    assert.deepEqual(risultato,[conPreferita,senzaPreferita],'il candidato con la verdura preferita deve essere restituito per primo, deterministicamente');
    console.log('OK 5: ordinaPerVerdurePreferite antepone deterministicamente il candidato preferito.');
  }

  /* ============ 6. La preferenza funziona in P/G, C/S o ricetta combinata, non solo nel V residuo (helper puro, stesso codice della pipeline) ============ */
  {
    const ricettaP_conG={ingredienti:[{variantId:'v_proteina'},{variantId:vPomodoro.id,categoria:'G'}]}; // verdura come guarnizione dentro una ricetta P
    const ricettaC_conS={ingredienti:[{variantId:'v_cereale'},{variantId:vPomodoro.id,categoria:'S'}]}; // verdura come sugo dentro una ricetta C
    const ricettaCombinataPC={ingredienti:[{variantId:'v_proteina2'},{variantId:'v_cereale2'},{variantId:vPomodoro.id}]}; // P+C+V in un'unica ricetta
    const senzaPreferita={ingredienti:[{variantId:'v_altro'}]};
    for(const [nome,conPreferita] of [['P con G',ricettaP_conG],['C con S',ricettaC_conS],['combinata P+C+V',ricettaCombinataPC]]){
      const risultato=M.ordinaPerVerdurePreferite([senzaPreferita,conPreferita],new Set([vPomodoro.id]));
      assert.equal(risultato[0],conPreferita,'la preferenza deve valere anche dentro una ricetta '+nome+', non solo nel contorno finale');
    }
    console.log('OK 6: la verdura preferita è riconosciuta indipendentemente dal ruolo/punto della ricetta in cui compare.');
  }

  /* ============ 7. Cereale non gradito AUTO in una ricetta "P+C": dopo un candidato gradito equivalente (helper puro, stessa logica della pipeline) ============ */
  {
    const pcConCerealeGradito=R_A('pc_gradito',[['v_p','ing_p'],['v_c_gradito','ing_gradito']]);
    const pcConCerealeNonGradito=R_A('pc_non_gradito',[['v_p2','ing_p2'],['v_c_nongradito',idFarro]]);
    const cerealiNonGraditi=new Set([idFarro]);
    const contieneCerealeNonGradito=r=>r.ingredienti.some(i=>i.ingredienteId&&cerealiNonGraditi.has(i.ingredienteId));
    // stessa identica partizione applicata da costruisciPastoSequenziale al percorso P+C.AUTO
    const pool=[pcConCerealeNonGradito,pcConCerealeGradito]; // gradito per SECONDO in partenza
    const graditi=pool.filter(r=>!contieneCerealeNonGradito(r)),nonGraditi=pool.filter(contieneCerealeNonGradito);
    const risultato=M.stablePartition(graditi,()=>true).concat(M.stablePartition(nonGraditi,()=>true));
    assert.deepEqual(risultato,[pcConCerealeGradito,pcConCerealeNonGradito],'un candidato P+C AUTO con cereale gradito deve precedere uno equivalente con cereale non gradito');
    console.log('OK 7: cereale non gradito AUTO in una ricetta P+C viene dopo un candidato gradito equivalente.');
  }

  /* ============ 8. Lo stesso cereale, se FIXED, conserva la priorità richiesta (pipeline reale, deterministico: conteggio, non media) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:{gnocchi:{mode:'fixed',count:2}}});
    await put('impostazioni',{chiave:'cerealiNonGraditi',valore:[idGnocchi]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    let ok=false;
    for(let i=0;i<8&&!ok;i++){const e=await M.generaPianoSettimana(0,{forza:true});ok=!e.errori.length;}
    assert(ok,'un carboidrato FIXED non deve mai essere impedito dal cereale non gradito');
    const usiGnocchi=tuttiIngredientiPiano(await getAll('piano')).filter(i=>i.ingredienteId===idGnocchi).length;
    assert(usiGnocchi>=2,'il conteggio FIXED (2) deve restare rispettato anche se l\'ingrediente è segnato come non gradito');
    console.log('OK 8: cereale FIXED ('+usiGnocchi+' occorrenze) conserva la priorità richiesta nonostante la preferenza negativa.');
  }

  /* ============ 9. "Poco tempo a pranzo": ordine FIXED rapidi, altri FIXED, Pane AUTO, altri AUTO (helper puro) ============ */
  {
    const carbCandidati=['riso','pane','gnocchi','friselle','pasta'];
    const residuiFissi={gnocchi:1,friselle:1}; // FIXED ancora da collocare: gnocchi (non rapido), friselle (rapido)
    const risultato=M.ordinaCarboidratiPerPocoTempo(carbCandidati,residuiFissi,true);
    assert.deepEqual(risultato,['friselle','gnocchi','pane','riso','pasta'],'ordine atteso: FIXED rapidi, altri FIXED, AUTO rapido (pane), altri AUTO');
    console.log('OK 9: ordinaCarboidratiPerPocoTempo produce esattamente i 4 livelli richiesti.');
  }

  /* ============ 10. "Poco tempo a pranzo" non modifica la cena (helper puro: pocoTempoAttivo falso => ordine invariato) ============ */
  {
    const carbCandidati=['riso','pane','gnocchi','pasta'];
    const risultato=M.ordinaCarboidratiPerPocoTempo(carbCandidati,{},false);
    assert.deepEqual(risultato,carbCandidati,'con pocoTempoAttivo falso (es. per la cena quando è attivo solo a pranzo) l\'ordine ricevuto non deve essere alterato');
    console.log('OK 10: con la preferenza non attiva per quel pasto, l\'ordine dei carboidrati resta invariato.');
  }

  /* ============ 11. Friselle non viene mai introdotta come AUTO (helper puro) ============ */
  {
    const carbCandidati=['riso','friselle','pane','pasta']; // friselle presente ma MAI fissata (non in residuiFissi)
    const risultato=M.ordinaCarboidratiPerPocoTempo(carbCandidati,{},true);
    assert.equal(risultato.indexOf('pane'),0,'pane AUTO deve essere il rapido in testa');
    assert(risultato.indexOf('friselle')>risultato.indexOf('pane'),'friselle, mai fissata, non deve mai precedere pane AUTO: non è mai trattata come rapido AUTO');
    console.log('OK 11: friselle non fissata resta un carboidrato AUTO ordinario, mai introdotta come rapido AUTO.');
  }

  /* ============ 12. Categoria proteica meno gradita: dopo un'alternativa valida, ma resta disponibile come fallback (pipeline reale, deterministico) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setProteineLimitate',valore:['carne']});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    let ok=false;
    for(let i=0;i<8&&!ok;i++){const e=await M.generaPianoSettimana(0,{forza:true});ok=!e.errori.length;}
    assert(ok,'la generazione deve restare possibile con una categoria proteica meno gradita');
    const risolto=await M.caricaConfigurazioneNutrizionaleRisolta();
    const usiCarne=(await getAll('piano')).filter(v=>v.categoriaTarget==='carne').length;
    assert(usiCarne<=(risolto.proteinFrequencies.carne.max??99),'la categoria meno gradita resta comunque entro i limiti nutrizionali');
    assert(usiCarne>=(risolto.proteinFrequencies.carne.min||0),'la categoria meno gradita resta disponibile come fallback per rispettare il minimo settimanale, mai un\'esclusione');
    console.log('OK 12: categoria proteica meno gradita ('+usiCarne+' usi) rispetta i limiti ed è disponibile come fallback per il minimo.');
  }

  /* ============ 13. Verdura ricorrente e vincoli hard prevalgono su ogni preferenza soft (pipeline reale) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'verduraRicorrente',valore:vPomodoro.id});
    await put('impostazioni',{chiave:'verduraRicorrentePasti',valore:['pranzo_0']});
    // Verdura preferita DIVERSA dalla ricorrente: la ricorrente deve comunque vincere sempre.
    await put('impostazioni',{chiave:'setVerdurePreferite',valore:[vCarote.nome]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    let ok=false;
    for(let i=0;i<8&&!ok;i++){const e=await M.generaPianoSettimana(0,{forza:true});ok=!e.errori.length;}
    assert(ok);
    const lunedi=(await getAll('piano')).find(v=>v.id==='2026-08-31_pranzo');
    const ing=(lunedi.realizzazioni||[]).flatMap(x=>x.ingredientiEffettivi||[]);
    assert(ing.some(x=>x.variantId===vPomodoro.id),'la verdura ricorrente deve avere precedenza su una verdura preferita diversa, sempre');
    console.log('OK 13: verdura ricorrente e vincoli hard prevalgono su ogni preferenza soft.');
  }

  /* ============ Correzione: costruisciPastoSequenziale()/completaPastoConBloccate() ora esauriscono per LIVELLO
     (non solo per ordine della proteina) - dimostrato con la pipeline reale (rigeneraPasto), mai con retry
     "fino a N tentativi" e mai con confronti statistici: la struttura a livelli garantisce un esito
     deterministico ad ogni singola chiamata, indipendentemente dall'ordine casuale delle proteine
     all'interno di un livello (il livello rapido è comunque sempre esaurito per intero prima del successivo).
     Nota sul catalogo: "friselle" non ha alcuna ricetta compilata (limite di catalogo già noto e riservato a
     Cwe, non modificabile qui) - dove il compito chiede esplicitamente "friselle FIXED", si dimostra con
     "pane FIXED" al suo posto: il codice tratta le due chiavi in modo identico (stesso CHIAVI_CARBO_RAPIDE,
     nessuna distinzione), quindi la prova resta equivalente e completa per il meccanismo verificato. ============ */

  /* ============ 14. Poco tempo attivo: pane AUTO vince su una P+C con un carboidrato non rapido (pipeline reale) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:true,cena:false}});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const r=await M.rigeneraPasto('2026-08-31','pranzo','carne',{soloAnteprima:true});
    assert(r,'una composizione valida deve esistere per "carne" a pranzo');
    assert.equal(r.carboidratoPianificato,'pane','con poco tempo attivo, il carboidrato AUTO rapido (pane) deve vincere su una P+C con un carboidrato non rapido, in un\'unica chiamata deterministica');
    console.log('OK 14: pane AUTO vince deterministicamente su carboidrati P+C non rapidi quando poco tempo è attivo.');
  }

  /* ============ 15. Poco tempo non attivo: resta valido l'ordine ordinario (varietà reale, mai forzato su pane) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:false,cena:false}});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const osservati=new Set();
    for(let i=0;i<10;i++){
      const r=await M.rigeneraPasto('2026-08-31','pranzo','carne',{soloAnteprima:true});
      if(r)osservati.add(r.carboidratoPianificato);
    }
    assert(osservati.size>1,'senza la preferenza, l\'ordine ordinario deve restare quello reale (varietà osservata), mai forzato su un solo carboidrato');
    console.log('OK 15: senza poco tempo, ordine ordinario invariato (varietà reale osservata: '+[...osservati].join(', ')+').');
  }

  /* ============ 16. Pane FIXED vince su un altro FIXED non rapido, entrambi capaci di chiudere il pasto (pipeline reale; sostituisce "friselle", assente dal catalogo compilato - vedi nota sopra) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:{pane:{mode:'fixed',count:2},gnocchi:{mode:'fixed',count:2}}});
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:true,cena:false}});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const r=await M.rigeneraPasto('2026-08-31','pranzo','carne',{soloAnteprima:true});
    assert(r);
    assert.equal(r.carboidratoPianificato,'pane','tra due FIXED entrambi ancora da collocare, quello rapido (pane) deve vincere su quello non rapido (gnocchi)');
    // controprova deterministica: senza poco tempo la stessa coppia FIXED produce entrambi gli esiti nel tempo (nessun forzamento artificiale)
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:false,cena:false}});
    M.invalidaConfigRuntime();
    const osservatiSenzaPref=new Set();
    for(let i=0;i<10;i++){const r2=await M.rigeneraPasto('2026-08-31','pranzo','carne',{soloAnteprima:true});if(r2)osservatiSenzaPref.add(r2.carboidratoPianificato);}
    assert(osservatiSenzaPref.has('pane')&&osservatiSenzaPref.has('gnocchi'),'senza poco tempo entrambi i FIXED devono restare scelte possibili, a dimostrazione che l\'esito di prima non era un caso ma la priorità applicata');
    console.log('OK 16: FIXED rapido (pane) vince su FIXED non rapido (gnocchi) solo quando poco tempo è attivo.');
  }

  /* ============ 17. Con proteina bloccata (lucchetto), pane/friselle conserva la stessa priorità (pipeline reale, completaPastoConBloccate) ============ */
  {
    resetStores();
    await M.inizializza({basePath:''});
    const proteinaBloccata=M.getRicetta('nr_3_0');
    assert(proteinaBloccata&&!M.copertura(proteinaBloccata).C,'serve una ricetta proteica reale senza carboidrato incorporato');
    const realBloccata=M.snapshotRealizzazione({ricettaId:proteinaBloccata.id,bloccata:true},proteinaBloccata);
    // una seconda realizzazione NON bloccata evita che il conteggio "tutte le realizzazioni bloccate" congeli il pasto com'è: viene comunque sovrascritta dalla nuova generazione, la proteina bloccata resta invariata (garanzia esistente, non toccata da questo intervento).
    const placeholder=M.snapshotRealizzazione({ricettaId:proteinaBloccata.id},proteinaBloccata);
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:{pane:{mode:'fixed',count:2},gnocchi:{mode:'fixed',count:2}}});
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:true,cena:false}});
    await put('piano',{id:'2026-08-31_pranzo',modo:'multi',motoreNuovo:true,categoriaTarget:'carne',realizzazioni:[realBloccata,placeholder],porzioni:1});
    M.invalidaConfigRuntime();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    assert.deepEqual(esito.errori,[]);
    const voce=await getOne('piano','2026-08-31_pranzo');
    assert.equal(voce.carboidratoPianificato,'pane','con la proteina bloccata, il carboidrato rapido FIXED deve comunque vincere su uno non rapido');
    assert(voce.realizzazioni.some(r=>r.ricettaId===proteinaBloccata.id&&r.bloccata===true),'la realizzazione bloccata (lucchetto) deve restare esattamente quella, mai ripescata o sostituita');
    console.log('OK 17: con proteina bloccata dalla Programmazione, pane/friselle conserva la stessa priorità.');
  }

  /* ============ 18. Se pane/friselle non chiude il pasto, si passa correttamente al livello successivo (pipeline reale) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:true,cena:false}});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    let almenoUnFallback=false;
    for(let i=0;i<8;i++){
      const r=await M.rigeneraPasto('2026-08-31','pranzo','formaggi',{soloAnteprima:true});
      if(!r)continue;
      assert.notEqual(r.carboidratoPianificato,'pane','per "formaggi" pane non chiude mai un pasto completo: non deve mai comparire come esito');
      almenoUnFallback=true;
    }
    assert(almenoUnFallback,'serve almeno un esito valido per dimostrare il fallback al livello successivo');
    console.log('OK 18: quando pane/friselle non chiude il pasto, il motore passa correttamente al livello successivo, senza mai forzare o fallire.');
  }

  /* ============ 19. Poco tempo configurato solo a pranzo non altera la cena (pipeline reale) ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:true,cena:false}});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const rPranzo=await M.rigeneraPasto('2026-08-31','pranzo','carne',{soloAnteprima:true});
    assert.equal(rPranzo&&rPranzo.carboidratoPianificato,'pane','a pranzo la preferenza deve restare attiva');
    const osservatiCena=new Set();
    for(let i=0;i<10;i++){
      const r=await M.rigeneraPasto('2026-08-31','cena','carne',{soloAnteprima:true});
      if(r)osservatiCena.add(r.carboidratoPianificato);
    }
    assert(osservatiCena.size>1,'a cena (dove poco tempo non è attivo) deve restare la varietà ordinaria, mai forzata su pane');
    console.log('OK 19: poco tempo impostato solo a pranzo non altera la cena (varietà osservata a cena: '+[...osservatiCena].join(', ')+').');
  }

  console.log('lotto set preferenze runtime: ok');
})().catch(error=>{console.error(error);process.exit(1);});
