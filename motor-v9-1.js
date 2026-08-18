
/* =========================================================
   MOTORE MENU DEFINITIVO v9
   Fonte normativa: percorso alimentare + configurazione Set.
   Regole:
   - Set = vincoli HARD quando espliciti.
   - Default pranzo/cena = portate modulari complete.
   - Slot non configurati = rotazione automatica entro frequenze del piano.
   - La rotazione usa i pasti CONSUMATI, non le sole proposte.
   - Verdure: esclusioni HARD; priorità temporale per conservazione;
     preferite più prevalenti ma con anti-ripetizione tra le preferite.
   - Poco tempo = famiglia pane/friselle con priorità obbligatoria.
   ========================================================= */

const FREQUENZE_MOTORE_BIBBIA = {
  carne:    {min:1, target:3, max:3},
  pesce:    {min:2, target:3, max:3},
  formaggi: {min:2, target:3, max:3},
  uova:     {min:1, target:2, max:2},
  // Il percorso dice "2-3 o più": 3 è il target automatico, non un tetto.
  legumi:   {min:2, target:3, max:14}
};

const SOTTOTIPI_MOTORE = {
  carne:    ['carne_bianca','carne_rossa','affettati'],
  pesce:    ['pesce_bianco','pesce_azzurro','pesce_grande','crostacei','molluschi','pesce_conservato'],
  formaggi: ['formaggio_fresco','formaggio_stagionato'],
  uova:     ['uova'],
  legumi:   ['legumi']
};

const CAP_SOTTOTIPI_MOTORE = {
  carne_rossa:1,
  affettati:1,
  pesce_grande:1,
  pesce_conservato:1
};

function motoreMescola(arr){
  const a=(arr||[]).slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function motoreCategoriaDiSottotipo(sottotipo){
  return SOTTOTIPO_A_GRUPPO[sottotipo] || sottotipo || null;
}

function motoreSequenzaSlot(giorni){
  const out=[];
  for(const g of giorni){
    out.push({giorno:g,pasto:'pranzo'});
    out.push({giorno:g,pasto:'cena'});
  }
  return out;
}

function motoreContaCategorie(celle, giorni){
  const out={carne:0,pesce:0,formaggi:0,uova:0,legumi:0};
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const c=celle[g][p].gruppoProteicoLargo;
      if(c && out[c]!==undefined) out[c]++;
    }
  }
  return out;
}

/* Costruisce la griglia proteica.
   Le scelte dell'utente occupano pranzo poi cena nel giorno selezionato.
   Gli slot liberi vengono completati prima ai minimi del percorso, poi ai target.
   Le categorie marcate "gradisci meno" restano ai minimi quando possibile. */
function costruisciGrigliaMotore(giorni, tabellaGiorno, categorieLimitate){
  const celle={};
  const errori=[];
  const limitate=new Set(categorieLimitate||[]);
  for(const g of giorni){
    celle[g]={
      pranzo:{gruppoProteicoLargo:null,origine:null,stato:'libera'},
      cena:{gruppoProteicoLargo:null,origine:null,stato:'libera'}
    };
  }

  // 1) vincoli espliciti Set
  for(const g of giorni){
    const scelte=(tabellaGiorno&&tabellaGiorno[g]) ? tabellaGiorno[g].slice(0,2) : [];
    for(let i=0;i<scelte.length;i++){
      const cat=scelte[i];
      if(!FREQUENZE_MOTORE_BIBBIA[cat]) continue;
      const p=i===0?'pranzo':'cena';
      celle[g][p]={gruppoProteicoLargo:cat,origine:'utente',stato:'definita'};
    }
  }

  let conteggi=motoreContaCategorie(celle,giorni);
  for(const [cat,n] of Object.entries(conteggi)){
    const max=FREQUENZE_MOTORE_BIBBIA[cat].max;
    if(n>max) errori.push(`${cat}: ${n} selezioni, massimo ${max}`);
  }
  if(errori.length) return {celle,errori,conteggi};

  const slot=motoreSequenzaSlot(giorni);
  const liberi=slot.filter(s=>!celle[s.giorno][s.pasto].gruppoProteicoLargo);

  function scegliCategoriaPerSlot(indiceLibero){
    const prevIndex=slot.findIndex(x=>x.giorno===liberi[indiceLibero].giorno && x.pasto===liberi[indiceLibero].pasto)-1;
    const prev=prevIndex>=0 ? celle[slot[prevIndex].giorno][slot[prevIndex].pasto].gruppoProteicoLargo : null;

    // Prima colma i minimi obbligatori
    let candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(cat=>{
      const f=FREQUENZE_MOTORE_BIBBIA[cat];
      return conteggi[cat] < f.min && conteggi[cat] < f.max;
    });

    // Poi tende ai target, evitando le categorie "gradite meno" se esiste alternativa
    if(!candidati.length){
      candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(cat=>{
        const f=FREQUENZE_MOTORE_BIBBIA[cat];
        return conteggi[cat] < f.target && conteggi[cat] < f.max && !limitate.has(cat);
      });
    }
    if(!candidati.length){
      candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(cat=>{
        const f=FREQUENZE_MOTORE_BIBBIA[cat];
        return conteggi[cat] < f.target && conteggi[cat] < f.max;
      });
    }
    // Ultima estensione consentita dal piano: legumi "2-3 o più"
    if(!candidati.length && conteggi.legumi < FREQUENZE_MOTORE_BIBBIA.legumi.max){
      candidati=['legumi'];
    }
    if(!candidati.length) return null;

    // Evita la stessa categoria consecutiva quando possibile.
    const alternati=candidati.filter(c=>c!==prev);
    if(alternati.length) candidati=alternati;

    // Privilegia la categoria col maggior deficit verso il target/minimo.
    let best=-Infinity, pool=[];
    for(const c of candidati){
      const f=FREQUENZE_MOTORE_BIBBIA[c];
      const deficit=(conteggi[c]<f.min ? (f.min-conteggi[c])*100 : (f.target-conteggi[c])*10);
      if(deficit>best){best=deficit;pool=[c];}
      else if(deficit===best) pool.push(c);
    }
    return motoreMescola(pool)[0];
  }

  for(let i=0;i<liberi.length;i++){
    const cat=scegliCategoriaPerSlot(i);
    if(!cat){
      errori.push(`nessuna categoria disponibile per ${liberi[i].giorno} ${liberi[i].pasto}`);
      continue;
    }
    celle[liberi[i].giorno][liberi[i].pasto]={
      gruppoProteicoLargo:cat,origine:'motore',stato:'definita'
    };
    conteggi[cat]++;
  }

  // Se Set è completo, deve comunque rispettare i minimi del percorso.
  for(const [cat,f] of Object.entries(FREQUENZE_MOTORE_BIBBIA)){
    if(conteggi[cat] < f.min){
      errori.push(`${cat}: ${conteggi[cat]} presenze, minimo ${f.min}`);
    }
  }
  return {celle,errori,conteggi};
}

/* Compatibilità con il vecchio codice: da v9 questi nomi puntano al motore unico. */
function costruisciGrigliaBase(giorni, tabellaGiorno){
  return costruisciGrigliaMotore(giorni, tabellaGiorno||{}, []);
}
function validaGrigliaBase(celle){
  let piene=0,totale=0; const vuote=[],conteggiPerCategoria={};
  for(const g of Object.keys(celle||{})){
    for(const p of ['pranzo','cena']){
      totale++;
      const c=celle[g][p]&&celle[g][p].gruppoProteicoLargo;
      if(c){piene++;conteggiPerCategoria[c]=(conteggiPerCategoria[c]||0)+1;}
      else vuote.push(g+'_'+p);
    }
  }
  return {piene,totale,vuote,completa:vuote.length===0,conteggiPerCategoria};
}

/* Storico reale: considera soltanto i pasti marcati consumato.
   Conserva l'ultimo consumo di ricette, carboidrati e verdure. */
async function costruisciStoricoConsumatiMotore(){
  const piano=await getAll('piano');
  const ricette=await getAll('ricette');
  const varianti=await getAll('varianti');
  const ingredienti=await getAll('ingredienti');
  const ricById=new Map(ricette.map(r=>[r.id,r]));
  const varById=new Map(varianti.map(v=>[v.id,v]));
  const baseById=new Map(ingredienti.map(i=>[i.id,i]));
  const ultimoRicetta={};
  const ultimoCarb={};
  const ultimoVerdura={};
  const sottotipiTotali={};

  for(const voce of piano){
    if(!voce || !voce.consumato) continue;
    const data=(voce.id||'').slice(0,10);
    const ts=Date.parse(data+'T12:00:00') || 0;
    if(voce.primoCereale) ultimoCarb[voce.primoCereale]=Math.max(ultimoCarb[voce.primoCereale]||0,ts);
    const ids=voce.modo==='multi'
      ? [voce.primoId,voce.secondoId,voce.contornoId].filter(Boolean)
      : [voce.ricettaId].filter(Boolean);
    for(const rid of ids){
      ultimoRicetta[rid]=Math.max(ultimoRicetta[rid]||0,ts);
      const r=ricById.get(rid);
      if(!r) continue;
      if(r.gruppoProteico) sottotipiTotali[r.gruppoProteico]=(sottotipiTotali[r.gruppoProteico]||0)+1;
      for(const ing of (r.ingredienti||[])){
        if(!ing.variantId) continue;
        const v=varById.get(ing.variantId), b=v?baseById.get(v.ingredienteId):null;
        if(b && b.gruppo==='verdura'){
          ultimoVerdura[v.id]=Math.max(ultimoVerdura[v.id]||0,ts);
        }
      }
    }
  }
  return {ultimoRicetta,ultimoCarb,ultimoVerdura,sottotipiTotali};
}
