'use strict';
/* Test mirato: regola definitiva di Cwe sulla scelta delle categorie
   proteiche - "pranzo = una categoria, cena = una categoria diversa",
   sempre, senza eccezioni. Elimina per intero la falsa semantica
   "maxProteinSourcesPerDay=1 -> stessa categoria pranzo/cena": nel
   vecchio motore "1" indicava solo che l'utente aveva già scelto una
   delle due categorie e il sistema doveva completare la seconda, mai
   "stessa categoria per entrambi i pasti".

   Regola della tabella utente per ogni giorno:
   - 0 categorie scelte -> il sistema ne sceglie automaticamente due,
     ammesse, differenti, compatibili con frequenze e profilo;
   - 1 categoria scelta -> resta vincolante, la seconda viene scelta
     automaticamente tra le ammesse e differenti;
   - 2 categorie scelte -> entrambe restano vincolanti.

   Verifica con la pipeline reale (engine-core.js:buildProteinGrid, la
   stessa funzione richiamata sia dal pulsante Casuale/Completa del Set
   sia, con la stessa identica logica, utilizzabile per la generazione
   del Menù quando l'utente lascia celle vuote - nessuna duplicazione
   della logica nel test) e casualità controllata (rng seedato,
   deterministico, mai migliaia di generazioni). */
const assert=require('node:assert/strict');
const E=require('../engine-core.js');
const N=require('../nutrition-config.js');

const GIORNI=['giorno_0','giorno_1','giorno_2','giorno_3','giorno_4','giorno_5','giorno_6'];

(function(){
  /* ============ 0/1/2 scelte, config predefinita (5 categorie ammesse) ============ */
  const userTable={
    giorno_0:[],                 // 0 scelte
    giorno_1:['carne'],          // 1 scelta
    giorno_2:['pesce','legumi']  // 2 scelte
  };
  const risolto=N.resolveNutritionConfig({});
  assert.equal(risolto.valid,true,'la configurazione predefinita deve restare valida');
  const r=E.buildProteinGrid(GIORNI,userTable,{proteinFrequencies:risolto.proteinFrequencies},{},E.seeded(42));
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

  console.log('OK: 0/1/2 scelte rispettate (pranzo!==cena sempre, source user/auto corretto).');
})();

(function(){
  /* ============ Esclusioni: due categorie rimangono ammesse tra quelle non escluse ============
     Le uniche esclusioni valide sono quelle di profilo (vegetariano/vegano):
     impostare max:0 direttamente su una categoria PDF-obbligatoria (min>0
     per tutte e 5) renderebbe la configurazione invalida per min>max, un
     caso diverso (validato altrove) - qui si verifica l'esclusione reale
     via profilo, che il resolver riconosce con forbiddenProteinMacros. */
  const risolto=N.resolveNutritionConfig({nutritionist:{config:{dietProfile:'vegetariano'}}});
  assert.equal(risolto.valid,true,'il profilo vegetariano esclude carne e pesce, lasciandone 3 (formaggi, uova, legumi): configurazione valida');
  const forbidden=new Set(risolto.profile.forbiddenProteinMacros);
  // Stessa trasformazione che ogni chiamante reale (Set/Menù) applica prima
  // di passare le frequenze a buildProteinGrid: le categorie forbidden dal
  // profilo diventano max:0 nella vista locale (esattamente come fa
  // index.html:getConfigProteine per il Set) - non è logica di
  // buildProteinGrid, è preparazione dell'input.
  const frequenzeConEsclusioni={};
  for(const [k,v] of Object.entries(risolto.proteinFrequencies))frequenzeConEsclusioni[k]=forbidden.has(k)?Object.assign({},v,{min:0,max:0,target:0}):Object.assign({},v);
  // Sottoinsieme di 4 giorni (8 slot): sufficiente a rispettare i minimi
  // settimanali delle 3 categorie ammesse (formaggi min2, uova min1,
  // legumi min2) restando ben dentro la capacità reale del vincolo "mai
  // la stessa categoria due volte nello stesso giorno" applicato a sole
  // 3 categorie disponibili (formaggi max3 + uova max2 + al più 1
  // legumi/giorno esauriscono rapidamente lo spazio su una settimana
  // intera con un profilo a sole 3 categorie - qui non serve testare
  // l'intera settimana, solo il comportamento di esclusione).
  const GIORNI_SUB=['giorno_0','giorno_1','giorno_2','giorno_3'];
  const r=E.buildProteinGrid(GIORNI_SUB,{},{proteinFrequencies:frequenzeConEsclusioni},{},E.seeded(7));
  assert.deepEqual(r.errors,[]);
  const scelte=[r.cells.giorno_0.pranzo.macro,r.cells.giorno_0.cena.macro];
  assert.notEqual(scelte[0],scelte[1],'anche con categorie escluse dal profilo, le due scelte automatiche devono essere differenti');
  for(const macro of scelte){
    assert(!forbidden.has(macro),'una categoria esclusa dal profilo ('+[...forbidden].join(',')+') non deve mai essere scelta, trovato '+macro);
  }
  console.log('OK: con categorie escluse dal profilo, le due scelte automatiche provengono sempre e solo dalle categorie rimaste ammesse.');
})();

(function(){
  /* ============ Meno di due categorie disponibili: la configurazione è rifiutata prima della generazione ============
     Scenario reale (non un valore inventato): il profilo vegano esclude
     carne, pesce, formaggi e uova, lasciando solo "legumi" - una sola
     categoria proteica, strutturalmente insufficiente per la regola
     "pranzo e cena sempre diversi". */
  const risolto=N.resolveNutritionConfig({nutritionist:{config:{dietProfile:'vegano'}}});
  assert.equal(risolto.valid,false,'con una sola categoria ammessa (legumi) la configurazione deve essere dichiarata incompatibile dal resolver, prima ancora di generare');
  assert(risolto.errors.some(e=>/almeno due categorie/.test(e)),'l\'errore deve indicare esplicitamente che servono almeno due categorie proteiche ammesse');

  // Anche interrogando direttamente il generatore con questa configurazione (percorso Set/Menù), l'esito deve essere un errore esplicito, mai una griglia con pranzo=cena.
  const forbidden=new Set(risolto.profile.forbiddenProteinMacros);
  const frequenzeConEsclusioni={};
  for(const [k,v] of Object.entries(risolto.proteinFrequencies))frequenzeConEsclusioni[k]=forbidden.has(k)?Object.assign({},v,{min:0,max:0,target:0}):Object.assign({},v);
  const r=E.buildProteinGrid(GIORNI,{giorno_0:[]},{proteinFrequencies:frequenzeConEsclusioni},{},E.seeded(1));
  assert(r.errors.length>0,'con meno di due categorie ammesse, buildProteinGrid deve rifiutare esplicitamente, mai produrre una griglia con pranzo=cena');
  assert.deepEqual(r.cells,{});
  console.log('OK: una configurazione con meno di due categorie proteiche disponibili viene rifiutata prima della generazione, in entrambi i punti (resolver e generatore).');
})();

console.log('lotto proteine autocompletamento: ok');
