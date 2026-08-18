from pathlib import Path
p=Path('index.html');s=p.read_text(encoding='utf-8')
needle='.tabgroup{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;}'
insert='''.setting-swipe{display:flex;gap:6px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:6px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;}\n.setting-swipe button{flex:0 0 auto;scroll-snap-align:start;white-space:nowrap;}\n.set-carb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:12px;row-gap:8px;}\n.set-carb-item{min-width:0;}\n.set-carb-celle{display:flex;gap:3px;flex-wrap:nowrap;}\n.set-carb-celle button{width:24px!important;height:24px!important;min-width:24px;padding:0!important;}\n#setTabellaGiorno .riga-label{text-align:left;padding-right:4px;}\n#setTabellaGiorno td.cella button{min-height:28px!important;min-width:28px!important;padding:4px;}\n#setTempoMenu{display:flex;flex-wrap:nowrap;gap:4px;}\n#setTempoMenu button{flex:1 1 0;min-width:0;padding:6px 4px;white-space:nowrap;}\n'''+needle
assert needle in s;s=s.replace(needle,insert,1)
a=s.index('<!-- ============ VIEW: SET ============ -->');b=s.index('<!-- ============ VIEW: IMPOSTAZIONI ============ -->',a);s=s[:a]+Path('tools/v17_set_fragment.html').read_text()+'\n'+s[b:]
a=s.index('function renderCaselleCarboidrati(){');b=s.index('\nfunction aggiornaStatoConfigCarb()',a);s=s[:a]+Path('tools/v17_carb_function.js').read_text()+s[b:]
s=s.replace("  const btnSave = document.getElementById('btnSalvaConfigCarboidrati');\n",'').replace("  if(btnSave){\n    btnSave.disabled = totale !== CONFIG_CARB_TOTALE_OBBLIGATORIO;\n  }\n",'')
a=s.find('/* Salva in IndexedDB e aggiorna il motore */');b=s.find('/* Reset */',a)
if a!=-1 and b!=-1:s=s[:a]+s[b:]
s=s.replace(' style="min-height:36px;min-width:36px;"','').replace("return `<tr><td class=\"riga-label\">${c.label}${rowMax?` (max ${tetto})`:''}</td>${cells}</tr>`;","return `<tr><td class=\"riga-label\">${c.label}</td>${cells}</tr>`;")
old="elV.innerHTML=stag.map(v=>`<button data-set-verd-pref=\"${v}\" class=\"${pref.has(v)?'active':''}\">${v}</button>`).join('') + `<button data-set-verd-pref-reset=\"1\" class=\"${pref.size===0?'active':''}\">Nessuna preferenza</button>`;";new="const stagOrd=[...stag].sort((a,b)=>a.localeCompare(b,'it')); elV.innerHTML=stagOrd.map(v=>`<button data-set-verd-pref=\"${v}\" class=\"${pref.has(v)?'active':''}\">${v}</button>`).join('') + `<button data-set-verd-pref-reset=\"1\" class=\"${pref.size===0?'active':''}\">Nessuna preferenza</button>`;";assert old in s;s=s.replace(old,new,1)
a=s.index('async function renderSetVerdure(){');b=s.index('\n/* Verifica quali contorni',a);s=s[:a]+Path('tools/v17_veg_function.js').read_text()+s[b:]
old="""  const stagionali = verdureDiStagione(new Date());
  // mostra prima le stagionali, poi il resto
  const ordinate = [...verdure].sort((a,b)=>{
    const as=stagionali.includes(a.nome)?0:1, bs=stagionali.includes(b.nome)?0:1;
    return as-bs || a.nome.localeCompare(b.nome);
  });""";assert old in s;s=s.replace(old,"  const ordinate = [...verdure].sort((a,b)=>a.nome.localeCompare(b.nome,'it'));",1)
anchor="'piselli in barattolo':'conf',";assert anchor in s;s=s.replace(anchor,anchor+"\n    'zucca':'fresco', 'verza':'fresco', 'crauti in barattolo':'conf', 'mais in scatola':'conf',",1)
s=s.replace('<div id="setColazioneEsclusi" class="tabgroup"></div>','<div id="setColazioneEsclusi" class="setting-swipe"></div>',1)
old="""  return Object.entries(mappa).map(([variantId, quantita])=>{
    const v = varianti.find(x=>x.id===variantId);
    return {variantId, nome:v.nome, quantita};
  }).sort((a,b)=> a.nome.localeCompare(b.nome));""";new="""  return Object.entries(mappa).map(([variantId, quantita])=>{
    const v = varianti.find(x=>x.id===variantId);
    return {variantId, nome:v.nome, quantita, prioritaVerdura:v&&v.categoria==='fresco'?0:3};
  }).sort((a,b)=> a.prioritaVerdura-b.prioritaVerdura || a.nome.localeCompare(b.nome,'it'));""";assert old in s;s=s.replace(old,new,1)
needle='<script src="motor-v9-4.js?v=11"></script>\n\n</body>';assert needle in s;s=s.replace(needle,'<script src="motor-v9-4.js?v=11"></script>\n'+Path('tools/v17_engine_override.html').read_text()+'\n\n</body>',1)
p.write_text(s,encoding='utf-8')
