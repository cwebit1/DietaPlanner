'use strict';
/* Verifica lato pagina Set: validaFattibilitaProteineSet() deve rifiutare
   un giorno con la stessa categoria ripetuta due volte (il controllo
   precedente, arr.length>limiteGiorno, non lo rilevava: ['carne','carne']
   ha lunghezza 2, pari al limite, ma non contiene due fonti diverse).
   Regola definitiva di Cwe (superata la falsa semantica
   "maxProteinSourcesPerDay=1 -> pranzo e cena della stessa categoria",
   eliminata per intero): pranzo e cena sono sempre due categorie diverse,
   il limite di celle fissabili per giorno è sempre 2, nessuna
   configurazione "fonti/giorno" residua. Verifica anche per contratto di
   sorgente che completaTabellaProteine() non passi più alcun parametro
   eliminato a buildProteinGrid() e non assegni mai un'anteprima quando la
   proposta risulta invalida. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function estraiFunzione(nome){
  const marker='function '+nome+'(';
  const start=html.indexOf(marker);
  assert(start>=0,'funzione non trovata nel sorgente: '+nome);
  const apertura=html.indexOf('{',start);
  let profondita=0,i=apertura;
  for(;i<html.length;i++){
    if(html[i]==='{')profondita++;
    else if(html[i]==='}'){profondita--;if(profondita===0)break;}
  }
  return html.slice(start,i+1);
}

const sorgente=[
  estraiFunzione('validaFattibilitaProteineSet'),
  'module.exports={validaFattibilitaProteineSet};'
].join('\n');
const Module=require('node:module');
const m=new Module(path.join(root,'index.html'));
m._compile(sorgente,path.join(root,'index.html'));
const {validaFattibilitaProteineSet}=m.exports;

const FREQ={carne:{min:1,max:3},pesce:{min:2,max:3},formaggi:{min:2,max:3},uova:{min:1,max:2},legumi:{min:2,max:null}};

// --- 1) ['carne','carne'] viene sempre rifiutato ---
{
  const tabella={giorno_0:['carne','carne']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ);
  assert.equal(esito.ok,false,'["carne","carne"] deve essere sempre respinto');
  assert.equal(esito.reason,'day-duplicate');
}
// controprova: categorie distinte sono valide (a parita' di altri vincoli
// minimi/massimi non ancora saturati)
{
  const tabella={giorno_0:['carne','pesce']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ);
  assert.equal(esito.ok,true,'categorie distinte devono restare valide');
}
// una sola cella scelta (nessun duplicato possibile con una voce sola) resta valida
{
  const tabella={giorno_0:['pesce']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ);
  assert.equal(esito.ok,true);
}
// una tabella con 3 caselle nello stesso giorno resta respinta da sempre
// (arr.length>2), invariato
{
  const tabella={giorno_0:['carne','pesce','uova']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ);
  assert.equal(esito.ok,false);
  assert.equal(esito.reason,'day-max');
}

// --- 2) il salvataggio non accetta una tabella duplicata: verificato per
//        contratto di sorgente che salvaSetCompleto richiami davvero
//        validaFattibilitaProteineSet prima di scrivere tabellaGiornoCategoria ---
const corpoSalva=estraiFunzione('salvaSetCompleto');
assert(corpoSalva.includes('validaFattibilitaProteineSet('),'salvaSetCompleto deve validare la tabella proteine prima di salvarla');
assert(/if\(!fatt\.ok\)/.test(corpoSalva),'salvaSetCompleto deve rifiutare il salvataggio se la validazione fallisce');

// --- 3) completaTabellaProteine non deve più passare/leggere alcun
//        parametro "fonti/giorno" eliminato: buildProteinGrid riceve solo
//        proteinFrequencies, mai una seconda impostazione giornaliera ---
const corpoCompleta=estraiFunzione('completaTabellaProteine');
assert(!/maxProteinSourcesPerDay/.test(corpoCompleta),'completaTabellaProteine non deve più referenziare il parametro eliminato');
assert(corpoCompleta.includes('buildProteinGrid(giorni,base,{proteinFrequencies:cfg.frequenze},{},Math.random)'),'completaTabellaProteine deve chiamare buildProteinGrid con solo proteinFrequencies');

// --- 4) una proposta non valida non viene mostrata ne' copiata in bozza:
//        verificato per contratto che gli errori di buildProteinGrid
//        vengano controllati PRIMA di assegnare tabellaProteineAnteprima,
//        e che in quel caso l'anteprima resti null ---
const posErrori=corpoCompleta.indexOf('griglia.errors');
const posAssegnaAnteprima=corpoCompleta.indexOf('tabellaProteineAnteprima=anteprima');
assert(posErrori>=0&&posAssegnaAnteprima>=0&&posErrori<posAssegnaAnteprima,'il controllo degli errori deve precedere l\'assegnazione dell\'anteprima');
assert(corpoCompleta.includes('tabellaProteineAnteprima=null'),'in caso di errore l\'anteprima non deve essere impostata');

// --- 5) nessuna variabile/campo "fonti/giorno" residua nell'intero file ---
assert(!html.includes('maxFontiProteicheGiornaliereSet'),'la variabile eliminata non deve più comparire nel sorgente');
assert(!html.includes("'Fonti proteiche/giorno'"),'la voce di Setting eliminata non deve più comparire nel sorgente');

console.log('OK: validazione Set proteine rifiuta sempre i duplicati giornalieri; completaTabellaProteine non referenzia più alcun parametro "fonti/giorno" eliminato.');
