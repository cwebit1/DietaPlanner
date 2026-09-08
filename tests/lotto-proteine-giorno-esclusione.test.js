'use strict';
/* Test mirato: regola di Cwe — "Quando una categoria proteica è stata
   scelta per un pasto, deve essere esclusa dal pool del secondo pasto
   dello stesso giorno" (default: 2 fonti proteiche/giorno). Genera una
   settimana reale con generaPianoSettimana() (API pubblica, casualità
   controllata via tentativi limitati) e legge le categorie
   EFFETTIVAMENTE salvate dal motore nello store 'piano'
   (voce.categoriaTarget) — mai una ricostruzione con una copia della
   logica di opzioniProteinaPerSlot. */
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
global.todayISO=()=>'2026-08-30';
global.giorniSettimana=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

(async()=>{
  await M.inizializza({basePath:''});
  // Nessuna configAvanzata esplicita: profilo onnivoro predefinito, tutte
  // e 5 le categorie ammesse - pranzo e cena hanno sempre due categorie
  // diverse (regola definitiva di Cwe, nessuna eccezione configurabile).

  let successi=0,violazioni=0;
  for(let tentativo=0;tentativo<10&&successi<3;tentativo++){
    stores.piano.clear();
    const esito=await M.generaPianoSettimana(0,{forza:true});
    if(esito.errori.length)continue;
    successi++;
    const piano=await global.getAll('piano');
    const giorni={};
    for(const voce of piano){
      const giorno=voce.id.slice(0,10);
      giorni[giorno]=giorni[giorno]||[];
      giorni[giorno].push(voce);
    }
    for(const [giorno,voci] of Object.entries(giorni)){
      if(voci.length!==2)continue; // solo giorni con pranzo+cena entrambi presenti
      const [pranzo,cena]=voci.sort((a,b)=>a.id.localeCompare(b.id)).map(v=>v);
      // id = 'YYYY-MM-DD_pranzo'/'YYYY-MM-DD_cena': ordine alfabetico mette 'cena' prima di 'pranzo' -> individua per suffisso
      const p=voci.find(v=>v.id.endsWith('_pranzo')),c=voci.find(v=>v.id.endsWith('_cena'));
      if(!p||!c)continue;
      if(p.categoriaTarget===c.categoriaTarget){
        violazioni++;
        console.log('violazione: stessa categoria proteica per pranzo e cena',giorno,':',p.categoriaTarget);
      }
    }
  }
  assert(successi>0,'nessuna settimana valida generata in 10 tentativi');
  assert.equal(violazioni,0,'per ogni giorno generato, categoriaTarget pranzo deve sempre differire da categoriaTarget cena');

  /* ============ Caso limite deterministico: allowed.length<=3 (dieta vegana, solo "legumi" ammesso) ============
     Pranzo e cena richiedono sempre due categorie distinte (regola
     definitiva di Cwe, nessuna eccezione configurabile - vedi
     tests/lotto-proteine-autocompletamento.test.js) ma con il profilo
     vegano ne esiste una sola disponibile: deve fallire con un errore
     esplicito, MAI produrre un piano che riapra il pool e ripeta
     "legumi" due volte nello stesso giorno (era esattamente il difetto:
     il vecchio codice riapriva il pool ignorando l'esclusione quando le
     categorie ammesse erano tre o meno). */
  {
    stores.piano.clear();
    await global.put('impostazioni',{chiave:'configAvanzata',valore:{dietProfile:'vegano'}});
    const esitoVegano=await M.generaPianoSettimana(0,{forza:true});
    const pianoVegano=await global.getAll('piano');
    const giorniVegano={};
    for(const voce of pianoVegano){
      const giorno=voce.id.slice(0,10);
      giorniVegano[giorno]=giorniVegano[giorno]||[];
      giorniVegano[giorno].push(voce);
    }
    let duplicatoVegano=false;
    for(const voci of Object.values(giorniVegano)){
      const p=voci.find(v=>v.id.endsWith('_pranzo')),c=voci.find(v=>v.id.endsWith('_cena'));
      if(p&&c&&p.categoriaTarget===c.categoriaTarget)duplicatoVegano=true;
    }
    assert(!duplicatoVegano,'con una sola categoria ammessa, il motore non deve MAI produrre un giorno con la stessa categoria ripetuta a pranzo e cena');
    assert(esitoVegano.errori.length>0,'con una sola categoria ammessa e 2 fonti/giorno richieste (matematicamente infattibile), la generazione deve fallire con un errore esplicito, mai un fallback silenzioso che riapre il pool');
  }

  console.log('lotto proteine giorno esclusione: '+successi+' settimane valide, 0 violazioni - ok');
})().catch(error=>{console.error(error);process.exit(1);});
