'use strict';
/* Regressione (commit ca226c1, "Pasto concluso: oggi incluso, sempre"):
   renderBloccoNuovoMotore usava giorno<=todayISO() per decidere se un
   pasto vuoto era "concluso" e giorno>=todayISO() per decidere se un
   pasto esistente era modificabile - entrambi criteri SOLO sulla data,
   che in Programmazione sono corretti (oggi e' sempre sola lettura) ma
   nella finestra Pasto sono sbagliati: alle 8 del mattino pranzo e cena
   di oggi comparivano gia' come "pasto concluso", prima ancora che la
   loro fascia oraria fosse chiusa.

   Questo test estrae davvero fasciaPastoSuperata()/FASCE_ORARIE_PASTO
   da index.html e li esegue con orari controllati (nessuna dipendenza
   dall'orologio reale), poi verifica per contratto di sorgente che
   renderBloccoNuovoMotore non usi piu' i vecchi criteri e non duplichi
   il flusso canonico di archiviazione. Programmazione (che deve restare
   invariata) e' verificata separatamente sul proprio sorgente. */
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
function estraiConst(nome){
  const re=new RegExp('const '+nome+'\\s*=\\s*\\{[\\s\\S]*?\\};');
  const m=html.match(re);
  assert(m,'costante non trovata nel sorgente: '+nome);
  return m[0];
}

const OGGI='2026-08-30'; // giorno "oggi" simulato, coerente col resto della suite

const sorgente=[
  estraiConst('FASCE_ORARIE_PASTO'),
  'function todayISO(){return "'+OGGI+'";}',
  estraiFunzione('fasciaPastoSuperata'),
  'module.exports={fasciaPastoSuperata,FASCE_ORARIE_PASTO};'
].join('\n');

const Module=require('node:module');
const m=new Module(path.join(root,'index.html'));
m._compile(sorgente,path.join(root,'index.html'));
const {fasciaPastoSuperata}=m.exports;

function oraDi(hh,mm){return new Date(OGGI+'T'+String(hh).padStart(2,'0')+':'+String(mm||0).padStart(2,'0')+':00');}

// --- 1-6: casi orari espliciti richiesti dal task, su OGGI ---
assert.equal(fasciaPastoSuperata(OGGI,'pranzo',oraDi(8,0)),false,'oggi 08:00: pranzo non concluso');
assert.equal(fasciaPastoSuperata(OGGI,'cena',oraDi(8,0)),false,'oggi 08:00: cena non conclusa');
assert.equal(fasciaPastoSuperata(OGGI,'pranzo',oraDi(13,0)),false,'oggi 13:00: pranzo non concluso');
assert.equal(fasciaPastoSuperata(OGGI,'cena',oraDi(13,0)),false,'oggi 13:00: cena non conclusa');
assert.equal(fasciaPastoSuperata(OGGI,'pranzo',oraDi(13,59)),false,'oggi 13:59: pranzo ancora aperto');
assert.equal(fasciaPastoSuperata(OGGI,'pranzo',oraDi(14,0)),true,'oggi 14:00: pranzo concluso');
assert.equal(fasciaPastoSuperata(OGGI,'cena',oraDi(14,0)),false,'oggi 14:00: cena non conclusa');
assert.equal(fasciaPastoSuperata(OGGI,'pranzo',oraDi(19,0)),true,'oggi 19:00: pranzo concluso');
assert.equal(fasciaPastoSuperata(OGGI,'cena',oraDi(19,0)),false,'oggi 19:00: cena non conclusa');
assert.equal(fasciaPastoSuperata(OGGI,'cena',oraDi(19,59)),false,'oggi 19:59: cena ancora aperta');
assert.equal(fasciaPastoSuperata(OGGI,'cena',oraDi(20,0)),true,'oggi 20:00: cena conclusa');
assert.equal(fasciaPastoSuperata(OGGI,'pranzo',oraDi(20,0)),true,'oggi 20:00: pranzo concluso (a maggior ragione)');

// --- giorno passato: sempre concluso, qualunque ora ---
const IERI='2026-08-29';
assert.equal(fasciaPastoSuperata(IERI,'pranzo',oraDi(8,0)),true,'giorno passato: pranzo sempre concluso');
assert.equal(fasciaPastoSuperata(IERI,'cena',oraDi(8,0)),true,'giorno passato: cena sempre conclusa');

// --- giorno futuro: mai concluso, qualunque ora ---
const DOMANI='2026-08-31';
assert.equal(fasciaPastoSuperata(DOMANI,'pranzo',oraDi(23,0)),false,'giorno futuro: pranzo mai concluso');
assert.equal(fasciaPastoSuperata(DOMANI,'cena',oraDi(23,0)),false,'giorno futuro: cena mai conclusa');

// --- riproduzione della logica reale di renderBloccoNuovoMotore, con
//     fasciaPastoSuperata reale: "pasto concluso" per uno slot vuoto, e
//     modificabilita' di un pasto esistente, devono seguire esattamente
//     le fasce, mai la sola data (punti 5 e 12) ---
function pastoVuotoConcluso(giorno,pasto,ora){return fasciaPastoSuperata(giorno,pasto,ora);}
function modificabile(voceConsumato,giorno,pasto,ora){return !voceConsumato && !fasciaPastoSuperata(giorno,pasto,ora);}

assert.equal(pastoVuotoConcluso(OGGI,'pranzo',oraDi(8,0)),false,'oggi 08:00, pranzo vuoto: non concluso, deve mostrare "non ancora programmato"');
assert.equal(pastoVuotoConcluso(OGGI,'cena',oraDi(8,0)),false,'oggi 08:00, cena vuota: non conclusa');
assert.equal(pastoVuotoConcluso(OGGI,'pranzo',oraDi(14,0)),true,'oggi 14:00, pranzo vuoto: concluso');

assert.equal(modificabile(false,OGGI,'pranzo',oraDi(13,0)),true,'pasto esistente non consumato, prima fine fascia: modificabile (Alternativa/Salvafrigo visibili)');
assert.equal(modificabile(false,OGGI,'pranzo',oraDi(14,0)),false,'pasto esistente non consumato, dopo fine fascia: NON modificabile (Alternativa/Salvafrigo nascosti) anche se non ancora archiviato');
assert.equal(modificabile(true,OGGI,'pranzo',oraDi(13,0)),false,'pasto gia\' consumato: mai modificabile, indipendentemente dalla fascia');
assert.equal(modificabile(false,DOMANI,'pranzo',oraDi(23,0)),true,'giorno futuro: pasto normalmente modificabile');
assert.equal(modificabile(false,IERI,'pranzo',oraDi(8,0)),false,'giorno passato: mai modificabile');

// --- contratto di sorgente: renderBloccoNuovoMotore non deve piu' usare
//     i vecchi criteri solo-data, e non deve duplicare il flusso
//     canonico di archiviazione (put su 'piano', registraConsumoStorico,
//     scalaInventarioPerRicetta) - quello resta esclusivo di
//     elaboraConsumoAutomatico ---
const corpoRenderBlocco=estraiFunzione('renderBloccoNuovoMotore');
assert(!corpoRenderBlocco.includes('giorno<=todayISO()'),'renderBloccoNuovoMotore non deve piu\' usare giorno<=todayISO() per decidere "concluso"');
assert(!corpoRenderBlocco.includes('giorno>=todayISO()'),'renderBloccoNuovoMotore non deve piu\' usare giorno>=todayISO() per decidere la modificabilita\'');
assert(corpoRenderBlocco.includes('fasciaPastoSuperata(giorno,pasto)'),'renderBloccoNuovoMotore deve usare fasciaPastoSuperata(giorno,pasto)');
assert(!/\bput\(\s*'piano'/.test(corpoRenderBlocco),'renderBloccoNuovoMotore non deve mai scrivere direttamente su \'piano\' per archiviare un consumo (lo fa solo elaboraConsumoAutomatico)');
assert(!corpoRenderBlocco.includes('registraConsumoStorico('),'renderBloccoNuovoMotore non deve registrare storico direttamente');
assert(!corpoRenderBlocco.includes('scalaInventarioPerRicetta('),'renderBloccoNuovoMotore non deve scaricare inventario direttamente');

// --- Programmazione: deve restare invariata (giorno<=todayISO() ancora
//     presente dove gestisce la sola lettura del Menu) ---
const corpoRiepilogoMenu=estraiFunzione('riepilogoGrigliaPastoMenu');
assert(corpoRiepilogoMenu.includes('giorno<=todayISO()'),'la Programmazione deve continuare a usare giorno<=todayISO() per la sola lettura del Menu (invariato)');

// --- Estensione: stessa identica regressione, stessa correzione, in
//     renderColazione (segnalata separatamente, ora estesa su richiesta
//     esplicita). Fascia colazione: [6,9], fine=9. ---
assert.equal(fasciaPastoSuperata(OGGI,'colazione',oraDi(8,0)),false,'oggi 08:00: colazione vuota non ancora conclusa');
assert.equal(fasciaPastoSuperata(OGGI,'colazione',oraDi(8,59)),false,'oggi 08:59: colazione ancora aperta');
assert.equal(fasciaPastoSuperata(OGGI,'colazione',oraDi(9,0)),true,'oggi 09:00: colazione conclusa');
assert.equal(fasciaPastoSuperata(IERI,'colazione',oraDi(8,0)),true,'giorno passato: colazione sempre conclusa');
assert.equal(fasciaPastoSuperata(DOMANI,'colazione',oraDi(23,0)),false,'giorno futuro: colazione mai conclusa');

const corpoRenderColazione=estraiFunzione('renderColazione');
assert(!corpoRenderColazione.includes('giorno<=todayISO()'),'renderColazione non deve piu\' usare giorno<=todayISO() per decidere "concluso"');
assert(!corpoRenderColazione.includes('giorno <= todayISO()'),'renderColazione non deve piu\' usare giorno <= todayISO() (con spazi) per decidere "concluso"');
assert((corpoRenderColazione.match(/fasciaPastoSuperata\(giorno,\s*'colazione'\)/g)||[]).length>=2,'renderColazione deve usare fasciaPastoSuperata(giorno,\'colazione\') per ENTRAMBI i rami (Menu ed elenco pasto) che decidono "concluso" su uno slot vuoto');
assert(corpoRenderColazione.includes("giorno === todayISO()"),'il confronto giorno===todayISO() del premio costanza (non un bug di fascia, riguarda solo "oggi esatto") deve restare invariato');

console.log('OK: la finestra Pasto (pranzo, cena, colazione) usa fasciaPastoSuperata (non piu\' la sola data) per "pasto concluso" e modificabilita\'; la Programmazione resta invariata.');
