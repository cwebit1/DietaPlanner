from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# 1) UI Set: lista ingredienti da non proporre automaticamente.
marker='''      <table class="tabella-giorno"><tbody id="setColazioneGiorni"></tbody></table>
'''
insert='''      <table class="tabella-giorno"><tbody id="setColazioneGiorni"></tbody></table>
      <label style="margin-top:16px;">Ingredienti da escludere:</label>
      <div class="meta" style="margin-bottom:8px;">Gli ingredienti selezionati non verranno mai usati nelle colazioni generate automaticamente. Le scelte impostate manualmente sopra restano prioritarie.</div>
      <div id="setColazioneEsclusi" class="tabgroup"></div>
'''
if 'id="setColazioneEsclusi"' not in s:
    if marker not in s: raise SystemExit('HTML colazione marker non trovato')
    s=s.replace(marker,insert,1)

# 2) Matrice: supporta blacklist ingredienti.
old='''function scegliColazioneAutomaticaCoerente(varianti, firmeDaEvitare){
  const escluse=new Set((firmeDaEvitare||[]).filter(Boolean));
  let pool=COLAZIONI_AUTOMATICHE_COHERENTI.map(schema=>({schema,componenti:componentiDaSchemaColazione(schema,varianti)})).filter(x=>x.componenti);
  const filtrato=pool.filter(x=>!escluse.has(firmaComponentiColazione(x.componenti)));
  if(filtrato.length) pool=filtrato;
  if(!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)].componenti;
}'''
new='''function scegliColazioneAutomaticaCoerente(varianti, firmeDaEvitare, ingredientiEsclusi){
  const escluse=new Set((firmeDaEvitare||[]).filter(Boolean));
  const noIng=new Set((ingredientiEsclusi||[]).map(x=>(x||'').toString().trim().toLowerCase()).filter(Boolean));
  let pool=COLAZIONI_AUTOMATICHE_COHERENTI
    .filter(schema=>!['proteine','carboidrati','grassi','carboidrati_semplici'].some(k=>schema[k]&&noIng.has(schema[k].toLowerCase())))
    .map(schema=>({schema,componenti:componentiDaSchemaColazione(schema,varianti)}))
    .filter(x=>x.componenti);
  const filtrato=pool.filter(x=>!escluse.has(firmaComponentiColazione(x.componenti)));
  if(filtrato.length) pool=filtrato;
  if(!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)].componenti;
}'''
if old not in s: raise SystemExit('funzione matrice colazione non trovata')
s=s.replace(old,new,1)

# 3) Render Set: genera dinamicamente i pulsanti della blacklist.
old_start='''async function renderSetColazione(){
  const contGruppi = document.getElementById('setColazioneGruppi');
  const contGiorni = document.getElementById('setColazioneGiorni');
  if(!contGruppi || !contGiorni) return;
  const varianti = await getAll('varianti');
  const compRec = await getOne('impostazioni', 'colazionePreferita');
  const giorniRec = await getOne('impostazioni', 'colazionePreferitaGiorni');'''
new_start='''async function renderSetColazione(){
  const contGruppi = document.getElementById('setColazioneGruppi');
  const contGiorni = document.getElementById('setColazioneGiorni');
  const contEsclusi = document.getElementById('setColazioneEsclusi');
  if(!contGruppi || !contGiorni) return;
  const varianti = await getAll('varianti');
  const compRec = await getOne('impostazioni', 'colazionePreferita');
  const giorniRec = await getOne('impostazioni', 'colazionePreferitaGiorni');
  const esclusiRec = await getOne('impostazioni', 'colazioneIngredientiEsclusi');'''
if old_start not in s: raise SystemExit('renderSetColazione start non trovato')
s=s.replace(old_start,new_start,1)

listener_marker='''  // Listener: selezione componenti gruppi (scrive direttamente in impostazioni)
'''
listener_insert='''  // Ingredienti esclusi dalle sole proposte automatiche.
  if(contEsclusi){
    const esclusi=new Set(esclusiRec&&Array.isArray(esclusiRec.valore)?esclusiRec.valore:[]);
    const nomiMatrice=[...new Set(COLAZIONI_AUTOMATICHE_COHERENTI.flatMap(schema=>
      ['proteine','carboidrati','grassi','carboidrati_semplici'].map(k=>schema[k]).filter(Boolean)
    ))].filter(nome=>varianti.some(v=>v.nome&&v.nome.toLowerCase()===nome.toLowerCase())).sort((a,b)=>a.localeCompare(b));
    contEsclusi.innerHTML=nomiMatrice.map(nome=>`<button data-col-escludi="${nome}" class="${esclusi.has(nome)?'active':''}">${nome}</button>`).join('');
    contEsclusi.querySelectorAll('[data-col-escludi]').forEach(btn=>btn.addEventListener('click',async()=>{
      const nome=btn.dataset.colEscludi;
      const rec=await getOne('impostazioni','colazioneIngredientiEsclusi');
      const lista=new Set(rec&&Array.isArray(rec.valore)?rec.valore:[]);
      lista.has(nome)?lista.delete(nome):lista.add(nome);
      await put('impostazioni',{chiave:'colazioneIngredientiEsclusi',valore:[...lista]});
      renderSetColazione();
    }));
  }
  // Listener: selezione componenti gruppi (scrive direttamente in impostazioni)
'''
if listener_marker not in s: raise SystemExit('listener colazione marker non trovato')
s=s.replace(listener_marker,listener_insert,1)

# 4) Generatore legacy in index: passa la blacklist alla matrice.
old_call='''        const firmaPref=colazionePref&&colazionePref.valore?firmaComponentiColazione(componentiColazioneDaSet(colazionePref.valore,varianti)):null;
        componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref]);'''
new_call='''        const firmaPref=colazionePref&&colazionePref.valore?firmaComponentiColazione(componentiColazioneDaSet(colazionePref.valore,varianti)):null;
        const recEsclusiColazione=await getOne('impostazioni','colazioneIngredientiEsclusi');
        componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],recEsclusiColazione&&recEsclusiColazione.valore?recEsclusiColazione.valore:[]);'''
if old_call not in s: raise SystemExit('chiamata matrice index non trovata')
s=s.replace(old_call,new_call,1)
p.write_text(s,encoding='utf-8')

# 5) Generatore principale v9-3: stessa blacklist HARD.
p=Path('motor-v9-3.js')
m=p.read_text(encoding='utf-8')
old_m='''          const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
          componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref]);'''
new_m='''          const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
          const recEsclusiColazione=await getOne('impostazioni','colazioneIngredientiEsclusi');
          componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref],recEsclusiColazione&&recEsclusiColazione.valore?recEsclusiColazione.valore:[]);'''
if old_m not in m: raise SystemExit('chiamata matrice motor non trovata')
m=m.replace(old_m,new_m,1)
p.write_text(m,encoding='utf-8')
print('v16 breakfast exclusions applied')