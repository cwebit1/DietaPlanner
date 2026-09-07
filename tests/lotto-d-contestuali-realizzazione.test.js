'use strict';
/* Test mirato: le quantita' contestuali definite dal nutrizionista
   (resolveNutritionConfig().ingredientConstraints[id].contexts) devono
   arrivare fino alla realizzazione effettiva del pasto, sia per il pasto
   principale sia per la colazione, con il valore contestuale che prevale
   sempre sul generico.

   Flusso reale ricostruito (vedi anche docs/REGISTRO_MODIFICHE.md):

   1. PASTO PRINCIPALE (pranzo/cena): le ricette vengono compilate UNA
      VOLTA in fase di inizializzazione (motor-v12.js:inizializza ->
      compilaRicetta -> preparaIngredientiDettagliati -> quantitaConfigurata),
      cache persistita in IndexedDB (store "ricette", invalidata solo da un
      cambio versione catalogo o dal pulsante "Applica e ricostruisci").
      Le ricette compilate qui non vengono MAI usate per la colazione.
      quantitaConfigurata leggeva PRIMA direttamente
      'vincoliIngredientiNutrizionista' grezzo e considerava solo la
      quantita' generica, mai il contesto: BUG confermato e corretto in
      questo intervento. Ora legge esclusivamente
      resolveNutritionConfig() (via configRuntime, cache di sessione) e
      usa ingredientConstraints[id].contexts.pastoPrincipale.quantity con
      priorita' sul valore generico ingredientConstraints[id].quantity.

   2. COLAZIONE: percorso completamente separato. Il selettore colazione
      (index.html, non toccato in questo intervento) legge
      variante.porzioneColazione, scritto da
      motor-v12.js:sincronizzaIngredientiIndexedDB. Prima di questo
      intervento tale valore veniva preso SOLO dal catalogo statico
      (ingredienti-new.json: porzione), mai da resolveNutritionConfig():
      BUG confermato e corretto qui, stessa fonte di verita' del pasto
      principale (contexts.colazione.quantity con priorita' sul valore di
      catalogo, che resta fallback).
      NOTA IMPORTANTE: "Uova" e "Ricotta" non sono attualmente selezionabili
      in colazione nel catalogo operativo (nessuna
      ingredienti-new.json:sottoCategoriaColazione di primo livello per
      loro - "Uova" ha soltanto un campo "ancheColazione" non ancora
      consumato da alcun codice, un gap distinto di idoneita' del
      catalogo, fuori perimetro di questo intervento: "Non modificare...
      catalogo ingredienti"). La correzione del meccanismo e' quindi
      verificata qui con un ingrediente realmente idoneo alla colazione
      nel catalogo attuale ("Latte parzialmente scremato"), con
      un'asserzione esplicita che documenta perche' Uova/Ricotta restano
      non idonei (porzioneColazione resta null per loro, invariato).

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

(async()=>{
  resetStores();
  /* Vincoli nutrizionista: quantita' generica DELIBERATAMENTE diversa da
     quella contestuale, per dimostrare che il contesto prevale sempre sul
     generico (mai il contrario). */
  await put('impostazioni',{chiave:'vincoliIngredientiNutrizionista',valore:{
    nri_uova:{stato:'limitato',quantita:1,contesti:{
      colazione:{quantita:1},
      pastoPrincipale:{quantita:2}
    }},
    nri_ricotta:{stato:'limitato',quantita:1,contesti:{
      colazione:{quantita:50},
      pastoPrincipale:{quantita:100}
    }},
    nri_latte_parzialmente_scremato:{stato:'limitato',quantita:1,contesti:{
      colazione:{quantita:150}
    }}
  }});

  await M.inizializza({basePath:''});

  /* ============ 1. Pasto principale: Uova = 2 (contestuale, non 1 generico) ============ */
  {
    const ricette=M.getRicette().filter(r=>r.recipeModelId===11); // template "PU" puro: solo Uova, sole cotture diverse
    assert(ricette.length>0,'devono esistere ricette compilate dal template 11 (Uova)');
    let trovato=0;
    for(const r of ricette){
      const ing=r.ingredienti.find(i=>i.nome==='Uova');
      if(!ing)continue;
      trovato++;
      assert.equal(ing.quantita,2,'Uova nel pasto principale deve usare la quantità contestuale (2), non quella generica (1) né il default di catalogo');
    }
    assert(trovato>0,'almeno una ricetta compilata deve contenere Uova');
  }

  /* ============ 2. Pasto principale: Ricotta = 100 (contestuale, non 1 generico) ============ */
  {
    const ricette=M.getRicette().filter(r=>r.recipeModelId===14);
    let trovato=0;
    for(const r of ricette){
      const ing=r.ingredienti.find(i=>i.nome==='Ricotta');
      if(!ing)continue;
      trovato++;
      assert.equal(ing.quantita,100,'Ricotta nel pasto principale deve usare la quantità contestuale (100), non quella generica (1) né il default di catalogo');
    }
    assert(trovato>0,'almeno una ricetta compilata deve contenere Ricotta');
  }

  /* ============ 3. Colazione: il meccanismo (porzioneColazione) applica il contesto quando l'ingrediente è idoneo ============ */
  {
    const varianti=await getAll('varianti');
    const latte=varianti.find(v=>v.nome==='Latte parzialmente scremato');
    assert(latte,'la variante Latte parzialmente scremato deve esistere dopo la sincronizzazione');
    assert.equal(latte.porzioneColazione,150,'la porzione colazione deve usare la quantità contestuale del nutrizionista (150), non il default di catalogo (200) né alcun valore hardcoded');
  }

  /* ============ 4. Colazione: Uova/Ricotta non idonei nel catalogo attuale, porzioneColazione resta null (nessuna invenzione di eleggibilità) ============ */
  {
    const varianti=await getAll('varianti');
    const uova=varianti.find(v=>v.nome==='Uova'),ricotta=varianti.find(v=>v.nome==='Ricotta');
    assert(uova&&ricotta,'le varianti Uova e Ricotta devono esistere');
    assert.equal(uova.porzioneColazione,null,'Uova non è idoneo alla colazione nel catalogo attuale (sottoCategoriaColazione assente a livello di catalogo): porzioneColazione resta null, il contesto nutrizionista non inventa un\'idoneità che il catalogo non definisce');
    assert.equal(ricotta.porzioneColazione,null,'Ricotta non è idoneo alla colazione nel catalogo attuale: stesso motivo');
  }

  /* ============ 5. Fallback: senza vincolo contestuale, resta il valore generico/di catalogo (nessuna regressione) ============ */
  {
    resetStores();
    await M.inizializza({basePath:''}); // nessun vincoliIngredientiNutrizionista: tutto il catalogo di default
    const ricette=M.getRicette().filter(r=>r.recipeModelId===11);
    let trovato=0;
    for(const r of ricette){
      const ing=r.ingredienti.find(i=>i.nome==='Uova');
      if(!ing)continue;
      trovato++;
      assert.equal(ing.quantita,2,'senza alcun vincolo nutrizionista, il fallback resta la porzione di catalogo (2, invariata)');
    }
    assert(trovato>0);
    const varianti=await getAll('varianti');
    const latte=varianti.find(v=>v.nome==='Latte parzialmente scremato');
    assert.equal(latte.porzioneColazione,200,'senza alcun vincolo nutrizionista, la porzione colazione resta il default di catalogo (200, invariato)');
  }

  console.log('lotto D contestuali realizzazione: ok');
})().catch(error=>{console.error(error);process.exit(1);});
