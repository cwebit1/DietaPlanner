'use strict';
/* Regressione: engine-core.buildProteinGrid() poteva produrre nello stesso
   giorno ['carne','carne'] (~35% delle generazioni casuali con i limiti
   predefiniti). Causa: il fallback "se il pool alternativo (senza la
   categoria precedente) e' vuoto, riusa comunque il pool con la categoria
   precedente" permetteva la ripetizione; la funzione inoltre non riceveva
   affatto maxProteinSourcesPerDay dal chiamante (index.html passava solo
   {proteinFrequencies}). Corretto con vero backtracking sui soli slot
   liberi (mai retry casuali illimitati) e lettura esplicita del vincolo
   giornaliero dalla configurazione canonica. */
const assert=require('node:assert/strict');
const E=require('../engine-core.js');
const GIORNI=['giorno_0','giorno_1','giorno_2','giorno_3','giorno_4','giorno_5','giorno_6'];

function contaDuplicatiGiorno(risultato){
  let n=0;
  for(const g of GIORNI){
    const p=risultato.cells[g].pranzo.macro,c=risultato.cells[g].cena.macro;
    if(p!=null&&p===c)n++;
  }
  return n;
}

// --- 1) almeno 10.000 generazioni Casuali con valore 2, zero duplicati ---
{
  let duplicati=0,errori=0,minViolati=0,maxViolati=0;
  const t0=Date.now();
  for(let seed=1;seed<=10000;seed++){
    const r=E.buildProteinGrid(GIORNI,{},{maxProteinSourcesPerDay:2},{},E.seeded(seed));
    if(r.errors.length){errori++;continue;}
    duplicati+=contaDuplicatiGiorno(r);
    for(const [m,cnt] of Object.entries(r.counts)){
      const lim=E.DEFAULTS.proteinFrequencies[m];
      if(cnt<lim.min)minViolati++;
      if(lim.max!=null&&cnt>lim.max)maxViolati++;
    }
  }
  const ms=Date.now()-t0;
  assert.equal(errori,0,'con la configurazione predefinita nessuna delle 10.000 generazioni deve fallire');
  assert.equal(duplicati,0,'nessun giorno deve avere pranzo===cena con 2 fonti/giorno, su 10.000 generazioni');
  assert.equal(minViolati,0,'nessuna violazione dei minimi settimanali su 10.000 generazioni');
  assert.equal(maxViolati,0,'nessuna violazione dei massimi settimanali su 10.000 generazioni');
  console.log('10.000 generazioni Casuali (2 fonti/giorno): 0 duplicati, 0 errori, '+ms+' ms');
}

// --- 2) pranzo !== cena sempre, con valore 2 (ripetuto su varie seed per sicurezza) ---
for(let seed=1;seed<=200;seed++){
  const r=E.buildProteinGrid(GIORNI,{},{maxProteinSourcesPerDay:2},{},E.seeded(seed*97+3));
  assert.equal(r.errors.length,0,'seed '+seed);
  for(const g of GIORNI)assert.notEqual(r.cells[g].pranzo.macro,r.cells[g].cena.macro,'seed '+seed+' '+g);
}

// --- 3) rispetto simultaneo di minimi, massimi e target settimanali ---
for(let seed=1;seed<=200;seed++){
  const r=E.buildProteinGrid(GIORNI,{},{maxProteinSourcesPerDay:2},{},E.seeded(seed*13+1));
  assert.equal(r.errors.length,0);
  for(const [m,cnt] of Object.entries(r.counts)){
    const lim=E.DEFAULTS.proteinFrequencies[m];
    assert(cnt>=lim.min,'minimo violato '+m+' seed '+seed);
    if(lim.max!=null)assert(cnt<=lim.max,'massimo violato '+m+' seed '+seed);
  }
}

// --- 4) celle fissate manualmente rispettate ---
{
  const userTable={giorno_0:['pesce'],giorno_3:['legumi','uova']};
  const r=E.buildProteinGrid(GIORNI,userTable,{maxProteinSourcesPerDay:2},{},E.seeded(7));
  assert.equal(r.errors.length,0);
  assert.equal(r.cells.giorno_0.pranzo.macro,'pesce');
  assert.equal(r.cells.giorno_0.pranzo.source,'user');
  assert.equal(r.cells.giorno_3.pranzo.macro,'legumi');
  assert.equal(r.cells.giorno_3.cena.macro,'uova');
  assert.equal(r.cells.giorno_3.pranzo.source,'user');
  assert.equal(r.cells.giorno_3.cena.source,'user');
}

// --- 5) una cella manuale Carne con valore 2 produce un secondo pasto NON Carne ---
{
  const r=E.buildProteinGrid(GIORNI,{giorno_1:['carne']},{maxProteinSourcesPerDay:2},{},E.seeded(11));
  assert.equal(r.errors.length,0);
  assert.equal(r.cells.giorno_1.pranzo.macro,'carne');
  assert.notEqual(r.cells.giorno_1.cena.macro,'carne','il secondo pasto deve essere diverso da Carne');
  assert.equal(r.cells.giorno_1.cena.source,'auto');
}

// --- 6) ['carne','carne'] fissato a mano viene rifiutato con valore 2 ---
{
  const r=E.buildProteinGrid(GIORNI,{giorno_2:['carne','carne']},{maxProteinSourcesPerDay:2},{},E.seeded(9));
  assert(r.errors.length>0,'una cella fissata a ["carne","carne"] con 2 fonti/giorno deve produrre un errore esplicito');
  assert.deepEqual(r.cells,{},'nessuna griglia (nemmeno parziale) deve essere restituita se i dati fissati sono gia\' invalidi');
}

// --- 9) Casuale (base={}) e Completa (base=celle esistenti) applicano le stesse regole ---
{
  const base={giorno_0:['pesce']};
  const casuale=E.buildProteinGrid(GIORNI,{},{maxProteinSourcesPerDay:2},{},E.seeded(21));
  const completa=E.buildProteinGrid(GIORNI,base,{maxProteinSourcesPerDay:2},{},E.seeded(21));
  assert.equal(casuale.errors.length,0);assert.equal(completa.errors.length,0);
  for(const g of GIORNI){
    assert.notEqual(casuale.cells[g].pranzo.macro,casuale.cells[g].cena.macro,'Casuale: '+g);
    assert.notEqual(completa.cells[g].pranzo.macro,completa.cells[g].cena.macro,'Completa: '+g);
  }
  assert.equal(completa.cells.giorno_0.pranzo.macro,'pesce','Completa deve rispettare la cella gia\' scelta a mano');
}

// --- 10) una configurazione impossibile produce errore, nessuna griglia ---
{
  // Minimi settimanali che superano di gran lunga gli slot disponibili (14).
  const cfgImpossibile={
    maxProteinSourcesPerDay:2,
    proteinFrequencies:{
      carne:{min:8,max:null,target:8},
      pesce:{min:8,max:null,target:8},
      formaggi:{min:0,max:0,target:0},
      uova:{min:0,max:0,target:0},
      legumi:{min:0,max:0,target:0}
    }
  };
  const r=E.buildProteinGrid(GIORNI,{},cfgImpossibile,{},E.seeded(3));
  assert(r.errors.length>0,'una configurazione impossibile deve produrre un errore esplicito');
  assert.deepEqual(r.cells,{},'nessuna anteprima/griglia deve essere prodotta quando i vincoli sono incompatibili');
}

// --- 11) valore 1: modalita' separata, pranzo===cena sempre, mai dedotta dal riempimento ---
for(let seed=1;seed<=200;seed++){
  const r=E.buildProteinGrid(GIORNI,{},{maxProteinSourcesPerDay:1},{},E.seeded(seed*31+2));
  assert.equal(r.errors.length,0,'seed '+seed);
  for(const g of GIORNI)assert.equal(r.cells[g].pranzo.macro,r.cells[g].cena.macro,'con 1 fonte/giorno pranzo e cena devono coincidere, seed '+seed+' '+g);
}
{
  // una singola cella fissata ('pesce') sotto valore 1 deve valere per
  // ENTRAMBI i pasti, non solo per il pranzo.
  const r=E.buildProteinGrid(GIORNI,{giorno_4:['pesce']},{maxProteinSourcesPerDay:1},{},E.seeded(5));
  assert.equal(r.errors.length,0);
  assert.equal(r.cells.giorno_4.pranzo.macro,'pesce');
  assert.equal(r.cells.giorno_4.cena.macro,'pesce','con 1 fonte/giorno la singola cella fissata vale per entrambi i pasti');
}
{
  // valore 1 con due categorie diverse fissate a mano: deve essere un errore.
  const r=E.buildProteinGrid(GIORNI,{giorno_5:['carne','pesce']},{maxProteinSourcesPerDay:1},{},E.seeded(5));
  assert(r.errors.length>0,'con 1 fonte/giorno due categorie diverse fissate lo stesso giorno devono produrre un errore esplicito');
}

console.log('OK: buildProteinGrid rispetta maxProteinSourcesPerDay (2: sempre distinte; 1: sempre uguali), con backtracking vero e zero duplicati su 10.000 generazioni.');
