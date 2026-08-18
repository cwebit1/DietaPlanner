from pathlib import Path

# v37 — poco tempo compatibile con quote carboidrati + friselle reali <= 1.

# ---------- motor-v9-2.js: il jolly rapido non può consumare gli slot necessari alle quote Set ----------
p=Path('motor-v9-2.js');s=p.read_text(encoding='utf-8')
old="""async function scegliCarboidratoMotore(stato, forzaJolly){
  if(forzaJolly){
    let pool=['pane','friselle'].filter(k=>CARBOIDRATI_PASTO[k]);
    // Rispetta il tetto reale definito in CARBOIDRATI_PASTO (friselle = 1/settimana).
    pool=pool.filter(k=>{ const c=CARBOIDRATI_PASTO[k]; return !c.limitato || (stato.carboidratiUsati[k]||0)<(c.tettoSettimanale||2); });
    if(!pool.length) pool=['pane'];
    const nonUsati=pool.filter(k=>(stato.carboidratiUsati[k]||0)===0);
    if(nonUsati.length) pool=nonUsati;
    const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
    stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
    return scelta;
  }

  // Quote esplicite Set: prima soddisfa le caselle ancora residue.
  const residui=Object.entries(stato.budgetCarb.residuo).filter(([k,n])=>n>0&&CARBOIDRATI_PASTO[k]);
"""
new="""async function scegliCarboidratoMotore(stato, forzaJolly){
  const residuiOra=Object.entries(stato.budgetCarb.residuo).filter(([k,n])=>n>0&&CARBOIDRATI_PASTO[k]);
  const totaleResiduo=residuiOra.reduce((n,[,q])=>n+(Number(q)||0),0);
  const slotResidui=Number.isFinite(stato.slotCarbAutomaticiResidui)?stato.slotCarbAutomaticiResidui:Infinity;
  // Poco tempo è una preferenza forte, ma non può rendere matematicamente impossibile
  // soddisfare quote carboidrati già scelte dall'utente. Usa pane/friselle soltanto
  // quando, dopo questo slot, resterà ancora capacità sufficiente per tutte le quote.
  const puoUsareJolly=!!forzaJolly && (totaleResiduo===0 || slotResidui>totaleResiduo);
  if(puoUsareJolly){
    let pool=['pane','friselle'].filter(k=>CARBOIDRATI_PASTO[k]);
    pool=pool.filter(k=>{ const c=CARBOIDRATI_PASTO[k]; return !c.limitato || (stato.carboidratiUsati[k]||0)<(c.tettoSettimanale||2); });
    if(!pool.length) pool=['pane'];
    const nonUsati=pool.filter(k=>(stato.carboidratiUsati[k]||0)===0);
    if(nonUsati.length) pool=nonUsati;
    const scelta=scegliMenoRecenteMotore(pool,k=>stato.storico.ultimoCarb[k]||0,k=>stato.carboidratiUsati[k]||0);
    stato.carboidratiUsati[scelta]=(stato.carboidratiUsati[scelta]||0)+1;
    return scelta;
  }

  // Quote esplicite Set: prima soddisfa le caselle ancora residue.
  const residui=residuiOra;
"""
if old not in s and 'const puoUsareJolly=!!forzaJolly' not in s:raise SystemExit('scegliCarboidrato target not found')
if old in s:s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# ---------- motor-v9-3.js: la ricetta veloce deve corrispondere al carb contabilizzato ----------
p=Path('motor-v9-3.js');s=p.read_text(encoding='utf-8')
anchor="async function generaPortateMotore(giorno,pasto,cella,preferenze,stato){"
helper="""async function scegliPrimoVelocePerCarbMotore(carb,stato){
  const tutte=await getAll('ricette');
  let pool=tutte.filter(r=>{
    if(r.esclusa||r.piattoSpeciale||(r.tipoPortata||'unico')!=='primo')return false;
    const nome=(r.nome||'').toLowerCase();
    const isFrisella=nome.includes('frisell');
    const isPane=nome.includes('bruschett')||nome.includes('pane')||(!isFrisella&&(r.ingredienti||[]).some(i=>(i.nomeLibero||'').toLowerCase()==='pane fresco'));
    return carb==='friselle'?isFrisella:(carb==='pane'?isPane:false);
  });
  if(!pool.length)return null;
  if(stato&&stato.ricetteUsateGenerazione){
    const nuove=pool.filter(r=>!stato.ricetteUsateGenerazione.has(r.id));if(nuove.length)pool=nuove;
  }
  const scelta=scegliMenoRecenteMotore(pool,r=>stato&&stato.storico?(stato.storico.ultimoRicetta[r.id]||0):0,()=>0);
  if(scelta&&stato&&stato.ricetteUsateGenerazione)stato.ricetteUsateGenerazione.add(scelta.id);
  return scelta;
}

"""
if 'async function scegliPrimoVelocePerCarbMotore' not in s:
    if anchor not in s:raise SystemExit('generaPortate anchor not found')
    s=s.replace(anchor,helper+anchor,1)
old="""  let primoId=null;
  if(pocoTempo){
    const rapido=await scegliPrimoVelocePaneFriselle();
    if(rapido) primoId=rapido.id;
  }
"""
new="""  let primoId=null;
  if(pocoTempo && (esito.primoCarboidrato==='pane'||esito.primoCarboidrato==='friselle')){
    const rapido=await scegliPrimoVelocePerCarbMotore(esito.primoCarboidrato,stato);
    if(rapido) primoId=rapido.id;
  }
"""
if old not in s and 'scegliPrimoVelocePerCarbMotore(esito.primoCarboidrato,stato)' not in s:raise SystemExit('rapid first target not found')
if old in s:s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# ---------- motor-v10.js: conta gli slot nei quali il motore deve ancora scegliere il carboidrato ----------
p=Path('motor-v10.js');s=p.read_text(encoding='utf-8')
anchor="async function motoreV10CompletaMulti(giorno,pasto,voce,cella,preferenze,stato){"
helper="""async function motoreV10PreparaSlotCarbAutomatici(giorni,griglia,stato,forza){
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

"""
if 'async function motoreV10PreparaSlotCarbAutomatici' not in s:
    if anchor not in s:raise SystemExit('v10 carb slot anchor not found')
    s=s.replace(anchor,helper+anchor,1)
old="""  const griglia=await motoreV10CostruisciGriglia(giorni,preferenze,stato);
  await motoreV10AssorbiQuoteProtette(giorni,griglia,stato);
  const generati=[];
"""
new="""  const griglia=await motoreV10CostruisciGriglia(giorni,preferenze,stato);
  await motoreV10AssorbiQuoteProtette(giorni,griglia,stato);
  await motoreV10PreparaSlotCarbAutomatici(giorni,griglia,stato,forza);
  const generati=[];
"""
if old not in s and 'await motoreV10PreparaSlotCarbAutomatici(giorni,griglia,stato,forza);' not in s:raise SystemExit('v10 prepare call target not found')
if old in s:s=s.replace(old,new,1)

old="""        await put('piano',r.voce);generati.push(r.voce);continue;
"""
new="""        await put('piano',r.voce);generati.push(r.voce);motoreV10ConsumaSlotCarb(stato,id);continue;
"""
if old in s:s=s.replace(old,new,1)

old="""      await put('piano',nuova);generati.push(nuova);
"""
new="""      await put('piano',nuova);generati.push(nuova);motoreV10ConsumaSlotCarb(stato,id);
"""
if old in s:s=s.replace(old,new,1)

old="""  const report={data:new Date().toISOString(),versioneMotore:'10',ok:stato.errori.length===0,errori:[...griglia.errori,...stato.errori],conteggiProteici:griglia.conteggi,generati:generati.length,carboidratiUsati:stato.carboidratiUsati,sottotipiUsati:stato.conteggiSottotipi,verdurePreferiteUsate:[...stato.preferiteVerdureUsate]};
"""
new="""  const report={data:new Date().toISOString(),versioneMotore:'10.3',ok:stato.errori.length===0,errori:[...griglia.errori,...stato.errori],conteggiProteici:griglia.conteggi,generati:generati.length,carboidratiUsati:stato.carboidratiUsati,quoteCarboidratiResidue:motoreV10QuoteCarbResidue(stato),sottotipiUsati:stato.conteggiSottotipi,verdurePreferiteUsate:[...stato.preferiteVerdureUsate]};
"""
if old not in s and 'quoteCarboidratiResidue:motoreV10QuoteCarbResidue(stato)' not in s:raise SystemExit('report target not found')
if old in s:s=s.replace(old,new,1)
s=s.replace("window.MOTORE_V10_REGOLE={versione:'1.2'","window.MOTORE_V10_REGOLE={versione:'1.3'",1)
p.write_text(s,encoding='utf-8')

# ---------- index cache ----------
p=Path('index.html');s=p.read_text(encoding='utf-8')
s=s.replace('<script src="motor-v9-2.js?v=11"></script>','<script src="motor-v9-2.js?v=12"></script>')
s=s.replace('<script src="motor-v9-3.js?v=11"></script>','<script src="motor-v9-3.js?v=12"></script>')
s=s.replace('<script src="motor-v10.js?v=5"></script>','<script src="motor-v10.js?v=6"></script>')
p.write_text(s,encoding='utf-8')

# ---------- rulebook ----------
p=Path('MOTORE-REGOLE.md');s=p.read_text(encoding='utf-8')
extra='''\n### Poco tempo e quote carboidrati (v37)\n\n- `Poco tempo` favorisce pane/bruschette/friselle senza consumare gli slot che sono matematicamente necessari per soddisfare quote carboidrati esplicite già scelte nel Set.\n- Il motore mantiene un conteggio degli slot in cui deve ancora scegliere il carboidrato: usa il jolly rapido soltanto quando gli slot residui sono più numerosi delle quote esplicite residue.\n- Se le quote residue occupano tutta la capacità rimasta, prevalgono le quote user; `Poco tempo` non può cancellarle.\n- Una ricetta rapida visualizzata deve corrispondere alla famiglia realmente contabilizzata: se il motore ha scelto `friselle`, mostra una ricetta di friselle; se ha scelto `pane`, non può mostrare friselle. Questo mantiene reale il tetto Friselle <= 1/settimana.\n- Eventuali quote rimaste impossibili da collocare perché l'utente ha successivamente occupato slot con pasti speciali/HARD vengono riportate nel report motore e non producono compensazioni sui pasti speciali.\n'''
if '### Poco tempo e quote carboidrati (v37)' not in s:s+=extra
p.write_text(s,encoding='utf-8')
print('v37 applied')
