from pathlib import Path

# ---------- index.html ----------
p=Path('index.html')
s=p.read_text(encoding='utf-8')

old_html='''<div id="setVerdure"><div class="card"><h3 style="margin-bottom:10px;">🥬 Impostazioni Verdure</h3><div id="setVerdurePreferite" style="margin-bottom:16px;"><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #2ecc71;color:#2ecc71;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Verdure da favorire</span></div><div class="meta" style="margin-bottom:8px;">Seleziona una o più verdure stagionali da favorire nella generazione.</div><div class="setting-swipe" id="setVerdurePreferiteLista"></div><div id="setVerdurePreferiteNota" class="meta" style="margin-top:8px;"></div></div><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #f1c40f;color:#f1c40f;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Disponibilità verdure</span></div><div class="meta" style="margin-bottom:10px;">Tocca per attivare/disattivare. Le verdure disattivate non vengono proposte.</div><div id="setVerdureLista"></div><div id="setVerdureRicorrenti" style="margin-top:16px;"><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #2ecc71;color:#2ecc71;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Verdure ricorrenti</span></div><div class="meta" style="margin-bottom:8px;">Una verdura che vuoi ritrovare spesso nel menù.</div><div class="setting-swipe" id="setVerduraRicorrenteScelta"></div><div class="meta" id="setVerduraRicorrenteNota" style="margin-top:8px;"></div></div></div></div>'''
new_html='''<div id="setVerdure"><div class="card"><h3 style="margin-bottom:10px;">🥬 Impostazioni Verdure</h3><div id="setVerdurePreferite" style="margin-bottom:16px;"><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #2ecc71;color:#2ecc71;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Verdure da favorire</span></div><div class="meta" style="margin-bottom:8px;">Seleziona una o più verdure stagionali da favorire nella generazione.</div><div class="setting-swipe" id="setVerdurePreferiteLista"></div><div id="setVerdurePreferiteNota" class="meta" style="margin-top:8px;"></div></div><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #f1c40f;color:#f1c40f;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Disponibilità verdure</span></div><div class="meta" style="margin-bottom:10px;">Tocca per escludere le verdure che non vuoi usare. Puoi escluderne al massimo 7; raggiunto il limite devi riattivarne una prima di escluderne un'altra.</div><div id="setVerdureLista"></div><div id="setVerdureRicorrenti" style="margin-top:16px;"><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #2ecc71;color:#2ecc71;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Verdure ricorrenti</span></div><div class="meta" style="margin-bottom:8px;">Seleziona una verdura e fino a 7 pasti settimanali. Nei pasti marcati il contorno viene vincolato a quella verdura.</div><div class="setting-swipe" id="setVerduraRicorrenteScelta"></div><div id="setVerduraRicorrenteTabella" style="overflow-x:auto;margin-top:10px;"></div><div class="meta" id="setVerduraRicorrenteNota" style="margin-top:8px;"></div></div></div></div>'''
if old_html not in s: raise SystemExit('HTML verdure block not found')
s=s.replace(old_html,new_html,1)

# same square style as the tables above
s=s.replace('''#setTabellaGiorno td.cella button{\n  box-sizing:border-box!important;''','''#setTabellaGiorno td.cella button,\n#setVerduraRicorrenteTabella td.cella button{\n  box-sizing:border-box!important;''',1)
s=s.replace('''.set-carb-celle button.active,\n#setTabellaGiorno td.cella button.active{''','''.set-carb-celle button.active,\n#setTabellaGiorno td.cella button.active,\n#setVerduraRicorrenteTabella td.cella button.active{''',1)
s=s.replace('''#setTabellaGiorno td.cella button{width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;padding:0!important;border-color:#4b5540!important;}''','''#setTabellaGiorno td.cella button,#setVerduraRicorrenteTabella td.cella button{width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;padding:0!important;border-color:#4b5540!important;}''',1)

old_render_start=s.index('async function renderSetVerdure(){')
old_render_end=s.index('\n\n/* Verifica quali contorni', old_render_start)
new_render='''async function renderSetVerdure(){
  const contenitore=document.getElementById('setVerdureLista'); if(!contenitore)return;
  const varianti=await getAll('varianti'), ingredienti=await getAll('ingredienti');
  const ingPerId={}; for(const i of ingredienti) ingPerId[i.id]=i;
  const cfgRec=await getOne('impostazioni','setVerdureDisattivate');
  const disattivate=new Set(cfgRec&&cfgRec.valore?cfgRec.valore:[]);
  const verdure=varianti.filter(v=>{const base=ingPerId[v.ingredienteId];return base&&(base.gruppo==='verdura'||v.nome.toLowerCase()==='patate');});
  const gruppi=[['fresco','Freschi','#2ecc71'],['fresco_duraturo','Freschi duraturi','#f1c40f'],['confezionato','In scatola','#f39c12'],['surgelato','Surgelati','#54bfe8']];
  const maxEsclusioni=7, alMassimo=disattivate.size>=maxEsclusioni;
  let html='';
  for(const [cat,label,colore] of gruppi){
    const items=verdure.filter(v=>tierDisponibilitaVerdura(v)===cat).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
    if(!items.length)continue;
    html+=`<div style="margin-top:14px;margin-bottom:8px;display:flex;align-items:center;gap:7px;color:var(--text);font-size:.78rem;font-weight:600;"><span style="width:10px;height:10px;border-radius:50%;background:${colore};display:inline-block;flex:0 0 10px;"></span><span>${label}</span></div><div class="setting-swipe">`;
    for(const v of items){
      const off=disattivate.has(v.id), blocca=alMassimo&&!off;
      html+=`<button data-verdura-toggle="${v.id}" class="${off?'inactive-red':'active'}" ${blocca?'disabled':''}>${v.nome}</button>`;
    }
    html+='</div>';
  }
  html+=`<div class="meta" style="margin-top:6px;">Escluse: ${disattivate.size} / ${maxEsclusioni}${alMassimo?' — limite raggiunto':''}</div>`;
  contenitore.innerHTML=html||'<div class="meta">Nessuna verdura trovata.</div>';
  contenitore.querySelectorAll('[data-verdura-toggle]').forEach(b=>b.addEventListener('click',async()=>{
    const vid=b.dataset.verduraToggle;
    const rec=await getOne('impostazioni','setVerdureDisattivate');
    const lista=new Set(rec&&rec.valore?rec.valore:[]);
    if(lista.has(vid)) lista.delete(vid);
    else {
      if(lista.size>=maxEsclusioni){await avviso('Puoi escludere al massimo 7 verdure. Riattivane una prima di escluderne un’altra.');return;}
      lista.add(vid);
    }
    await put('impostazioni',{chiave:'setVerdureDisattivate',valore:[...lista]});
    await renderMantieniSwipe(renderSetVerdure);
  }));
}'''
s=s[:old_render_start]+new_render+s[old_render_end:]

start=s.index('async function renderSetVerduraRicorrente(){')
end=s.index('\n\nasync function renderSetColazione(){',start)
new_rec='''async function renderSetVerduraRicorrente(){
  const el=document.getElementById('setVerduraRicorrenteScelta');
  const tab=document.getElementById('setVerduraRicorrenteTabella');
  const nota=document.getElementById('setVerduraRicorrenteNota');
  if(!el||!tab)return;
  const varianti=await getAll('varianti'), ingredienti=await getAll('ingredienti');
  const ingPerId={}; for(const i of ingredienti) ingPerId[i.id]=i;
  const verdure=varianti.filter(v=>{const b=ingPerId[v.ingredienteId];return b&&b.gruppo==='verdura';});
  const cfgRec=await getOne('impostazioni','verduraRicorrente');
  const cfgPasti=await getOne('impostazioni','verduraRicorrentePasti');
  const attiva=cfgRec&&cfgRec.valore?cfgRec.valore:null;
  const pasti=new Set(cfgPasti&&Array.isArray(cfgPasti.valore)?cfgPasti.valore:[]);
  const ordinate=[...verdure].sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
  el.innerHTML=`<button data-vr="" class="${!attiva?'active':''}">Nessuna</button>`+ordinate.map(v=>`<button data-vr="${v.id}" class="${attiva===v.id?'active':''}">${v.nome}</button>`).join('');
  el.querySelectorAll('[data-vr]').forEach(b=>b.addEventListener('click',async()=>{
    const vid=b.dataset.vr||null;
    if(vid) await put('impostazioni',{chiave:'verduraRicorrente',valore:vid});
    else {await delKey('impostazioni','verduraRicorrente');await put('impostazioni',{chiave:'verduraRicorrentePasti',valore:[]});}
    await renderMantieniSwipe(renderSetVerduraRicorrente);
  }));
  const giorni=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const head=giorni.map(g=>`<th style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;padding:4px 2px;min-width:26px;text-align:center;">${g}</th>`).join('');
  const totale=pasti.size, maxPasti=7, pieno=totale>=maxPasti;
  const riga=pasto=>giorni.map((_,i)=>{const key=pasto+'_'+i,on=pasti.has(key),disabled=!attiva||(pieno&&!on);return `<td class="cella"><button data-vr-pasto="${key}" class="${on?'active':''}" ${disabled?'disabled':''}></button></td>`;}).join('');
  tab.innerHTML=`<table class="tabella-giorno"><tr><th class="col-label"></th>${head}</tr><tr><td class="riga-label">Pranzo</td>${riga('pranzo')}</tr><tr><td class="riga-label">Cena</td>${riga('cena')}</tr></table>`;
  tab.querySelectorAll('[data-vr-pasto]').forEach(b=>b.addEventListener('click',async()=>{
    if(!attiva){await avviso('Seleziona prima la verdura ricorrente.');return;}
    const key=b.dataset.vrPasto;
    const rec=await getOne('impostazioni','verduraRicorrentePasti');
    const set=new Set(rec&&Array.isArray(rec.valore)?rec.valore:[]);
    if(set.has(key)) set.delete(key);
    else {if(set.size>=7){await avviso('Puoi programmare al massimo 7 pasti con la verdura ricorrente.');return;} set.add(key);}
    await put('impostazioni',{chiave:'verduraRicorrentePasti',valore:[...set]});
    await renderSetVerduraRicorrente();
  }));
  if(nota){
    const vScelta=attiva?verdure.find(v=>v.id===attiva):null;
    nota.textContent=vScelta?`✓ ${vScelta.nome}: ${totale} / 7 pasti vincolati. Nei pasti selezionati il motore userà obbligatoriamente un contorno con questa verdura.`:'Seleziona una verdura per attivare la programmazione dei pasti.';
    if(vScelta){nota.style.border='1px solid #2ecc71';nota.style.background='rgba(46,204,113,0.35)';nota.style.borderRadius='8px';nota.style.padding='8px 10px';nota.style.color='var(--text)';}
    else {nota.style.border='none';nota.style.background='transparent';nota.style.borderRadius='0';nota.style.padding='0';nota.style.color='';}
  }
}'''
s=s[:start]+new_rec+s[end:]
p.write_text(s,encoding='utf-8')

# ---------- motor-v9-2.js ----------
p=Path('motor-v9-2.js')
s=p.read_text(encoding='utf-8')
anchor='''  if(!candidati.length) return null;\n\n  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;'''
insert='''  if(!candidati.length) return null;\n\n  const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7;\n  const slotRicorrente=(preferenze._pastoCorrente||'')+'_'+idx;\n  const ricorrenteHard=preferenze.verduraRicorrenteVariantId && (preferenze.verduraRicorrentePasti||[]).includes(slotRicorrente);\n  if(ricorrenteHard){\n    const hard=candidati.filter(x=>x.info.variantId===preferenze.verduraRicorrenteVariantId);\n    if(!hard.length) return null;\n    const scelta=scegliMenoRecenteMotore(hard,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);\n    return scelta?scelta.r:null;\n  }\n\n  const ordine=idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']);'''
if anchor not in s: raise SystemExit('motor-v9-2 anchor not found')
s=s.replace(anchor,insert,1)
# remove duplicated ordine line resulting from anchor replacement
s=s.replace("  const ordine=idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']);\n  const ordine=idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']);", "  const ordine=idx<=2?['fresco','resistente','surgelato']:(idx<=4?['resistente','fresco','surgelato']:['surgelato','resistente','fresco']);",1)
p.write_text(s,encoding='utf-8')

# ---------- motor-v9-3.js ----------
p=Path('motor-v9-3.js')
s=p.read_text(encoding='utf-8')
s=s.replace("""  const recOff=await getOne('impostazioni','setVerdureDisattivate');\n  const varianti=await getAll('varianti');""","""  const recOff=await getOne('impostazioni','setVerdureDisattivate');\n  const recRic=await getOne('impostazioni','verduraRicorrente');\n  const recRicPasti=await getOne('impostazioni','verduraRicorrentePasti');\n  const varianti=await getAll('varianti');""",1)
s=s.replace("""    verdurePreferiteVariantIds:prefIds,\n    verdureDisattivate:recOff&&recOff.valore?recOff.valore:[]\n  };""","""    verdurePreferiteVariantIds:prefIds,\n    verdureDisattivate:recOff&&recOff.valore?recOff.valore:[],\n    verduraRicorrenteVariantId:recRic&&recRic.valore?recRic.valore:null,\n    verduraRicorrentePasti:recRicPasti&&Array.isArray(recRicPasti.valore)?recRicPasti.valore:[]\n  };""",1)
s=s.replace("""  const pocoTempo=(pasto==='pranzo'&&preferenze.pocoTempoPranzo)||(pasto==='cena'&&preferenze.pocoTempoCena);\n  const esito=await componiPastoModulare(sottotipo,giorno,null,null,null,pocoTempo,preferenze,stato);""","""  const pocoTempo=(pasto==='pranzo'&&preferenze.pocoTempoPranzo)||(pasto==='cena'&&preferenze.pocoTempoCena);\n  const preferenzeSlot=Object.assign({},preferenze,{_pastoCorrente:pasto});\n  const esito=await componiPastoModulare(sottotipo,giorno,null,null,null,pocoTempo,preferenzeSlot,stato);""",1)
p.write_text(s,encoding='utf-8')

print('v30 applied: recurring vegetable schedule hard constraint + max 7 recurring meals + max 7 disabled vegetables')
