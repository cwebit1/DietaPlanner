from pathlib import Path

# v38 — ripristina il filtro stagionale nel motore v10 e impedisce Set contraddittori
# tra verdura ricorrente HARD e verdura dichiarata non disponibile.

# ---------- motor-v10.js ----------
p=Path('motor-v10.js');s=p.read_text(encoding='utf-8')
old="""  if(preferenze.verduraRicorrenteVariantId && (preferenze.verduraRicorrentePasti||[]).includes(slot)){
    const hard=candidati.filter(x=>x.info.variantId===preferenze.verduraRicorrenteVariantId);
    if(!hard.length) return null;
    const scelta=scegliMenoRecenteMotore(hard,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);
    return scelta?scelta.r:null;
  }
  const ordine=(typeof ordineVerdureGiornoV17==='function')?ordineVerdureGiornoV17(idx):(idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']));
"""
new="""  if(preferenze.verduraRicorrenteVariantId && (preferenze.verduraRicorrentePasti||[]).includes(slot)){
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
"""
if old not in s and "const stag=new Set(verdureDiStagione(new Date(giorno+'T12:00:00'))||[]);" not in s:raise SystemExit('season target not found')
if old in s:s=s.replace(old,new,1)
s=s.replace("window.MOTORE_V10_REGOLE={versione:'1.3'","window.MOTORE_V10_REGOLE={versione:'1.4'",1)
p.write_text(s,encoding='utf-8')

# ---------- index.html ----------
p=Path('index.html');s=p.read_text(encoding='utf-8')
old="""    if(lista.has(vid)) lista.delete(vid);
    else {
      if(lista.size>=maxEsclusioni){await avviso('Puoi escludere al massimo 7 verdure. Riattivane una prima di escluderne un’altra.');return;}
      lista.add(vid);
    }
"""
new="""    if(lista.has(vid)) lista.delete(vid);
    else {
      const ric=await getOne('impostazioni','verduraRicorrente');
      if(ric&&ric.valore===vid){await avviso('Questa verdura è programmata come ricorrente. Togli prima la programmazione ricorrente oppure scegli un’altra verdura.');return;}
      if(lista.size>=maxEsclusioni){await avviso('Puoi escludere al massimo 7 verdure. Riattivane una prima di escluderne un’altra.');return;}
      lista.add(vid);
    }
"""
if old not in s and "Questa verdura è programmata come ricorrente" not in s:raise SystemExit('availability recurring guard target not found')
if old in s:s=s.replace(old,new,1)

old="""  el.querySelectorAll('[data-vr]').forEach(b=>b.addEventListener('click',async()=>{
    const vid=b.dataset.vr||null;
    if(vid) await put('impostazioni',{chiave:'verduraRicorrente',valore:vid});
    else {await delKey('impostazioni','verduraRicorrente');await put('impostazioni',{chiave:'verduraRicorrentePasti',valore:[]});}
    await renderMantieniSwipe(renderSetVerduraRicorrente);
  }));
"""
new="""  el.querySelectorAll('[data-vr]').forEach(b=>b.addEventListener('click',async()=>{
    const vid=b.dataset.vr||null;
    if(vid){
      const off=await getOne('impostazioni','setVerdureDisattivate');
      const escluse=new Set(off&&Array.isArray(off.valore)?off.valore:[]);
      if(escluse.has(vid)){await avviso('Questa verdura è indicata come non disponibile. Riattivala prima in Disponibilità verdure.');return;}
      await put('impostazioni',{chiave:'verduraRicorrente',valore:vid});
    } else {await delKey('impostazioni','verduraRicorrente');await put('impostazioni',{chiave:'verduraRicorrentePasti',valore:[]});}
    await renderMantieniSwipe(renderSetVerduraRicorrente);
  }));
"""
if old not in s and "Questa verdura è indicata come non disponibile" not in s:raise SystemExit('recurring availability guard target not found')
if old in s:s=s.replace(old,new,1)

s=s.replace('<script src="motor-v10.js?v=6"></script>','<script src="motor-v10.js?v=7"></script>')
p.write_text(s,encoding='utf-8')

# ---------- rulebook ----------
p=Path('MOTORE-REGOLE.md');s=p.read_text(encoding='utf-8')
extra='''\n### Stagionalità e coerenza disponibilità/ricorrenza (v38)\n\n- Negli slot automatici il filtro stagionale è un vero filtro: le verdure fresche/fresche durature fuori dalla lista del mese non vengono proposte; confezionati e surgelati restano disponibili tutto l'anno.\n- Una verdura ricorrente impostata esplicitamente dall'utente è HARD e può derogare alla stagionalità, perché la scelta user precede il filtro automatico.\n- `Disponibilità verdure` e `Verdura ricorrente` non possono contraddirsi: non si può disattivare una verdura già programmata come ricorrente e non si può rendere ricorrente una verdura dichiarata non disponibile.\n'''
if '### Stagionalità e coerenza disponibilità/ricorrenza (v38)' not in s:s+=extra
p.write_text(s,encoding='utf-8')
print('v38 applied')
