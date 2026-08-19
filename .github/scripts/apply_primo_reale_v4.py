from pathlib import Path
import json, re

# PARTE 1 — ricette.json
p=Path('ricette.json')
data=json.loads(p.read_text(encoding='utf-8'))
compat={
 'al pomodoro':['pasta','pasta_fresca','riso','farro','orzo','cous_cous','polenta'],
 'al pesto di basilico':['pasta','pasta_fresca','riso','farro','orzo'],
 'al ragù di verdure':['pasta','pasta_fresca','riso','farro','orzo','polenta'],
 'alle verdure':['pasta','pasta_fresca','riso','farro','orzo','cous_cous','polenta'],
 'ai funghi':['pasta','pasta_fresca','riso','farro','orzo','polenta'],
 'al limone e prezzemolo':['pasta','riso','farro','orzo','cous_cous'],
 'alla Norma':['pasta','pasta_fresca'],
 'con zucchine e pomodorini':['pasta','pasta_fresca','riso','farro','orzo','cous_cous']
}
ricette=data.get('ricette', data if isinstance(data,list) else [])
for r in ricette:
    if r.get('nome') in compat:
        r['carboidratiCompatibili']=compat[r['nome']]
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding='utf-8')

# PARTE 2, 7, 8 — index.html
p=Path('index.html')
s=p.read_text(encoding='utf-8')

# CARBOIDRATI_PASTO: stato finale v4
repl={
"gnocchi:       { label:'Gnocchi',       ingrediente:'Gnocchi di patate', porzione:175, gruppo:'limitati',      limitato:true, tettoSettimanale:2, haPoolSughi:true },":"gnocchi:       { label:'Gnocchi',       ingrediente:'Gnocchi di patate', porzione:175, gruppo:'limitati',      limitato:true, tettoSettimanale:2, haPoolSughi:false },",
"pasta_ripiena: { label:'Pasta ripiena', ingrediente:'Ravioli ricotta e spinaci', porzione:125, gruppo:'limitati', limitato:true, tettoSettimanale:2, haPoolSughi:true },":"pasta_ripiena: { label:'Pasta ripiena', ingrediente:'Ravioli ricotta e spinaci', porzione:125, gruppo:'limitati', limitato:true, tettoSettimanale:2, haPoolSughi:false, soloSfiziosa:true },",
"pasta_sfoglia: { label:'Pasta sfoglia', ingrediente:'Sfoglie di lasagna', porzione:65, gruppo:'limitati',      limitato:true, tettoSettimanale:2, haPoolSughi:true }":"pasta_sfoglia: { label:'Pasta sfoglia', ingrediente:'Sfoglie di lasagna', porzione:65, gruppo:'limitati',      limitato:true, tettoSettimanale:2, haPoolSughi:false, soloSfiziosa:true }"
}
for a,b in repl.items(): s=s.replace(a,b)

# Manuale: affettati -> nessuna alternativa carboidrato
needle="async function carboidratiAmmessiCambioDraft(giorno,pasto,draft){\n  const stato = await creaStatoMotoreSettimana();"
if needle in s:
    s=s.replace(needle,"async function carboidratiAmmessiCambioDraft(giorno,pasto,draft){\n  // Affettati impone pane: nessuna alternativa da proporre nel bottone manuale.\n  if(draft.sottotipoProposto==='affettati') return [];\n  const stato = await creaStatoMotoreSettimana();",1)

# Editor avanzato: stato compatibilità
needle="  let modalEditSottoCategoriaScelta = ricetta.sottoCategoriaModulare || 'sugo';\n  let modalEditCerealeScelto = ricetta.cerealeLibero ? 'libero' : (ricetta.tipoCereale || 'libero');"
replv=needle+"\n  let modalEditCarbCompatScelti = new Set(ricetta.carboidratiCompatibili || []);"
if 'modalEditCarbCompatScelti' not in s and needle in s:
    s=s.replace(needle,replv,1)

# Editor avanzato: due sezioni HTML
needle='      <label>Ingredienti (uno per riga: nome, grammi) — per i primi modulari, NON inserire il cereale</label>'
html='''      <div id="modalEditSezioneSugoCompat" style="display:${(ricetta.tipoPortata==='modulare' && (ricetta.sottoCategoriaModulare||'sugo')==='sugo')?'block':'none'};"><label>Carboidrati compatibili (solo per i sughi)</label><div class="tabgroup" id="modalEditCarbCompat" style="flex-wrap:wrap;">${['pasta','pasta_fresca','riso','farro','orzo','cous_cous','polenta'].map(k=>`<button data-modaledit-carbcompat="${k}" class="${(ricetta.carboidratiCompatibili||[]).includes(k)?'active':''}">${CARBOIDRATI_PASTO[k]?CARBOIDRATI_PASTO[k].label:k}</button>`).join('')}</div><div class="meta" style="margin-top:4px;">Il motore userà questo sugo SOLO per i carboidrati selezionati qui.</div></div>
      <div id="modalEditSezioneImponeCarb" style="display:${((ricetta.tipoPortata==='secondo')||(ricetta.tipoPortata==='modulare' && ricetta.sottoCategoriaModulare==='proteina'))?'block':'none'};"><label>Impone un carboidrato specifico (facoltativo)</label><select id="modalEditImponeCarboidrato"><option value="" ${!ricetta.imponeCarboidrato?'selected':''}>— nessuno, segue la rotazione normale —</option>${Object.keys(CARBOIDRATI_PASTO).map(k=>`<option value="${k}" ${ricetta.imponeCarboidrato===k?'selected':''}>${CARBOIDRATI_PASTO[k].label}</option>`).join('')}</select><div class="meta" style="margin-top:4px;">Usato per casi individuali oltre alla regola di famiglia già cablata per gli affettati.</div></div>
'''+needle
if 'id="modalEditSezioneSugoCompat"' not in s and needle in s:
    s=s.replace(needle,html,1)

# Editor avanzato: listener v4
old="""    document.getElementById('modalEditTipoPortata')?.addEventListener('change', (e)=>{const tipo=e.target.value;document.getElementById('modalEditSezioneModulare').style.display=tipo==='modulare'?'block':'none';document.getElementById('modalEditSezioneCereale').style.display=tipo==='primo'?'block':'none';});
    document.getElementById('modalEditSottoCategoriaMod')?.addEventListener('click', (e)=>{const btn=e.target.closest('[data-modaledit-sottocat]');if(!btn)return;modalEditSottoCategoriaScelta=btn.dataset.modaleditSottocat;document.querySelectorAll('#modalEditSottoCategoriaMod button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');});
    document.getElementById('modalEditCerealeTab')?.addEventListener('click', (e)=>{const btn=e.target.closest('[data-modaledit-cereale]');if(!btn)return;modalEditCerealeScelto=btn.dataset.modaleditCereale;document.querySelectorAll('#modalEditCerealeTab button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');});"""
new="""    document.getElementById('modalEditTipoPortata')?.addEventListener('change', (e)=>{
      const tipo=e.target.value;
      document.getElementById('modalEditSezioneModulare').style.display=tipo==='modulare'?'block':'none';
      document.getElementById('modalEditSezioneCereale').style.display=tipo==='primo'?'block':'none';
      document.getElementById('modalEditSezioneSugoCompat').style.display=(tipo==='modulare' && modalEditSottoCategoriaScelta==='sugo')?'block':'none';
      document.getElementById('modalEditSezioneImponeCarb').style.display=(tipo==='secondo' || (tipo==='modulare' && modalEditSottoCategoriaScelta==='proteina'))?'block':'none';
    });
    document.getElementById('modalEditSottoCategoriaMod')?.addEventListener('click', (e)=>{
      const btn=e.target.closest('[data-modaledit-sottocat]');if(!btn)return;
      modalEditSottoCategoriaScelta=btn.dataset.modaleditSottocat;
      document.querySelectorAll('#modalEditSottoCategoriaMod button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('modalEditSezioneSugoCompat').style.display=(modalEditSottoCategoriaScelta==='sugo')?'block':'none';
      document.getElementById('modalEditSezioneImponeCarb').style.display=(modalEditSottoCategoriaScelta==='proteina')?'block':'none';
    });
    document.getElementById('modalEditCarbCompat')?.addEventListener('click', (e)=>{
      const btn=e.target.closest('[data-modaledit-carbcompat]'); if(!btn) return;
      const k = btn.dataset.modaleditCarbcompat;
      if(modalEditCarbCompatScelti.has(k)){ modalEditCarbCompatScelti.delete(k); btn.classList.remove('active'); }
      else{ modalEditCarbCompatScelti.add(k); btn.classList.add('active'); }
    });
    document.getElementById('modalEditCerealeTab')?.addEventListener('click', (e)=>{const btn=e.target.closest('[data-modaledit-cereale]');if(!btn)return;modalEditCerealeScelto=btn.dataset.modaleditCereale;document.querySelectorAll('#modalEditCerealeTab button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');});"""
if old in s:
    s=s.replace(old,new,1)

# Editor avanzato: salvataggio campi
needle="    ricetta.tipoCereale = tipoPortataScelto==='primo' && modalEditCerealeScelto!=='libero' ? modalEditCerealeScelto : null;"
extra=needle+"\n    ricetta.carboidratiCompatibili = (tipoPortataScelto==='modulare' && modalEditSottoCategoriaScelta==='sugo') ? Array.from(modalEditCarbCompatScelti) : (ricetta.carboidratiCompatibili || []);\n    ricetta.imponeCarboidrato = document.getElementById('modalEditImponeCarboidrato') ? (document.getElementById('modalEditImponeCarboidrato').value || null) : (ricetta.imponeCarboidrato || null);"
if 'ricetta.imponeCarboidrato = document.getElementById' not in s and needle in s:
    s=s.replace(needle,extra,1)

p.write_text(s,encoding='utf-8')

# PARTE 3 — motor-v10.js (funzioni condivise, stato v4)
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
start=s.index('async function motoreV10ScegliPrimoReale(')
end=s.index('function motoreV10VoceHaContenuto',start)
block="""async function motoreV10ScegliPrimoReale(carb, stato, preferenze){
  const cfg = CARBOIDRATI_PASTO[carb];
  if(!cfg) return null;
  const target = (cfg.ingrediente||'').toLowerCase();
  const [tutte, varianti] = await Promise.all([getAll('ricette'), getAll('varianti')]);
  const vById = new Map(varianti.map(v=>[v.id,v]));

  let pool = tutte.filter(r=>{
    if(r.esclusa || (r.tipoPortata||'unico')!=='primo') return false;
    const nomi = (r.ingredienti||[]).map(i=>{
      if(i.variantId) return (vById.get(i.variantId)?.nome||'').toLowerCase();
      return (i.nomeLibero||'').toLowerCase();
    });
    return target && nomi.includes(target);
  });
  if(!pool.length) return null;

  const prefIds = new Set(preferenze?.ingredientiPreferitiVariantIds || []);
  if(prefIds.size){
    const conPreferenza = pool.filter(r=>(r.ingredienti||[]).some(i=>i.variantId && prefIds.has(i.variantId)));
    if(conPreferenza.length) pool = conPreferenza;
  }

  return scegliMenoRecenteMotore(pool, r=>stato.storico.ultimoRicetta[r.id]||0, ()=>0);
}

async function motoreV10CarboidratoFattibile(carb, giorno, categoria, stato){
  const cfg = CARBOIDRATI_PASTO[carb];
  if(!cfg) return false;

  if(cfg.limitato){
    const attivato = ((stato.budgetCarb && stato.budgetCarb.config && stato.budgetCarb.config[carb]) || 0) > 0;
    if(!attivato) return false;
    const usato = await contaCarboidratoSettimana(carb);
    if(usato >= (cfg.tettoSettimanale||2)) return false;
  }

  if(cfg.jolly) return true;

  if(cfg.soloSfiziosa){
    if(!categoria) return false;
    const tutte = await getAll('ricette');
    return tutte.some(r=>!r.esclusa && !r.piattoSpeciale && (r.tipoPortata||'unico')==='unico'
      && motoreCategoriaDiSottotipo(r.gruppoProteico)===categoria);
  }

  const primoReale = await motoreV10ScegliPrimoReale(carb, stato, {});
  if(primoReale) return true;

  if(cfg.haPoolSughi){
    const sughi = await cercaComponentiModulari('sugo');
    return sughi.some(s=>(s.carboidratiCompatibili||[]).includes(carb));
  }
  return false;
}

window.motoreV10ScegliPrimoReale = motoreV10ScegliPrimoReale;
window.motoreV10CarboidratoFattibile = motoreV10CarboidratoFattibile;

"""
s=s[:start]+block+s[end:]
p.write_text(s,encoding='utf-8')

# PARTE 4 — motor-v9-2.js
p=Path('motor-v9-2.js')
s=p.read_text(encoding='utf-8')
start=s.index('async function scegliCarboidratoMotore(')
end=s.index('/* Override del compositore modulare',start)
block="""async function scegliCarboidratoMotore(stato, forzaJolly, giorno, categoria){
  if(forzaJolly){
    let pool=['pane','friselle'].filter(k=>CARBOIDRATI_PASTO[k]);
    pool=pool.filter(k=>{ const c=CARBOIDRATI_PASTO[k]; return !c.limitato || (stato.carboidratiUsati[k]||0)<(c.tettoSettimanale||2); });
    if(!pool.length) pool=['pane'];
    const nonUsati=pool.filter(k=>(stato.carboidratiUsati[k]||0)===0);
    if(nonUsati.length) pool=nonUsati;
    const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
    stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
    return scelta;
  }

  const residui = Object.entries(stato.budgetCarb.residuo).filter(([k,n])=>n>0&&CARBOIDRATI_PASTO[k]);
  let pool = residui.length ? residui.map(([k])=>k) : CARBOIDRATI_ROTAZIONE.filter(k=>CARBOIDRATI_PASTO[k]);

  const fattibili=[];
  for(const k of pool){
    if(await motoreV10CarboidratoFattibile(k, giorno, categoria, stato)) fattibili.push(k);
  }
  pool = fattibili.length ? fattibili : ['pane'];

  const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
  stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
  if(stato.budgetCarb.residuo[scelta]>0) stato.budgetCarb.residuo[scelta]--;
  return scelta;
}

"""
s=s[:start]+block+s[end:]
p.write_text(s,encoding='utf-8')

# PARTE 5/6 — motor-v9-3.js
p=Path('motor-v9-3.js')
s=p.read_text(encoding='utf-8')
start=s.index('componiPastoModulare = async function(')
end=s.index('async function caricaPreferenzeMotoreDaSet',start)
compose="""componiPastoModulare = async function(gruppoProteico, giorno, escludiSugoId, escludiProteinaId, escludiContornoId, forzaJolly, preferenzeMotore, statoMotore){
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
  const categoriaLarga = gruppoProteico ? motoreCategoriaDiSottotipo(gruppoProteico) : null;

  // Affettati impone pane: scavalca la rotazione, non passa da scegliCarboidratoMotore.
  const carb = (gruppoProteico==='affettati')
    ? (statoMotore.carboidratiUsati['pane']=(statoMotore.carboidratiUsati['pane']||0)+1, 'pane')
    : await scegliCarboidratoMotore(statoMotore,!!forzaJolly,giorno,categoriaLarga);
  const carbCfg=CARBOIDRATI_PASTO[carb];
  if(!carbCfg) return null;

  if(carbCfg.soloSfiziosa){
    return {soloSfiziosa:true, primoCarboidrato:carb, categoriaLarga};
  }

  let sugo=null, primoRicettaRealeId=null;
  if(!carbCfg.jolly){
    const primoReale = await motoreV10ScegliPrimoReale(carb, statoMotore, preferenzeMotore);
    if(primoReale){
      primoRicettaRealeId = primoReale.id;
    }else if(carbCfg.haPoolSughi){
      const tuttiSughi = await cercaComponentiModulari('sugo');
      const compatibili = tuttiSughi.filter(s=>(s.carboidratiCompatibili||[]).includes(carb));
      const nonUsati = compatibili.filter(s=>s.id!==escludiSugoId);
      const pool = nonUsati.length?nonUsati:compatibili;
      sugo = scegliMenoRecenteMotore(pool, r=>statoMotore.storico.ultimoRicetta[r.id]||0, ()=>0);
    }
  }

  const proteina=gruppoProteico ? await scegliProteinaModulareMotore(gruppoProteico,statoMotore,escludiProteinaId) : null;
  const contorno=await scegliContornoMotore(giorno,statoMotore,preferenzeMotore,escludiContornoId);
  if(!proteina || !contorno) return null;

  const cottura=scegliCotturaStandard(proteina.gruppoProteico,proteina.nome);
  return {
    primoRicettaRealeId,
    primoNome: primoRicettaRealeId ? null : (sugo?componiNomePrimoModulare(carbCfg.label,sugo.nome):carbCfg.label),
    primoCarboidrato:carb,
    primoSugoId:sugo?sugo.id:null,
    primoEJolly:!!carbCfg.jolly,
    secondoNome:componiNomeSecondoModulare(proteina.nome,cottura,contorno.nome),
    proteinaId:proteina.id,
    cottura,
    contornoId:contorno.id
  };
};

"""
s=s[:start]+compose+s[end:]
start=s.index('async function generaPortateMotore(')
end=s.index('/* Generatore unico v9.',start)
gen="""async function generaPortateMotore(giorno,pasto,cella,preferenze,stato){
  const categoria=cella.gruppoProteicoLargo;
  const sottotipo=await scegliSottotipoMotore(categoria,stato);
  const pocoTempo=(pasto==='pranzo'&&preferenze.pocoTempoPranzo)||(pasto==='cena'&&preferenze.pocoTempoCena);
  const esito=await componiPastoModulare(sottotipo,giorno,null,null,null,pocoTempo,preferenze,stato);
  if(!esito) return {voce:null,errore:`Nessuna combinazione completa per ${giorno} ${pasto} (${categoria}/${sottotipo})`};

  if(esito.soloSfiziosa){
    const draftFittizio={categoriaLarga:categoria, sottotipoProposto:sottotipo, contornoId:null};
    const sfiziosa=await trovaPiattoUnicoCompatibileDraft(pasto, giorno, draftFittizio, null);
    if(!sfiziosa) return {voce:null,errore:`Sfiziosa risultata indisponibile a runtime per ${giorno} ${pasto} — verificare coerenza dati`};
    return {
      voce:{
        id:giorno+'_'+pasto, modo:'unico', fascia:sfiziosa.fascia||'medio', porzioni:1,
        ricettaId:sfiziosa.id, primoId:null, secondoId:null, contornoId:null,
        categoriaLargaE1:categoria, sottotipoProteicoMotore:sottotipo,
        origineCategoriaMotore:cella.origine, origine:'motore'
      },
      errore:null
    };
  }

  let primoId = esito.primoRicettaRealeId || null;
  if(pocoTempo && !primoId){
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
      id:giorno+'_'+pasto, modo:'multi', fascia:'facile', porzioni:1,
      primoId, primoCereale:esito.primoCarboidrato, primoSugoId:esito.primoSugoId||null,
      secondoId:esito.proteinaId, contornoId:esito.contornoId, cotturaSecondo:esito.cottura||null,
      ricettaId:null, categoriaLargaE1:categoria, sottotipoProteicoMotore:sottotipo,
      origineCategoriaMotore:cella.origine, pocoTempoMotore:!!pocoTempo, origine:'motore'
    },
    errore:null
  };
}

"""
s=s[:start]+gen+s[end:]
p.write_text(s,encoding='utf-8')

# Verifiche minime prima del commit
idx=Path('index.html').read_text(encoding='utf-8')
m93=Path('motor-v9-3.js').read_text(encoding='utf-8')
m92=Path('motor-v9-2.js').read_text(encoding='utf-8')
m10=Path('motor-v10.js').read_text(encoding='utf-8')
checks=[
 "if(draft.sottotipoProposto==='affettati') return [];" in idx,
 'modalEditCarbCompatScelti' in idx,
 'modalEditImponeCarboidrato' in idx,
 "gruppoProteico==='affettati'" in m93,
 'if(esito.soloSfiziosa)' in m93,
 'motoreV10CarboidratoFattibile(k, giorno, categoria, stato)' in m92,
 'async function motoreV10CarboidratoFattibile' in m10
]
if not all(checks):
    raise SystemExit('Verifica patch v4 fallita: '+str(checks))
