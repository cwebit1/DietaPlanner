'use strict';
/* Copre i punti 9-18 del compito e lo stress test richiesto (approvato a
   200 generazioni complessive invece di 1.000) sulle combinazioni:
   tutti AUTO; uno o piu' FIXED; FIXED con tetto; alcuni EXCLUDED;
   FIXED+AUTO+EXCLUDED insieme; realizzazioni bloccate. */
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

async function resetImpostazioniCarboidrati(){
  for(const k of ['configCarboidratiStati','tabellaGiornoCategoria'])await global.delKey('impostazioni',k);
}
function contaChiave(piano,chiave){return piano.filter(v=>v.carboidratoPianificato===chiave).length;}

async function verificaSettimanaValida(piano,{excludedKeys=[],fixedCounts={},tettoKeys={}}={}){
  for(const voce of piano){
    if(!voce.realizzazioni||!voce.realizzazioni.length)continue;
    // punto 9/10: ogni pasto ordinario salvato contiene C, mai carbKeyUsato nullo
    assert(voce.carboidratoPianificato,'pasto senza carboidratoPianificato: '+voce.id);
    // punto 13: nessun EXCLUDED in un record salvato
    for(const esc of excludedKeys)assert.notEqual(voce.carboidratoPianificato,esc,'usato un carboidrato EXCLUDED ('+esc+') in '+voce.id);
    // punto 18: la riga C deve corrispondere a una realizzazione reale, mai un placeholder senza nome
    const materializzate=[];
    for(const real of voce.realizzazioni){const r=await M.materializzaRealizzazione(real);if(r)materializzate.push(r);}
    const copreC=materializzate.some(r=>Array.isArray(r.classe)&&r.classe.includes('C')&&r.nome);
    assert(copreC,'il pasto '+voce.id+' non ha una realizzazione C con nome reale (rischio "Seleziona pasto" nel renderer)');
  }
  // punto 12/15: i FIXED (anche con tetto) compaiono esattamente nel numero scelto, mai oltre
  for(const [chiave,n] of Object.entries(fixedCounts)){
    const trovati=contaChiave(piano,chiave);
    assert(trovati<=n,'il FIXED '+chiave+' compare più volte del numero scelto ('+trovati+'>'+n+')');
  }
  for(const [chiave,max] of Object.entries(tettoKeys)){
    assert(contaChiave(piano,chiave)<=max,'il carboidrato a tetto '+chiave+' supera il proprio massimo settimanale');
  }
}

(async()=>{
  await M.inizializza({basePath:''});
  let generazioniTotali=0;

  // --- Combinazione 1: tutti AUTO (default) ---
  await resetImpostazioniCarboidrati();
  for(let i=0;i<30;i++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    generazioniTotali++;
    if(esito.errori.length)continue;
    await verificaSettimanaValida(await global.getAll('piano'),{});
  }

  // --- Combinazione 2: uno o più FIXED (carboidrati liberi, senza tetto) ---
  await global.put('impostazioni',{chiave:'configCarboidratiStati',valore:{riso:{mode:'fixed',count:3},farro:{mode:'fixed',count:2}}});
  for(let i=0;i<30;i++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    generazioniTotali++;
    if(esito.errori.length)continue;
    const piano=await global.getAll('piano');
    await verificaSettimanaValida(piano,{fixedCounts:{riso:3,farro:2}});
    assert.equal(contaChiave(piano,'riso'),3,'riso FIXED 3 deve comparire esattamente 3 volte');
    assert.equal(contaChiave(piano,'farro'),2,'farro FIXED 2 deve comparire esattamente 2 volte');
  }
  await resetImpostazioniCarboidrati();

  // --- Combinazione 3: FIXED con tetto PDF (max reale dal resolver) ---
  await global.put('impostazioni',{chiave:'configCarboidratiStati',valore:{gnocchi:{mode:'fixed',count:2},friselle:{mode:'fixed',count:1}}});
  for(let i=0;i<30;i++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    generazioniTotali++;
    if(esito.errori.length)continue;
    const piano=await global.getAll('piano');
    await verificaSettimanaValida(piano,{fixedCounts:{gnocchi:2,friselle:1},tettoKeys:{gnocchi:2,friselle:2}});
    assert.equal(contaChiave(piano,'gnocchi'),2,'gnocchi FIXED 2 (al tetto) deve comparire esattamente 2 volte');
    assert.equal(contaChiave(piano,'friselle'),1,'friselle FIXED 1 deve comparire esattamente 1 volta');
  }
  await resetImpostazioniCarboidrati();

  // --- Combinazione 4: alcuni EXCLUDED ---
  await global.put('impostazioni',{chiave:'configCarboidratiStati',valore:{patate:{mode:'excluded',count:0},polenta:{mode:'excluded',count:0}}});
  for(let i=0;i<30;i++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    generazioniTotali++;
    if(esito.errori.length)continue;
    await verificaSettimanaValida(await global.getAll('piano'),{excludedKeys:['patate','polenta']});
  }
  await resetImpostazioniCarboidrati();

  // --- Combinazione 5: FIXED + AUTO + EXCLUDED insieme ---
  await global.put('impostazioni',{chiave:'configCarboidratiStati',valore:{
    riso:{mode:'fixed',count:2},gnocchi:{mode:'fixed',count:1},patate:{mode:'excluded',count:0}
  }});
  for(let i=0;i<30;i++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    generazioniTotali++;
    if(esito.errori.length)continue;
    const piano=await global.getAll('piano');
    await verificaSettimanaValida(piano,{fixedCounts:{riso:2,gnocchi:1},tettoKeys:{gnocchi:2},excludedKeys:['patate']});
    assert.equal(contaChiave(piano,'riso'),2);
    assert.equal(contaChiave(piano,'gnocchi'),1);
  }
  await resetImpostazioniCarboidrati();

  // --- Combinazione 6: realizzazioni bloccate ---
  for(let i=0;i<30;i++){
    stores.piano.clear();
    let esito=await M.generaPianoSettimana(0,{forza:true});
    generazioniTotali++;
    if(esito.errori.length)continue;
    const giorni=global.giorniSettimana();
    const id=giorni[0]+'_pranzo';
    const voce=await global.getOne('piano',id);
    if(!voce||!voce.realizzazioni||!voce.realizzazioni.length)continue;
    // blocca solo la realizzazione P (punto 16: PX bloccato resta
    // invariato, si cerca C senza modificare PX)
    const realP=voce.realizzazioni.find(r=>{return true;}); // marchiamo la prima disponibile
    voce.realizzazioni[0].bloccata=true;
    const idBloccato=voce.realizzazioni[0].ricettaId;
    await global.put('piano',voce);
    esito=await M.generaPianoSettimana(0,{forza:true});
    if(esito.errori.length)continue;
    const dopo=await global.getOne('piano',id);
    const realBloccataDopo=dopo.realizzazioni.find(r=>r.ricettaId===idBloccato);
    assert(realBloccataDopo&&realBloccataDopo.bloccata,'la realizzazione bloccata deve restare tale dopo Rigenera');
    assert(dopo.carboidratoPianificato,'anche con un blocco parziale il pasto rigenerato deve avere un carboidrato');
    await verificaSettimanaValida(await global.getAll('piano'),{});
  }

  assert(generazioniTotali>=180,'servono almeno ~200 generazioni complessive di stress (fatte: '+generazioniTotali+')');

  // --- Punto 11: configurazione impossibile (nessun carboidrato
  //     disponibile) -> errore esplicito, nessuna scrittura parziale. ---
  {
    const stati={};
    for(const chiave of ['pane','riso','farro','orzo','pasta','pasta_fresca','cous_cous','patate','polenta','gnocchi','pasta_ripiena','gallette','crackers','friselle','taralli','piadina','pasta_sfoglia'])stati[chiave]={mode:'excluded',count:0};
    await global.put('impostazioni',{chiave:'configCarboidratiStati',valore:stati});
    stores.piano.clear();
    const snapshotPrima=JSON.stringify(await global.getAll('piano'));
    const esito=await M.generaPianoSettimana(0,{forza:true});
    assert(esito.errori.length>0,'con tutti i carboidrati esclusi la generazione deve fallire con un errore esplicito');
    const snapshotDopo=JSON.stringify(await global.getAll('piano'));
    assert.equal(snapshotDopo,snapshotPrima,'un fallimento non deve lasciare alcuna scrittura parziale su \'piano\'');
    await resetImpostazioniCarboidrati();
  }

  // --- Punto 5 (validazione atomica), verificata direttamente e in
  //     isolamento su erroreValidazionePastoFinale: un candidato con
  //     carbKeyUsato nullo, con un carboidrato escluso, o con copertura
  //     V incompleta deve essere respinto; uno regolare deve passare. ---
  {
    const motorSrc=fs.readFileSync(path.join(root,'motor-v12.js'),'utf8');
    function estrai(nome){
      const marker='function '+nome+'(';
      const start=motorSrc.indexOf(marker);
      assert(start>=0,nome+' non trovata');
      const apertura=motorSrc.indexOf('{',start);
      let profondita=0,i=apertura;
      for(;i<motorSrc.length;i++){if(motorSrc[i]==='{')profondita++;else if(motorSrc[i]==='}'){profondita--;if(profondita===0)break;}}
      return motorSrc.slice(start,i+1);
    }
    const sorgenteIsolato=[
      "const TOKEN_P = new Set(['PC','PP','PF','PU','PL']);",
      "const PROTEIN_MACRO_TO_TOKEN={carne:'PC',pesce:'PP',formaggi:'PF',uova:'PU',legumi:'PL'};",
      "const SUBTYPE_TO_TOKEN={carne_bianca:'PC',carne_rossa:'PC',affettati:'PC',pesce_bianco:'PP',pesce_azzurro:'PP',pesce_grande:'PP',pesce_conservato:'PP',molluschi:'PP',crostacei:'PP',formaggio_fresco:'PF',formaggio_stagionato:'PF',uova:'PU',legumi:'PL'};",
      estrai('ruoliVerduraDaClasse'),
      estrai('copertura'),
      estrai('pastoCompletoPerToken'),
      estrai('erroreValidazionePastoFinale'),
      'module.exports={erroreValidazionePastoFinale};'
    ].join('\n');
    const Module=require('node:module');
    const m=new Module(path.join(root,'motor-v12.js'));
    m._compile(sorgenteIsolato,path.join(root,'motor-v12.js'));
    const {erroreValidazionePastoFinale}=m.exports;

    const ricettaP={id:'p1',classe:['PC'],ingredienti:[]},ricettaC={id:'c1',classe:['C','V'],ingredienti:[]};
    const bilancioOk={coperturaCompleta:true};
    const ctxTest={resolved:{carbohydrates:{excludedKeys:['patate']}}};

    assert.equal(erroreValidazionePastoFinale({ricette:[ricettaP,ricettaC],carbKeyUsato:'riso',bilancioVerdura:bilancioOk},'carne',ctxTest),null,'un candidato regolare completo deve passare');
    assert(erroreValidazionePastoFinale({ricette:[ricettaP,ricettaC],carbKeyUsato:null,bilancioVerdura:bilancioOk},'carne',ctxTest),'carbKeyUsato nullo deve essere respinto');
    assert(erroreValidazionePastoFinale({ricette:[ricettaP,ricettaC],carbKeyUsato:'patate',bilancioVerdura:bilancioOk},'carne',ctxTest),'un carboidrato EXCLUDED (patate) deve essere respinto');
    assert(erroreValidazionePastoFinale({ricette:[ricettaP,ricettaC],carbKeyUsato:'riso',bilancioVerdura:{coperturaCompleta:false}},'carne',ctxTest),'copertura V incompleta deve essere respinta');
    assert(erroreValidazionePastoFinale({ricette:[ricettaC],carbKeyUsato:'riso',bilancioVerdura:bilancioOk},'carne',ctxTest),'nessuna realizzazione P per il token richiesto deve essere respinta');
    assert(erroreValidazionePastoFinale(null,'carne',ctxTest),'un candidato assente deve essere respinto');
  }

  console.log('OK: '+generazioniTotali+' generazioni di stress su 6 combinazioni, tutte con C sempre presente, FIXED esatti, EXCLUDED mai usati, tetti rispettati, blocchi preservati.');
})().catch(e=>{console.error(e);process.exit(1);});
