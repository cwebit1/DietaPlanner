'use strict';
/* Regressione (introdotta dal commit 8d2be4e, "Pasto concluso su giorni
   passati, ricette a piu ruoli scritte una sola volta"): righeVsgUniche()
   aveva sostituito il rendering C/P/V con una mappa generica
   ICONE_VSG={C:'🍞',P:'🥩',V:'🥬'}, mostrando '🥩' per QUALSIASI gruppo
   proteico (pesce, uova, legumi, formaggi...) invece della sua icona
   vera. La funzione corretta iconaGruppoProteico(gruppoProteico) esisteva
   gia' e non era mai stata rimossa - solo bypassata da questo punto.

   Questo test estrae ed esegue davvero le funzioni coinvolte da
   index.html (non solo un controllo di stringa sul sorgente), per
   verificare il comportamento funzionale, non solo la sua presenza. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

/* Estrae il corpo di "function NOME(...){ ... }" bilanciando le graffe,
   cosi' non dipende dalla formattazione esatta ne' si rompe per un
   futuro refactor di poche righe. */
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
  const re=new RegExp('const '+nome+'=\\{[^}]*\\};');
  const m=html.match(re);
  assert(m,'costante non trovata nel sorgente: '+nome);
  return m[0];
}

const sorgente=[
  estraiFunzione('iconaGruppoProteico'),
  estraiFunzione('classiVsgUi'),
  estraiFunzione('ricettaCopreRigaVsg'),
  estraiConst('ICONE_VSG'),
  estraiFunzione('righeVsgUniche'),
  estraiFunzione('iconeRigaVsg'),
  estraiFunzione('iconaPastoDaVoce'),
  'module.exports={iconaGruppoProteico,righeVsgUniche,iconeRigaVsg,iconaPastoDaVoce};'
].join('\n');

const Module=require('node:module');
const m=new Module(path.join(root,'index.html'));
m._compile(sorgente,path.join(root,'index.html'));
const {iconaGruppoProteico,righeVsgUniche,iconeRigaVsg,iconaPastoDaVoce}=m.exports;

// --- 1) iconaGruppoProteico: ogni gruppo proteico richiesto dal task ---
const attese={
  carne_bianca:'🍗', carne_rossa:'🥩', affettati:'🥓',
  pesce_bianco:'🐟', pesce_azzurro:'🐠', pesce_conservato:'🥫',
  molluschi:'🦑', crostacei:'🦐',
  formaggio_fresco:'🧀', formaggio_stagionato:'🧀',
  uova:'🥚', legumi:'🫘'
};
for(const [gruppo,attesa] of Object.entries(attese)){
  assert.equal(iconaGruppoProteico(gruppo),attesa,'icona errata per '+gruppo);
}
assert.equal(iconaGruppoProteico(undefined),'','gruppo proteico assente: nessuna icona, mai un default');
assert.equal(iconaGruppoProteico('qualcosa_di_sconosciuto'),'','gruppo non riconosciuto: nessuna icona, mai un default alimentare');

function ricetta(id,nome,classe,gruppoProteico){
  return {id,nome,classe,gruppoProteico};
}

// --- 2) riga solo P: usa iconaGruppoProteico, non un simbolo fisso ---
for(const [gruppo,attesa] of Object.entries(attese)){
  const righe=righeVsgUniche([ricetta('r1','Proteina test',['PP'],gruppo)]);
  assert.equal(righe.length,1,'una ricetta P deve generare una sola riga');
  assert.equal(righe[0].gruppoProteico,gruppo,'la riga deve portare con se\' il gruppo proteico');
  assert.equal(iconeRigaVsg(righe[0]),attesa,'icona di riga errata per '+gruppo);
}

// --- 3) C+P: due icone corrette, una sola riga (pesce, poi uova) ---
{
  const righe=righeVsgUniche([ricetta('combo1','Riso con Salmone',['C','PF'],'pesce_azzurro')]);
  assert.equal(righe.length,1,'C+P deve restare una sola riga');
  assert.deepEqual(righe[0].tipi,['C','P']);
  assert.equal(iconeRigaVsg(righe[0]),'🍞🐠','C+P (pesce azzurro) deve mostrare 🍞🐠');
}
{
  const righe=righeVsgUniche([ricetta('combo2','Riso con Uova',['C','PU'],'uova')]);
  assert.equal(righe.length,1);
  assert.equal(iconeRigaVsg(righe[0]),'🍞🥚','C+P (uova) deve mostrare 🍞🥚');
}

// --- 4) P+V: due icone corrette, una sola riga (legumi) ---
{
  const righe=righeVsgUniche([ricetta('combo3','Insalata di Legumi',['PL','V'],'legumi')]);
  assert.equal(righe.length,1,'P+V deve restare una sola riga');
  assert.deepEqual(righe[0].tipi,['P','V']);
  assert.equal(iconeRigaVsg(righe[0]),'🫘🥬','P+V (legumi) deve mostrare 🫘🥬');
}

// --- 5) due realizzazioni con gruppi proteici DIVERSI e reali: nessuna
//        riduzione arbitraria al primo trovato, righe distinte, icone
//        entrambe corrette ---
{
  const righe=righeVsgUniche([
    ricetta('rA','Bresaola',['PC'],'affettati'),
    ricetta('rB','Uova sode',['PU'],'uova')
  ]);
  assert.equal(righe.length,2,'due proteine reali distinte devono restare due righe distinte');
  const icone=righe.map(r=>iconeRigaVsg(r)).sort();
  assert.deepEqual(icone,['🥓','🥚'].sort(),'entrambe le proteine devono avere la propria icona corretta, nessuna persa');
}

// --- 6) pasto senza proteina: nessun '🥩' di default ---
{
  const righe=righeVsgUniche([ricetta('soloC','Solo pasta',['C'],null)]);
  righe.push({id:null,nome:null,tipi:['P']}); // ruolo P non coperto, come fa il renderer reale
  for(const r of righe)assert(!iconeRigaVsg(r).includes('🥩'),'un pasto senza proteina non deve mai mostrare 🥩 come default');
}

// --- 7) calendario storico: stesso gruppo proteico, stessa icona di Pasto/Programmazione ---
{
  const voceNuova={motoreNuovo:true,consumato:true,realizzazioni:[{gruppoProteico:'pesce_bianco'}]};
  const {icona}=iconaPastoDaVoce(voceNuova,{});
  assert.equal(icona,'🐟','il calendario deve mostrare la stessa icona di Pasto/Programmazione per lo stesso gruppo proteico');
  const righeEquivalenti=righeVsgUniche([ricetta('eq','Pesce',['PF'],'pesce_bianco')]);
  assert.equal(iconeRigaVsg(righeEquivalenti.find(r=>r.tipi.includes('P'))),icona,'coerenza fra le tre viste per lo stesso gruppo proteico');
}

// --- 8) calendario: due gruppi proteici reali, nessuna duplicazione, ordine stabile ---
{
  const voce={motoreNuovo:true,consumato:true,realizzazioni:[
    {gruppoProteico:'formaggio_stagionato'},
    {gruppoProteico:'affettati'},
    {gruppoProteico:'formaggio_stagionato'} // duplicato: non deve comparire due volte
  ]};
  const {icona}=iconaPastoDaVoce(voce,{});
  assert.equal(icona,'🧀🥓','due gruppi proteici reali distinti, ordine di comparsa, nessun duplicato');
}

// --- 9) calendario: mai '🍝' come fallback per proteina non riconosciuta o assente ---
{
  const vocePasConsumato={motoreNuovo:true,consumato:false,realizzazioni:[{gruppoProteico:'carne_rossa'}]};
  assert.equal(iconaPastoDaVoce(vocePasConsumato,{}).icona,'','pasto non consumato: nessuna icona (condizione temporale invariata)');
  const voceSenzaGruppo={motoreNuovo:true,consumato:true,realizzazioni:[{gruppoProteico:null}]};
  assert.equal(iconaPastoDaVoce(voceSenzaGruppo,{}).icona,'','nessun gruppo proteico riconosciuto: mai 🍝 come fallback');
  // record legacy (secondoId) senza gruppoProteico sulla ricetta: nessun fallback
  const voceLegacy={modo:'multi',consumato:true,secondoId:'r1'};
  const ricettePerId={r1:{id:'r1',nome:'Piatto vecchio schema'}}; // senza gruppoProteico
  assert.equal(iconaPastoDaVoce(voceLegacy,ricettePerId).icona,'','record legacy senza gruppoProteico: nessun fallback 🍝');
}

// --- 10) record legacy CON gruppoProteico sulla ricetta: funziona ---
{
  const voceLegacy={modo:'multi',consumato:true,secondoId:'r2'};
  const ricettePerId={r2:{id:'r2',nome:'Piatto vecchio schema con proteina',gruppoProteico:'crostacei'}};
  assert.equal(iconaPastoDaVoce(voceLegacy,ricettePerId).icona,'🦐','record legacy con gruppoProteico sulla ricetta deve funzionare');
}
{
  // schema 'unico' legacy (ricettaId invece di secondoId)
  const voceLegacyUnico={modo:'unico',consumato:true,ricettaId:'r3'};
  const ricettePerId={r3:{id:'r3',nome:'Piatto unico',gruppoProteico:'molluschi'}};
  assert.equal(iconaPastoDaVoce(voceLegacyUnico,ricettePerId).icona,'🦑','record legacy modo unico deve funzionare');
}

console.log('OK: icone proteiche corrette in tutte le viste (Pasto, Programmazione, calendario storico), nessun default 🥩/🍝.');
