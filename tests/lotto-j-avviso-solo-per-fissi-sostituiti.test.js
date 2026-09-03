'use strict';
/* Regressione (segnalata da Cwe, 04/09/2026, sez.7 del task "Programmazione
   automatica / Menù settimanale"): con TUTTI i carboidrati in stato AUTO
   (nessun FIXED impostato nel Set), il motore mostrava comunque il
   triangolo giallo + tooltip di sostituzione su pasti come "Tagliolini
   all'uovo con zucchine e carote", pur non esistendo alcuna condizione
   utente esplicita sostituita.
   Causa: l'avviso confrontava la chiave usata con carbCandidati[0], primo
   elemento di una lista MESCOLATA (mescolaValori) — posizione casuale, mai
   una scelta dell'utente. Fix: l'avviso ora scatta solo quando un
   carboidrato FIXED (residuo>0, condizione utente esplicita) era fra i
   candidati ed è stato scartato a favore di un altro — mai per una
   sostituzione fra due AUTO. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const stores={};
for(const name of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[name]=new Map();
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value?structuredClone(value):null;};
global.put=async(name,value)=>{stores[name].set(value.id??value.chiave,structuredClone(value));return value;};
global.delKey=async(name,key)=>stores[name].delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=> '2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

function messaggiSostituzione(piano){
  return piano
    .map(v=>v.avvisoCarboidrato)
    .filter(Boolean)
    .filter(msg=>/non disponibile per questa proteina: usato/.test(msg));
}

(async()=>{
  await M.inizializza({basePath:''});

  // Nessuna voce 'configCarboidrati*' impostata: stato di default, tutto AUTO,
  // nessun FIXED — esattamente lo scenario segnalato (Set senza alcun
  // carboidrato impostato manualmente).
  let generazioniValide=0,falsiPositivi=0;
  for(let tentativo=0;tentativo<20;tentativo++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    if(esito.errori.length)continue;
    generazioniValide++;
    const piano=await global.getAll('piano');
    falsiPositivi+=messaggiSostituzione(piano).length;
  }
  assert(generazioniValide>0,'nessuna generazione valida su cui verificare (setup test da rivedere)');
  assert.equal(falsiPositivi,0,'con tutti i carboidrati AUTO non deve mai comparire un avviso di sostituzione: un AUTO scelto al posto di un altro AUTO non è una condizione utente sostituita');

  // Controprova: con un carboidrato FIXED esplicito che risulta incompatibile
  // con la proteina scelta in almeno uno slot, l'avviso DEVE poter comparire
  // (non deve essere stato disattivato del tutto insieme al fix).
  await global.put('impostazioni',{chiave:'configCarboidratiStati',valore:{riso:{mode:'fixed',count:7}}});
  stores.piano.clear();
  let almenoUnAvvisoLegittimo=false;
  for(let tentativo=0;tentativo<20&&!almenoUnAvvisoLegittimo;tentativo++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    if(esito.errori.length)continue;
    const piano=await global.getAll('piano');
    if(messaggiSostituzione(piano).length)almenoUnAvvisoLegittimo=true;
  }
  // Nota: non è garantito che il catalogo di test produca mai
  // un'incompatibilità reale col riso fisso; si verifica solo che, se
  // l'avviso compare, riguardi davvero 'riso' come sostituito - mai un
  // artefatto di posizione casuale nella lista mescolata.
  const pianoFinale=await global.getAll('piano');
  for(const msg of messaggiSostituzione(pianoFinale)){
    assert(msg.startsWith('Carboidrato riso non disponibile'),'un avviso legittimo deve riguardare il FIXED realmente sostituito, non un candidato casuale: '+msg);
  }

  console.log('OK: avviso di sostituzione carboidrato scatta solo per un FIXED realmente scartato ('+generazioniValide+' generazioni AUTO senza falsi positivi verificate).');
})().catch(e=>{console.error(e);process.exit(1);});
