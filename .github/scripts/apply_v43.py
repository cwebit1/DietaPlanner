from pathlib import Path
import re

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# 1) Il soggetto proteico deve derivare PRIMA dalla ricetta del secondo corrente.
#    categoriaLarga puo' essere un marker vecchio/stale e non deve prevalere.
pat=r"async function macroProteicaDraftRefresh\(draft\)\{.*?\n\}"
m=re.search(pat,s,re.S)
if not m: raise SystemExit('macroProteicaDraftRefresh non trovata')
new=r'''async function macroProteicaDraftRefresh(draft){
  if(!draft)return null;
  if(draft.proteinaId){
    const r=await getOne('ricette',draft.proteinaId);
    if(r&&r.gruppoProteico){
      const macro=motoreCategoriaDiSottotipo(r.gruppoProteico)||r.gruppoProteico;
      draft.soggettoProteico=macro;
      draft.categoriaLarga=macro;
      draft.sottotipoProposto=r.gruppoProteico;
      return macro;
    }
  }
  if(draft.soggettoProteico)return draft.soggettoProteico;
  if(draft.categoriaLarga){draft.soggettoProteico=draft.categoriaLarga;return draft.categoriaLarga;}
  return null;
}'''
s=s[:m.start()]+new+s[m.end():]

# 2) Helper unico per fissare il soggetto del pasto prima di cambiare forma culinaria.
anchor='async function preparaCandidatoPerTabDraft(pasto,giorno,tab){'
if anchor not in s: raise SystemExit('preparaCandidatoPerTabDraft non trovata')
helper=r'''async function sincronizzaSoggettoProteicoDraft(pasto,giorno,draft){
  if(!draft)return null;
  // La portata proteica visibile e' la fonte piu' specifica del soggetto.
  const macro=await macroProteicaDraftRefresh(draft);
  if(macro)return macro;
  // Se il secondo non e' ancora materializzato, usa il soggetto assegnato allo slot.
  const voce=await getOne('piano',(giorno||giornoSelezionato)+'_'+pasto);
  const daSlot=(voce&&voce.categoriaLargaE1)||draft.soggettoProteico||draft.categoriaLarga||null;
  if(daSlot){draft.soggettoProteico=daSlot;draft.categoriaLarga=daSlot;}
  return daSlot;
}

'''
s=s.replace(anchor,helper+anchor,1)

# 3) Qualunque apertura di Piatto unico/Sfiziosa fissa prima il soggetto proteico.
old="""  }else if(tab==='unico'||tab==='sfiziosa'){
    let r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,null);"""
new="""  }else if(tab==='unico'||tab==='sfiziosa'){
    await sincronizzaSoggettoProteicoDraft(pasto,giorno,draft);
    let r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,null);"""
if old not in s: raise SystemExit('blocco tab unico/sfiziosa non trovato')
s=s.replace(old,new,1)

# 4) Anche il refresh di unico/sfiziosa conserva lo stesso soggetto.
old="""  }else if(tipo==='unico'||tipo==='sfiziosa'){
    let r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,draft.ricettaId);"""
new="""  }else if(tipo==='unico'||tipo==='sfiziosa'){
    await sincronizzaSoggettoProteicoDraft(pasto,giorno,draft);
    let r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,draft.ricettaId);"""
if old not in s: raise SystemExit('refresh unico/sfiziosa non trovato')
s=s.replace(old,new,1)

# 5) Il refresh del secondo usa esplicitamente il soggetto del pasto, mai un marker stale.
old="""    const macro=await macroProteicaDraftRefresh(draft);"""
new="""    const macro=(await sincronizzaSoggettoProteicoDraft(pasto,giorno,draft))||await macroProteicaDraftRefresh(draft);"""
# sostituisci solo la prima occorrenza dentro cambiaCellaDraft/proteina, dopo helper.
pos=s.find("}else if(cella==='proteina'){")
if pos<0: raise SystemExit('cella proteina non trovata')
pos2=s.find(old,pos)
if pos2<0: raise SystemExit('macro refresh nel blocco proteina non trovato')
s=s[:pos2]+new+s[pos2+len(old):]

# 6) Togli il pulsante Cambia proteina: il refresh icona resta il comando Cambia ricetta.
#    Mantieni solo Cambia cottura quando esiste davvero piu' di una cottura.
old="""      <div class=\"row\" style=\"margin-top:6px;gap:6px;\"><button class=\"small\" data-pasto-cambia=\"proteina\">Cambia proteina</button>${cottureAmmesse.length>1?'<button class=\"small\" data-pasto-cambia=\"cottura\">Cambia cottura</button>':''}</div>"""
new="""      ${cottureAmmesse.length>1?'<div class=\"row\" style=\"margin-top:6px;gap:6px;justify-content:flex-end;\"><button class=\"small\" data-pasto-cambia=\"cottura\">Cambia cottura</button></div>':''}"""
if old not in s: raise SystemExit('pulsante Cambia proteina non trovato')
s=s.replace(old,new,1)

# Titolo refresh secondo = Cambia ricetta, non generico rigenera secondo.
s=s.replace('data-pasto-refresh=\"secondo\" title=\"Rigenera secondo\"','data-pasto-refresh=\"secondo\" title=\"Cambia ricetta\"',1)

# 7) Quando il draft nasce da una voce esistente, conserva anche il soggetto proteico.
needle="""      categoriaLarga: voce.categoriaLargaE1 || motoreCategoriaDiSottotipo(voce.sottotipoProteicoMotore) || null,
      sottotipoProposto: voce.sottotipoProteicoMotore || null,"""
repl="""      categoriaLarga: voce.categoriaLargaE1 || motoreCategoriaDiSottotipo(voce.sottotipoProteicoMotore) || null,
      soggettoProteico: voce.categoriaLargaE1 || motoreCategoriaDiSottotipo(voce.sottotipoProteicoMotore) || null,
      sottotipoProposto: voce.sottotipoProteicoMotore || null,"""
if needle not in s: raise SystemExit('inizializzazione draft categoria non trovata')
s=s.replace(needle,repl,1)

# Dopo la creazione, se esiste gia' il secondo, riallinea subito il soggetto alla ricetta reale.
needle="""    await generaCandidatoDraftModulare(pasto, giorno);
  }
  const draft = draftPasto[chiaveStato];"""
repl="""    await generaCandidatoDraftModulare(pasto, giorno);
  }
  const draft = draftPasto[chiaveStato];
  await sincronizzaSoggettoProteicoDraft(pasto,giorno,draft);"""
if needle not in s: raise SystemExit('post init draft non trovato')
s=s.replace(needle,repl,1)

# cache bust
s=s.replace('<script src="motor-v10.js?v=9"></script>','<script src="motor-v10.js?v=10"></script>',1)
p.write_text(s,encoding='utf-8')

# ---- motor-v10: il matching unico/sfiziosa usa un HARD subject comune alle modalita ----
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
needle="""  const targetCarbKey=info.carboidrato||null;
  const targetCarbNome=(info.ingredienteCarboidrato||'').toLowerCase();"""
repl="""  const macroTarget=(draft&&draft.soggettoProteico)||info.categoriaProteica||null;
  const targetCarbKey=info.carboidrato||null;
  const targetCarbNome=(info.ingredienteCarboidrato||'').toLowerCase();"""
if needle not in s: raise SystemExit('target unico non trovato')
s=s.replace(needle,repl,1)

s=s.replace("    if(info.categoriaProteica&&a.categoria!==info.categoriaProteica)continue;","    if(macroTarget&&a.categoria!==macroTarget)continue;",1)
s=s.replace("    if(info.sottotipoProteico&&a.sottotipo===info.sottotipoProteico)score+=35;\n    else if(info.categoriaProteica&&a.categoria===info.categoriaProteica)score+=20;",
            "    if(info.sottotipoProteico&&a.sottotipo===info.sottotipoProteico)score+=35;\n    else if(macroTarget&&a.categoria===macroTarget)score+=20;",1)

# Review registra il soggetto effettivo, non un marker vecchio.
s=s.replace("categoriaProteica:info.categoriaProteica,sottotipoProteico:info.sottotipoProteico,",
            "categoriaProteica:macroTarget,sottotipoProteico:info.sottotipoProteico,",1)

s=s.replace("window.MOTORE_V10_REGOLE={versione:'1.5'","window.MOTORE_V10_REGOLE={versione:'1.6'",1)
p.write_text(s,encoding='utf-8')

# Regole permanenti
p=Path('MOTORE-REGOLE.md')
s=p.read_text(encoding='utf-8')
extra=r'''

## Soggetto proteico unico tra Portate / Piatto unico / Sfiziosa (v43)

- Ogni pranzo/cena possiede un **soggetto proteico** comune alle diverse forme culinarie.
- Se Portate mostra UOVA, Piatto unico e Ricetta sfiziosa devono cercare esclusivamente ricette UOVA; lo stesso vale per PESCE, CARNE, FORMAGGI e LEGUMI.
- Il soggetto viene ricavato prima dalla proteina concreta gia' visibile; i marker di categoria salvati in precedenza non possono prevalere se sono incoerenti.
- Passare da Portate a Piatto unico/Sfiziosa cambia la forma culinaria, non la macrocategoria del pasto.
- Il refresh specifico del secondo significa **Cambia ricetta nella stessa macrocategoria**. Non esiste un comando manuale `Cambia proteina` che consenta di saltare ad altra macro.
- Se non esiste una realizzazione idonea nella stessa macro, si compone usando i moduli disponibili o si registra una lacuna da rinforzare; non si usa una macro diversa per tappare il buco.
'''
if '## Soggetto proteico unico tra Portate / Piatto unico / Sfiziosa (v43)' not in s:s+=extra
p.write_text(s,encoding='utf-8')
print('v43 applied')
