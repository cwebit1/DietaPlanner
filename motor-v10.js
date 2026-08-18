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
    // Scelta esplicita user: è HARD e può volutamente derogare alla stagionalità,
    // ma non alla disponibilità (i Set contraddittori vengono bloccati in UI).
    const hard=candidati.filter(x=>x.info.variantId===preferenze.verduraRicorrenteVariantId);
    if(!hard.length) return null;
    const scelta=scegliMenoRecenteMotore(hard,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    return scelta?scelta.r:null;
  }
  // Filtro stagionale automatico: freschi e freschi duraturi devono essere
  // coerenti col mese; confezionati e surgelati restano disponibili tutto l'anno.
  if(typeof verdureDiStagione==='function'){
    const stag=new Set(verdureDiStagione(new Date(giorno+'T12:00:00'))||[]);
    if(stag.size){
      candidati=candidati.filter(x=>x.info.tier==='confezionato'||x.info.tier==='surgelato'||stag.has(x.info.nome));
      if(!candidati.length)return null;
    }
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
      const alt=candidati.filter(k=>k!==prev);
      if(alt.length) candidati=alt;
      else stato.errori && stato.errori.push(`Proteina ripetuta nello stesso giorno (${g} — nessuna alternativa disponibile per ${prev})`);
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

async function motoreV10PreparaSlotCarbAutomatici(giorni,griglia,stato,forza){
  const [ricette,varianti]=await Promise.all([getAll('ricette'),getAll('varianti')]);
  const rById=new Map(ricette.map(r=>[r.id,r])),vById=new Map(varianti.map(v=>[v.id,v]));
  const ids=new Set();
  for(const g of giorni)for(const p of ['pranzo','cena']){
    const id=g+'_'+p,c=griglia.celle[g][p],v=c.voce;
    if(c.speciale||v&&v.consumato||v&&v.bloccata)continue;
    if(c.protetta&&motoreV10VoceCompleta(v))continue;
    if(!c.protetta&&!forza&&v&&motoreV10VoceCompleta(v))continue;
    const k=await motoreV10InferisciCarboidrato(v,rById,vById);
    if(c.protetta&&k)continue;
    ids.add(id);
  }
  stato.slotCarbAutomaticiIds=ids;
  stato.slotCarbAutomaticiResidui=ids.size;
  return ids;
}
function motoreV10ConsumaSlotCarb(stato,id){
  if(!stato.slotCarbAutomaticiIds||!stato.slotCarbAutomaticiIds.has(id))return;
  stato.slotCarbAutomaticiIds.delete(id);
  stato.slotCarbAutomaticiResidui=Math.max(0,(stato.slotCarbAutomaticiResidui||0)-1);
}
function motoreV10QuoteCarbResidue(stato){
  return Object.fromEntries(Object.entries(stato.budgetCarb.residuo||{}).filter(([,n])=>Number(n)>0));
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
  await motoreV10PreparaSlotCarbAutomatici(giorni,griglia,stato,forza);
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
        await put('piano',r.voce);generati.push(r.voce);motoreV10ConsumaSlotCarb(stato,id);continue;
      }
      if(esistente&&!forza&&motoreV10VoceCompleta(esistente))continue;
      if(!cella.gruppoProteicoLargo){
        if(esistente&&protetta)continue;
        stato.errori.push(`Slot senza categoria proteica: ${g} ${pasto}`);continue;
      }
      const r=await generaPortateMotore(g,pasto,cella,preferenze,stato);
      if(!r.voce){stato.errori.push(r.errore);continue;}
      const nuova=Object.assign({},esistente||{},r.voce,{consumato:false,origine:'motore'});
      await put('piano',nuova);generati.push(nuova);motoreV10ConsumaSlotCarb(stato,id);
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
      comp=componentiColazioneDaSet(pref.valore,varianti);
    }else{
      const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
      comp=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],esclusi);
    }
    if(comp)await put('piano',{id:idCol,componenti:comp,origine:'motore_set'});
  }
  const report={data:new Date().toISOString(),versioneMotore:'10.3',ok:stato.errori.length===0,errori:[...griglia.errori,...stato.errori],conteggiProteici:griglia.conteggi,generati:generati.length,carboidratiUsati:stato.carboidratiUsati,quoteCarboidratiResidue:motoreV10QuoteCarbResidue(stato),sottotipiUsati:stato.conteggiSottotipi,verdurePreferiteUsate:[...stato.preferiteVerdureUsate]};
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


/* v10: ricerca culinaria dopo la griglia alimentare.
   Unico/sfiziosa non devono imporre gli ingredienti al piano: devono rappresentare
   la funzione gia decisa. Match forte sugli ingredienti, fallback sulle macro.
   Una verdura ricorrente programmata resta invece HARD e va mantenuta esatta. */
async function motoreV10AnalizzaUnico(r,varianti,ingredienti){
  const vById=new Map(varianti.map(v=>[v.id,v]));
  const bById=new Map(ingredienti.map(b=>[b.id,b]));
  const nomi=[]; const verdure=[];
  for(const ing of (r.ingredienti||[])){
    if(ing.variantId){
      const v=vById.get(ing.variantId); if(!v)continue;
      const nome=(v.nome||'').toLowerCase(); nomi.push(nome);
      const b=bById.get(v.ingredienteId); if(b&&b.gruppo==='verdura')verdure.push(nome);
    }else if(ing.nomeLibero)nomi.push((ing.nomeLibero||'').toLowerCase());
  }
  const testo=nomi.join(' ');
  const carbKeys=[];
  for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){
    const target=(cfg.ingrediente||'').toLowerCase();
    if(target&&nomi.includes(target))carbKeys.push(k);
  }
  const euristiche=[['pasta','pasta'],['pasta_fresca','raviol'],['riso','riso'],['farro','farro'],['orzo','orzo'],['cous_cous','cous cous'],['pane','pane'],['friselle','frisell'],['patate','patat'],['polenta','polenta'],['piadina','piadin'],['crackers','cracker'],['taralli_grissini_crostini','grissin'],['taralli_grissini_crostini','tarall']];
  for(const [k,t] of euristiche)if(CARBOIDRATI_PASTO[k]&&testo.includes(t)&&!carbKeys.includes(k))carbKeys.push(k);
  return {nomi,verdure,carbKeys,categoria:motoreCategoriaDiSottotipo(r.gruppoProteico),sottotipo:r.gruppoProteico||null};
}

async function motoreV10VerduraHardSlot(giorno,pasto,varianti){
  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;
  const [rec,recP]=await Promise.all([getOne('impostazioni','verduraRicorrente'),getOne('impostazioni','verduraRicorrentePasti')]);
  const pasti=recP&&Array.isArray(recP.valore)?recP.valore:[];
  if(!rec||!rec.valore||!pasti.includes(pasto+'_'+idx))return null;
  const v=varianti.find(x=>x.id===rec.valore); return v?(v.nome||'').toLowerCase():null;
}


/* v35 — Unico per funzione, senza esplodere il DB.
   1) Se una ricetta unica ha proteina+verdura ma manca solo il carboidrato,
      la completa con il jolly pane.
   2) Se manca una ricetta unica idonea, compone a richiesta carboidrato +
      secondo + contorno già determinati dai layer precedenti.
   Le ricette composte sono lazy e deduplicate tramite chiaveComposta: non si
   pre-generano migliaia di combinazioni. */
function motoreV10MergeIngredienti(liste){
  const m=new Map(), liberi=[];
  for(const lista of liste){
    for(const ing of (lista||[])){
      if(ing.variantId){
        const k=ing.variantId, q=Number(ing.quantita)||0;
        if(!m.has(k))m.set(k,{variantId:k,nomeLibero:null,quantita:0});
        m.get(k).quantita+=q;
      }else if(ing.nomeLibero){
        const k=(ing.nomeLibero||'').trim().toLowerCase(), q=Number(ing.quantita)||0;
        let x=liberi.find(z=>(z.nomeLibero||'').trim().toLowerCase()===k);
        if(!x){x={variantId:null,nomeLibero:ing.nomeLibero,quantita:0};liberi.push(x);}
        x.quantita+=q;
      }
    }
  }
  return [...m.values(),...liberi].filter(x=>x.quantita>0);
}
async function motoreV10UpsertComposta(chiave,nome,gruppo,ingredienti,procedimento,fonteIds){
  const tutte=await getAll('ricette');
  let r=tutte.find(x=>x.fonte==='composta_runtime'&&x.chiaveComposta===chiave);
  if(!r)r={id:uid()};
  Object.assign(r,{nome,fascia:'facile',porzioni:1,gruppoProteico:gruppo||'',tipoPortata:'unico',fonte:'composta_runtime',chiaveComposta:chiave,fonteIds:fonteIds||[],ingredienti,procedimento:procedimento||[],nutrizioneManualeTotale:null,esclusa:false,piattoSpeciale:false});
  await put('ricette',r);return r;
}
async function motoreV10CompletaUnicoConPane(r,varianti){
  if(!r)return null;
  const cfg=CARBOIDRATI_PASTO.pane;if(!cfg)return null;
  const v=varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v)return null;
  const key='pane|'+r.id;
  const nome=/\bpane\b/i.test(r.nome||'')?r.nome:(r.nome+' con pane');
  const ingredienti=motoreV10MergeIngredienti([r.ingredienti,[{variantId:v.id,nomeLibero:null,quantita:cfg.porzione}]]);
  const procedimento=[...(r.procedimento||[]),'Servi il pane nella dose prevista insieme al piatto.'];
  return motoreV10UpsertComposta(key,nome,r.gruppoProteico,ingredienti,procedimento,[r.id]);
}
async function motoreV10CarboidratoDaDraft(draft,varianti){
  if(!draft)return null;
  if(draft.primoCereale&&CARBOIDRATI_PASTO[draft.primoCereale])return draft.primoCereale;
  if(!draft.primoId)return null;
  const r=await getOne('ricette',draft.primoId);if(!r)return null;
  if(r.cerealeUsato&&CARBOIDRATI_PASTO[r.cerealeUsato])return r.cerealeUsato;
  if(r.tipoCereale&&CARBOIDRATI_PASTO[r.tipoCereale])return r.tipoCereale;
  const vById=new Map((varianti||[]).map(v=>[v.id,v]));
  const nomi=(r.ingredienti||[]).map(i=>i.variantId&&vById.get(i.variantId)?(vById.get(i.variantId).nome||'').toLowerCase():(i.nomeLibero||'').toLowerCase());
  const testo=nomi.join(' ');
  for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){
    const target=(cfg.ingrediente||'').toLowerCase();
    if(target&&nomi.includes(target))return k;
  }
  const eur=[['pasta_fresca','raviol'],['cous_cous','cous cous'],['friselle','frisell'],['polenta','polenta'],['farro','farro'],['orzo','orzo'],['riso','riso'],['patate','patat'],['pane','pane'],['pasta','pasta']];
  for(const [k,t] of eur)if(CARBOIDRATI_PASTO[k]&&testo.includes(t))return k;
  return null;
}
/* v41 — prima della realizzazione culinaria completa SOLO le componenti
   ancora libere. Non tocca mai una scelta già presente nel draft. Serve a evitare
   il falso esito "nessun piatto compatibile" quando il DB possiede i moduli ma
   non una ricetta unica nominale. */
async function motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft){
  if(!draft)return draft;
  const preferenze=typeof caricaPreferenzeMotoreDaSet==='function'?await caricaPreferenzeMotoreDaSet(0):{};
  const stato=typeof creaStatoMotoreSettimana==='function'?await creaStatoMotoreSettimana():null;
  if(!draft.primoCereale && stato && typeof scegliCarboidratoMotore==='function'){
    draft.primoCereale=await scegliCarboidratoMotore(stato,false);
  }
  if(!draft.proteinaId && stato && typeof scegliProteinaModulareMotore==='function'){
    const categoria=draft.categoriaLarga||null;
    const sottotipo=draft.sottotipoProposto||(categoria&&typeof risolviSottotipoFine==='function'?risolviSottotipoFine(categoria,{}):null);
    if(sottotipo){
      const prot=await scegliProteinaModulareMotore(sottotipo,stato,null);
      if(prot){
        draft.proteinaId=prot.id;
        draft.sottotipoProposto=prot.gruppoProteico||sottotipo;
        if(!draft.cottura)draft.cottura=scegliCotturaStandard(prot.gruppoProteico,prot.nome);
      }
    }
  }
  if(!draft.contornoId && stato && typeof scegliContornoMotore==='function'){
    const prefSlot=Object.assign({},preferenze,{_pastoCorrente:pasto});
    const cont=await scegliContornoMotore(giorno,stato,prefSlot,null);
    if(cont)draft.contornoId=cont.id;
  }
  return draft;
}
window.motoreV10CompletaDraftPerRealizzazione=motoreV10CompletaDraftPerRealizzazione;

async function motoreV10ComponiUnicoDaDraft(draft,varianti){
  if(!draft||!draft.proteinaId||!draft.contornoId)return null;
  const [prot,cont]=await Promise.all([getOne('ricette',draft.proteinaId),getOne('ricette',draft.contornoId)]);
  if(!prot||!cont)return null;
  let carb=await motoreV10CarboidratoDaDraft(draft,varianti);
  if(!carb){
    const cous=CARBOIDRATI_PASTO.cous_cous;
    const vc=cous&&varianti.find(x=>(x.nome||'').toLowerCase()===(cous.ingrediente||'').toLowerCase());
    carb=vc?'cous_cous':'pane';
  }
  let cfg=CARBOIDRATI_PASTO[carb];
  let v=cfg&&varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v&&carb!=='pane'){
    carb='pane';cfg=CARBOIDRATI_PASTO.pane;
    v=cfg&&varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  }
  if(!cfg||!v)return null;
  const ingredienti=motoreV10MergeIngredienti([[{variantId:v.id,nomeLibero:null,quantita:cfg.porzione}],prot.ingredienti,cont.ingredienti]);
  const nome=(cfg.label||carb)+' con '+(prot.nome||'proteina').toLowerCase()+' e '+(cont.nome||'verdura').toLowerCase();
  const key=['draft',carb,prot.id,cont.id].join('|');
  const procedimento=[`Prepara ${cfg.label||carb} nella dose prevista.`,...(prot.procedimento||[]),...(cont.procedimento||[]),'Riunisci le componenti nello stesso piatto e servi come piatto unico.'];
  return motoreV10UpsertComposta(key,nome,prot.gruppoProteico||draft.sottotipoProposto||'',ingredienti,procedimento,[prot.id,cont.id]);
}

async function motoreV10ScoreFrigoRicetta(r){
  const score=new Map();
  try{
    const [scad,avanzi,inv]=await Promise.all([getScadenzeImminenti(),getAvanziScomodi(),getAll('inventario')]);
    for(const x of (scad||[]))if(x.variantId)score.set(x.variantId,100);
    for(const x of (avanzi||[]))if(x.variantId)score.set(x.variantId,Math.max(score.get(x.variantId)||0,80));
    for(const x of (inv||[]))if(x.variantId&&x.stato!=='esaurito'&&Number(x.quantita)>0)score.set(x.variantId,Math.max(score.get(x.variantId)||0,10));
  }catch(e){}
  let n=0; for(const i of (r&&r.ingredienti||[]))if(i.variantId&&score.has(i.variantId))n+=score.get(i.variantId);
  return n;
}

trovaPiattoUnicoCompatibileDraft = async function(pasto,giorno,draft,escludiId){
  const info=await infoCombinazioneDraft(draft);
  const [tutte,varianti,ingredienti,storico]=await Promise.all([getAll('ricette'),getAll('varianti'),getAll('ingredienti'),costruisciStoricoConsumatiMotore()]);
  const macroTarget=(draft&&draft.soggettoProteico)||info.categoriaProteica||null;
  const targetCarbKey=info.carboidrato||null;
  const targetCarbNome=(info.ingredienteCarboidrato||'').toLowerCase();
  const targetVerdure=new Set((info.verdure||[]).map(x=>(x||'').toLowerCase()));
  const hardVerdura=await motoreV10VerduraHardSlot(giorno,pasto,varianti);
  let best=-Infinity,compatibili=[];
  for(const r of tutte){
    if(r.id===escludiId||r.esclusa||r.piattoSpeciale||(r.tipoPortata||'unico')!=='unico')continue;
    const a=await motoreV10AnalizzaUnico(r,varianti,ingredienti);
    if(macroTarget&&a.categoria!==macroTarget)continue;
    if(!a.verdure.length)continue;  // la verdura non ha un jolly equivalente
    if(hardVerdura&&!a.verdure.includes(hardVerdura))continue;
    const mancaSoloCarb=!a.carbKeys.length;
    // Il layer alimentare viene prima della ricetta: un carboidrato già deciso non
    // può essere sostituito col jolly pane solo per adattarsi a un record unico.
    if(mancaSoloCarb&&targetCarbKey&&targetCarbKey!=='pane')continue;
    let score=mancaSoloCarb?-25:0;
    score+=Math.min(await motoreV10ScoreFrigoRicetta(r), 15);
    if(targetCarbKey&&a.carbKeys.includes(targetCarbKey))score+=100;
    else if(targetCarbNome&&a.nomi.includes(targetCarbNome))score+=100;
    else score+=30;
    if(info.sottotipoProteico&&a.sottotipo===info.sottotipoProteico)score+=35;
    else if(macroTarget&&a.categoria===macroTarget)score+=20;
    if(hardVerdura)score+=100;
    else if(targetVerdure.size&&a.verdure.some(v=>targetVerdure.has(v)))score+=60;
    else score+=20; // verdura diversa ma stessa funzione, se non era hard
    if(score>best){best=score;compatibili=[r];}
    else if(score===best)compatibili.push(r);
  }
  if(compatibili.length){
    const nonCorrente=compatibili.filter(r=>r.id!==draft.ricettaId),pool=nonCorrente.length?nonCorrente:compatibili;
    let scelta=scegliMenoRecenteMotore(pool,r=>storico.ultimoRicetta[r.id]||0,()=>0);
    if(scelta){
      const a=await motoreV10AnalizzaUnico(scelta,varianti,ingredienti);
      if(!a.carbKeys.length){
        const conPane=await motoreV10CompletaUnicoConPane(scelta,varianti);
        if(conPane)return conPane;
      }
      return scelta;
    }
  }
  // Nessun record unico utile: prova la composizione funzionale già definita dai layer.
  let composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  // Se mancava soltanto una componente libera, completala senza toccare quelle già
  // scelte dall'utente e riprova. motoreV10UpsertComposta aggiunge la nuova
  // realizzazione allo store ricette, evitando un vicolo cieco nella UI.
  await motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft);
  composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  if(typeof registraRichiestaRicettaReview==='function')await registraRichiestaRicettaReview({
    tipo:draft&&draft.tabAttiva==='sfiziosa'?'ricetta_sfiziosa_mancante':'piatto_unico_mancante',
    carboidrato:info.carboidrato,categoriaProteica:macroTarget,sottotipoProteico:info.sottotipoProteico,
    verdura:(info.verdure||[]).join(' + '),pasto,giorno
  });
  return null;
};

window.MOTORE_V10_REGOLE={versione:'1.6',maxPastiSpeciali:MOTORE_V10_MAX_SPECIALI,pipeline:['scelte_user','preferenze_esclusioni','completamento_guida','rotazione_varieta','realizzazione_ricetta']};
})();
