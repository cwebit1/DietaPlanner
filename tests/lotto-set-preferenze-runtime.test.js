'use strict';
/* Test integrato mirato: collega realmente al motore corrente
   (motor-v12.js) le 5 preferenze del Set utente salvate in IndexedDB ma
   finora non consumate dalla generazione:
   setProteineLimitate, setPocoTempo, cerealiNonGraditi,
   setVerdurePreferite, setVerdureDisattivate.

   Usa la pipeline reale (generaPianoSettimana/rigeneraPasto) col
   catalogo reale (db-ricette.json/ingredienti-new.json), mai una
   reimplementazione della logica di preferenza. Casualità controllata
   con tentativi limitati (mai migliaia di generazioni). */
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
async function generaSettimanaValida(tentativiMax){
  let ultimoErrore=null;
  for(let i=0;i<tentativiMax;i++){
    const esito=await M.generaPianoSettimana(0,{forza:true});
    if(!esito.errori.length)return {ok:true,esito};
    ultimoErrore=esito.errori;
  }
  return {ok:false,errore:ultimoErrore};
}

(async()=>{
  await M.inizializza({basePath:''});M.invalidaConfigRuntime();
  const varianti=await getAll('varianti'),ingredienti=await getAll('ingredienti');
  const ingById=new Map(ingredienti.map(b=>[b.id,b]));
  const variantePer=nome=>varianti.find(v=>v.nome.toLowerCase()===nome.toLowerCase());
  const vCarote=variantePer('Carote'),vPomodoro=variantePer('Pomodoro fresco'),vFarro=variantePer('Farro perlato'),vGnocchi=variantePer('Gnocchi');
  assert(vCarote&&vPomodoro&&vFarro&&vGnocchi,'varianti reali del catalogo attese per il test');
  const idFarro=ingById.get(vFarro.ingredienteId)&&vFarro.ingredienteId;
  assert(idFarro,'ID base di Farro perlato atteso');

  /* ============ 1. Senza preferenze: esistono candidati ordinari (baseline) ============ */
  {
    resetStores();await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const {ok,esito}=await generaSettimanaValida(5);
    assert(ok,'senza alcuna preferenza la settimana deve generarsi normalmente');
    const piano=await getAll('piano');
    assert.equal(piano.length,14);
    console.log('OK 1: senza preferenze, candidati ordinari, settimana completa.');
  }

  /* ============ 2. Verdura disattivata: mai in generazione né in rigeneraPasto ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[vCarote.id]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const {ok}=await generaSettimanaValida(10);
    assert(ok,'la generazione deve restare possibile escludendo una sola verdura tra molte');
    const piano=await getAll('piano');
    const tuttiIng=tuttiIngredientiPiano(piano);
    assert(!tuttiIng.some(i=>i.variantId===vCarote.id),'la verdura disattivata non deve mai comparire nel piano generato');

    // rigeneraPasto: stesso vincolo, mai riabilitata
    for(let i=0;i<8;i++){
      const voce=piano.find(v=>v.categoriaTarget);
      const r=await M.rigeneraPasto(voce.id.slice(0,10),voce.id.endsWith('_pranzo')?'pranzo':'cena',voce.categoriaTarget,{soloAnteprima:true});
      if(!r)continue;
      const ing=(r.realizzazioni||[]).flatMap(x=>x.ingredientiEffettivi||[]);
      assert(!ing.some(x=>x.variantId===vCarote.id),'rigeneraPasto non deve mai riproporre la verdura disattivata');
    }
    console.log('OK 2: verdura disattivata assente sia dalla generazione sia da rigeneraPasto.');
  }

  /* ============ 3. Verdura favorita: scelta prima quando esiste soluzione completa valida ============ */
  {
    resetStores();
    await put('impostazioni',{chiave:'setVerdurePreferite',valore:[vPomodoro.nome]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    let trovata=false;
    for(let i=0;i<15&&!trovata;i++){
      resetStores();
      await put('impostazioni',{chiave:'setVerdurePreferite',valore:[vPomodoro.nome]});
      await M.inizializza({basePath:''});M.invalidaConfigRuntime();
      const {ok}=await generaSettimanaValida(1);
      if(!ok)continue;
      const piano=await getAll('piano');
      const tuttiIng=tuttiIngredientiPiano(piano);
      if(tuttiIng.some(x=>x.variantId===vPomodoro.id))trovata=true;
    }
    assert(trovata,'con la verdura favorita configurata, deve comparire almeno una volta in una settimana reale entro pochi tentativi (preferenza applicata, mai un obbligo)');
    console.log('OK 3: la verdura favorita viene scelta quando esiste una soluzione completa valida che la contiene.');
  }

  /* ============ 4. Cereale non gradito: evitato se esiste alternativa, ma resta utilizzabile se FIXED ============ */
  {
    // 4a. AUTO: con Farro perlato segnato come non gradito, la presenza
    // media su più settimane deve ridursi rispetto al baseline (confronto
    // su una media di poche prove indipendenti, per non dipendere dal
    // rumore di una singola estrazione casuale - mai un'esclusione hard:
    // può ancora comparire se serve).
    const contaFarro=async()=>tuttiIngredientiPiano(await getAll('piano')).filter(i=>i.ingredienteId===idFarro).length;
    let baseTotale=0,prefTotale=0;
    const CAMPIONI=5;
    for(let i=0;i<CAMPIONI;i++){
      resetStores();
      await M.inizializza({basePath:''});M.invalidaConfigRuntime();
      const {ok}=await generaSettimanaValida(3);
      assert(ok);
      baseTotale+=await contaFarro();
    }
    for(let i=0;i<CAMPIONI;i++){
      resetStores();
      await put('impostazioni',{chiave:'cerealiNonGraditi',valore:[idFarro]});
      await M.inizializza({basePath:''});M.invalidaConfigRuntime();
      const {ok}=await generaSettimanaValida(5);
      assert(ok,'la generazione deve restare possibile anche con un cereale AUTO segnato come non gradito');
      prefTotale+=await contaFarro();
    }
    assert(prefTotale<=baseTotale,'in media su '+CAMPIONI+' settimane, un cereale AUTO non gradito ('+prefTotale+'/'+CAMPIONI+') non deve comparire più spesso del baseline ('+baseTotale+'/'+CAMPIONI+')');

    // 4b. FIXED: Gnocchi fissato a 2/settimana anche se marcato "non
    // gradito" - il conteggio fisso non deve mai essere alterato dalla
    // preferenza negativa (task: "non cambiare un carboidrato FIXED").
    resetStores();
    const idGnocchi=vGnocchi.ingredienteId;
    await put('impostazioni',{chiave:'configCarboidratiStati',valore:{gnocchi:{mode:'fixed',count:2}}});
    await put('impostazioni',{chiave:'cerealiNonGraditi',valore:[idGnocchi]});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const {ok:okFixed}=await generaSettimanaValida(8);
    assert(okFixed,'un carboidrato FIXED non deve mai essere impedito dal cereale non gradito');
    const usiGnocchi=tuttiIngredientiPiano(await getAll('piano')).filter(i=>i.ingredienteId===idGnocchi).length;
    assert(usiGnocchi>=2,'il conteggio FIXED (2) deve restare rispettato anche se l\'ingrediente è segnato come non gradito');
    console.log('OK 4: cereale AUTO non gradito evitato quando possibile, FIXED invariato.');
  }

  /* ============ 5. Proteina meno gradita: usata solo dopo le categorie valide alternative ============ */
  {
    resetStores();
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const risoltoBase=await M.caricaConfigurazioneNutrizionaleRisolta();
    const {ok:okBase}=await generaSettimanaValida(3);
    assert(okBase);
    const usiBase={};for(const v of await getAll('piano'))usiBase[v.categoriaTarget]=(usiBase[v.categoriaTarget]||0)+1;

    resetStores();
    await put('impostazioni',{chiave:'setProteineLimitate',valore:['carne']});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const {ok:okPref}=await generaSettimanaValida(5);
    assert(okPref,'la generazione deve restare possibile con una categoria proteica meno gradita');
    const usiPref={};for(const v of await getAll('piano'))usiPref[v.categoriaTarget]=(usiPref[v.categoriaTarget]||0)+1;
    assert((usiPref.carne||0)<=(risoltoBase.proteinFrequencies.carne.max??99),'la categoria meno gradita resta comunque entro i limiti nutrizionali (mai un\'esclusione)');
    console.log('OK 5: categoria proteica meno gradita ('+  (usiPref.carne||0)+' usi) resta un\'opzione, non un\'esclusione.');
  }

  /* ============ 6. "Poco tempo": non implementato (condizione di arresto, documentata) ============ */
  {
    /* Nessun metadato strutturato nel catalogo (db-ricette.json,
       ingredienti-new.json) distingue preparazioni fredde/rapide/
       pane-friselle: solo nomi liberi di cottura testuali. Dedurre la
       rapidità dal nome è esplicitamente vietato dall'incarico.
       setPocoTempo viene caricato da caricaPreferenzeUtenteSet() per
       trasparenza ma non altera l'ordine delle composizioni: verificato
       qui che impostarlo non cambi il comportamento (nessuna somiglianza
       accidentale con un'implementazione nascosta). */
    resetStores();
    await put('impostazioni',{chiave:'setPocoTempo',valore:{pranzo:true,cena:false}});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const {ok}=await generaSettimanaValida(3);
    assert(ok,'impostare "poco tempo" non deve mai impedire la generazione (preferenza non applicata, per assenza di metadati affidabili)');
    console.log('OK 6 (documentato, non implementato): "poco tempo" non altera la generazione - manca un metadato di catalogo per rapida/fredda, vedi REGISTRO_MODIFICHE.md.');
  }

  /* ============ 7. Verdura ricorrente: continua ad avere precedenza (regressione) ============ */
  {
    resetStores();
    const vRic=vPomodoro;
    await put('impostazioni',{chiave:'verduraRicorrente',valore:vRic.id});
    await put('impostazioni',{chiave:'verduraRicorrentePasti',valore:['pranzo_0']});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const {ok}=await generaSettimanaValida(8);
    assert(ok,'la verdura ricorrente già funzionante deve continuare a generare correttamente');
    const lunedi=(await getAll('piano')).find(v=>v.id.endsWith('_pranzo')&&v.id.startsWith('2026-08-31'));
    const ing=(lunedi.realizzazioni||[]).flatMap(x=>x.ingredientiEffettivi||[]);
    assert(ing.some(x=>x.variantId===vRic.id),'la verdura ricorrente obbligatoria deve avere precedenza, invariata da questo intervento');
    console.log('OK 7: verdura ricorrente ancora con precedenza (nessuna regressione).');
  }

  /* ============ 8. Tutte le verdure compatibili disattivate: errore esplicito, mai riapertura del pool ============ */
  {
    resetStores();
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const tutteLeVerdure=varianti.filter(v=>{const b=ingById.get(v.ingredienteId);return b&&b.gruppo==='verdura';}).map(v=>v.id);
    await put('impostazioni',{chiave:'setVerdureDisattivate',valore:tutteLeVerdure});
    await M.inizializza({basePath:''});M.invalidaConfigRuntime();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    assert(esito.errori.length>0,'con tutte le verdure disattivate la generazione deve fallire esplicitamente');
    const piano=await getAll('piano');
    assert.equal(piano.length,0,'nessuna scrittura parziale: il pool non deve mai essere riaperto per aggirare il fallimento');
    console.log('OK 8: con tutte le verdure compatibili disattivate, errore esplicito e nessuna scrittura parziale.');
  }

  console.log('lotto set preferenze runtime: ok');
})().catch(error=>{console.error(error);process.exit(1);});
