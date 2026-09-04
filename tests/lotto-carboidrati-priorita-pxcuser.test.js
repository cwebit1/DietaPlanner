'use strict';
/* Regressione: il motore non rispettava il processo logico con cui
   "C.user" (un carboidrato FIXED ancora da collocare) deve guidare la
   scelta fra i candidati PX. Cause concrete, tutte in motor-v12.js:
   1) carboidratiCandidatiSlot() mescolava fissi (C.user) e AUTO in un
      unico array (fissi.concat(auto) poi mescolaValori su tutto),
      permettendo a un C.user di essere provato dopo diversi AUTO;
   2) costruisciPastoSequenziale() provava i PX in ordine di rotazione
      senza mai cercare PRIMA, in tutto il pool, quelli che realizzano
      gia' PX+C.user;
   3) una ricetta PX gia' combinata con un carboidrato (PX+C) veniva
      accettata subito se il suo C incorporato era ammissibile in
      qualunque forma (anche solo AUTO), senza verificare prima se
      esisteva altrove nel pool un PX+C.user migliore;
   4) se nessun carboidrato risultava compatibile, il pasto si chiudeva
      comunque con la sola proteina (chiudiPastoConVerdura senza alcun
      carboidrato), producendo un pasto ordinario senza C.
   Questo test verifica il comportamento REALE con il catalogo vero
   (motor-v12.js, IndexedDB reale via harness Node), non solo il
   conteggio finale. */
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
const motorSrc=fs.readFileSync(path.join(root,'motor-v12.js'),'utf8');

function estraiFunzioneMotor(nome){
  const marker='function '+nome+'(';
  const start=motorSrc.indexOf(marker);
  assert(start>=0,'funzione non trovata in motor-v12.js: '+nome);
  const apertura=motorSrc.indexOf('{',start);
  let profondita=0,i=apertura;
  for(;i<motorSrc.length;i++){
    if(motorSrc[i]==='{')profondita++;
    else if(motorSrc[i]==='}'){profondita--;if(profondita===0)break;}
  }
  return motorSrc.slice(start,i+1);
}

(async()=>{
  await M.inizializza({basePath:''});

  // --- Punti 1,3,4,5: PX+C.user (combo Panino+Prosciutto crudo, id 32,
  //     carboidrato 'pane') deve avere priorita' assoluta quando serve
  //     una proteina di categoria 'carne' (token PC) e 'pane' e' FIXED
  //     con residuo ancora disponibile. Nessuna delle 100 generazioni
  //     deve fallire la priorita': non e' un comportamento probabile,
  //     e' una regola che vale sempre quando l'opportunita' esiste. ---
  await global.put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:{giorno_0:['carne',null]}});
  await global.put('impostazioni',{chiave:'configCarboidratiStati',valore:{pane:{mode:'fixed',count:1}}});
  let successiPxCUser=0,generazioniValide=0;
  for(let i=0;i<100;i++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    if(esito.errori.length)continue;
    generazioniValide++;
    const voce=await global.getOne('piano','2026-08-31_pranzo');
    if(voce&&voce.carboidratoPianificato==='pane')successiPxCUser++;
  }
  assert(generazioniValide>=80,'servono abbastanza generazioni valide per una verifica affidabile ('+generazioniValide+'/100)');
  assert.equal(successiPxCUser,generazioniValide,'PX+C.user (pane) deve essere scelto SEMPRE quando esiste un candidato PC che lo realizza e pane e\' ancora FIXED da collocare - non solo talvolta');
  await global.delKey('impostazioni','tabellaGiornoCategoria');
  await global.delKey('impostazioni','configCarboidratiStati');

  // --- Punto 6/7/8 (contratto di sorgente): niente regola generica "C
  //     compatibile con PX"; le funzioni S/G/V (completaResiduoVerduraRicette,
  //     assegnaCondimentiRotazioneGlobale) non compaiono direttamente nel
  //     corpo di costruisciPastoSequenziale/cercaCarboSeparato - intervengono
  //     solo dentro chiudiPastoConVerdura, chiamata SOLO dopo che P e C sono
  //     gia' entrambi decisi. ---
  const corpoCostruisci=estraiFunzioneMotor('costruisciPastoSequenziale');
  const corpoCerca=estraiFunzioneMotor('cercaCarboSeparato');
  for(const corpo of [corpoCostruisci,corpoCerca]){
    assert(!corpo.includes('completaResiduoVerduraRicette('),'la scelta di P/C non deve calcolare direttamente il residuo V - solo chiudiPastoConVerdura lo fa, dopo');
    assert(!corpo.includes('assegnaCondimentiRotazioneGlobale('),'la scelta di P/C non deve toccare direttamente sughi/condimenti - solo chiudiPastoConVerdura lo fa, dopo');
  }
  assert(corpoCostruisci.includes('fissiRimasti'),'costruisciPastoSequenziale deve distinguere esplicitamente i C.user (fissiRimasti) dagli AUTO');

  // --- Punto 2: FIXED e AUTO non mescolati nello stesso livello di
  //     priorita' - carboidratiCandidatiSlot() non deve piu' mescolare
  //     l'unione fissi+auto in un solo shuffle. ---
  const corpoCandidati=estraiFunzioneMotor('carboidratiCandidatiSlot');
  assert(!corpoCandidati.includes('mescolaValori(fissi.concat('),'i fissi (C.user) e gli AUTO non devono piu\' essere mescolati insieme in un unico livello');
  assert(/mescolaValori\(fissi,rng\)\.concat\(mescolaValori\(/.test(corpoCandidati),'i fissi devono restare un gruppo separato, mescolato solo al proprio interno, sempre prima degli AUTO');

  // --- Punto 4 (fallback rimosso): nessuna chiamata a chiudiPastoConVerdura
  //     con la sola proteina (senza alcun carboidrato) deve restare nel
  //     percorso ordinario. ---
  assert(!/chiudiPastoConVerdura\(\[proteina,\.\.\.extra\],token,giorno,pool,ctx\);\s*\n\s*if\(esito\)return Object\.assign\(esito,\{carbKeyUsato:null/.test(corpoCostruisci),'non deve piu\' esistere il fallback che chiude il pasto con la sola proteina e carbKeyUsato:null');
  assert(!corpoCostruisci.includes('Nessun carboidrato compatibile trovato per questa proteina in questo pasto'),'rimosso l\'avviso legato al vecchio fallback senza C');

  console.log('OK: PX+C.user ha priorita\' assoluta ('+successiPxCUser+'/'+generazioniValide+' generazioni), FIXED/AUTO mai mescolati, nessuna regola generica "C compatibile con PX", S/G/V intervengono solo dopo P/C, nessun fallback senza C.');
})().catch(e=>{console.error(e);process.exit(1);});
