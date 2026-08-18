componiPastoModulare = async function(gruppoProteico, giorno, escludiSugoId, escludiProteinaId, escludiContornoId, forzaJolly, preferenzeMotore, statoMotore){
  preferenzeMotore=preferenzeMotore||{};
  if(!statoMotore){
    statoMotore={
      storico:await costruisciStoricoConsumatiMotore(),
      ricetteUsateGenerazione:new Set(),
      preferiteVerdureUsate:new Set(),
      carboidratiUsati:{},
      budgetCarb:await preparaBudgetCarboidratiMotore()
    };
  }
  const carb=await scegliCarboidratoMotore(statoMotore,!!forzaJolly);
  const carbCfg=CARBOIDRATI_PASTO[carb];
  if(!carbCfg) return null;

  const sugo=carbCfg.haPoolSughi ? await scegliSugoMotore(statoMotore,escludiSugoId) : null;
  const proteina=gruppoProteico ? await scegliProteinaModulareMotore(gruppoProteico,statoMotore,escludiProteinaId) : null;
  const contorno=await scegliContornoMotore(giorno,statoMotore,preferenzeMotore,escludiContornoId);
  if(!proteina || !contorno) return null;

  const cottura=scegliCotturaStandard(proteina.gruppoProteico);
  return {
    primoNome:sugo?componiNomePrimoModulare(carbCfg.label,sugo.nome):carbCfg.label,
    primoCarboidrato:carb,
    primoSugoId:sugo?sugo.id:null,
    primoEJolly:!carbCfg.haPoolSughi,
    secondoNome:componiNomeSecondoModulare(proteina.nome,cottura,contorno.nome),
    proteinaId:proteina.id,
    cottura,
    contornoId:contorno.id
  };
};

async function caricaPreferenzeMotoreDaSet(scartoSettimane){
  const giorni=giorniSettimana(scartoSettimane||0);
  const recTab=await getOne('impostazioni','tabellaGiornoCategoria');
  const tabRaw=recTab&&recTab.valore?recTab.valore:{};
  const giornoCategoria={};
  giorni.forEach((g,i)=>{
    const a=tabRaw['giorno_'+i];
    if(a&&a.length) giornoCategoria[g]=a.slice(0,2);
  });

  const recLim=await getOne('impostazioni','setProteineLimitate');
  const recTempo=await getOne('impostazioni','setPocoTempo');
  const recPref=await getOne('impostazioni','setVerdurePreferite');
  const recOff=await getOne('impostazioni','setVerdureDisattivate');
  const recRic=await getOne('impostazioni','verduraRicorrente');
  const recRicPasti=await getOne('impostazioni','verduraRicorrentePasti');
  const varianti=await getAll('varianti');
  const prefNomi=new Set(recPref&&recPref.valore?recPref.valore:[]);
  const prefIds=varianti.filter(v=>prefNomi.has(v.nome)).map(v=>v.id);
  const tempo=Object.assign({pranzo:false,cena:false},recTempo&&recTempo.valore?recTempo.valore:{});
  return {
    giornoCategoria,
    proteineLimitate:recLim&&recLim.valore?recLim.valore:[],
    pocoTempoPranzo:!!tempo.pranzo,
    pocoTempoCena:!!tempo.cena,
    verdurePreferiteVariantIds:prefIds,
    verdureDisattivate:recOff&&recOff.valore?recOff.valore:[],
    verduraRicorrenteVariantId:recRic&&recRic.valore?recRic.valore:null,
    verduraRicorrentePasti:recRicPasti&&Array.isArray(recRicPasti.valore)?recRicPasti.valore:[]
  };
}

async function creaStatoMotoreSettimana(){
  const storico=await costruisciStoricoConsumatiMotore();
  const ultimoConsumoSottotipo={};
  // In assenza di timestamp per sottotipo, il totale storico mantiene comunque
  // una rotazione equilibrata; i singoli piatti usano invece il timestamp reale.
  return {
    storico,
    ultimoConsumoSottotipo,
    conteggiSottotipi:{},
    ricetteUsateGenerazione:new Set(),
    preferiteVerdureUsate:new Set(),
    carboidratiUsati:{},
    budgetCarb:await preparaBudgetCarboidratiMotore(),
    errori:[],
    marcatori:[]
  };
}

async function generaPortateMotore(giorno,pasto,cella,preferenze,stato){
  const categoria=cella.gruppoProteicoLargo;
  const sottotipo=await scegliSottotipoMotore(categoria,stato);
  const pocoTempo=(pasto==='pranzo'&&preferenze.pocoTempoPranzo)||(pasto==='cena'&&preferenze.pocoTempoCena);
  const preferenzeSlot=Object.assign({},preferenze,{_pastoCorrente:pasto});
  const esito=await componiPastoModulare(sottotipo,giorno,null,null,null,pocoTempo,preferenzeSlot,stato);
  if(!esito) return {voce:null,errore:`Nessuna combinazione completa per ${giorno} ${pasto} (${categoria}/${sottotipo})`};

  let primoId=null;
  if(pocoTempo){
    const rapido=await scegliPrimoVelocePaneFriselle();
    if(rapido) primoId=rapido.id;
  }
  if(!primoId && esito.primoSugoId){
    const template=await getOne('ricette',esito.primoSugoId);
    if(template){
      const composto=await componiPrimoModulare(template,esito.primoCarboidrato);
      if(composto) primoId=composto.id;
    }
  }
  return {
    voce:{
      id:giorno+'_'+pasto,
      modo:'multi',
      fascia:'facile',
      porzioni:1,
      primoId,
      primoCereale:esito.primoCarboidrato,
      primoSugoId:esito.primoSugoId||null,
      secondoId:esito.proteinaId,
      contornoId:esito.contornoId,
      cotturaSecondo:esito.cottura||null,
      ricettaId:null,
      categoriaLargaE1:categoria,
      sottotipoProteicoMotore:sottotipo,
      origineCategoriaMotore:cella.origine,
      pocoTempoMotore:!!pocoTempo,
      origine:'motore'
    },
    errore:null
  };
}

/* Generatore unico v9. Non usa più E2 né il 50/50 unico/multi.
   Piatto unico, sfiziosa, speciale e Salvafrigo restano alternative scelte
   dall'utente dal pannello del pasto; Genera menu propone sempre portate. */
generaPianoSettimana = async function(scartoSettimane, opzioni){
  scartoSettimane=scartoSettimane||0;
  opzioni=opzioni||{};
  const forza=!!opzioni.forza;
  const giorni=giorniSettimana(scartoSettimane);
  const preferenze=opzioni.preferenze&&Object.keys(opzioni.preferenze).length
    ? Object.assign(await caricaPreferenzeMotoreDaSet(scartoSettimane),opzioni.preferenze)
    : await caricaPreferenzeMotoreDaSet(scartoSettimane);

  const griglia=costruisciGrigliaMotore(giorni,preferenze.giornoCategoria||{},preferenze.proteineLimitate||[]);
  if(griglia.errori.length){
    await put('impostazioni',{chiave:'ultimoReportMotore',valore:{data:new Date().toISOString(),ok:false,errori:griglia.errori,conteggi:griglia.conteggi}});
    if(typeof avviso==='function') await avviso('Configurazione Set non compatibile con il percorso:\n'+griglia.errori.join('\n'));
    return {ok:false,errori:griglia.errori};
  }

  const stato=await creaStatoMotoreSettimana();
  const generati=[];
  for(const g of giorni){
    for(const pasto of ['pranzo','cena']){
      const id=g+'_'+pasto;
      let esistente=await getOne('piano',id);
      if(esistente&&esistente.consumato) continue;
      if(esistente&&esistente.bloccata) continue;
      if(esistente&&!forza){
        const completo=esistente.modo==='multi'
          ? (!!esistente.secondoId && !!esistente.contornoId && (!!esistente.primoId || !!esistente.primoCereale))
          : !!esistente.ricettaId;
        if(completo) continue;
      }

      const risultato=await generaPortateMotore(g,pasto,griglia.celle[g][pasto],preferenze,stato);
      if(!risultato.voce){
        stato.errori.push(risultato.errore);
        continue;
      }
      // Mantiene il lucchetto o altri metadati non nutrizionali dell'eventuale record.
      const nuova=Object.assign({},esistente||{},risultato.voce,{consumato:false});
      await put('piano',nuova);
      generati.push(nuova);
    }

    // Colazione: conserva la logica già prevista dal Set.
    const varianti=await getAll('varianti');
    const idCol=g+'_colazione';
    let col=await getOne('piano',idCol);
    if(!(col&&col.consumato)&&!(col&&col.bloccata)){
      if(forza&&col&&!col.colazioneSpecialeId) col=Object.assign({},col,{componenti:null});
      if(!col||(!col.componenti&&!col.colazioneSpecialeId)){
        const pref=await getOne('impostazioni','colazionePreferita');
        const gg=await getOne('impostazioni','colazionePreferitaGiorni');
        const giorniPref=gg&&gg.valore?gg.valore:[];
        const idx=giorni.indexOf(g);
        const giorniPrefNormalizzati=(giorniPref||[]).map(Number);
        const usa=!!(pref&&pref.valore) && (giorniPrefNormalizzati.length>=7 || giorniPrefNormalizzati.includes(idx));
        let componenti;
        if(usa){
          componenti=componentiColazioneDaSet(pref.valore,varianti);
        }else{
          const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
          const recEsclusiColazione=await getOne('impostazioni','colazioneIngredientiEsclusi');
          componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],recEsclusiColazione&&recEsclusiColazione.valore?recEsclusiColazione.valore:[]);
        }
        if(componenti) await put('piano',{id:idCol,componenti});
      }
    }
  }

  const report={
    data:new Date().toISOString(),
    ok:stato.errori.length===0,
    errori:stato.errori,
    conteggiProteici:griglia.conteggi,
    generati:generati.length,
    carboidratiUsati:stato.carboidratiUsati,
    sottotipiUsati:stato.conteggiSottotipi,
    verdurePreferiteUsate:[...stato.preferiteVerdureUsate]
  };
  await put('impostazioni',{chiave:'ultimoReportMotore',valore:report});
  if(scartoSettimane===0 && typeof renderPiano==='function') renderPiano();
  return report;
};

generaMenuDaConfigSet = async function(scartoSettimane){
  scartoSettimane=scartoSettimane||0;
  menuSettimanaScarto=scartoSettimane;
  mostraVista('menu');
  const preferenze=await caricaPreferenzeMotoreDaSet(scartoSettimane);
  const report=await generaPianoSettimana(scartoSettimane,{forza:true,preferenze});
  await renderMenuSettimanale();
  await renderPiano();
  return report;
};

/* Registrazione lacune libreria per la futura Review.
   Usa lo store impostazioni già esistente, così non richiede una migrazione IndexedDB. */
async function registraRichiestaRicettaReview(dati){
  const rec=await getOne('impostazioni','reviewRicetteMancanti');
  const lista=rec&&Array.isArray(rec.valore)?rec.valore:[];
  const norm=v=>(v||'').toString().trim().toLowerCase();
  const key=[
    dati.tipo||'piatto_unico',
    norm(dati.carboidrato),
    norm(dati.categoriaProteica),
    norm(dati.sottotipoProteico),
    norm(dati.verdura)
  ].join('|');
  let x=lista.find(r=>r.key===key);
  if(x){
    x.conteggio=(x.conteggio||0)+1;
    x.ultimaRichiesta=new Date().toISOString();
  }else{
    x=Object.assign({key,conteggio:1,primaRichiesta:new Date().toISOString(),ultimaRichiesta:new Date().toISOString()},dati);
    lista.push(x);
  }
  await put('impostazioni',{chiave:'reviewRicetteMancanti',valore:lista});
  return x;
}

/* La vecchia E2 può ancora essere richiamata da utility non attive: restituisce
   una struttura neutra invece di causare ReferenceError. */
async function sviluppaGrigliaCrossWeek(celle,giorni,tutteRicette,mappaVarianti,preferenze,storicoPerSlot,usatiPrecedente){
  return {celle,storicoPerSlot:storicoPerSlot||{},ripetizioniForzate:[],usatiSettimanaCorrente:new Set()};
}


