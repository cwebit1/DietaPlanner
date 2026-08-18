/* =========================================================
   MOTORE v10 — pipeline a layer
   Fonte: MOTORE-REGOLE.md + PERCORSO ALIMENTARE MIRIA SPILLER.pdf
   Questo file viene caricato per ultimo e corregge/coordina il motore v9
   senza eliminare le utility gia usate dall'interfaccia.
   ========================================================= */
(function(){
'use strict';

const MOTORE_V10_MAX_SPECIALI = 2;

function motoreV10VoceHaContenuto(v){
  if(!v) return false;
  if(v.colazioneSpecialeId || v.componenti) return true;
  if(v.modo==='multi') return !!(v.primoId || v.primoCereale || v.secondoId || v.contornoId);
  return !!v.ricettaId;
}
function motoreV10VoceCompleta(v){
  if(!v) return false;
  if(v.modo==='multi') return !!v.secondoId && !!v.contornoId && (!!v.primoId || !!v.primoCereale);
  return !!v.ricettaId;
}
function motoreV10Protetta(v){
  if(!motoreV10VoceHaContenuto(v)) return false;
  if(v.consumato || v.bloccata) return true;
  return v.origine !== 'motore' && v.origine !== 'motore_set';
}

function motoreV10GiorniSettimanaDaData(giorno){
  const d=new Date(giorno+'T12:00:00');
  const delta=(d.getDay()+6)%7;
  const lun=new Date(d); lun.setDate(d.getDate()-delta);
  const out=[];
  for(let i=0;i<7;i++){
    const x=new Date(lun); x.setDate(lun.getDate()+i);
    out.push(x.toISOString().slice(0,10));
  }
  return out;
}

async function motoreV10RicettaPrincipaleVoce(v, ricById){
  if(!v) return null;
  if(v.modo==='multi') return v.secondoId ? ricById.get(v.secondoId)||null : null;
  return v.ricettaId ? ricById.get(v.ricettaId)||null : null;
}
async function motoreV10VoceSpeciale(v, ricById){
  if(!v || v.modo==='multi' || !v.ricettaId) return false;
  const r=ricById.get(v.ricettaId);
  return !!(r && r.piattoSpeciale);
}

async function motoreV10ContaSpecialiSettimana(giorno, escludiPianoId){
  const giorni=new Set(motoreV10GiorniSettimanaDaData(giorno));
  const [piano,ricette]=await Promise.all([getAll('piano'),getAll('ricette')]);
  const ricById=new Map(ricette.map(r=>[r.id,r]));
  let n=0;
  for(const v of piano){
    if(!v || v.id===escludiPianoId) continue;
    const sep=(v.id||'').lastIndexOf('_'); if(sep<0) continue;
    const data=v.id.slice(0,sep), pasto=v.id.slice(sep+1);
    if(!giorni.has(data) || !['pranzo','cena'].includes(pasto)) continue;
    if(await motoreV10VoceSpeciale(v,ricById)) n++;
  }
  return n;
}

/* Limite speciale centralizzato: intercetta qualunque percorso che usa
   confermaConAllarme (Piano, alternativa completa, assegnazione dal Ricettario). */
if(typeof confermaConAllarme==='function' && !confermaConAllarme._motoreV10){
  const _confermaConAllarme=confermaConAllarme;
  const wrap=async function(pasto,giorno,ricetteCandidate){
    if(['pranzo','cena'].includes(pasto)){
      const speciale=(ricetteCandidate||[]).find(r=>r&&r.piattoSpeciale);
      if(speciale){
        const pianoId=giorno+'_'+pasto;
        const n=await motoreV10ContaSpecialiSettimana(giorno,pianoId);
        if(n>=MOTORE_V10_MAX_SPECIALI){
          if(typeof avviso==='function') await avviso('Puoi programmare al massimo 2 pasti speciali nella stessa settimana.');
          return false;
        }
      }
    }
    return _confermaConAllarme(pasto,giorno,ricetteCandidate);
  };
  wrap._motoreV10=true;
  confermaConAllarme=wrap;
}

/* Conteggi proteici dell'interfaccia/allarmi: i pasti speciali sono fuori
   dal conteggio ordinario e non generano compensazioni. */
async function motoreV10ConsumiProteici(consumatiSoltanto){
  const giorni=giorniSettimana();
  const gruppi={carne:0,pesce:0,formaggi:0,uova:0,legumi:0};
  const sottotipi={carne_rossa:0,affettati:0,pesce_grande:0,pesce_conservato:0};
  const [piano,ricette]=await Promise.all([getAll('piano'),getAll('ricette')]);
  const pById=new Map(piano.map(v=>[v.id,v]));
  const rById=new Map(ricette.map(r=>[r.id,r]));
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const voce=pById.get(g+'_'+p); if(!voce || (consumatiSoltanto&&!voce.consumato)) continue;
      if(await motoreV10VoceSpeciale(voce,rById)) continue;
      const ids=voce.modo==='multi'?[voce.secondoId].filter(Boolean):[voce.ricettaId].filter(Boolean);
      for(const id of ids){
        const r=rById.get(id); if(!r||!r.gruppoProteico||r.piattoSpeciale) continue;
        const s=r.gruppoProteico, m=motoreCategoriaDiSottotipo(s);
        if(gruppi[m]!==undefined) gruppi[m]++;
        if(sottotipi[s]!==undefined) sottotipi[s]++;
      }
    }
  }
  return {gruppi,sottotipi};
}
if(typeof getConsumiProteiciSettimana==='function') getConsumiProteiciSettimana=()=>motoreV10ConsumiProteici(false);
if(typeof getConsumiProteiciSettimanaConsumati==='function') getConsumiProteiciSettimanaConsumati=()=>motoreV10ConsumiProteici(true);

/* Storico del motore: usa solo pasti realmente consumati e NON usa i pasti
   speciali per guidare frequenze/rotazione del piano ordinario. */
costruisciStoricoConsumatiMotore = async function(){
  const [piano,ricette,varianti,ingredienti]=await Promise.all([getAll('piano'),getAll('ricette'),getAll('varianti'),getAll('ingredienti')]);
  const ricById=new Map(ricette.map(r=>[r.id,r]));
  const varById=new Map(varianti.map(v=>[v.id,v]));
  const baseById=new Map(ingredienti.map(i=>[i.id,i]));
  const ultimoRicetta={},ultimoCarb={},ultimoVerdura={},sottotipiTotali={},ultimoSottotipo={},ultimoCategoriaProteica={};
  for(const voce of piano){
    if(!voce||!voce.consumato) continue;
    if(await motoreV10VoceSpeciale(voce,ricById)) continue;
    const data=(voce.id||'').slice(0,10), ts=Date.parse(data+'T12:00:00')||0;
    if(voce.primoCereale) ultimoCarb[voce.primoCereale]=Math.max(ultimoCarb[voce.primoCereale]||0,ts);
    const ids=voce.modo==='multi'?[voce.primoId,voce.secondoId,voce.contornoId].filter(Boolean):[voce.ricettaId].filter(Boolean);
    for(const rid of ids){
      const r=ricById.get(rid); if(!r||r.piattoSpeciale) continue;
      ultimoRicetta[rid]=Math.max(ultimoRicetta[rid]||0,ts);
      if(r.gruppoProteico){
        sottotipiTotali[r.gruppoProteico]=(sottotipiTotali[r.gruppoProteico]||0)+1;
        ultimoSottotipo[r.gruppoProteico]=Math.max(ultimoSottotipo[r.gruppoProteico]||0,ts);
        const macro=motoreCategoriaDiSottotipo(r.gruppoProteico);
        if(macro) ultimoCategoriaProteica[macro]=Math.max(ultimoCategoriaProteica[macro]||0,ts);
      }
      for(const ing of (r.ingredienti||[])){
        if(!ing.variantId) continue;
        const v=varById.get(ing.variantId), b=v?baseById.get(v.ingredienteId):null;
        if(b&&b.gruppo==='verdura') ultimoVerdura[v.id]=Math.max(ultimoVerdura[v.id]||0,ts);
      }
    }
  }
  return {ultimoRicetta,ultimoCarb,ultimoVerdura,sottotipiTotali,ultimoSottotipo,ultimoCategoriaProteica};
};

/* Ripristina insieme: deperibilita v17 + verdura ricorrente HARD v30. */
scegliContornoMotore = async function(giorno,stato,preferenze,escludiId){
  const [ricette,varianti,ingredienti]=await Promise.all([getAll('ricette'),getAll('varianti'),getAll('ingredienti')]);
  const cache={vById:new Map(varianti.map(v=>[v.id,v])),bById:new Map(ingredienti.map(b=>[b.id,b]))};
  const off=new Set(preferenze.verdureDisattivate||[]), prefIds=new Set(preferenze.verdurePreferiteVariantIds||[]);
  let candidati=[];
  for(const r of ricette){
    if(r.tipoPortata!=='modulare'||r.sottoCategoriaModulare!=='contorno'||r.esclusa||r.id===escludiId) continue;
    const info=await motoreInfoVerduraContorno(r,cache); if(!info||off.has(info.variantId)) continue;
    candidati.push({r,info});
  }
  if(!candidati.length) return null;
  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;
  const slot=(preferenze._pastoCorrente||'')+'_'+idx;
  if(preferenze.verduraRicorrenteVariantId && (preferenze.verduraRicorrentePasti||[]).includes(slot)){
    const hard=candidati.filter(x=>x.info.variantId===preferenze.verduraRicorrenteVariantId);
    if(!hard.length) return null;
    const scelta=scegliMenoRecenteMotore(hard,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    return scelta?scelta.r:null;
  }
  const ordine=(typeof ordineVerdureGiornoV17==='function')?ordineVerdureGiornoV17(idx):(idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']));
  let pool=[];
  for(const t of ordine){ pool=candidati.filter(x=>x.info.tier===t); if(pool.length) break; }
  if(!pool.length) pool=candidati;
  const preferite=pool.filter(x=>prefIds.has(x.info.variantId));
  if(preferite.length){
    const nuove=preferite.filter(x=>!stato.preferiteVerdureUsate.has(x.info.variantId));
    const p=nuove.length?nuove:preferite;
    const scelta=scegliMenoRecenteMotore(p,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    if(scelta) stato.preferiteVerdureUsate.add(scelta.info.variantId);
    return scelta?scelta.r:null;
  }
  return motoreMescola(pool)[0].r;
};

async function motoreV10CategoriaVoce(voce,ricById){
  const r=await motoreV10RicettaPrincipaleVoce(voce,ricById);
  return r&&r.gruppoProteico ? motoreCategoriaDiSottotipo(r.gruppoProteico) : null;
}

function motoreV10ScegliCategoria(candidati,conteggi,storico){
  if(!candidati.length) return null;
  let bestDef=-Infinity,pool=[];
  for(const c of candidati){
    const f=FREQUENZE_MOTORE_BIBBIA[c];
    const def=conteggi[c]<f.min?(f.min-conteggi[c])*100:(conteggi[c]<f.target?(f.target-conteggi[c])*10:1);
    if(def>bestDef){bestDef=def;pool=[c];}else if(def===bestDef)pool.push(c);
  }
  let oldest=Infinity,p2=[];
  for(const c of pool){
    const ts=(storico.ultimoCategoriaProteica||{})[c]||0;
    if(ts<oldest){oldest=ts;p2=[c];}else if(ts===oldest)p2.push(c);
  }
  return motoreMescola(p2)[0];
}

async function motoreV10CostruisciGriglia(giorni,preferenze,stato){
  const [piano,ricette]=await Promise.all([getAll('piano'),getAll('ricette')]);
  const pById=new Map(piano.map(v=>[v.id,v])), rById=new Map(ricette.map(r=>[r.id,r]));
  const celle={},errori=[];
  for(const g of giorni){
    celle[g]={};
    for(const p of ['pranzo','cena']){
      const voce=pById.get(g+'_'+p)||null;
      const speciale=await motoreV10VoceSpeciale(voce,rById);
      const protetta=motoreV10Protetta(voce);
      const completa=motoreV10VoceCompleta(voce);
      const categoria=(speciale||!protetta)?null:await motoreV10CategoriaVoce(voce,rById);
      celle[g][p]={gruppoProteicoLargo:categoria,origine:categoria&&protetta?'utente_pasto':null,stato:categoria?'definita':'libera',voce,protetta,speciale,completa};
    }
  }
  // Layer 1: Set. Una ricetta/pasto diretto sullo slot e' piu specifico e resta intatto.
  for(const g of giorni){
    const scelte=(preferenze.giornoCategoria&&preferenze.giornoCategoria[g])?(preferenze.giornoCategoria[g]||[]).slice(0,2):[];
    for(let i=0;i<scelte.length;i++){
      const p=i===0?'pranzo':'cena', cat=scelte[i], c=celle[g][p];
      if(!FREQUENZE_MOTORE_BIBBIA[cat]||c.speciale) continue;
      if(!c.gruppoProteicoLargo && !(c.protetta&&c.completa&&c.voce&&c.voce.modo!=='multi')){
        c.gruppoProteicoLargo=cat;c.origine='utente_set';c.stato='definita';
      }
    }
  }
  const conteggi={carne:0,pesce:0,formaggi:0,uova:0,legumi:0};
  for(const g of giorni)for(const p of ['pranzo','cena']){const c=celle[g][p].gruppoProteicoLargo;if(c&&conteggi[c]!==undefined)conteggi[c]++;}
  const limitate=new Set(preferenze.proteineLimitate||[]);
  let prev=null;
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const c=celle[g][p];
      if(c.speciale){prev=null;continue;}
      if(c.gruppoProteicoLargo){prev=c.gruppoProteicoLargo;continue;}
      // Un piatto unico scelto dall'utente senza categoria riconoscibile resta intatto e non viene completato.
      if(c.protetta&&c.completa&&c.voce&&c.voce.modo!=='multi') continue;
      let candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].min && conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max);
      if(!candidati.length) candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].target && conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max && !limitate.has(k));
      if(!candidati.length) candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].target && conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max);
      if(!candidati.length) candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max && !limitate.has(k));
      if(!candidati.length) candidati=Object.keys(FREQUENZE_MOTORE_BIBBIA).filter(k=>conteggi[k]<FREQUENZE_MOTORE_BIBBIA[k].max);
      const alt=candidati.filter(k=>k!==prev); if(alt.length)candidati=alt;
      const scelta=motoreV10ScegliCategoria(candidati,conteggi,stato.storico);
      if(!scelta){errori.push(`Nessuna categoria proteica disponibile per ${g} ${p}`);continue;}
      c.gruppoProteicoLargo=scelta;c.origine='motore';c.stato='definita';conteggi[scelta]++;prev=scelta;
    }
  }
  return {celle,conteggi,errori};
}

async function motoreV10InferisciCarboidrato(voce,ricById,varById){
  if(!voce) return null;
  if(voce.primoCereale&&CARBOIDRATI_PASTO[voce.primoCereale]) return voce.primoCereale;
  const ids=voce.modo==='multi'?[voce.primoId].filter(Boolean):[voce.ricettaId].filter(Boolean);
  for(const id of ids){
    const r=ricById.get(id); if(!r)continue;
    if(r.cerealeUsato&&CARBOIDRATI_PASTO[r.cerealeUsato])return r.cerealeUsato;
    if(r.tipoCereale&&CARBOIDRATI_PASTO[r.tipoCereale])return r.tipoCereale;
    const nomi=[];
    for(const i of (r.ingredienti||[])){
      if(i.variantId&&varById.has(i.variantId))nomi.push((varById.get(i.variantId).nome||'').toLowerCase());
      if(i.nomeLibero)nomi.push(i.nomeLibero.toLowerCase());
    }
    for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){
      const target=(cfg.ingrediente||'').toLowerCase();
      if(target&&nomi.includes(target))return k;
    }
    const testo=nomi.join(' ');
    const mappa=[['friselle','friselle'],['cous_cous','cous cous'],['farro','farro'],['orzo','orzo'],['riso','riso'],['patate','patat'],['polenta','polenta'],['pane','pane'],['pasta','pasta']];
    for(const [k,t] of mappa)if(CARBOIDRATI_PASTO[k]&&testo.includes(t))return k;
  }
  return null;
}

async function motoreV10AssorbiQuoteProtette(giorni,griglia,stato){
  const [ricette,varianti]=await Promise.all([getAll('ricette'),getAll('varianti')]);
  const rById=new Map(ricette.map(r=>[r.id,r])), vById=new Map(varianti.map(v=>[v.id,v]));
  for(const g of giorni){
    for(const p of ['pranzo','cena']){
      const c=griglia.celle[g][p], v=c.voce;
      if(!v||c.speciale||!c.protetta)continue;
      const k=await motoreV10InferisciCarboidrato(v,rById,vById);
      if(k){
        stato.carboidratiUsati[k]=(stato.carboidratiUsati[k]||0)+1;
        if(stato.budgetCarb.residuo[k]>0)stato.budgetCarb.residuo[k]--;
      }
    }
  }
}

async function motoreV10CompletaMulti(giorno,pasto,voce,cella,preferenze,stato){
  const nuova=Object.assign({},voce||{id:giorno+'_'+pasto,porzioni:1},{modo:'multi'});
  const categoria=cella.gruppoProteicoLargo;
  if(!nuova.secondoId){
    const sottotipo=await scegliSottotipoMotore(categoria,stato);
    const prot=await scegliProteinaModulareMotore(sottotipo,stato,null);
    if(!prot)return {voce:null,errore:`Nessuna proteina per ${giorno} ${pasto} (${categoria})`};
    nuova.secondoId=prot.id;nuova.sottotipoProteicoMotore=prot.gruppoProteico;nuova.cotturaSecondo=scegliCotturaStandard(prot.gruppoProteico,prot.nome);
  }else if(!nuova.cotturaSecondo){
    const r=await getOne('ricette',nuova.secondoId);if(r)nuova.cotturaSecondo=scegliCotturaStandard(r.gruppoProteico,r.nome);
  }
  if(!nuova.contornoId){
    const prefSlot=Object.assign({},preferenze,{_pastoCorrente:pasto});
    const cont=await scegliContornoMotore(giorno,stato,prefSlot,null);
    if(!cont)return {voce:null,errore:`Nessun contorno compatibile per ${giorno} ${pasto}`};
    nuova.contornoId=cont.id;
  }
  if(!nuova.primoId&&!nuova.primoCereale){
    const poco=(pasto==='pranzo'&&preferenze.pocoTempoPranzo)||(pasto==='cena'&&preferenze.pocoTempoCena);
    const k=await scegliCarboidratoMotore(stato,!!poco), cfg=CARBOIDRATI_PASTO[k];
    nuova.primoCereale=k;
    if(cfg&&cfg.haPoolSughi){
      const sugo=await scegliSugoMotore(stato,null);nuova.primoSugoId=sugo?sugo.id:null;
      if(sugo){const pr=await componiPrimoModulare(sugo,k);if(pr)nuova.primoId=pr.id;}
    }
  }else if(nuova.primoCereale&&!nuova.primoId){
    const cfg=CARBOIDRATI_PASTO[nuova.primoCereale];
    if(cfg&&cfg.haPoolSughi){
      let sugo=nuova.primoSugoId?await getOne('ricette',nuova.primoSugoId):null;
      if(!sugo)sugo=await scegliSugoMotore(stato,null);
      nuova.primoSugoId=sugo?sugo.id:null;
      if(sugo){const pr=await componiPrimoModulare(sugo,nuova.primoCereale);if(pr)nuova.primoId=pr.id;}
    }
  }
  nuova.categoriaLargaE1=categoria;nuova.origineCategoriaMotore=cella.origine;
  nuova.origine=voce&&voce.origine?voce.origine:'utente';
  nuova.consumato=!!(voce&&voce.consumato);
  if(!nuova.secondoId||!nuova.contornoId||(!nuova.primoId&&!nuova.primoCereale))return {voce:null,errore:`Pasto parziale non completabile per ${giorno} ${pasto}`};
  return {voce:nuova,errore:null};
}

function motoreV10SchemaColazioneCompatibile(schema,prefNomi,esclusi){
  for(const k of ['proteine','carboidrati','grassi','carboidrati_semplici']){
    const richiesto=prefNomi[k];
    if(richiesto && (schema[k]||'').toLowerCase()!==richiesto.toLowerCase())return false;
    if(esclusi.has((schema[k]||'').toLowerCase()))return false;
    // Nei gruppi facoltativi, nessuna selezione significa davvero "nessuno".
    if(!richiesto && (k==='grassi'||k==='carboidrati_semplici') && schema[k]) return false;
  }
  return true;
}
async function motoreV10ColazioneDaSetParziale(prefValore,varianti,esclusi,evitaFirme){
  const prefComp=componentiColazioneDaSet(prefValore||{},varianti);
  const prefNomi={};
  for(const g of COLAZIONE_GRUPPI){
    if(g.chiave==='bibita')continue;
    prefNomi[g.chiave]=prefComp[g.chiave]?nomeOpzioneColazione(g,prefComp[g.chiave],varianti):null;
  }
  const no=new Set((esclusi||[]).map(x=>(x||'').toLowerCase()));
  let pool=COLAZIONI_AUTOMATICHE_COHERENTI.filter(s=>motoreV10SchemaColazioneCompatibile(s,prefNomi,no));
  if(!pool.length){
    // Se la combinazione esplicita non ha template, non inventare abbinamenti.
    const espliciti=Object.values(prefComp).filter(Boolean);
    if(espliciti.length)return prefComp;
    return scegliColazioneAutomaticaCoerente(varianti,evitaFirme||[],esclusi||[]);
  }
  const candidati=pool.map(s=>componentiDaSchemaColazione(s,varianti)).filter(Boolean);
  const avoid=new Set(evitaFirme||[]), nuovi=candidati.filter(c=>!avoid.has(firmaComponentiColazione(c)));
  const scelto=motoreMescola(nuovi.length?nuovi:candidati)[0];
  if(scelto&&prefComp.bibita)scelto.bibita=prefComp.bibita;
  return scelto||null;
}

/* Generatore v10: preserva pasti scelti/programmati, esclude speciali dai conti,
   completa solo componenti libere e lascia la Bibbia lavorare soltanto sui vuoti. */
generaPianoSettimana = async function(scartoSettimane,opzioni){
  scartoSettimane=scartoSettimane||0;opzioni=opzioni||{};const forza=!!opzioni.forza;
  const giorni=giorniSettimana(scartoSettimane);
  const preferenze=opzioni.preferenze&&Object.keys(opzioni.preferenze).length?Object.assign(await caricaPreferenzeMotoreDaSet(scartoSettimane),opzioni.preferenze):await caricaPreferenzeMotoreDaSet(scartoSettimane);
  const stato=await creaStatoMotoreSettimana();
  const griglia=await motoreV10CostruisciGriglia(giorni,preferenze,stato);
  await motoreV10AssorbiQuoteProtette(giorni,griglia,stato);
  const generati=[];
  for(const g of giorni){
    for(const pasto of ['pranzo','cena']){
      const id=g+'_'+pasto,cella=griglia.celle[g][pasto];
      let esistente=await getOne('piano',id);
      if(cella.speciale||esistente&&esistente.consumato||esistente&&esistente.bloccata)continue;
      const protetta=motoreV10Protetta(esistente);
      if(protetta&&motoreV10VoceCompleta(esistente))continue;
      if(protetta&&esistente&&esistente.modo==='multi'){
        const r=await motoreV10CompletaMulti(g,pasto,esistente,cella,preferenze,stato);
        if(!r.voce){stato.errori.push(r.errore);continue;}
        await put('piano',r.voce);generati.push(r.voce);continue;
      }
      if(esistente&&!forza&&motoreV10VoceCompleta(esistente))continue;
      if(!cella.gruppoProteicoLargo){
        if(esistente&&protetta)continue;
        stato.errori.push(`Slot senza categoria proteica: ${g} ${pasto}`);continue;
      }
      const r=await generaPortateMotore(g,pasto,cella,preferenze,stato);
      if(!r.voce){stato.errori.push(r.errore);continue;}
      const nuova=Object.assign({},esistente||{},r.voce,{consumato:false,origine:'motore'});
      await put('piano',nuova);generati.push(nuova);
    }

    // Colazione: manuale HARD; Set parziale completato con combinazioni coerenti.
    const idCol=g+'_colazione'; let col=await getOne('piano',idCol);
    if(col&&col.consumato||col&&col.bloccata||col&&col.colazioneSpecialeId)continue;
    if(col&&col.origine==='utente'&&col.componenti)continue;
    const idx=giorni.indexOf(g);
    const premio=await getOne('impostazioni','contatoreColazioniMorigerate');
    const premioMaturo=(premio&&Number(premio.valore)>=5&&g===todayISO());
    if(premioMaturo){
      // Lo slot deve restare libero per mostrare la scelta Budino/standard nel Piano.
      if(col&&(col.origine==='motore'||col.origine==='motore_set'))await delKey('piano',idCol);
      continue;
    }
    const [pref,gg,recEsclusi,varianti]=await Promise.all([
      getOne('impostazioni','colazionePreferita'),getOne('impostazioni','colazionePreferitaGiorni'),getOne('impostazioni','colazioneIngredientiEsclusi'),getAll('varianti')
    ]);
    const giorniPref=(gg&&Array.isArray(gg.valore)?gg.valore:[]).map(Number), usa=!!(pref&&pref.valore)&&giorniPref.includes(idx);
    const esclusi=recEsclusi&&Array.isArray(recEsclusi.valore)?recEsclusi.valore:[];
    let comp=null;
    if(usa){
      comp=await motoreV10ColazioneDaSetParziale(pref.valore,varianti,esclusi,[]);
    }else{
      const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
      comp=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],esclusi);
    }
    if(comp)await put('piano',{id:idCol,componenti:comp,origine:'motore_set'});
  }
  const report={data:new Date().toISOString(),versioneMotore:'10',ok:stato.errori.length===0,errori:[...griglia.errori,...stato.errori],conteggiProteici:griglia.conteggi,generati:generati.length,carboidratiUsati:stato.carboidratiUsati,sottotipiUsati:stato.conteggiSottotipi,verdurePreferiteUsate:[...stato.preferiteVerdureUsate]};
  await put('impostazioni',{chiave:'ultimoReportMotore',valore:report});
  if(scartoSettimane===0&&typeof renderPiano==='function')renderPiano();
  return report;
};

generaMenuDaConfigSet = async function(scartoSettimane){
  scartoSettimane=scartoSettimane||0;menuSettimanaScarto=scartoSettimane;mostraVista('menu');
  const preferenze=await caricaPreferenzeMotoreDaSet(scartoSettimane);
  const report=await generaPianoSettimana(scartoSettimane,{forza:true,preferenze});
  await renderMenuSettimanale();await renderPiano();return report;
};

window.MOTORE_V10_REGOLE={versione:'1.0',maxPastiSpeciali:MOTORE_V10_MAX_SPECIALI,pipeline:['scelte_user','preferenze_esclusioni','completamento_guida','rotazione_varieta','realizzazione_ricetta']};
})();
