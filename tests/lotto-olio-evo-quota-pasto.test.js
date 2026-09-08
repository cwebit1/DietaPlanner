'use strict';
/* Test mirato: decisione esplicita di Cwe sull'olio EVO -
   «10 g complessivi al giorno, ripartiti in 5 g a pranzo e 5 g a cena» -
   una sola fonte quantitativa per pasto, mai moltiplicata per il numero
   di ricette che lo compongono.

   Verifica ESCLUSIVAMENTE tramite API pubbliche reali e deterministiche
   di DietaPlannerMotorV12 (rigeneraPasto): mai una chiamata diretta alla
   funzione interna motor-v12.js:normalizzaRealizzazioniOlio, che resta
   non esportata (corretto in questo intervento: era stata esposta solo
   per comodità del test, la stessa deviazione già corretta per
   configRuntime/ricettaAmmessa - vedi docs/REGISTRO_MODIFICHE.md).
   normalizzaRealizzazioniOlio è applicata dai suoi due chiamanti reali
   invariati (chiusura del pasto in costruisciPastoSequenziale, Roll in
   ruotaPasto): qui si esercita il primo tramite rigeneraPasto (la stessa
   funzione pubblica che la pagina Pasto usa per "Rigenera").

   Copertura end-to-end rimasta: pranzo/cena con una sola realizzazione
   reale contenente olio (template 34, l'unico nel catalogo con "Olio
   extravergine oliva" - verificato con ricerca esaustiva), invariante
   "quando l'olio compare il totale è sempre 5 g" osservata su più
   target reali, idoneità colazione.

   Caso rimosso (non riproducibile end-to-end col catalogo attuale, mai
   sostituito con dati finti): un pasto con PIÙ realizzazioni contenenti
   olio contemporaneamente. Nell'intero catalogo reale un solo template
   ha olio: il motore sequenziale non può quindi mai comporre un pasto
   con due o più ricette che lo contengano entrambe, indipendentemente
   da quanti tentativi. Questo caso resta garantito solo
   dall'implementazione matematica di normalizzaRealizzazioniOlio
   (ridistribuzione proporzionale con somma finale esatta, vedi il
   commento della funzione in motor-v12.js) e dalla revisione del
   codice, non da una prova end-to-end. */
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

function oliCompleti(voce){
  const occorrenze=[];
  for(const real of (voce&&voce.realizzazioni)||[]){
    for(const ing of real.ingredientiEffettivi||[]){
      if(ing.nome==='Olio extravergine oliva')occorrenze.push({real,ing});
    }
  }
  return occorrenze;
}

/* Richiama la sola API pubblica rigeneraPasto finché non produce (per
   caso, con dati reali) un pasto la cui realizzazione contiene olio, o
   esaurisce i tentativi. Nessuna chiamata a funzioni interne. */
async function trovaPastoConOlio(giorno,pasto,target,tentativiMax){
  for(let i=0;i<tentativiMax;i++){
    const voce=await M.rigeneraPasto(giorno,pasto,target,{soloAnteprima:true});
    if(voce&&oliCompleti(voce).length)return voce;
  }
  return null;
}

(async()=>{
  await M.inizializza({basePath:''});

  const resolved=N.resolveNutritionConfig({});
  assert.equal(resolved.oilGramsPerDay,10,'default risolto: 10 g/die');
  assert.equal(resolved.oilGramsPerMainMeal,5,'quota per pasto principale derivata: 5 g, mai una seconda impostazione indipendente');

  /* ============ 1. Pranzo con una realizzazione reale contenente olio: totale 5 g ============ */
  {
    const voce=await trovaPastoConOlio('2026-08-31','pranzo','legumi',60);
    assert(voce,'rigeneraPasto deve poter produrre, entro 60 tentativi, un pranzo reale con olio (template 34, unico nel catalogo)');
    const occorrenze=oliCompleti(voce);
    const totale=occorrenze.reduce((s,o)=>s+(Number(o.ing.quantita)||0),0);
    assert.equal(totale,5,'pranzo con olio: totale 5 g, mai i 10 g di catalogo');
    assert.equal(occorrenze[0].ing.grammi,5,'grammi (equivalente interno) coerente con quantita');
  }

  /* ============ 2. Cena equivalente: stessa quota (5 g) ============ */
  {
    const voce=await trovaPastoConOlio('2026-09-01','cena','legumi',60);
    assert(voce,'rigeneraPasto deve poter produrre, entro 60 tentativi, una cena reale con olio');
    const totale=oliCompleti(voce).reduce((s,o)=>s+(Number(o.ing.quantita)||0),0);
    assert.equal(totale,5,'cena: stessa quota di 5 g del pranzo, oilGramsPerMainMeal è simmetrico (10/2), non una seconda impostazione per pasto');
  }

  /* ============ 3. nutrientiEffettivi propagati (stesso snapshot letto da nutrienti/inventario/spesa/storico) ============ */
  {
    const voce=await trovaPastoConOlio('2026-09-02','pranzo','legumi',60);
    assert(voce,'serve un pasto reale con olio per verificare la propagazione');
    const {real}=oliCompleti(voce)[0];
    assert(real.nutrientiEffettivi&&typeof real.nutrientiEffettivi.grassi==='number','nutrientiEffettivi deve essere ricalcolato e presente sulla realizzazione con olio');
  }

  /* ============ 4. Invariante generale: ogni volta che l'olio compare, il totale è sempre 5 g, mai altro (nessuna duplicazione, nessuna aggiunta parziale) ============ */
  {
    let osservazioni=0;
    for(const target of ['legumi','carne','pesce','formaggi','uova']){
      for(let i=0;i<15;i++){
        const voce=await M.rigeneraPasto('2026-09-03','pranzo',target,{soloAnteprima:true});
        const occorrenze=voce&&oliCompleti(voce);
        if(occorrenze&&occorrenze.length){
          osservazioni++;
          const totale=occorrenze.reduce((s,o)=>s+(Number(o.ing.quantita)||0),0);
          assert.equal(totale,5,'ogni volta che l\'olio compare in un pasto reale, il totale deve essere sempre 5 g (target: '+target+')');
        }
      }
    }
    assert(osservazioni>0,'il test deve aver osservato almeno un pasto reale con olio per validare l\'invariante');
  }

  /* ============ 5. Colazione: nessuna quota automatica (strutturalmente non idonea) ============ */
  {
    const varianti=await getAll('varianti');
    const olio=varianti.find(v=>v.nome==='Olio extravergine oliva');
    assert(olio,'la variante Olio extravergine oliva deve esistere');
    assert.equal(olio.colazioneGruppo,null,'l\'olio non è idoneo alla colazione nel catalogo (nessuna sottoCategoriaColazione/ancheColazione): nessuna quota automatica può mai raggiungerlo lì');
    assert.equal(olio.porzioneColazione,null,'nessuna porzione di colazione calcolata per l\'olio');
  }

  console.log('lotto olio EVO quota pasto: ok');
})().catch(error=>{console.error(error);process.exit(1);});
