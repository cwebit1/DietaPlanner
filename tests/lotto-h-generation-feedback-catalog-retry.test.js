'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function bloccoTra(inizio,fine){
  const da=index.indexOf(inizio);
  const a=index.indexOf(fine,da);
  assert(da>=0&&a>da,'blocco non trovato: '+inizio);
  return index.slice(da,a);
}

for(const [inizio,fine] of [
  ["f.querySelector('#btnResettaMenu').addEventListener", "f.querySelector('#btnRigeneraMenu').addEventListener"],
  ["f.querySelector('#btnRigeneraMenu').addEventListener", "f.querySelector('#btnSalvaMenu').addEventListener"]
]){
  const blocco=bloccoTra(inizio,fine);
  assert(blocco.includes('const esito=await generaPianoSettimana'));
  assert(blocco.includes('await mostraFeedbackGenerazioneMenu(esito)'));
}

const feedback=bloccoTra('async function mostraFeedbackGenerazioneMenu(esito){','async function generaMenuDaConfigSet');
assert(feedback.includes('Array.isArray(esito.generati)'));
assert(feedback.includes('esito.generati.length'));
assert(feedback.includes("esito.errori.join(' ')"));
assert(feedback.includes("await avviso('Nessun pasto generato. '+dettaglio)"));

const statoVuoto=bloccoTra("if(!tutteRicette.length){",'const giorniSett = giorniSettimana(0);');
assert(statoVuoto.includes('btnBenvenutoRiprovaRicettario'));
assert(statoVuoto.includes('riprovaInizializzazioneRicettario'));
assert(!statoVuoto.includes('ricette.json'));
assert(!index.includes('id="btnModalImportaRicette"'));
assert(index.includes('id="btnModalRiprovaRicettario"'));

const riprova=bloccoTra('async function riprovaInizializzazioneRicettario(btn){',"document.getElementById('btnModalRiprovaRicettario')");
assert(riprova.includes("DietaPlannerMotorV12.inizializza({basePath:''})"));
assert(riprova.includes('!esito.concrete||!ricette.length'));
assert(riprova.includes('Ricettario ancora non disponibile'));
assert(riprova.includes('await renderPiano()'));

(async()=>{
  const avvisiGenerazione=[];
  let renderMenuCount=0;
  const feedbackContext={
    renderMenuSettimanale:async()=>{renderMenuCount++;},
    avviso:async msg=>avvisiGenerazione.push(msg)
  };
  vm.runInNewContext(feedback+'\nthis.feedback=mostraFeedbackGenerazioneMenu;',feedbackContext);
  assert.equal(await feedbackContext.feedback({generati:[{id:'pasto'}],errori:[]}),false);
  assert.equal(renderMenuCount,0);
  assert.deepEqual(avvisiGenerazione,[]);
  assert.equal(await feedbackContext.feedback({generati:[],errori:['Nessuna combinazione per carne.']}),true);
  assert.equal(renderMenuCount,1);
  assert.equal(avvisiGenerazione[0],'Nessun pasto generato. Nessuna combinazione per carne.');
  await assert.rejects(()=>feedbackContext.feedback(null),/risultato valido/);

  const modal={classList:{add:()=>{modal.hidden=true;}}};
  const avvisi=[];
  let renderPianoCount=0;
  const context={
    console,
    document:{getElementById:()=>modal,contains:()=>true},
    DietaPlannerMotorV12:{inizializza:async()=>({concrete:0})},
    getAll:async()=>[],
    avviso:async msg=>avvisi.push(msg),
    renderVersioneHeader:async()=>{},
    renderPiano:async()=>{renderPianoCount++;}
  };
  vm.runInNewContext(riprova+'\nthis.retry=riprovaInizializzazioneRicettario;',context);
  const btn={textContent:'Riprova',disabled:false};
  assert.equal(await context.retry(btn),false);
  assert.match(avvisi[0],/Ricettario ancora non disponibile/);
  assert.equal(renderPianoCount,0);
  assert.equal(btn.textContent,'Riprova');
  assert.equal(btn.disabled,false);

  context.DietaPlannerMotorV12.inizializza=async()=>({concrete:540});
  context.getAll=async()=>[{id:'ricetta'}];
  assert.equal(await context.retry(btn),true);
  assert.equal(renderPianoCount,1);
  assert.equal(modal.hidden,true);
  console.log('lotto H feedback generazione e retry ricettario: ok');
})().catch(error=>{console.error(error);process.exit(1);});
