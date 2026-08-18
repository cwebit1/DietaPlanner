from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# 1) Verdura ricorrente: massimo 5 pasti
s=s.replace('Seleziona una verdura e fino a 7 pasti settimanali. Nei pasti marcati il contorno viene vincolato a quella verdura.',
            'Seleziona una verdura e fino a 5 pasti settimanali. Nei pasti marcati il contorno viene vincolato a quella verdura.',1)
s=s.replace('const totale=pasti.size, maxPasti=7, pieno=totale>=maxPasti;',
            'const totale=pasti.size, maxPasti=5, pieno=totale>=maxPasti;',1)
s=s.replace("if(set.size>=7){await avviso('Puoi programmare al massimo 7 pasti con la verdura ricorrente.');return;}",
            "if(set.size>=5){await avviso('Puoi programmare al massimo 5 pasti con la verdura ricorrente.');return;}",1)
s=s.replace("nota.textContent=vScelta?`✓ ${vScelta.nome}: ${totale} / 7 pasti vincolati. Nei pasti selezionati il motore userà obbligatoriamente un contorno con questa verdura.`",
            "nota.textContent=vScelta?`✓ ${vScelta.nome}: ${totale} / 5 pasti vincolati. Nei pasti selezionati il motore userà obbligatoriamente un contorno con questa verdura.`",1)

# 2) Riordina blocco esclusioni colazione: label -> swipe -> descrizione
old='''<label style="margin-top:16px;">Ingredienti da escludere:</label><div class="meta" style="margin-bottom:8px;">Gli ingredienti selezionati non verranno mai usati nelle colazioni generate automaticamente. Le scelte impostate manualmente sopra restano prioritarie.</div><div id="setColazioneEsclusi" class="setting-swipe"></div>'''
new='''<label style="margin-top:16px;">Ingredienti da escludere:</label><div id="setColazioneEsclusi" class="setting-swipe" style="margin-top:8px;"></div><div class="meta" style="margin-top:8px;margin-bottom:8px;">Le esclusioni valgono solo per la colazione automatica: un alimento escluso qui resta disponibile per pranzo e cena. Le scelte impostate manualmente sopra restano prioritarie.</div>'''
if old not in s:
    raise SystemExit('Breakfast exclusion HTML block not found')
s=s.replace(old,new,1)

# 3) Stesso stile quadratini per la riga giorni colazione
s=s.replace('''#setTabellaGiorno td.cella button,
#setVerduraRicorrenteTabella td.cella button{''','''#setTabellaGiorno td.cella button,
#setVerduraRicorrenteTabella td.cella button,
#setColazioneGiorni td.cella button{''',1)
s=s.replace('''#setTabellaGiorno td.cella button.active,
#setVerduraRicorrenteTabella td.cella button.active{''','''#setTabellaGiorno td.cella button.active,
#setVerduraRicorrenteTabella td.cella button.active,
#setColazioneGiorni td.cella button.active{''',1)
s=s.replace('''#setTabellaGiorno td.cella button,#setVerduraRicorrenteTabella td.cella button{width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;padding:0!important;border-color:#4b5540!important;}''','''#setTabellaGiorno td.cella button,#setVerduraRicorrenteTabella td.cella button,#setColazioneGiorni td.cella button{width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;padding:0!important;border-color:#4b5540!important;}''',1)

# 4) Titoli gruppi colazione bordati per colore
old_group='''  for(const gr of COLAZIONE_GRUPPI){
    const opzioni = opzioniColazioneGruppo(gr, varianti);
    const selezionatoId = componenti[gr.chiave];
    htmlGruppi += `<label style="margin-top:8px;">${gr.label}${gr.obbligatorio?'':' (facoltativo)'}</label>
      <div class="colazione-gruppo-slide" data-set-col-gruppo="${gr.chiave}">
        ${gr.consentiNessuno ? `<button data-set-col-opt="" class="${!selezionatoId?'active':''}">— nessuno —</button>` : ''}
        ${opzioni.map(o=>`<button data-set-col-opt="${o.id}" class="${o.id===selezionatoId?'active':''}">${o.nome}</button>`).join('')}
      </div>`;
  }'''
new_group='''  const coloriGruppiColazione={proteine:'#2ecc71',bibita:'#ffffff',carboidrati:'#2ecc71',grassi:'#f1c40f',carboidrati_semplici:'#f39c12'};
  for(const gr of COLAZIONE_GRUPPI){
    const opzioni = opzioniColazioneGruppo(gr, varianti);
    const selezionatoId = componenti[gr.chiave];
    const coloreTitolo=coloriGruppiColazione[gr.chiave]||'var(--text-dim)';
    htmlGruppi += `<div style="margin:10px 0 7px;"><span style="display:inline-block;border:1px solid ${coloreTitolo};color:${coloreTitolo};border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">${gr.label}</span></div>
      <div class="colazione-gruppo-slide" data-set-col-gruppo="${gr.chiave}">
        ${gr.consentiNessuno ? `<button data-set-col-opt="" class="${!selezionatoId?'active':''}">— nessuno —</button>` : ''}
        ${opzioni.map(o=>`<button data-set-col-opt="${o.id}" class="${o.id===selezionatoId?'active':''}">${o.nome}</button>`).join('')}
      </div>`;
  }'''
if old_group not in s:
    raise SystemExit('Breakfast groups render block not found')
s=s.replace(old_group,new_group,1)

# 5) Ripristina riga giorni con stesso stile delle tabelle precedenti (header verticali)
old_days='''  const rigaIntestazioneCol = NOMI_GIORNI_BREVI.map(g=>`<th>${g}</th>`).join('');
  const celleCol = NOMI_GIORNI_BREVI.map((g, idx)=>{
    const attivo = giorniAttivi.includes(idx);
    return `<td class="cella"><button data-set-colpref-giorno="${idx}" class="${attivo?'active':''}"></button></td>`;
  }).join('');
  contGiorni.innerHTML = `
    <tr><th class="col-label"></th>${rigaIntestazioneCol}</tr>
    <tr><td class="riga-label">Colazione</td>${celleCol}</tr>`;'''
new_days='''  const rigaIntestazioneCol = NOMI_GIORNI_BREVI.map(g=>`<th style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;padding:4px 2px;min-width:26px;text-align:center;">${g}</th>`).join('');
  const celleCol = NOMI_GIORNI_BREVI.map((g, idx)=>{
    const attivo = giorniAttivi.includes(idx);
    return `<td class="cella"><button data-set-colpref-giorno="${idx}" class="${attivo?'active':''}"></button></td>`;
  }).join('');
  contGiorni.innerHTML = `
    <tr><th class="col-label"></th>${rigaIntestazioneCol}</tr>
    <tr><td class="riga-label" style="text-align:left;padding-right:4px;">Colazione</td>${celleCol}</tr>`;'''
if old_days not in s:
    raise SystemExit('Breakfast days table block not found')
s=s.replace(old_days,new_days,1)

# 6) Swipe esclusioni: tutti gli ingredienti definiti per i gruppi colazione; rosso=escluso, verde=disponibile.
old_excl='''    const nomiMatrice=[...new Set(COLAZIONI_AUTOMATICHE_COHERENTI.flatMap(schema=>
      ['proteine','carboidrati','grassi','carboidrati_semplici'].map(k=>schema[k]).filter(Boolean)
    ))].filter(nome=>varianti.some(v=>v.nome&&v.nome.toLowerCase()===nome.toLowerCase())).sort((a,b)=>a.localeCompare(b));
    contEsclusi.innerHTML=nomiMatrice.map(nome=>`<button data-col-escludi="${nome}" class="${esclusi.has(nome)?'active':''}">${nome}</button>`).join('');'''
new_excl='''    const gruppiEscludibili=new Set(['proteine','carboidrati','grassi','carboidrati_semplici']);
    const nomiMatrice=[...new Set(varianti.filter(v=>gruppiEscludibili.has(v.colazioneGruppo)).map(v=>v.nome).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
    contEsclusi.innerHTML=nomiMatrice.map(nome=>`<button data-col-escludi="${nome}" class="${esclusi.has(nome)?'inactive-red':'active'}">${nome}</button>`).join('');'''
if old_excl not in s:
    raise SystemExit('Breakfast exclusion list block not found')
s=s.replace(old_excl,new_excl,1)

p.write_text(s,encoding='utf-8')
print('v31 applied: recurring veg max 5; breakfast group colors, day row restored, breakfast-only exclusions swipe')
# trigger v31
