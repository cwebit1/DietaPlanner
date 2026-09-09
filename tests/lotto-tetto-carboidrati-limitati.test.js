'use strict';
/* Test mirato: decisione esplicita di Cwe - il tetto cumulativo
   settimanale dei carboidrati limitati (limitedCarbTotalMax) è una
   regola APP-CWE (non PDF), configurabile ad personam dal
   nutrizionista, default 3, intervallo 0-14. resolveNutritionConfig()
   resta l'unica fonte autorevole lungo tutta la catena Setting ->
   resolver -> Set -> motore, mai una seconda interpretazione. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const N=require('../nutrition-config.js');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

// Almeno due chiavi limitate reali (cap PDF individuale 2 ciascuna, per
// poterle sommare senza urtare il cap individuale prima del tetto
// cumulativo in verifica).
const CHIAVI_LIMITATE=Object.keys(N.PDF_BASELINE.carbohydrateWeeklyCaps);
assert(CHIAVI_LIMITATE.length>=3,'servono almeno 3 chiavi limitate per il test');
const [K1,K2,K3]=CHIAVI_LIMITATE;

function statiFixed(mappa){
  const states={};
  for(const [k,n] of Object.entries(mappa))states[k]={mode:'fixed',count:n};
  return states;
}

// --- 1) campo assente -> valore risolto 3 ---
{
  const r=N.resolveNutritionConfig({});
  assert.equal(r.limitedCarbTotalMax,3,'campo assente: il resolver deve risolvere il default 3');
  assert.equal(r.valid,true);
}

// --- 2) valore personale 5: resolver, Set (contratto di sorgente) e motore (stessa funzione) usano 5 ---
{
  const r=N.resolveNutritionConfig({nutritionist:{config:{limitedCarbTotalMax:5}}});
  assert.equal(r.limitedCarbTotalMax,5,'valore personale 5 deve essere risolto esattamente');
  assert.equal(r.valid,true);

  // 5 occorrenze complessive (2+2+1, sotto i cap individuali PDF di 2
  // ciascuno) devono essere ammesse con tetto 5, esattamente la stessa
  // funzione che il motore chiama per validare le celle FIXED.
  const r5=N.resolveNutritionConfig({
    nutritionist:{config:{limitedCarbTotalMax:5}},
    user:{carbohydrates:{states:statiFixed({[K1]:2,[K2]:2,[K3]:1})}}
  });
  assert.equal(r5.valid,true,'5 occorrenze totali devono essere ammesse con tetto personale 5');
  assert.equal(r5.limitedCarbTotalMax,5);

  // La stessa configurazione (5 occorrenze) deve invece essere respinta
  // col default 3: dimostra che il tetto realmente applicato è quello
  // personale, non un default fisso ignorato.
  const rDefault=N.resolveNutritionConfig({
    user:{carbohydrates:{states:statiFixed({[K1]:2,[K2]:2,[K3]:1})}}
  });
  assert.equal(rDefault.valid,false,'le stesse 5 occorrenze devono essere respinte col tetto di default 3');
  assert(rDefault.errors.some(e=>/tetto applicativo totale 3/.test(e)));

  // Contratto di sorgente Set: CONFIG_CARB_TETTO_LIMITATI deve essere una
  // cache di sessione (let), mai una costante fissa calcolata una sola
  // volta all'avvio - altrimenti il Set non potrebbe mai riflettere un
  // valore personale diverso da 3.
  assert(/let CONFIG_CARB_TETTO_LIMITATI=/.test(html),'CONFIG_CARB_TETTO_LIMITATI deve essere una variabile aggiornabile (let), non una costante fissa');
  assert(html.includes('async function aggiornaTettoCarbLimitatiSet()'),'deve esistere un caricamento dinamico del tetto per il Set, analogo a quello già in uso per le proteine');
  // Il salvataggio del Set deve validare col tetto realmente risolto per
  // l'utente (passando la configurazione nutrizionista al resolver), mai
  // sempre col default.
  const corpoSalvaCarb=html.slice(html.indexOf('async function salvaConfigCarboidratiSet'),html.indexOf('async function salvaConfigCarboidratiSet')+700);
  assert(corpoSalvaCarb.includes("getOne('impostazioni','configAvanzata')"),'salvaConfigCarboidratiSet deve leggere la configurazione nutrizionista prima di validare');
  assert(corpoSalvaCarb.includes('nutritionist:{config:'),'salvaConfigCarboidratiSet deve passare la configurazione nutrizionista al resolver, non validare sempre col default');

  // Contratto Setting: il campo deve esistere, con min/max/step corretti.
  assert(html.includes('data-cfg-avanzata="limitedCarbTotalMax"'),'il campo Setting limitedCarbTotalMax deve esistere');
  assert(/min="0" max="14" step="1" data-cfg-avanzata="limitedCarbTotalMax"/.test(html),'il campo deve avere min 0, max 14, step 1');
}

// --- 3) valore 0 -> nessun carboidrato limitato ammesso ---
{
  const r=N.resolveNutritionConfig({
    nutritionist:{config:{limitedCarbTotalMax:0}},
    user:{carbohydrates:{states:statiFixed({[K1]:1})}}
  });
  assert.equal(r.valid,false,'con tetto 0, anche una sola occorrenza limitata deve essere respinta');
  assert(r.errors.some(e=>/tetto applicativo totale 0/.test(e)));

  const rZero=N.resolveNutritionConfig({nutritionist:{config:{limitedCarbTotalMax:0}}});
  assert.equal(rZero.valid,true,'tetto 0 senza alcuna occorrenza fissata deve restare valido');
  assert.equal(rZero.limitedCarbTotalMax,0);
}

// --- 4) valore non valido -> configurazione non salvabile/risolta come non valida ---
for(const invalido of [2.5,-1,15,'abc',null===undefined?null:'x']){
  const r=N.resolveNutritionConfig({nutritionist:{config:{limitedCarbTotalMax:invalido}}});
  if(invalido==='x')continue; // guardia residua, non un caso reale
  assert.equal(r.valid,false,'valore non valido ('+JSON.stringify(invalido)+') deve rendere la configurazione non valida');
  assert(r.errors.some(e=>/Tetto cumulativo carboidrati limitati non valido/.test(e)));
}
// null esplicito equivale a campo assente (default 3, valido) - non un valore non valido
{
  const r=N.resolveNutritionConfig({nutritionist:{config:{limitedCarbTotalMax:null}}});
  assert.equal(r.valid,true);
  assert.equal(r.limitedCarbTotalMax,3,'null esplicito deve risolversi come campo assente (default 3), mai come 0 o errore');
}

// --- 5) i limiti individuali delle categorie restano invariati, anche con tetto cumulativo alto (14) ---
{
  const pdfCap=N.PDF_BASELINE.carbohydrateWeeklyCaps[K1];
  const r=N.resolveNutritionConfig({
    nutritionist:{config:{limitedCarbTotalMax:14}},
    user:{carbohydrates:{states:statiFixed({[K1]:pdfCap+1})}}
  });
  assert.equal(r.valid,false,'anche con tetto cumulativo 14, il cap individuale PDF della singola categoria deve restare vincolante');
  assert(r.errors.some(e=>e.includes(K1)&&/tetto PDF/.test(e)));
}

console.log('lotto tetto carboidrati limitati: ok');
