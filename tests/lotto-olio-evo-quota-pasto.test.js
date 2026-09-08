'use strict';
/* Test mirato: decisione esplicita di Cwe sull'olio EVO -
   «10 g complessivi al giorno, ripartiti in 5 g a pranzo e 5 g a cena» -
   una sola fonte quantitativa per pasto, mai moltiplicata per il numero
   di ricette che lo compongono.

   Verifica il PUNTO COMUNE reale (motor-v12.js:normalizzaRealizzazioniOlio,
   richiamato dagli stessi due punti di normalizzaRealizzazioniVerdura:
   costruisciPastoSequenziale - generazione sequenziale e rigeneraPasto -
   e ruotaPasto/Roll), non una sua reimplementazione.

   Perché normalizzaRealizzazioniOlio è esportata (unica eccezione in
   questo intervento a "non esportare funzioni interne per facilitare i
   test"): nell'intero catalogo reale (db-ricette.json) un solo template
   (id 34, legumi) contiene "Olio extravergine oliva" - verificato con
   ricerca esaustiva. Non essendo autorizzata la modifica del catalogo
   ricette, non esiste alcun modo di produrre con la generazione reale
   uno scenario con PIÙ realizzazioni di olio nello stesso pasto (il
   caso esplicitamente richiesto dal test): l'unico punto di verifica
   possibile per questo scenario è la funzione stessa, con dati costruiti
   dalla stessa pipeline reale (generaCombinazioni + compilaRicetta +
   snapshotRealizzazione, tutte già esportate in interventi precedenti),
   mai valori inventati a mano. */
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

  const resolved=N.resolveNutritionConfig({});
  assert.equal(resolved.oilGramsPerDay,10,'default risolto: 10 g/die');
  assert.equal(resolved.oilGramsPerMainMeal,5,'quota per pasto principale derivata: 5 g, mai una seconda impostazione indipendente');

  /* ============ 1. Pranzo, una sola realizzazione con olio (ricetta reale, template 34) ============ */
  {
    const ricetteConOlio=M.getRicette().filter(r=>r.recipeModelId===34&&r.ingredienti.some(i=>i.nome==='Olio extravergine oliva'));
    assert(ricetteConOlio.length>0,'il catalogo reale deve avere almeno una ricetta compilata con olio (template 34)');
    const singola=[M.snapshotRealizzazione({ricettaId:ricetteConOlio[0].id},ricetteConOlio[0])];
    const normalizzate=M.normalizzaRealizzazioniOlio(singola,resolved.oilGramsPerMainMeal);
    const totale=normalizzate.reduce((tot,real)=>tot+(real.ingredientiEffettivi||[]).filter(i=>i.nome==='Olio extravergine oliva').reduce((s,i)=>s+(Number(i.quantita)||0),0),0);
    assert.equal(totale,5,'pranzo con una sola realizzazione contenente olio: totale 5 g, mai i 10 g di catalogo');
  }

  /* ============ 2. Pranzo composto da più realizzazioni contenenti olio: totale sempre 5 g, mai 5 g per ricetta ============ */
  {
    const ricetteConOlio=M.getRicette().filter(r=>r.recipeModelId===34&&r.ingredienti.some(i=>i.nome==='Olio extravergine oliva'));
    const multiple=[
      M.snapshotRealizzazione({ricettaId:ricetteConOlio[0].id},ricetteConOlio[0]),
      M.snapshotRealizzazione({ricettaId:ricetteConOlio[1].id},ricetteConOlio[1])
    ];
    const normalizzate=M.normalizzaRealizzazioniOlio(multiple,resolved.oilGramsPerMainMeal);
    const perRealizzazione=normalizzate.map(real=>(real.ingredientiEffettivi||[]).filter(i=>i.nome==='Olio extravergine oliva').reduce((s,i)=>s+(Number(i.quantita)||0),0));
    const totale=perRealizzazione.reduce((a,b)=>a+b,0);
    assert.equal(totale,5,'due realizzazioni con olio nello stesso pasto: totale complessivo 5 g, non 10 g (5 g per ricetta)');
    assert(perRealizzazione.every(q=>q<5),'nessuna singola occorrenza deve conservare l\'intera quota quando ce ne sono altre nello stesso pasto');
    // distribuzione deterministica: stesso input, stesso risultato
    const multiple2=[
      M.snapshotRealizzazione({ricettaId:ricetteConOlio[0].id},ricetteConOlio[0]),
      M.snapshotRealizzazione({ricettaId:ricetteConOlio[1].id},ricetteConOlio[1])
    ];
    const normalizzate2=M.normalizzaRealizzazioniOlio(multiple2,resolved.oilGramsPerMainMeal);
    const perRealizzazione2=normalizzate2.map(real=>(real.ingredientiEffettivi||[]).filter(i=>i.nome==='Olio extravergine oliva').reduce((s,i)=>s+(Number(i.quantita)||0),0));
    assert.deepEqual(perRealizzazione,perRealizzazione2,'la distribuzione deve essere deterministica, mai casuale, a parità di input');
  }

  /* ============ 3. Cena equivalente: stessa quota (5 g), stessa funzione, nessuna seconda regola ============ */
  {
    const ricetteConOlio=M.getRicette().filter(r=>r.recipeModelId===34&&r.ingredienti.some(i=>i.nome==='Olio extravergine oliva'));
    const cena=[M.snapshotRealizzazione({ricettaId:ricetteConOlio[2].id},ricetteConOlio[2])];
    const normalizzate=M.normalizzaRealizzazioniOlio(cena,resolved.oilGramsPerMainMeal);
    const totale=normalizzate.reduce((tot,real)=>tot+(real.ingredientiEffettivi||[]).filter(i=>i.nome==='Olio extravergine oliva').reduce((s,i)=>s+(Number(i.quantita)||0),0),0);
    assert.equal(totale,5,'cena: stessa quota di 5 g del pranzo, oilGramsPerMainMeal è simmetrico (10/2), non una seconda impostazione per pasto');
  }

  /* ============ 4. nutrientiEffettivi coerenti con la quantità di olio normalizzata (5 g, non 10 g) ============ */
  {
    const ricetteConOlio=M.getRicette().filter(r=>r.recipeModelId===34&&r.ingredienti.some(i=>i.nome==='Olio extravergine oliva'));
    const base=ricetteConOlio[0];
    const real=[M.snapshotRealizzazione({ricettaId:base.id},base)];
    const grassiPrimaOlio=real[0].ingredientiEffettivi.find(i=>i.nome==='Olio extravergine oliva').grammi; // 10, prima della normalizzazione
    const grassiPrimaTotali=real[0].nutrientiEffettivi.grassi;
    const normalizzate=M.normalizzaRealizzazioniOlio(real,resolved.oilGramsPerMainMeal);
    const grassiDopoTotali=normalizzate[0].nutrientiEffettivi.grassi;
    assert.equal(grassiDopoTotali,grassiPrimaTotali-5,'i grassi in nutrientiEffettivi devono riflettere il dimezzamento dell\'olio (10g->5g, 100% grassi -> -5g), stesso snapshot letto da nutrienti/inventario/spesa/storico');
    assert(grassiPrimaOlio===10,'pre-condizione: la porzione di catalogo (10 g) resta un metadato del catalogo, non modificata');
  }

  /* ============ 5. Colazione: nessuna quota automatica (strutturalmente non idonea) ============ */
  {
    const varianti=await getAll('varianti');
    const olio=varianti.find(v=>v.nome==='Olio extravergine oliva');
    assert(olio,'la variante Olio extravergine oliva deve esistere');
    assert.equal(olio.colazioneGruppo,null,'l\'olio non è idoneo alla colazione nel catalogo (nessuna sottoCategoriaColazione/ancheColazione): nessuna quota automatica può mai raggiungerlo lì');
    assert.equal(olio.porzioneColazione,null,'nessuna porzione di colazione calcolata per l\'olio');
  }

  /* ============ 6. Nessun aggiunta automatica: una realizzazione senza olio resta senza olio ============ */
  {
    const senzaOlio=M.getRicette().find(r=>!r.ingredienti.some(i=>i.nome==='Olio extravergine oliva'));
    assert(senzaOlio,'deve esistere almeno una ricetta compilata senza olio');
    const real=[M.snapshotRealizzazione({ricettaId:senzaOlio.id},senzaOlio)];
    const normalizzate=M.normalizzaRealizzazioniOlio(real,resolved.oilGramsPerMainMeal);
    assert(!normalizzate[0].ingredientiEffettivi.some(i=>i.nome==='Olio extravergine oliva'),'una ricetta che non prevede olio non deve mai riceverlo automaticamente');
  }

  console.log('lotto olio EVO quota pasto: ok');
})().catch(error=>{console.error(error);process.exit(1);});
