from pathlib import Path

# v41 — separazione netta fra rigore del motore e libertà manuale dell'utente.
# - Il motore automatico continua a rispettare quote/tetti/rotazione.
# - Il cambio manuale resta libero dentro la macrocategoria: carboidrato è carboidrato.
# - Unico/sfiziosa tentano sempre la composizione funzionale prima di dichiarare assenza.

p=Path('index.html')
s=p.read_text(encoding='utf-8')

old="""async function carboidratiAmmessiCambioDraft(giorno,pasto,draft){
  const conteggi=await contaCarboidratiSettimanaDraft(giorno,giorno+'_'+pasto);
  const rec=await getOne('impostazioni','configCarboidrati');
  const cfg=rec&&rec.valore?rec.valore:{};
  const totaleEsplicito=Object.entries(cfg).reduce((n,[k,v])=>n+(CARBOIDRATI_PASTO[k]?Math.max(0,parseInt(v)||0):0),0);
  return Object.keys(CARBOIDRATI_PASTO).filter(k=>{
    if(k===draft.primoCereale) return false;
    const c=CARBOIDRATI_PASTO[k];
    if(c.limitato && (conteggi[k]||0)>=(c.tettoSettimanale||2)) return false;
    const quota=Math.max(0,parseInt(cfg[k])||0);
    if(totaleEsplicito>=14 && quota===0) return false;
    if(quota>0 && (conteggi[k]||0)>=quota) return false;
    return true;
  });
}

async function validaCarboidratoDraft(giorno,pasto,draft){
  if(!draft.primoCereale || !CARBOIDRATI_PASTO[draft.primoCereale]) return false;
  const conteggi=await contaCarboidratiSettimanaDraft(giorno,giorno+'_'+pasto);
  const c=CARBOIDRATI_PASTO[draft.primoCereale];
  if(c.limitato && (conteggi[draft.primoCereale]||0)>=(c.tettoSettimanale||2)) return false;
  const rec=await getOne('impostazioni','configCarboidrati');
  const cfg=rec&&rec.valore?rec.valore:{};
  const totaleEsplicito=Object.entries(cfg).reduce((n,[k,v])=>n+(CARBOIDRATI_PASTO[k]?Math.max(0,parseInt(v)||0):0),0);
  const quota=Math.max(0,parseInt(cfg[draft.primoCereale])||0);
  if(totaleEsplicito>=14 && quota===0) return false;
  if(quota>0 && (conteggi[draft.primoCereale]||0)>=quota) return false;
  return true;
}
"""
new="""/* v41 — libertà manuale per macrocategoria.
   Le quote del Set e i tetti di rotazione sono vincoli DEL MOTORE durante la
   generazione automatica, non dell'utente durante la modifica di un pasto.
   Quindi riso/farro/pasta/cous cous/pane ecc. sono tutti sostituibili fra loro:
   la funzione nutrizionale resta 'carboidrato'. */
async function carboidratiAmmessiCambioDraft(giorno,pasto,draft){
  return Object.keys(CARBOIDRATI_PASTO).filter(k=>k!==draft.primoCereale);
}

async function validaCarboidratoDraft(giorno,pasto,draft){
  return !!(draft && draft.primoCereale && CARBOIDRATI_PASTO[draft.primoCereale]);
}
"""
if old not in s:
    raise SystemExit('blocco carboidrati manuali non trovato')
s=s.replace(old,new,1)

s=s.replace("if(!disponibili.length){await avviso('Nessun altro carboidrato disponibile senza superare i limiti del Set/percorso.');return;}",
            "if(!disponibili.length){await avviso('Nessun altro carboidrato disponibile.');return;}",1)

# Quando si apre unico/sfiziosa, se il primo tentativo non trova un record,
# riprova dopo aver garantito soltanto le componenti mancanti del draft.
old="""  }else if(tab==='unico'||tab==='sfiziosa'){
    const r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,null);
    draft.ricettaId=r?r.id:null;
  }else if(tab==='speciale'){"""
new="""  }else if(tab==='unico'||tab==='sfiziosa'){
    let r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,null);
    if(!r && typeof motoreV10CompletaDraftPerRealizzazione==='function'){
      await motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft);
      r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,null);
    }
    draft.ricettaId=r?r.id:null;
  }else if(tab==='speciale'){"""
if old not in s:
    raise SystemExit('preparaCandidato unico/sfiziosa non trovato')
s=s.replace(old,new,1)

# Stesso principio sul refresh unico/sfiziosa.
old="""  }else if(tipo==='unico'||tipo==='sfiziosa'){
    const r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,draft.ricettaId); draft.ricettaId=r?r.id:null;
  }else if(tipo==='speciale'){"""
new="""  }else if(tipo==='unico'||tipo==='sfiziosa'){
    let r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,draft.ricettaId);
    if(!r && typeof motoreV10CompletaDraftPerRealizzazione==='function'){
      await motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft);
      r=await trovaPiattoUnicoCompatibileDraft(pasto,giorno,draft,draft.ricettaId);
    }
    draft.ricettaId=r?r.id:null;
  }else if(tipo==='speciale'){"""
if old not in s:
    raise SystemExit('refresh unico/sfiziosa non trovato')
s=s.replace(old,new,1)

s=s.replace('<script src="motor-v10.js?v=7"></script>','<script src="motor-v10.js?v=8"></script>',1)
p.write_text(s,encoding='utf-8')

# ----- motor-v10: completa solo ciò che manca e poi costruisce una ricetta runtime -----
p=Path('motor-v10.js')
s=p.read_text(encoding='utf-8')
anchor="""async function motoreV10ComponiUnicoDaDraft(draft,varianti){
"""
helper="""/* v41 — prima della realizzazione culinaria completa SOLO le componenti
   ancora libere. Non tocca mai una scelta già presente nel draft. Serve a evitare
   il falso esito \"nessun piatto compatibile\" quando il DB possiede i moduli ma
   non una ricetta unica nominale. */
async function motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft){
  if(!draft)return draft;
  const preferenze=typeof caricaPreferenzeMotoreDaSet==='function'?await caricaPreferenzeMotoreDaSet(0):{};
  const stato=typeof creaStatoMotoreSettimana==='function'?await creaStatoMotoreSettimana():null;
  if(!draft.primoCereale && stato && typeof scegliCarboidratoMotore==='function'){
    draft.primoCereale=await scegliCarboidratoMotore(stato,false);
  }
  if(!draft.proteinaId && stato && typeof scegliProteinaModulareMotore==='function'){
    const categoria=draft.categoriaLarga||null;
    const sottotipo=draft.sottotipoProposto||(categoria&&typeof risolviSottotipoFine==='function'?risolviSottotipoFine(categoria,{}):null);
    if(sottotipo){
      const prot=await scegliProteinaModulareMotore(sottotipo,stato,null);
      if(prot){
        draft.proteinaId=prot.id;
        draft.sottotipoProposto=prot.gruppoProteico||sottotipo;
        if(!draft.cottura)draft.cottura=scegliCotturaStandard(prot.gruppoProteico,prot.nome);
      }
    }
  }
  if(!draft.contornoId && stato && typeof scegliContornoMotore==='function'){
    const prefSlot=Object.assign({},preferenze,{_pastoCorrente:pasto});
    const cont=await scegliContornoMotore(giorno,stato,prefSlot,null);
    if(cont)draft.contornoId=cont.id;
  }
  return draft;
}
window.motoreV10CompletaDraftPerRealizzazione=motoreV10CompletaDraftPerRealizzazione;

"""
if 'async function motoreV10CompletaDraftPerRealizzazione' not in s:
    if anchor not in s: raise SystemExit('anchor composizione v10 non trovato')
    s=s.replace(anchor,helper+anchor,1)

# Prima di registrare una vera lacuna, tenta un'ultima volta di completare i vuoti
# e creare la composizione runtime. La ricetta generata viene salvata nello store ricette.
old="""  // Nessun record unico utile: prova la composizione funzionale già definita dai layer.
  const composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  if(typeof registraRichiestaRicettaReview==='function')await registraRichiestaRicettaReview({"""
new="""  // Nessun record unico utile: prova la composizione funzionale già definita dai layer.
  let composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  // Se mancava soltanto una componente libera, completala senza toccare quelle già
  // scelte dall'utente e riprova. motoreV10UpsertComposta aggiunge la nuova
  // realizzazione allo store ricette, evitando un vicolo cieco nella UI.
  await motoreV10CompletaDraftPerRealizzazione(pasto,giorno,draft);
  composta=await motoreV10ComponiUnicoDaDraft(draft,varianti);
  if(composta)return composta;
  if(typeof registraRichiestaRicettaReview==='function')await registraRichiestaRicettaReview({"""
if old not in s:
    raise SystemExit('fallback review v10 non trovato')
s=s.replace(old,new,1)
s=s.replace("window.MOTORE_V10_REGOLE={versione:'1.2'","window.MOTORE_V10_REGOLE={versione:'1.3'",1)
p.write_text(s,encoding='utf-8')

# ----- regole permanenti -----
p=Path('MOTORE-REGOLE.md')
s=p.read_text(encoding='utf-8')
extra="""

## Libertà manuale dentro la macrocategoria (v41)

- Il rigore di quote, tetti, rotazione e distribuzione appartiene alla **generazione automatica del motore**.
- L'utente non è vincolato alle quote specifiche quando modifica manualmente un pasto già proposto.
- Dentro la stessa funzione nutrizionale il cambio è libero: riso/farro/pasta/cous cous/pane ecc. restano **carboidrati**; un pesce può essere sostituito con un altro pesce; una carne con un'altra carne.
- Il motore non può invece usare questa libertà per aggirare Set, Bibbia, HARD, esclusioni o rotazione durante la generazione automatica.
- Per `unico` e `sfiziosa`, prima di dichiarare una lacuna il sistema deve: cercare record compatibili, provare la compatibilità per macro, completare le sole componenti libere e costruire una composizione runtime. Se anche questa catena fallisce, la combinazione va registrata per Review e il DB va rinforzato.
"""
if '## Libertà manuale dentro la macrocategoria (v41)' not in s:s+=extra
p.write_text(s,encoding='utf-8')

print('v41 applied')
