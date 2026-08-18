from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# Preferenze generazione menu: una sola categoria di esclusione alla volta.
old="""  const recLim=await getOne('impostazioni','setProteineLimitate');
  const limitate=new Set(recLim&&recLim.valore?recLim.valore:[]);
  const elLim=document.getElementById('setProteineLimitate');
  if(elLim){
    elLim.innerHTML=CATEGORIE_PROTEICHE_SET.map(c=>`<button data-set-prot-lim=\"${c.chiave}\" class=\"${limitate.has(c.chiave)?'active':''}\">${c.label}</button>`).join('');
    elLim.querySelectorAll('[data-set-prot-lim]').forEach(b=>b.addEventListener('click',async()=>{ const k=b.dataset.setProtLim; limitate.has(k)?limitate.delete(k):limitate.add(k); await put('impostazioni',{chiave:'setProteineLimitate',valore:[...limitate]}); await renderMantieniSwipe(renderSetPreferenzeMenu); }));
  }"""
new="""  const recLim=await getOne('impostazioni','setProteineLimitate');
  const salvate=recLim&&Array.isArray(recLim.valore)?recLim.valore:[];
  const esclusa=salvate.length?salvate[0]:null;
  const elLim=document.getElementById('setProteineLimitate');
  if(elLim){
    elLim.innerHTML=CATEGORIE_PROTEICHE_SET.map(c=>`<button data-set-prot-lim=\"${c.chiave}\" class=\"${esclusa===c.chiave?'active':''}\">${c.label}</button>`).join('');
    elLim.querySelectorAll('[data-set-prot-lim]').forEach(b=>b.addEventListener('click',async()=>{
      const k=b.dataset.setProtLim;
      const nuova=(esclusa===k)?[]:[k];
      await put('impostazioni',{chiave:'setProteineLimitate',valore:nuova});
      await renderMantieniSwipe(renderSetPreferenzeMenu);
    }));
  }"""
if old not in s:
    raise SystemExit('protein exclusion preference block not found')
s=s.replace(old,new,1)

# Stato attivo rosso, stesso linguaggio visivo delle verdure disattivate.
anchor=""".setting-swipe button.inactive-red{
  background:rgba(231,76,60,0.18)!important;
  color:#e74c3c!important;
  border-color:#e74c3c!important;
  font-weight:700;
}
"""
css="""
#setProteineLimitate button.active{
  background:rgba(231,76,60,0.18)!important;
  color:#e74c3c!important;
  border-color:#e74c3c!important;
  font-weight:700!important;
}
"""
if css.strip() not in s:
    if anchor not in s:
        raise SystemExit('red selector CSS anchor not found')
    s=s.replace(anchor,anchor+css,1)

p.write_text(s,encoding='utf-8')
print('v28: protein menu exclusion preference is single-choice and active state is red')
# trigger v28
