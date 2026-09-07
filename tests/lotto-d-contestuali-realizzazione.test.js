'use strict';
/* Test mirato: le quantita' contestuali definite dal nutrizionista
   (resolveNutritionConfig().ingredientConstraints[id].contexts) devono
   arrivare fino alla realizzazione effettiva del pasto, sia per il pasto
   principale sia per la colazione, con il valore contestuale che prevale
   sempre sul generico. Chiude il flusso per Uova e Ricotta (ingredienti a
   doppio contesto, un solo ingrediente, mai duplicato).

   Flusso reale ricostruito (vedi anche docs/REGISTRO_MODIFICHE.md):

   1. PASTO PRINCIPALE (pranzo/cena): le ricette vengono compilate UNA
      VOLTA in fase di inizializzazione (motor-v12.js:inizializza ->
      compilaRicetta -> preparaIngredientiDettagliati -> quantitaConfigurata),
      cache persistita in IndexedDB (store "ricette", invalidata solo da un
      cambio versione catalogo o dal pulsante "Applica e ricostruisci").
      Le ricette compilate qui non vengono MAI usate per la colazione.
      quantitaConfigurata legge esclusivamente resolveNutritionConfig()
      (via configRuntime, cache di sessione):
      ingredientConstraints[id].contexts.pastoPrincipale.quantity con
      priorita' sul valore generico. Lo snapshot (snapshotRealizzazione)
      copia direttamente ricetta.ingredienti, quindi conserva quantita'/
      unita' cosi' come compilate.

   2. COLAZIONE: percorso separato. Il selettore colazione (index.html,
      non toccato) legge variante.colazioneGruppo/porzioneColazione,
      scritti esclusivamente da motor-v12.js:sincronizzaIngredientiIndexedDB.
      Idoneita' decisa da un'unica struttura canonica letta in un solo
      punto (metaColazioneCanonica): "ancheColazione" per gli ingredienti
      a doppio contesto (Uova, Ricotta - un solo ingrediente, mai
      duplicato), altrimenti il campo di primo livello
      "sottoCategoriaColazione" per gli ingredienti a colazione esclusiva.
      La QUANTITA' colazione usa la stessa fonte di verita' del pasto
      principale (contexts.colazione.quantity, con priorita' sul
      fallback di catalogo), convertita nell'equivalente in grammi con
      la stessa funzione gia' usata per il pasto principale
      (grammiDaQuantita - mai una seconda conversione pz/g duplicata).
      In index.html sono state rimosse due scritture legacy che
      duplicavano/contraddicevano questo meccanismo: il blocco
      TAG_COLAZIONE (porzioni hardcoded, incluso "uova: 120g" incompatibile
      con "1 pz") e la patch che escludeva esplicitamente la ricotta dalla
      colazione (contraddiceva la regola PDF gia' presente nel resolver).
      Entrambe erano comunque dentro seedIfEmpty(), funzione senza alcun
      chiamante nell'app (verificato con ricerca globale) - la rimozione
      elimina un percorso morto potenzialmente riattivabile, non cambia
      comportamento runtime osservabile prima/dopo.

   Non genera settimane complete. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
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

/* Stessa formula usata da index.html:formattaQuantita per mostrare un
   ingrediente a pezzi (grammi-equivalenti -> conteggio pezzi): replicata
   qui solo per leggere il dato in modo verificabile, mai per deciderlo -
   la decisione resta unicamente in motor-v12.js. */
function pezziDaGrammi(variante){
  return Math.round((variante.porzioneColazione||0)/(variante.pesoPezzo||1));
}

(async()=>{
  resetStores();
  /* Vincoli nutrizionista: quantita' generica DELIBERATAMENTE diversa da
     quella contestuale, per dimostrare che il contesto prevale sempre sul
     generico (mai il contrario). Uova e Ricotta in unita' NATIVA
     (pezzi/grammi), esattamente come le inserirebbe il nutrizionista. */
  await put('impostazioni',{chiave:'vincoliIngredientiNutrizionista',valore:{
    nri_uova:{stato:'limitato',quantita:1,contesti:{
      colazione:{quantita:1},
      pastoPrincipale:{quantita:2}
    }},
    nri_ricotta:{stato:'limitato',quantita:1,contesti:{
      colazione:{quantita:50},
      pastoPrincipale:{quantita:100}
    }}
  }});

  await M.inizializza({basePath:''});

  /* ============ 1. Variante Uova: colazioneGruppo = proteine ============ */
  {
    const varianti=await getAll('varianti');
    const uova=varianti.find(v=>v.nome==='Uova');
    assert(uova,'la variante Uova deve esistere');
    assert.equal(uova.colazioneGruppo,'proteine','Uova deve essere idonea alla colazione, gruppo proteine (da ancheColazione, struttura canonica)');
  }

  /* ============ 2. Uova a colazione: quantità 1, unità "pz" ============ */
  {
    const varianti=await getAll('varianti');
    const uova=varianti.find(v=>v.nome==='Uova');
    assert.equal(uova.unitaPezzo,true,'Uova deve restare a pezzi anche in colazione (stessa unità nativa del pasto principale)');
    assert.equal(pezziDaGrammi(uova),1,'Uova a colazione deve mostrare 1 pz (quantità contestuale), mai convertita in grammi visibili');
  }

  /* ============ 3. Uova nel pasto principale: quantità 2, unità "pz" ============ */
  {
    const ricette=M.getRicette().filter(r=>r.recipeModelId===11); // template "PU" puro: solo Uova, sole cotture diverse
    assert(ricette.length>0,'devono esistere ricette compilate dal template 11 (Uova)');
    let trovato=0;
    for(const r of ricette){
      const ing=r.ingredienti.find(i=>i.nome==='Uova');
      if(!ing)continue;
      trovato++;
      assert.equal(ing.quantita,2,'Uova nel pasto principale deve usare la quantità contestuale (2)');
      assert.equal(ing.unita,'pz','Uova nel pasto principale deve restare in pezzi');
    }
    assert(trovato>0,'almeno una ricetta compilata deve contenere Uova');
  }

  /* ============ 4. Variante Ricotta: colazioneGruppo = proteine ============ */
  {
    const varianti=await getAll('varianti');
    const ricotta=varianti.find(v=>v.nome==='Ricotta');
    assert(ricotta,'la variante Ricotta deve esistere');
    assert.equal(ricotta.colazioneGruppo,'proteine','Ricotta deve essere idonea alla colazione, gruppo proteine (da ancheColazione, struttura canonica)');
  }

  /* ============ 5. Ricotta a colazione: quantità 50, unità "g" ============ */
  {
    const varianti=await getAll('varianti');
    const ricotta=varianti.find(v=>v.nome==='Ricotta');
    assert.equal(ricotta.unitaPezzo,false,'Ricotta resta in grammi anche a colazione');
    assert.equal(ricotta.porzioneColazione,50,'Ricotta a colazione deve mostrare 50 g (quantità contestuale)');
  }

  /* ============ 6. Ricotta nel pasto principale: quantità 100, unità "g" ============ */
  {
    const ricette=M.getRicette().filter(r=>r.recipeModelId===14);
    let trovato=0;
    for(const r of ricette){
      const ing=r.ingredienti.find(i=>i.nome==='Ricotta');
      if(!ing)continue;
      trovato++;
      assert.equal(ing.quantita,100,'Ricotta nel pasto principale deve usare la quantità contestuale (100)');
      assert.equal(ing.unita,'g','Ricotta nel pasto principale deve restare in grammi');
    }
    assert(trovato>0,'almeno una ricetta compilata deve contenere Ricotta');
  }

  /* ============ 7. snapshotRealizzazione(): Uova nel pasto principale conserva 2 pz ============ */
  {
    const ricetta=M.getRicette().find(r=>r.recipeModelId===11&&r.ingredienti.some(i=>i.nome==='Uova'));
    assert(ricetta,'deve esistere una ricetta compilata con Uova');
    const snap=M.snapshotRealizzazione({ricettaId:ricetta.id,recipeModelId:ricetta.recipeModelId},ricetta);
    const ing=snap.ingredientiEffettivi.find(i=>i.nome==='Uova');
    assert(ing,'lo snapshot deve contenere Uova negli ingredienti effettivi');
    assert.equal(ing.quantita,2,'lo snapshot della realizzazione deve conservare 2 (pz) per Uova');
    assert.equal(ing.unita,'pz','lo snapshot della realizzazione deve conservare l\'unità pz per Uova');
  }

  /* ============ 8. snapshotRealizzazione(): Ricotta nel pasto principale conserva 100 g ============ */
  {
    const ricetta=M.getRicette().find(r=>r.recipeModelId===14&&r.ingredienti.some(i=>i.nome==='Ricotta'));
    assert(ricetta,'deve esistere una ricetta compilata con Ricotta');
    const snap=M.snapshotRealizzazione({ricettaId:ricetta.id,recipeModelId:ricetta.recipeModelId},ricetta);
    const ing=snap.ingredientiEffettivi.find(i=>i.nome==='Ricotta');
    assert(ing,'lo snapshot deve contenere Ricotta negli ingredienti effettivi');
    assert.equal(ing.quantita,100,'lo snapshot della realizzazione deve conservare 100 (g) per Ricotta');
    assert.equal(ing.unita,'g','lo snapshot della realizzazione deve conservare l\'unità g per Ricotta');
  }

  /* ============ 9. Seconda sincronizzazione: valori identici, nessun duplicato ============ */
  {
    const primaUova=(await getAll('varianti')).filter(v=>v.nome==='Uova');
    const primaRicotta=(await getAll('varianti')).filter(v=>v.nome==='Ricotta');
    assert.equal(primaUova.length,1,'una sola variante Uova prima della seconda sincronizzazione');
    assert.equal(primaRicotta.length,1,'una sola variante Ricotta prima della seconda sincronizzazione');

    await M.inizializza({basePath:''}); // seconda inizializzazione/sincronizzazione, stessi dati

    const dopoUova=(await getAll('varianti')).filter(v=>v.nome==='Uova');
    const dopoRicotta=(await getAll('varianti')).filter(v=>v.nome==='Ricotta');
    assert.equal(dopoUova.length,1,'nessun duplicato per Uova dopo la seconda sincronizzazione');
    assert.equal(dopoRicotta.length,1,'nessun duplicato per Ricotta dopo la seconda sincronizzazione');
    assert.deepEqual(dopoUova[0],primaUova[0],'la seconda sincronizzazione non deve cambiare i valori di Uova');
    assert.deepEqual(dopoRicotta[0],primaRicotta[0],'la seconda sincronizzazione non deve cambiare i valori di Ricotta');
  }

  /* ============ 10. Fallback: senza vincolo contestuale, resta il valore/default di catalogo ============ */
  {
    resetStores();
    await M.inizializza({basePath:''}); // nessun vincoliIngredientiNutrizionista: tutto il catalogo di default
    const varianti=await getAll('varianti');
    const uova=varianti.find(v=>v.nome==='Uova'),ricotta=varianti.find(v=>v.nome==='Ricotta');
    assert.equal(pezziDaGrammi(uova),1,'senza vincolo nutrizionista, il fallback di colazione per Uova resta il default di catalogo (ancheColazione.porzioneMin=1)');
    assert.equal(ricotta.porzioneColazione,50,'senza vincolo nutrizionista, il fallback di colazione per Ricotta resta il default di catalogo (ancheColazione.porzioneMin=50)');
    const ricette=M.getRicette().filter(r=>r.recipeModelId===11);
    let trovato=0;
    for(const r of ricette){
      const ing=r.ingredienti.find(i=>i.nome==='Uova');
      if(!ing)continue;
      trovato++;
      assert.equal(ing.quantita,2,'senza vincolo nutrizionista, il pasto principale resta il default di catalogo (2, invariato)');
    }
    assert(trovato>0);
  }

  console.log('lotto D contestuali realizzazione: ok');
})().catch(error=>{console.error(error);process.exit(1);});
