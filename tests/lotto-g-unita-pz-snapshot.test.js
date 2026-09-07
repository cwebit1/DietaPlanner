'use strict';
/* Test mirato: contratto unico quantita'/unita'/grammi per gli ingredienti
   a pezzi lungo l'intera cascata (catalogo -> ricetta compilata ->
   snapshot -> visualizzazione -> lista spesa -> scarico inventario).
   Casi rappresentativi: Uova (2 pz = 120 g) e Friselle (2 pz = 50 g).

   Contratto definitivo (nessuna tabella hardcoded nome->peso, l'unita'
   deriva solo dai metadati canonici del catalogo):
   - "quantita": valore nell'unita' NATIVA dell'ingrediente (pezzi per
     Uova/Friselle, grammi per gli altri).
   - "unita": 'pz' se meta.unitaPorzione==='pezzi', altrimenti 'g'.
   - "grammi": equivalente interno (grammiDaQuantita), usato SOLO per
     nutrizione/confronti/aggregazioni pesate - mai mostrato come tale
     all'utente per un ingrediente a pezzi.
   - "pesoPezzo"/variante: fattore di conversione derivato dal catalogo
     (pesoPorzioneGrammi/porzione), mai un nome->peso hardcoded.
   - porzioneColazione (variante): stesso contratto, sempre grammi-
     equivalenti internamente (nutrizioneSingoloComponenteColazione lavora
     in grammi), la UI riconverte a pezzi solo alla formattazione finale.

   Difetti riprodotti e corretti in questo intervento (index.html):
   - scalaInventarioPerRicetta()/annullaScalaInventarioPerRicetta()
     scalavano/restituivano l'inventario con "ing.quantita" grezzo, senza
     controllare "ing.unita": per un ingrediente a pezzi questo scalava
     l'inventario (sempre in grammi) del solo conteggio-pezzi (es. "2"
     invece di "120 g" per le Uova). Percorso live confermato
     (voce.motoreNuovo, consumo pasto). Corretto riusando lo stesso
     pattern gia' corretto in aggiornaListaSpesaAutomatica.
   - apriModalDettaglioRicetta() passava "i.quantita" grezzo a
     formattaQuantita() (che si aspetta sempre grammi): per le Uova questo
     avrebbe mostrato "0 pz" invece di "2 pz". Corretto con lo stesso
     pattern.

   Percorsi gia' corretti, non modificati:
   - aggiornaListaSpesaAutomatica() (ramo motoreNuovo): usa gia' "ing.grammi"
     per gli ingredienti a pezzi, con lo stesso commento esplicito del
     contratto.
   - preparaIngredientiDettagliati()/quantitaConfigurata() (motor-v12.js,
     corretti in un intervento precedente): "quantita" nativa, "grammi"
     equivalente, "unita" da meta.unitaPorzione - generico, nessun nome
     hardcoded.
   - snapshotRealizzazione(): copia direttamente ricetta.ingredienti senza
     trasformazioni.

   Scoperta rilevante: nessuna ricetta di db-ricette.json contiene mai
   "Friselle" come ingrediente (verificato con ricerca esaustiva) - il
   motore sequenziale non puo' quindi selezionarla realmente in un pasto
   generato oggi (CARB_KEY_BY_NAME['friselle'] resta un carboidrato
   "riconosciuto" ma orfano nel catalogo ricette). Non essendo autorizzata
   la modifica delle ricette in questo intervento, il meccanismo per
   Friselle e' verificato qui compilando un template SINTETICO in memoria
   (mai scritto su disco/ricette) con la stessa, identica pipeline
   (generaCombinazioni + compilaRicetta) usata per ogni ricetta reale -
   nessun secondo algoritmo, stessa funzione di produzione. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const indexSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
const stores={};
function resetStores(){
  for(const name of ['ingredienti','varianti','ricette','impostazioni','piano','consumoGiorno','inventario'])stores[name]=new Map();
}
resetStores();
global.getAll=async name=>[...(stores[name]||new Map()).values()].map(value=>structuredClone(value));
global.getOne=async(name,key)=>{const value=(stores[name]||new Map()).get(key);return value===undefined?null:structuredClone(value);};
global.put=async(name,value)=>{(stores[name]||new Map()).set(value.id??value.chiave,structuredClone(value));return value;};
global.delKey=async(name,key)=>(stores[name]||new Map()).delete(key);
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).split('?')[0]),'utf8'))});
global.todayISO=()=>'2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

/* Estrae il corpo di una funzione con nome da index.html, verbatim - mai
   una riscrittura. Usato per eseguire (non reimplementare) la logica
   reale di lista spesa/inventario, come richiesto: "non copiare la loro
   logica nel test; non creare un secondo algoritmo". */
function estraiFunzione(nome){
  const inizio=indexSource.indexOf('async function '+nome+'(');
  assert(inizio>=0,'funzione non trovata in index.html: '+nome);
  const fine=indexSource.indexOf('\n}\n',inizio);
  return indexSource.slice(inizio,fine+2);
}

(async()=>{
  await M.inizializza({basePath:''});

  /* ============ 1. Uova, pasto principale: quantita=2, unita='pz', grammi=120 ============ */
  {
    const ricette=M.getRicette().filter(r=>r.recipeModelId===11); // template "PU" puro: solo Uova
    let trovato=0;
    for(const r of ricette){
      const ing=r.ingredienti.find(i=>i.nome==='Uova');
      if(!ing)continue;
      trovato++;
      assert.equal(ing.quantita,2,'Uova pasto principale: quantita nativa 2 (pz)');
      assert.equal(ing.unita,'pz','Uova pasto principale: unita pz');
      assert.equal(ing.grammi,120,'Uova pasto principale: equivalente interno 120 g');
    }
    assert(trovato>0,'almeno una ricetta compilata deve contenere Uova');
  }

  /* ============ 2. Uova, colazione: contesto nativo 1 pz, equivalente interno 60 g, formattazione finale "1 pz" ============ */
  {
    const varianti=await getAll('varianti');
    const uova=varianti.find(v=>v.nome==='Uova');
    assert.equal(uova.colazioneGruppo,'proteine','Uova idonea alla colazione (ancheColazione, gia'+String.fromCharCode(39)+' verificato in un intervento precedente)');
    assert.equal(uova.porzioneColazione,60,'Uova colazione: equivalente interno 60 g (1 pz nativo * pesoPezzo 60)');
    assert.equal(uova.unitaPezzo,true,'Uova resta a pezzi anche in colazione');
    const pzMostrati=Math.round(uova.porzioneColazione/uova.pesoPezzo); // stessa formula di formattaQuantita()
    assert.equal(pzMostrati,1,'formattazione finale attesa: 1 pz, mai i 60 g interni');
  }

  /* ============ 3. Friselle: quantita=2, unita='pz', grammi=50, formattazione finale "2 pz" ============
     Nessuna ricetta reale contiene Friselle (vedi nota in testa al file):
     stessa pipeline reale (generaCombinazioni + compilaRicetta), template
     sintetico solo in memoria. */
  let friselleCompilata;
  {
    const templateFriselle={id:'sintetico-friselle',gruppi:[
      {testo1:'',categoria:'C',ingredienti:[{nome:'Friselle',stack:1,roll:1}],cotture:[],testo2:'',mostraNomi:false}
    ],classe:['C']};
    const combos=M.generaCombinazioni(templateFriselle);
    assert(combos.length>0,'il template sintetico deve generare almeno una combinazione');
    friselleCompilata=await M.compilaRicetta(templateFriselle,combos[0],0);
    const ing=friselleCompilata.ingredienti.find(i=>i.nome==='Friselle');
    assert(ing,'la ricetta compilata deve contenere Friselle');
    assert.equal(ing.quantita,2,'Friselle: quantita nativa 2 (pz)');
    assert.equal(ing.unita,'pz','Friselle: unita pz');
    assert.equal(ing.grammi,50,'Friselle: equivalente interno 50 g');
    const varianti=await getAll('varianti');
    const vFriselle=varianti.find(v=>v.nome==='Friselle');
    const pzMostrati=Math.round(ing.grammi/vFriselle.pesoPezzo); // stessa formula di formattaQuantita()
    assert.equal(pzMostrati,2,'formattazione finale attesa: 2 pz, mai i 50 g interni');
  }

  /* ============ 4. snapshotRealizzazione(): Uova e Friselle conservano quantita/unita/grammi senza trasformazioni ============ */
  {
    const ricettaUova=M.getRicette().find(r=>r.recipeModelId===11&&r.ingredienti.some(i=>i.nome==='Uova'));
    const snapUova=M.snapshotRealizzazione({ricettaId:ricettaUova.id},ricettaUova);
    const ingUova=snapUova.ingredientiEffettivi.find(i=>i.nome==='Uova');
    assert.equal(ingUova.quantita,2);assert.equal(ingUova.unita,'pz');assert.equal(ingUova.grammi,120);

    const snapFriselle=M.snapshotRealizzazione({ricettaId:'sintetico-friselle'},friselleCompilata);
    const ingFriselle=snapFriselle.ingredientiEffettivi.find(i=>i.nome==='Friselle');
    assert.equal(ingFriselle.quantita,2);assert.equal(ingFriselle.unita,'pz');assert.equal(ingFriselle.grammi,50);
  }

  /* ============ 5. Aggregazione lista spesa: due porzioni da 2 Friselle = 4 pz equivalenti (100 g), non 100 pz ============
     Esegue la formula REALE estratta da aggiornaListaSpesaAutomatica
     (ramo motoreNuovo), non una sua reimplementazione. */
  {
    const corpo=estraiFunzione('aggiornaListaSpesaAutomatica');
    assert(corpo.includes("ing.unita==='pz'"),'la formula di aggregazione deve distinguere per unita, non dedurla dal nome');
    assert(!/['"]friselle['"]|['"]uova['"]/i.test(corpo),'nessuna tabella hardcoded nome->peso nella funzione di aggregazione');
    // estrae ed esegue la sola espressione di conversione, verbatim
    const match=corpo.match(/const quantitaInventario=ing\.unita==='pz'\s*\?\s*\(Number\(ing\.grammi\)\|\|Number\(ing\.quantita\)\|\|0\)\s*:\s*\(Number\(ing\.quantita\)\|\|0\);/);
    assert(match,'espressione di conversione non trovata testualmente in aggiornaListaSpesaAutomatica');
    const calcolaQuantitaInventario=new Function('ing',match[0]+'\nreturn quantitaInventario;');
    let fabbisogno=0;
    for(let i=0;i<2;i++){ // due porzioni, ciascuna con 2 pz di Friselle (grammi=50)
      fabbisogno+=calcolaQuantitaInventario({unita:'pz',quantita:2,grammi:50});
    }
    assert.equal(fabbisogno,100,'due porzioni da 2 Friselle devono aggregare a 100 g (= 4 pz equivalenti)');
    const vFriselle=(await getAll('varianti')).find(v=>v.nome==='Friselle');
    assert.equal(Math.round(fabbisogno/vFriselle.pesoPezzo),4,'100 g equivalgono a 4 pz, mai 100 pz');
  }

  /* ============ 6. Scarico inventario: una porzione da 2 Friselle sottrae l'equivalente corretto (50 g), non 2 g e non 50 pezzi ============
     Esegue la funzione REALE scalaInventarioPerRicetta(), estratta ed
     eseguita verbatim (stesso harness getAll/getOne/put gia' disponibile),
     non reimplementata. */
  {
    const vFriselle=(await getAll('varianti')).find(v=>v.nome==='Friselle');
    await put('inventario',{id:'inv-friselle-test',variantId:vFriselle.id,zona:'dispensa',quantita:200,stato:'disponibile',dataAcquisto:'2026-08-25'});

    const corpoScala=estraiFunzione('scalaInventarioPerRicetta');
    assert(corpoScala.includes("ing.unita==='pz'"),'scalaInventarioPerRicetta deve distinguere per unita, non dedurla dal nome');
    // getAll/put/todayISO sono gia' globali in questo harness: la funzione
    // estratta li risolve automaticamente, nessun wrapper che ne alteri la logica.
    const scalaInventarioPerRicetta=new Function(corpoScala+'\nreturn scalaInventarioPerRicetta;')();

    const ricettaFriselleUnaPorzione={porzioni:1,ingredienti:[{
      variantId:vFriselle.id,nome:'Friselle',quantita:2,unita:'pz',grammi:50,nonRichiedeInventario:false
    }]};
    await scalaInventarioPerRicetta(ricettaFriselleUnaPorzione,1);

    const dopo=(await getAll('inventario')).find(i=>i.id==='inv-friselle-test');
    assert.equal(dopo.quantita,150,'2 Friselle (50 g) sottratti da 200 g devono lasciare 150 g, non 198 g (2g sottratti per errore) ne\' -50\u00a0g/50 pezzi sottratti per errore');
  }

  console.log('lotto G unita pz snapshot: ok');
})().catch(error=>{console.error(error);process.exit(1);});
