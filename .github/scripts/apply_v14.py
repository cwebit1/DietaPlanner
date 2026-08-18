from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')

marker='.nutri-grid .lbl{font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;}\n'
css='''/* Colazione: riepilogo in stile portate */
.colazione-riepilogo{margin-bottom:10px;}
.colazione-voce{margin-bottom:14px;}
.colazione-voce:last-child{margin-bottom:8px;}
.colazione-categoria{
  text-transform:uppercase;letter-spacing:.04em;font-size:0.65rem;
  color:var(--text-dim);margin-bottom:4px;display:flex;align-items:center;gap:7px;
}
.colazione-punto{
  width:9px;height:9px;border-radius:50%;background:#2ecc71;
  display:inline-block;flex:0 0 9px;box-shadow:0 0 0 2px rgba(46,204,113,.10);
}
.colazione-nome{font-weight:700;font-size:0.9rem;line-height:1.25;flex:1;}
.colazione-info-selezionati{margin:2px 0 20px;}
.colazione-info-voce{padding:0 0 14px;margin-bottom:14px;border-bottom:1px solid var(--border);}
.colazione-info-voce:last-child{margin-bottom:0;}
.colazione-info-categoria{
  font-size:0.78rem;color:var(--accent);font-weight:700;
  text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;
}
.colazione-info-nome{font-size:1.22rem;line-height:1.2;font-weight:800;color:var(--text);}
.colazione-info-dose{font-size:1.02rem;line-height:1.2;color:var(--text-dim);margin-top:4px;font-weight:600;}
.colazione-info-separatore{height:1px;background:var(--border);margin:4px 0 18px;}
'''
if '.colazione-riepilogo{margin-bottom:10px;}' not in s:
    if marker not in s: raise SystemExit('CSS marker non trovato')
    s=s.replace(marker,marker+css,1)

if 'async function htmlRiepilogoColazione(' not in s:
    insert='''
function nutrizioneSingoloComponenteColazione(g, id, varianti){
  if(!id || g.chiave==='bibita') return null;
  const v=(varianti||[]).find(x=>x.id===id);
  if(!v) return null;
  const fattore=(v.porzioneColazione||0)/100;
  return {
    kcal:(v.kcal100||0)*fattore,
    prot:(v.prot100||0)*fattore,
    carb:(v.carb100||0)*fattore,
    grassi:(v.grassi100||0)*fattore
  };
}

async function htmlRiepilogoColazione(componenti, colazioneSpecialeId, varianti, infoAttr){
  const attrInfo=infoAttr||'data-info-colazione-attuale="1"';
  if(colazioneSpecialeId){
    const cs=await getOne('ricette',colazioneSpecialeId);
    const n=cs&&cs.nutrizioneManualeTotale?cs.nutrizioneManualeTotale:null;
    return `<div class="colazione-riepilogo">
      <div class="colazione-voce">
        <div class="colazione-categoria"><span class="colazione-punto"></span>Speciale</div>
        <div class="row" style="align-items:baseline;gap:8px;">
          <span class="colazione-nome">${cs?cs.nome:'Colazione speciale'}</span>
          <button class="icon-info-btn" ${attrInfo} title="Valori nutrizionali">ⓘ</button>
        </div>
        ${n?`<div class="meta">${Math.round(n.kcal||0)} kcal</div>`:''}
      </div>
    </div>`;
  }
  const attivi=COLAZIONE_GRUPPI.filter(g=>componenti&&componenti[g.chiave]);
  if(!attivi.length) return `<div class="meta">Colazione da configurare</div>`;
  return `<div class="colazione-riepilogo">${attivi.map((g,i)=>{
    const id=componenti[g.chiave];
    const nome=nomeOpzioneColazione(g,id,varianti);
    if(!nome) return '';
    const n=nutrizioneSingoloComponenteColazione(g,id,varianti);
    return `<div class="colazione-voce">
      <div class="colazione-categoria">${i===0?'<span class="colazione-punto"></span>':''}${g.label}</div>
      <div class="row" style="align-items:baseline;gap:8px;">
        <span class="colazione-nome">${nome}</span>
        ${i===0?`<button class="icon-info-btn" ${attrInfo} title="Valori nutrizionali">ⓘ</button>`:''}
      </div>
      ${n?`<div class="meta">${Math.round(n.kcal)} kcal</div>`:''}
    </div>`;
  }).join('')}</div>`;
}
'''
    pos=s.index('\nasync function renderColazione(giorno, elementId){')
    s=s[:pos]+insert+s[pos:]

old='''    el.innerHTML = html + btnEditorColazione + `<div style="opacity:0.7;">
      <div style="font-weight:700;font-size:0.95rem;">✓ ${descrizioneAttuale}</div>
      ${(voce.componenti || voce.colazioneSpecialeId) ? `<div class="meta" style="margin-top:4px;">${Math.round(nutri.kcal)} kcal <button class="icon-info-btn" data-info-colazione="1" title="Valori nutrizionali">ⓘ</button></div>` : ''}
    </div>`;'''
new='''    const riepilogoScaduto = (voce.componenti || voce.colazioneSpecialeId)
      ? await htmlRiepilogoColazione(voce.componenti,voce.colazioneSpecialeId,varianti,'data-info-colazione="1"')
      : '<div class="meta">✓ Nessuna colazione</div>';
    el.innerHTML = html + btnEditorColazione + `<div style="opacity:0.7;">${riepilogoScaduto}</div>`;'''
if old in s:
    s=s.replace(old,new,1)

old2='''  html += `<div style="font-weight:800;font-size:1rem;line-height:1.35;margin-bottom:3px;">${descrizioneAttuale}</div>
    <div class="meta" style="margin-bottom:9px;">${Math.round(nutri.kcal)} kcal
      <button class="icon-info-btn" data-info-colazione-attuale="1" title="Valori nutrizionali">ⓘ</button>
    </div>`;'''
new2="  html += await htmlRiepilogoColazione(voce.componenti,voce.colazioneSpecialeId,varianti,'data-info-colazione-attuale=\"1\"');"
if old2 in s:
    s=s.replace(old2,new2,1)

s=s.replace('<summary>⚙️ Configura colazione</summary>','<summary>⚙️ Modifica</summary>',1)

start=s.index('async function apriModalInfoColazione(componenti, colazioneSpecialeId){')
end=s.index('\n/* =========================================================\n   COLAZIONE / SPUNTINO', start)
new_popup='''async function apriModalInfoColazione(componenti, colazioneSpecialeId){
  const varianti = await getAll('varianti');
  const nutri = await nutrizioneColazione(componenti, varianti, colazioneSpecialeId);
  let elementiHtml='';
  if(colazioneSpecialeId){
    const cs=await getOne('ricette',colazioneSpecialeId);
    elementiHtml = cs
      ? `<div class="colazione-info-voce">
          <div class="colazione-info-categoria">Colazione speciale</div>
          <div class="colazione-info-nome">${cs.nome}</div>
        </div>`
      : '';
  }else{
    elementiHtml = COLAZIONE_GRUPPI.map(g=>{
      const id=componenti&&componenti[g.chiave];
      if(!id) return '';
      const nome=nomeOpzioneColazione(g,id,varianti);
      if(!nome) return '';
      let dose='';
      if(g.chiave!=='bibita'){
        const v=varianti.find(x=>x.id===id);
        if(v) dose=formattaQuantita(v,v.porzioneColazione||0);
      }
      return `<div class="colazione-info-voce">
        <div class="colazione-info-categoria">${g.label}</div>
        <div class="colazione-info-nome">${nome}</div>
        ${dose?`<div class="colazione-info-dose">${dose}</div>`:''}
      </div>`;
    }).join('');
  }
  document.getElementById('modalDettaglioTitolo').textContent = 'Apporti — Colazione';
  document.getElementById('modalDettaglioContenuto').innerHTML = `
    <div class="colazione-info-selezionati">
      ${elementiHtml || '<div class="meta">Nessun elemento selezionato.</div>'}
    </div>
    <div class="colazione-info-separatore"></div>
    <div class="nutri-grid">
      <div><div class="num">${Math.round(nutri.kcal)}</div><div class="lbl">kcal</div></div>
      <div><div class="num">${Math.round(nutri.prot)}g</div><div class="lbl">proteine</div></div>
      <div><div class="num">${Math.round(nutri.carb)}g</div><div class="lbl">carboidrati</div></div>
      <div><div class="num">${Math.round(nutri.grassi)}g</div><div class="lbl">grassi</div></div>
    </div>`;
  document.getElementById('modalDettaglio').classList.remove('hidden');
}
'''
s=s[:start]+new_popup+s[end:]

required=['.colazione-riepilogo{margin-bottom:10px;}','async function htmlRiepilogoColazione(','<summary>⚙️ Modifica</summary>','colazione-info-dose',"html += await htmlRiepilogoColazione(voce.componenti,voce.colazioneSpecialeId,varianti"]
for x in required:
    if x not in s: raise SystemExit('Verifica fallita: '+x)
p.write_text(s,encoding='utf-8')
print('v14 breakfast visual patch applied')
