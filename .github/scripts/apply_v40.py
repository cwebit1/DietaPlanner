from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

old="""    contEsclusi.querySelectorAll('[data-col-escludi]').forEach(btn=>btn.addEventListener('click',async()=>{
      const nome=btn.dataset.colEscludi;
      const rec=await getOne('impostazioni','colazioneIngredientiEsclusi');
      const lista=new Set(rec&&Array.isArray(rec.valore)?rec.valore:[]);
      lista.has(nome)?lista.delete(nome):lista.add(nome);
      await put('impostazioni',{chiave:'colazioneIngredientiEsclusi',valore:[...lista]});
      await renderMantieniSwipe(renderSetColazione);
    }));
"""
new="""    contEsclusi.querySelectorAll('[data-col-escludi]').forEach(btn=>btn.addEventListener('click',async()=>{
      const nome=btn.dataset.colEscludi;
      const rec=await getOne('impostazioni','colazioneIngredientiEsclusi');
      const lista=new Set(rec&&Array.isArray(rec.valore)?rec.valore:[]);
      if(lista.has(nome)) lista.delete(nome);
      else {
        // Non creare un Set contraddittorio: un ingrediente scelto nella colazione
        // predefinita non può essere contemporaneamente marcato "da escludere".
        const prefRec=await getOne('impostazioni','colazionePreferita');
        const pref=prefRec&&prefRec.valore?prefRec.valore:{};
        const selezionati=new Set(Object.values(pref).filter(Boolean).map(id=>varianti.find(v=>v.id===id)?.nome).filter(Boolean));
        if(selezionati.has(nome)){
          await avviso('Questo ingrediente è già selezionato nella colazione predefinita. Cambia prima quella selezione oppure lascialo disponibile.');
          return;
        }
        lista.add(nome);
      }
      await put('impostazioni',{chiave:'colazioneIngredientiEsclusi',valore:[...lista]});
      await renderMantieniSwipe(renderSetColazione);
    }));
"""
if old not in s and 'Questo ingrediente è già selezionato nella colazione predefinita' not in s:
    raise SystemExit('breakfast exclusion target not found')
if old in s:s=s.replace(old,new,1)

old="""      btn.addEventListener('click', async ()=>{
        const gruppo = slide.dataset.setColGruppo;
        const idScelto = btn.dataset.setColOpt || null;
        const rec = await getOne('impostazioni', 'colazionePreferita');
        const comp = rec && rec.valore ? Object.assign({}, rec.valore) : {};
        comp[gruppo] = idScelto;
        await put('impostazioni', {chiave:'colazionePreferita', valore: comp});
        await renderMantieniSwipe(renderSetColazione);
      });
"""
new="""      btn.addEventListener('click', async ()=>{
        const gruppo = slide.dataset.setColGruppo;
        const idScelto = btn.dataset.setColOpt || null;
        if(idScelto){
          const scelta=varianti.find(v=>v.id===idScelto);
          const off=await getOne('impostazioni','colazioneIngredientiEsclusi');
          const esclusi=new Set(off&&Array.isArray(off.valore)?off.valore:[]);
          if(scelta&&esclusi.has(scelta.nome)){
            await avviso('Questo ingrediente è escluso dalla colazione. Riattivalo prima in Ingredienti da escludere.');
            return;
          }
        }
        const rec = await getOne('impostazioni', 'colazionePreferita');
        const comp = rec && rec.valore ? Object.assign({}, rec.valore) : {};
        comp[gruppo] = idScelto;
        await put('impostazioni', {chiave:'colazionePreferita', valore: comp});
        await renderMantieniSwipe(renderSetColazione);
      });
"""
if old not in s and 'Questo ingrediente è escluso dalla colazione' not in s:
    raise SystemExit('breakfast selection target not found')
if old in s:s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

p=Path('MOTORE-REGOLE.md')
r=p.read_text(encoding='utf-8')
extra='''\n### Coerenza colazione predefinita / esclusioni (v40)\n\n- L'esclusione ingredienti della colazione resta confinata alla colazione e non influisce su pranzo/cena.\n- Il Set non può contenere contemporaneamente lo stesso ingrediente come componente della colazione predefinita e come ingrediente escluso.\n- Se l'ingrediente è già nella colazione predefinita, l'utente deve prima cambiare quella componente per poterlo escludere; se è già escluso, deve prima riattivarlo per poterlo selezionare nella colazione predefinita.\n- Le colazioni speciali deliberate dall'utente restano un ramo volontario distinto e non vengono bloccate da questa coerenza del generatore ordinario.\n'''
if '### Coerenza colazione predefinita / esclusioni (v40)' not in r:r+=extra
p.write_text(r,encoding='utf-8')
print('v40 applied')
