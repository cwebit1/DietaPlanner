from pathlib import Path
import re

# v42 — revisione strutturale dei refresh specifici.
# Principi:
# 1) un refresh manuale non cambia mai macrocategoria;
# 2) l'apertura del draft non sovrascrive componenti già presenti;
# 3) il frigo orienta le alternative culinarie a parità di macro;
# 4) se la macro non ha alternative, si registra la lacuna invece di saltare macro.

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# ---- sostituisce generaCandidatoDraftModulare: preserva componenti esistenti e ricava la macro dal secondo corrente ----
pat=r"async function generaCandidatoDraftModulare\(pasto, giorno\)\{.*?\n\}\n\nasync function rigeneraPortataDraft"
m=re.search(pat,s,re.S)
if not m:
    raise SystemExit('generaCandidatoDraftModulare non trovato')
new_func=r'''async function generaCandidatoDraftModulare(pasto, giorno){
  giorno=giorno||giornoSelezionato;
  const draft=draftPasto[giorno+'_'+pasto]; if(!draft)return;

  // v42: prima ricava sempre la macro dalla proteina già presente. Un pasto con
  // Uova sode deve restare UOVA anche se vecchi record non avevano categoriaLargaE1.
  if(!draft.categoriaLarga && draft.proteinaId){
    const corrente=await getOne('ricette',draft.proteinaId);
    if(corrente&&corrente.gruppoProteico){
      draft.categoriaLarga=motoreCategoriaDiSottotipo(corrente.gruppoProteico)||corrente.gruppoProteico;
      draft.sottotipoProposto=corrente.gruppoProteico;
    }
  }

  // Un draft completo NON va rigenerato all'apertura: prima questa funzione
  // riassegnava primo/secondo/contorno e poteva cambiare anche la macro proteica.
  if(draft.primoCereale && draft.proteinaId && draft.contornoId) return;

  const voce=await getOne('piano',giorno+'_'+pasto);
  const categoriaLarga=draft.categoriaLarga||(voce&&voce.categoriaLargaE1)||null;
  draft.categoriaLarga=categoriaLarga||null;
  if(!draft.sottotipoProposto && draft.proteinaId){
    const corrente=await getOne('ricette',draft.proteinaId);
    if(corrente)draft.sottotipoProposto=corrente.gruppoProteico||null;
  }

  // Completa soltanto i vuoti usando il coordinatore v10; non tocca mai ciò che
  // esiste già. Poi compone il primo se il cereale usa un pool sughi.
  if(typeof motoreV10CompletaDraftPerRealizzazione==='function'){
    await motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft);
  }
  if(draft.primoCereale && !draft.primoId){
    const cfg=CARBOIDRATI_PASTO[draft.primoCereale];
    if(cfg&&cfg.haPoolSughi){
      let sugo=draft.primoSugoId?await getOne('ricette',draft.primoSugoId):null;
      if(!sugo&&typeof scegliSugoMotore==='function'){
        const stato=typeof creaStatoMotoreSettimana==='function'?await creaStatoMotoreSettimana():null;
        if(stato)sugo=await scegliSugoMotore(stato,null);
      }
      if(sugo){
        draft.primoSugoId=sugo.id;
        const pr=await componiPrimoModulare(sugo,draft.primoCereale);
        if(pr)draft.primoId=pr.id;
      }
    }
  }
}

async function rigeneraPortataDraft'''
s=s[:m.start()]+new_func+s[m.end():]

# ---- helper frigo per refresh manuali ----
anchor="async function cambiaCellaDraft(pasto, giorno, cella){"
if anchor not in s: raise SystemExit('cambiaCellaDraft anchor non trovato')
helper=r'''async function variantiFrigoPrioritarieRefresh(){
  const score=new Map();
  try{
    const [scad,avanzi,inv]=await Promise.all([getScadenzeImminenti(),getAvanziScomodi(),getAll('inventario')]);
    for(const x of (scad||[])) if(x.variantId) score.set(x.variantId,100);
    for(const x of (avanzi||[])) if(x.variantId) score.set(x.variantId,Math.max(score.get(x.variantId)||0,80));
    for(const x of (inv||[])) if(x.variantId&&x.stato!=='esaurito'&&Number(x.quantita)>0) score.set(x.variantId,Math.max(score.get(x.variantId)||0,10));
  }catch(e){}
  return score;
}
function punteggioRicettaFrigoRefresh(r,score){
  let n=0;
  for(const i of (r&&r.ingredienti||[])) if(i.variantId&&score.has(i.variantId)) n+=score.get(i.variantId);
  return n;
}
async function macroProteicaDraftRefresh(draft){
  if(draft.categoriaLarga)return draft.categoriaLarga;
  const id=draft.proteinaId||draft.ricettaId;
  if(!id)return null;
  const r=await getOne('ricette',id);
  if(!r||!r.gruppoProteico)return null;
  const macro=motoreCategoriaDiSottotipo(r.gruppoProteico)||r.gruppoProteico;
  draft.categoriaLarga=macro;
  if(!draft.sottotipoProposto)draft.sottotipoProposto=r.gruppoProteico;
  return macro;
}

'''
s=s.replace(anchor,helper+anchor,1)

# ---- sostituisce blocco proteina: MAI fallback fuori macro, priorità frigo, rotazione ----
start=s.find("  }else if(cella==='proteina'){")
end=s.find("  }else if(cella==='cottura'){",start)
if start<0 or end<0: raise SystemExit('blocco proteina cambiaCellaDraft non trovato')
new_prot=r'''  }else if(cella==='proteina'){
    const macro=await macroProteicaDraftRefresh(draft);
    if(!macro){
      await avviso('Non riesco a determinare la macrocategoria proteica di questo secondo.');
      return;
    }
    const [tutte,frigo,storico]=await Promise.all([
      getAll('ricette'),variantiFrigoPrioritarieRefresh(),
      typeof costruisciStoricoConsumatiMotore==='function'?costruisciStoricoConsumatiMotore():Promise.resolve({ultimoRicetta:{}})
    ]);
    let pool=tutte.filter(r=>{
      if(r.esclusa||r.piattoSpeciale||r.id===draft.proteinaId)return false;
      const eProteina=(r.tipoPortata==='modulare'&&r.sottoCategoriaModulare==='proteina')||r.tipoPortata==='secondo';
      if(!eProteina||!r.gruppoProteico)return false;
      return (motoreCategoriaDiSottotipo(r.gruppoProteico)||r.gruppoProteico)===macro;
    });
    if(!pool.length){
      if(typeof registraRichiestaRicettaReview==='function') await registraRichiestaRicettaReview({tipo:'famiglia_proteica_refresh_mancante',categoriaProteica:macro,sottotipoProteico:draft.sottotipoProposto||null,pasto,giorno});
      await avviso('Non ci sono ancora altre preparazioni disponibili per questa famiglia. La combinazione è stata segnalata per il ricettario.');
      return;
    }
    // Prima usa ciò che ha senso consumare dal frigo; a parità evita ciò che è stato
    // mangiato più di recente. Nessun candidato di carne/pesce può entrare se macro=UOVA.
    let best=-Infinity,scelte=[];
    for(const r of pool){
      const sf=punteggioRicettaFrigoRefresh(r,frigo);
      const rec=(storico&&storico.ultimoRicetta&&storico.ultimoRicetta[r.id])||0;
      const score=sf*1000000-rec;
      if(score>best){best=score;scelte=[r];}else if(score===best)scelte.push(r);
    }
    const p=(typeof motoreMescola==='function'?motoreMescola(scelte):scelte)[0];
    if(p){
      draft.proteinaId=p.id;
      draft.categoriaLarga=macro;
      draft.sottotipoProposto=p.gruppoProteico;
      draft.cottura=scegliCotturaStandard(p.gruppoProteico,p.nome);
    }
'''
s=s[:start]+new_prot+s[end:]

# ---- sugo: resta sugo ma privilegia ingredienti reali disponibili/urgenti ----
start=s.find("  }else if(cella==='sugo'){")
end=s.find("  }else if(cella==='proteina'){",start)
if start<0 or end<0: raise SystemExit('blocco sugo non trovato')
new_sugo=r'''  }else if(cella==='sugo'){
    const cfg=CARBOIDRATI_PASTO[draft.primoCereale]; if(!cfg||!cfg.haPoolSughi)return;
    const [sughi,frigo]=await Promise.all([cercaComponentiModulari('sugo'),variantiFrigoPrioritarieRefresh()]);
    const pool=sughi.filter(x=>x.id!==draft.primoSugoId);
    if(pool.length){
      let best=-Infinity,scelte=[];
      for(const x of pool){
        const score=punteggioRicettaFrigoRefresh(x,frigo);
        if(score>best){best=score;scelte=[x];}else if(score===best)scelte.push(x);
      }
      const x=(typeof motoreMescola==='function'?motoreMescola(scelte):scelte)[0];
      draft.primoSugoId=x.id;
      const pr=await componiPrimoModulare(x,draft.primoCereale);
      draft.primoId=pr?pr.id:null;
    }
'''
s=s[:start]+new_sugo+s[end:]

# cache bust: v42 usa anche un nuovo override/semantica nell'index stesso
s=s.replace('<script src="motor-v10.js?v=8"></script>','<script src="motor-v10.js?v=9"></script>',1)
p.write_text(s,encoding='utf-8')

# ---- motor-v10: anche unico/sfiziosa deve usare il frigo come criterio culinario secondario ----
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
anchor="trovaPiattoUnicoCompatibileDraft = async function(pasto,giorno,draft,escludiId){"
if anchor not in s: raise SystemExit('trovaPiattoUnicoCompatibileDraft non trovato')
helper=r'''async function motoreV10ScoreFrigoRicetta(r){
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

'''
if 'async function motoreV10ScoreFrigoRicetta' not in s:s=s.replace(anchor,helper+anchor,1)
# aggiunge il bonus al punteggio senza alterare i vincoli hard/macro
needle="    let score=mancaSoloCarb?-25:0;"
if needle not in s: raise SystemExit('score unico non trovato')
s=s.replace(needle,"    let score=mancaSoloCarb?-25:0;\n    score+=(await motoreV10ScoreFrigoRicetta(r))*2;",1)
s=s.replace("window.MOTORE_V10_REGOLE={versione:'1.4'","window.MOTORE_V10_REGOLE={versione:'1.5'",1)
p.write_text(s,encoding='utf-8')

# ---- regole permanenti ----
p=Path('MOTORE-REGOLE.md')
s=p.read_text(encoding='utf-8')
extra=r'''

## Refresh specifici e realizzazione culinaria (v42)

- Un refresh manuale di una singola portata **non cambia mai la macrocategoria**: UOVA resta UOVA, PESCE resta PESCE, CARNE resta CARNE, ecc.
- La macrocategoria deve essere ricavata anche dai vecchi pasti/ricette che non hanno i marker recenti; l'assenza di `categoriaLargaE1` non autorizza un pool globale.
- L'apertura dell'editor di un pasto non deve rigenerare né sovrascrivere componenti già presenti: completa solo i vuoti.
- Dentro la macrocategoria la preparazione concreta è libera e deve essere variata; a parità di validità si privilegiano ingredienti realmente disponibili, in scadenza o avanzati. Questo vale anche per sughi e per la ricerca di piatti unici/sfiziosi.
- Esempio UOVA: uova sode, alla coque, strapazzate, frittate, omelette e altre preparazioni restano nella stessa macro. Le varianti di frittata/omelette devono essere guidate anche da ciò che c'è nel frigo.
- Se una famiglia non dispone di alternative culinarie sufficienti, **non si salta a un'altra macro**: si registra la lacuna nel Review ricette e si rinforza il DB/template.
- Un piatto unico può rappresentare la stessa macro con una preparazione più completa; il cambio di forma culinaria non autorizza il cambio di funzione nutrizionale.
'''
if '## Refresh specifici e realizzazione culinaria (v42)' not in s:s+=extra
p.write_text(s,encoding='utf-8')

print('v42 applied')
