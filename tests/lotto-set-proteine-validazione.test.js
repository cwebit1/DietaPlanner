'use strict';
/* Verifica lato pagina Set: validaFattibilitaProteineSet() deve rifiutare
   un giorno con la stessa categoria ripetuta due volte quando le fonti
   proteiche/giorno sono 2 (il controllo precedente, arr.length>limiteGiorno,
   non lo rilevava: ['carne','carne'] ha lunghezza 2, pari al limite, ma
   non contiene due fonti diverse). Verifica anche per contratto di
   sorgente che completaTabellaProteine() passi ora maxProteinSourcesPerDay
   a buildProteinGrid() e non assegni mai un'anteprima quando la proposta
   risulta invalida. */
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

// --- 6) ['carne','carne'] viene rifiutato dalla validazione con valore 2 ---
{
  const tabella={giorno_0:['carne','carne']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ,2);
  assert.equal(esito.ok,false,'["carne","carne"] deve essere respinto con 2 fonti/giorno');
  assert.equal(esito.reason,'day-duplicate');
}
// controprova: categorie distinte con valore 2 sono valide (a parita' di
// altri vincoli minimi/massimi non ancora saturati)
{
  const tabella={giorno_0:['carne','pesce']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ,2);
  assert.equal(esito.ok,true,'categorie distinte devono restare valide con 2 fonti/giorno');
}
// con valore 1, un singolo valore ripetuto concettualmente (qui una sola
// cella, mai due) resta valido - la tabella con una sola voce non e' un
// duplicato
{
  const tabella={giorno_0:['pesce']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ,1);
  assert.equal(esito.ok,true);
}
// una tabella con 3 caselle nello stesso giorno resta respinta da sempre
// (arr.length>limiteGiorno), invariato
{
  const tabella={giorno_0:['carne','pesce','uova']};
  const esito=validaFattibilitaProteineSet(tabella,FREQ,2);
  assert.equal(esito.ok,false);
  assert.equal(esito.reason,'day-max');
}

// --- 7) il salvataggio non accetta una tabella duplicata: verificato per
//        contratto di sorgente che salvaSetCompleto richiami davvero
//        validaFattibilitaProteineSet prima di scrivere tabellaGiornoCategoria ---
const corpoSalva=estraiFunzione('salvaSetCompleto');
assert(corpoSalva.includes('validaFattibilitaProteineSet('),'salvaSetCompleto deve validare la tabella proteine prima di salvarla');
assert(/if\(!fatt\.ok\)/.test(corpoSalva),'salvaSetCompleto deve rifiutare il salvataggio se la validazione fallisce');

// --- 1) buildProteinGrid riceve ora maxProteinSourcesPerDay dal chiamante
//        (non solo {proteinFrequencies}), senza duplicare la configurazione
//        canonica (il valore viene letto da cfg.maxProteinSourcesPerDay,
//        gia' calcolato da caricaVincoliProteineSet/getConfigProteine) ---
const corpoCompleta=estraiFunzione('completaTabellaProteine');
assert(corpoCompleta.includes('maxProteinSourcesPerDay:cfg.maxProteinSourcesPerDay'),'completaTabellaProteine deve passare il vincolo giornaliero effettivo a buildProteinGrid');
assert(!/buildProteinGrid\(giorni,base,\{proteinFrequencies:cfg\.frequenze\},\{\},Math\.random\)/.test(corpoCompleta),'la vecchia chiamata senza maxProteinSourcesPerDay non deve piu\' comparire');

// --- 3) una proposta non valida non viene mostrata ne' copiata in bozza:
//        verificato per contratto che gli errori di buildProteinGrid
//        vengano controllati PRIMA di assegnare tabellaProteineAnteprima,
//        e che in quel caso l'anteprima resti null ---
const posErrori=corpoCompleta.indexOf('griglia.errors');
const posAssegnaAnteprima=corpoCompleta.indexOf('tabellaProteineAnteprima=anteprima');
assert(posErrori>=0&&posAssegnaAnteprima>=0&&posErrori<posAssegnaAnteprima,'il controllo degli errori deve precedere l\'assegnazione dell\'anteprima');
assert(corpoCompleta.includes('tabellaProteineAnteprima=null'),'in caso di errore l\'anteprima non deve essere impostata');

console.log('OK: validazione Set proteine rifiuta i duplicati giornalieri; completaTabellaProteine passa il vincolo giornaliero e non mostra proposte invalide.');
