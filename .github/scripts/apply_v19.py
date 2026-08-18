from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

anchor="async function renderSetPreferenzeMenu(){"
helper=r'''function catturaPosizioniSwipe(){
  return [...document.querySelectorAll('.setting-swipe,.colazione-gruppo-slide')].map((el,i)=>(
    {i, id:el.id||'', gruppo:el.dataset.setColGruppo||'', x:el.scrollLeft}
  ));
}
function ripristinaPosizioniSwipe(posizioni){
  const tutti=[...document.querySelectorAll('.setting-swipe,.colazione-gruppo-slide')];
  for(const p of posizioni){
    let el=null;
    if(p.id) el=document.getElementById(p.id);
    if(!el && p.gruppo) el=document.querySelector(`.colazione-gruppo-slide[data-set-col-gruppo="${p.gruppo}"]`);
    if(!el) el=tutti[p.i]||null;
    if(el) el.scrollLeft=p.x;
  }
}
async function renderMantieniSwipe(renderFn){
  const posizioni=catturaPosizioniSwipe();
  await renderFn();
  ripristinaPosizioniSwipe(posizioni);
  requestAnimationFrame(()=>ripristinaPosizioniSwipe(posizioni));
}

'''
if helper.strip() not in s:
    if anchor not in s:
        raise SystemExit('anchor renderSetPreferenzeMenu not found')
    s=s.replace(anchor,helper+anchor,1)

repls={
"await put('impostazioni',{chiave:'setProteineLimitate',valore:[...limitate]}); renderSetPreferenzeMenu();":"await put('impostazioni',{chiave:'setProteineLimitate',valore:[...limitate]}); await renderMantieniSwipe(renderSetPreferenzeMenu);",
"await put('impostazioni',{chiave:'setPocoTempo',valore:tempo}); renderSetPreferenzeMenu();":"await put('impostazioni',{chiave:'setPocoTempo',valore:tempo}); await renderMantieniSwipe(renderSetPreferenzeMenu);",
"await put('impostazioni',{chiave:'setVerdurePreferite',valore:[...pref]}); renderSetPreferenzeMenu();":"await put('impostazioni',{chiave:'setVerdurePreferite',valore:[...pref]}); await renderMantieniSwipe(renderSetPreferenzeMenu);",
"await put('impostazioni',{chiave:'setVerdurePreferite',valore:[]}); renderSetPreferenzeMenu();":"await put('impostazioni',{chiave:'setVerdurePreferite',valore:[]}); await renderMantieniSwipe(renderSetPreferenzeMenu);",
"await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[...lista]});renderSetVerdure();":"await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[...lista]});await renderMantieniSwipe(renderSetVerdure);",
"      renderSetVerduraRicorrente();":"      await renderMantieniSwipe(renderSetVerduraRicorrente);",
"      renderSetColazione();":"      await renderMantieniSwipe(renderSetColazione);",
}
for old,new in repls.items():
    if old not in s:
        raise SystemExit('expected snippet not found: '+old[:90])
    s=s.replace(old,new)

p.write_text(s,encoding='utf-8')
print('v19 swipe position preservation applied')
# trigger: 2026-08-18
