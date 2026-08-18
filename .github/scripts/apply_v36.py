from pathlib import Path

# v36 — consolidamento motore a layer e controlli matematici del Set.

# ---------------- motor-v10.js ----------------
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
old="""async function motoreV10CompletaUnicoConPane(r,varianti){
  if(!r)return null;
  const cfg=CARBOIDRATI_PASTO.pane;if(!cfg)return null;
  const v=varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v)return null;
  const key='pane|'+r.id;
  const nome=/\\bpane\\b/i.test(r.nome||'')?r.nome:(r.nome+' con pane');
  const ingredienti=motoreV10MergeIngredienti([r.ingredienti,[{variantId:v.id,nomeLibero:null,quantita:cfg.porzione}]]);
  const procedimento=[...(r.procedimento||[]),'Servi il pane nella dose prevista insieme al piatto.'];
  return motoreV10UpsertComposta(key,nome,r.gruppoProteico,ingredienti,procedimento,[r.id]);
}
async function motoreV10ComponiUnicoDaDraft(draft,varianti){
  if(!draft||!draft.proteinaId||!draft.contornoId)return null;
  const [prot,cont]=await Promise.all([getOne('ricette',draft.proteinaId),getOne('ricette',draft.contornoId)]);
  if(!prot||!cont)return null;
  let carb=draft.primoCereale&&CARBOIDRATI_PASTO[draft.primoCereale]?draft.primoCereale:null;
  if(!carb){
    const cous=CARBOIDRATI_PASTO.cous_cous;
    const vc=cous&&varianti.find(x=>(x.nome||'').toLowerCase()===(cous.ingrediente||'').toLowerCase());
    carb=vc?'cous_cous':'pane';
  }
"""
new="""async function motoreV10CompletaUnicoConPane(r,varianti){
  if(!r)return null;
  const cfg=CARBOIDRATI_PASTO.pane;if(!cfg)return null;
  const v=varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v)return null;
  const key='pane|'+r.id;
  const nome=/\\bpane\\b/i.test(r.nome||'')?r.nome:(r.nome+' con pane');
  const ingredienti=motoreV10MergeIngredienti([r.ingredienti,[{variantId:v.id,nomeLibero:null,quantita:cfg.porzione}]]);
  const procedimento=[...(r.procedimento||[]),'Servi il pane nella dose prevista insieme al piatto.'];
  return motoreV10UpsertComposta(key,nome,r.gruppoProteico,ingredienti,procedimento,[r.id]);
}
async function motoreV10CarboidratoDaDraft(draft,varianti){
  if(!draft)return null;
  if(draft.primoCereale&&CARBOIDRATI_PASTO[draft.primoCereale])return draft.primoCereale;
  if(!draft.primoId)return null;
  const r=await getOne('ricette',draft.primoId);if(!r)return null;
  if(r.cerealeUsato&&CARBOIDRATI_PASTO[r.cerealeUsato])return r.cerealeUsato;
  if(r.tipoCereale&&CARBOIDRATI_PASTO[r.tipoCereale])return r.tipoCereale;
  const vById=new Map((varianti||[]).map(v=>[v.id,v]));
  const nomi=(r.ingredienti||[]).map(i=>i.variantId&&vById.get(i.variantId)?(vById.get(i.variantId).nome||'').toLowerCase():(i.nomeLibero||'').toLowerCase());
  const testo=nomi.join(' ');
  for(const [k,cfg] of Object.entries(CARBOIDRATI_PASTO)){
    const target=(cfg.ingrediente||'').toLowerCase();
    if(target&&nomi.includes(target))return k;
  }
  const eur=[['pasta_fresca','raviol'],['cous_cous','cous cous'],['friselle','frisell'],['polenta','polenta'],['farro','farro'],['orzo','orzo'],['riso','riso'],['patate','patat'],['pane','pane'],['pasta','pasta']];
  for(const [k,t] of eur)if(CARBOIDRATI_PASTO[k]&&testo.includes(t))return k;
  return null;
}
async function motoreV10ComponiUnicoDaDraft(draft,varianti){
  if(!draft||!draft.proteinaId||!draft.contornoId)return null;
  const [prot,cont]=await Promise.all([getOne('ricette',draft.proteinaId),getOne('ricette',draft.contornoId)]);
  if(!prot||!cont)return null;
  let carb=await motoreV10CarboidratoDaDraft(draft,varianti);
  if(!carb){
    const cous=CARBOIDRATI_PASTO.cous_cous;
    const vc=cous&&varianti.find(x=>(x.nome||'').toLowerCase()===(cous.ingrediente||'').toLowerCase());
    carb=vc?'cous_cous':'pane';
  }
"""
if old not in s and 'async function motoreV10CarboidratoDaDraft' not in s:raise SystemExit('v35 helper block not found')
if old in s:s=s.replace(old,new,1)

old="""    const mancaSoloCarb=!a.carbKeys.length;
    let score=mancaSoloCarb?-25:0;
    if(targetCarbKey&&a.carbKeys.includes(targetCarbKey))score+=100;
    else if(targetCarbNome&&a.nomi.includes(targetCarbNome))score+=100;
    else score+=30; // stessa funzione: fonte di carboidrati presente
"""
new="""    const mancaSoloCarb=!a.carbKeys.length;
    // Il layer alimentare viene prima della ricetta: un carboidrato già deciso non
    // può essere sostituito col jolly pane solo per adattarsi a un record unico.
    if(mancaSoloCarb&&targetCarbKey&&targetCarbKey!=='pane')continue;
    let score=mancaSoloCarb?-25:0;
    if(targetCarbKey&&a.carbKeys.includes(targetCarbKey))score+=100;
    else if(targetCarbNome&&a.nomi.includes(targetCarbNome))score+=100;
    else score+=30;
"""
if old not in s and "if(mancaSoloCarb&&targetCarbKey&&targetCarbKey!=='pane')continue;" not in s:raise SystemExit('candidate scoring block not found')
if old in s:s=s.replace(old,new,1)
s=s.replace("window.MOTORE_V10_REGOLE={versione:'1.1'","window.MOTORE_V10_REGOLE={versione:'1.2'",1)
p.write_text(s,encoding='utf-8')

# ---------------- index.html ----------------
p=Path('index.html');s=p.read_text(encoding='utf-8')

# Il Set proteico è parziale: una nuova scelta è ammessa solo se gli slot liberi
# rimasti sono matematicamente sufficienti a colmare i minimi delle altre macro.
anchor="const NOMI_GIORNI_SET = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];\n\n"
helper="""const NOMI_GIORNI_SET = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

function validaFattibilitaProteineSet(tabella){
  const conteggi={carne:0,pesce:0,formaggi:0,uova:0,legumi:0};
  let occupati=0;
  for(let i=0;i<7;i++){
    const arr=(tabella['giorno_'+i]||[]).slice(0,2);
    occupati+=arr.length;
    for(const cat of arr)if(conteggi[cat]!==undefined)conteggi[cat]++;
  }
  const slotLiberi=14-occupati;
  let deficitMinimi=0;
  for(const cat of Object.keys(conteggi)){
    const min=Number(FREQUENZE_CONSIGLIATE[cat]?.min||0);
    deficitMinimi+=Math.max(0,min-conteggi[cat]);
  }
  return {ok:deficitMinimi<=slotLiberi,slotLiberi,deficitMinimi,conteggi};
}

"""
if 'function validaFattibilitaProteineSet' not in s:
    if anchor not in s:raise SystemExit('Set protein anchor not found')
    s=s.replace(anchor,helper,1)

old="""      if(arr.length>=2){ await avviso('Hai già selezionato 2 fonti proteiche per questo giorno.'); return; }
      arr.push(cat);
    }
    await put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:tabella});
    renderSetTabellaGiorno();
"""
new="""      if(arr.length>=2){ await avviso('Hai già selezionato 2 fonti proteiche per questo giorno.'); return; }
      arr.push(cat);
      const fatt=validaFattibilitaProteineSet(tabella);
      if(!fatt.ok){
        arr.pop();
        await avviso('Questa scelta lascerebbe troppo pochi pasti liberi per completare le frequenze minime delle altre categorie.');
        return;
      }
    }
    await put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:tabella});
    renderSetTabellaGiorno();
"""
if old not in s and 'const fatt=validaFattibilitaProteineSet(tabella);' not in s:raise SystemExit('Set protein click target not found')
if old in s:s=s.replace(old,new,1)

s=s.replace('<script src="motor-v10.js?v=4"></script>','<script src="motor-v10.js?v=5"></script>')
p.write_text(s,encoding='utf-8')

# ---------------- rulebook ----------------
p=Path('MOTORE-REGOLE.md');s=p.read_text(encoding='utf-8')
s=s.replace('- Se non esiste ricetta compatibile, non proporre nulla e registrare la combinazione in `reviewRicetteMancanti`.','- Se non esiste un record unico compatibile, tentare prima il completamento/composizione funzionale previsto dalla sezione v35; registrare in `reviewRicetteMancanti` soltanto se anche questo fallisce.')
extra='''\n### Vincolo sul carboidrato già determinato (v36)\n\n- Quando il layer alimentare ha già assegnato un carboidrato allo slot, la realizzazione `unico/sfiziosa` non può sostituirlo con pane solo per adattarsi a una ricetta del DB.\n- Un primo HARD assegnato dal Ricettario deve essere analizzato per inferirne la famiglia di carboidrato anche quando non possiede `primoCereale`.\n- Il jolly pane è universale solo quando la funzione carboidrato è ancora libera oppure quando il pane è già la funzione scelta; altrimenti si usa la composizione runtime con il carboidrato determinato dal layer.\n\n### Fattibilità Set proteico parziale (v36)\n\n- Ogni nuova scelta proteica nel Set viene accettata soltanto se, dopo averla inserita, il numero di slot pranzo/cena ancora liberi è almeno uguale alla somma dei deficit verso i minimi delle macro non ancora soddisfatte.\n- Questo controllo non completa il piano e non sovrascrive scelte user: impedisce soltanto di creare un Set parziale matematicamente impossibile da completare.\n'''
if '### Vincolo sul carboidrato già determinato (v36)' not in s:s+=extra
p.write_text(s,encoding='utf-8')
print('v36 applied')
# trigger v36 consolidated
