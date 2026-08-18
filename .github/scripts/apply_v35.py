from pathlib import Path

# --- motor-v10.js: piatto unico per funzione + composizione runtime ---
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
anchor="""trovaPiattoUnicoCompatibileDraft = async function(pasto,giorno,draft,escludiId){"""
helper=r'''
/* v35 — Unico per funzione, senza esplodere il DB.
   1) Se una ricetta unica ha proteina+verdura ma manca solo il carboidrato,
      la completa con il jolly pane.
   2) Se manca una ricetta unica idonea, compone a richiesta carboidrato +
      secondo + contorno già determinati dai layer precedenti.
   Le ricette composte sono lazy e deduplicate tramite chiaveComposta: non si
   pre-generano migliaia di combinazioni. */
function motoreV10MergeIngredienti(liste){
  const m=new Map(), liberi=[];
  for(const lista of liste){
    for(const ing of (lista||[])){
      if(ing.variantId){
        const k=ing.variantId, q=Number(ing.quantita)||0;
        if(!m.has(k))m.set(k,{variantId:k,nomeLibero:null,quantita:0});
        m.get(k).quantita+=q;
      }else if(ing.nomeLibero){
        const k=(ing.nomeLibero||'').trim().toLowerCase(), q=Number(ing.quantita)||0;
        let x=liberi.find(z=>(z.nomeLibero||'').trim().toLowerCase()===k);
        if(!x){x={variantId:null,nomeLibero:ing.nomeLibero,quantita:0};liberi.push(x);}
        x.quantita+=q;
      }
    }
  }
  return [...m.values(),...liberi].filter(x=>x.quantita>0);
}
async function motoreV10UpsertComposta(chiave,nome,gruppo,ingredienti,procedimento,fonteIds){
  const tutte=await getAll('ricette');
  let r=tutte.find(x=>x.fonte==='composta_runtime'&&x.chiaveComposta===chiave);
  if(!r)r={id:uid()};
  Object.assign(r,{nome,fascia:'facile',porzioni:1,gruppoProteico:gruppo||'',tipoPortata:'unico',fonte:'composta_runtime',chiaveComposta:chiave,fonteIds:fonteIds||[],ingredienti,procedimento:procedimento||[],nutrizioneManualeTotale:null,esclusa:false,piattoSpeciale:false});
  await put('ricette',r);return r;
}
async function motoreV10CompletaUnicoConPane(r,varianti){
  if(!r)return null;
  const cfg=CARBOIDRATI_PASTO.pane;if(!cfg)return null;
  const v=varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v)return null;
  const key='pane|'+r.id;
  const nome=/\bpane\b/i.test(r.nome||'')?r.nome:(r.nome+' con pane');
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
  let cfg=CARBOIDRATI_PASTO[carb];
  let v=cfg&&varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  if(!v&&carb!=='pane'){
    carb='pane';cfg=CARBOIDRATI_PASTO.pane;
    v=cfg&&varianti.find(x=>(x.nome||'').toLowerCase()===(cfg.ingrediente||'').toLowerCase());
  }
  if(!cfg||!v)return null;
  const ingredienti=motoreV10MergeIngredienti([[{variantId:v.id,nomeLibero:null,quantita:cfg.porzione}],prot.ingredienti,cont.ingredienti]);
  const nome=(cfg.label||carb)+' con '+(prot.nome||'proteina').toLowerCase()+' e '+(cont.nome||'verdura').toLowerCase();
  const key=['draft',carb,prot.id,cont.id].join('|');
  const procedimento=[`Prepara ${cfg.label||carb} nella dose prevista.`,...(prot.procedimento||[]),...(cont.procedimento||[]),'Riunisci le componenti nello stesso piatto e servi come piatto unico.'];
  return motoreV10UpsertComposta(key,nome,prot.gruppoProteico||draft.sottotipoProposto||'',ingredienti,procedimento,[prot.id,cont.id]);
}
'''
if 'async function motoreV10ComponiUnicoDaDraft' not in s:
    if anchor not in s: raise SystemExit('unico anchor not found')
    s=s.replace(anchor,helper+'\n'+anchor,1)

old="""    if(info.categoriaProteica&&a.categoria!==info.categoriaProteica)continue;
    if(!a.carbKeys.length)continue; // ogni pasto ordinario deve avere fonte di carboidrati
    if(!a.verdure.length)continue;  // e verdura
    if(hardVerdura&&!a.verdure.includes(hardVerdura))continue;
    let score=0;"""
new="""    if(info.categoriaProteica&&a.categoria!==info.categoriaProteica)continue;
    if(!a.verdure.length)continue;  // la verdura non ha un jolly equivalente
    if(hardVerdura&&!a.verdure.includes(hardVerdura))continue;
    const mancaSoloCarb=!a.carbKeys.length;
    let score=mancaSoloCarb?-25:0;"""
if old in s:s=s.replace(old,new,1)
elif 'const mancaSoloCarb=!a.carbKeys.length;' not in s:raise SystemExit('candidate filter target not found')

old="""  if(!compatibili.length){
    if(typeof registraRichiestaRicettaReview==='function')await registraRichiestaRicettaReview({
      tipo:draft&&draft.tabAttiva==='sfiziosa'?'ricetta_sfiziosa_mancante':'piatto_unico_mancante',
      carboidrato:info.carboidrato,categoriaProteica:info.categoriaProteica,sottotipoProteico:info.sottotipoProteico,
      verdura:(info.verdure||[]).join(' + '),pasto,giorno
    });
    return null;
  }
  const nonCorrente=compatibili.filter(r=>r.id!==draft.ricettaId),pool=nonCorrente.length?nonCorrente:compatibili;
  return scegliMenoRecenteMotore(pool,r=>storico.ultimoRicetta[r.id]||0,()=>0);"""
new="""  if(compatibili.length){
    const nonCorrente=compatibili.filter(r=>r.id!==draft.ricettaId),pool=nonCorrente.length?nonCorrente:compatibili;
    let scelta=scegliMenoRecenteMotore(pool,r=>storico.ultimoRicetta[r.id]||0,()=>0);
    if(scelta){
      const a=await motoreV10AnalizzaUnico(scelta,varianti,ingredienti);
      if(!a.carbKeys.length){
        const conPane=await motoreV10CompletaUnicoConPane(scelta,varianti);
        if(conPane)return conPane;
      }
      return scelta;
    }
  }
  // Nessun record unico utile: prova la composizione funzionale già definita dai layer.
  const composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  if(typeof registraRichiestaRicettaReview==='function')await registraRichiestaRicettaReview({
    tipo:draft&&draft.tabAttiva==='sfiziosa'?'ricetta_sfiziosa_mancante':'piatto_unico_mancante',
    carboidrato:info.carboidrato,categoriaProteica:info.categoriaProteica,sottotipoProteico:info.sottotipoProteico,
    verdura:(info.verdure||[]).join(' + '),pasto,giorno
  });
  return null;"""
if old in s:s=s.replace(old,new,1)
elif 'const composta=await motoreV10ComponiUnicoDaDraft' not in s:raise SystemExit('no-match target not found')

s=s.replace("window.MOTORE_V10_REGOLE={versione:'1.0'","window.MOTORE_V10_REGOLE={versione:'1.1'",1)
p.write_text(s,encoding='utf-8')

# --- index cache bust ---
p=Path('index.html');s=p.read_text(encoding='utf-8')
s=s.replace('<script src="motor-v10.js?v=2"></script>','<script src="motor-v10.js?v=4"></script>')
s=s.replace('<script src="motor-v10.js?v=3"></script>','<script src="motor-v10.js?v=4"></script>')
p.write_text(s,encoding='utf-8')

# --- persistent rulebook ---
p=Path('MOTORE-REGOLE.md');s=p.read_text(encoding='utf-8')
regola='''\n## Piatto unico per composizione funzionale (v35)\n\n- Una ricetta con proteina + verdura che manca soltanto della quota carboidrati non è una lacuna: il motore aggiunge **pane** come jolly assoluto nella dose prevista.\n- Se non esiste un record `unico` adatto ma i layer hanno già definito **carboidrato + secondo + contorno**, il motore può comporli in un unico piatto. Se manca il carboidrato concreto prova prima **cous cous**, poi **pane** come fallback universale.\n- La composizione non modifica i vincoli HARD già definiti.\n- Le composizioni sono create solo quando servono e deduplicate (`fonte=composta_runtime`, `chiaveComposta`): non si pre-genera un database combinatorio.\n- Si registra una lacuna in Review solo quando non esiste né ricetta compatibile, né completamento con pane, né composizione funzionale valida.\n'''
if '## Piatto unico per composizione funzionale (v35)' not in s:s+=regola
p.write_text(s,encoding='utf-8')

# --- review: riclassifica i falsi gap carb-only ---
p=Path('REVIEW-RICETTE-DB.md');s=p.read_text(encoding='utf-8')
note='''\n## Riclassificazione v35 — carboidrato mancante\n\nNon sono più considerate lacune DB le ricette che hanno già **proteina + verdura** e mancano soltanto del carboidrato: vengono completate con il jolly pane. Se non esiste un `unico` adatto ma esistono secondo e contorno coerenti, il motore prova la composizione funzionale con il carboidrato già deciso; in assenza di uno specifico usa cous cous e infine pane.\n\nCasi precedentemente sospetti come *Uova strapazzate con zucchine e parmigiano*, *Insalata di tonno, pomodoro e mozzarella*, *Petto di pollo con zucchine e insalata* e *Melanzane alla parmigiana leggera* sono quindi **COPERTI PER COMPOSIZIONE/JOLLY** e non richiedono una nuova ricetta solo per aggiungere il carboidrato.\n'''
if '## Riclassificazione v35 — carboidrato mancante' not in s:s+=note
p.write_text(s,encoding='utf-8')
print('v35 applied: unico functional composition + bread/cous cous fallback')
# trigger v35
