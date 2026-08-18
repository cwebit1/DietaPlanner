from pathlib import Path
import re, subprocess, sys

root=Path('.')
idx=root/'index.html'
mot=root/'motor-v9-3.js'

s=idx.read_text(encoding='utf-8')

old="""const COLAZIONE_GRUPPI = [
  {chiave:'carboidrati', label:'Carboidrati', obbligatorio:true},
  {chiave:'proteine', label:'Proteine', obbligatorio:true},
  {chiave:'grassi', label:'Grassi', obbligatorio:false},
  {chiave:'carboidrati_semplici', label:'Carboidrati semplici', obbligatorio:false}
];"""

new="""const COLAZIONE_GRUPPI = [
  {chiave:'proteine', label:'Proteine', obbligatorio:true, consentiNessuno:true},
  {chiave:'bibita', label:'Bibita', obbligatorio:false, consentiNessuno:true, senzaNutrizione:true},
  {chiave:'carboidrati', label:'Carboidrati', obbligatorio:true, consentiNessuno:true},
  {chiave:'grassi', label:'Grassi', obbligatorio:false, consentiNessuno:true},
  {chiave:'carboidrati_semplici', label:'Carboidrati semplici', obbligatorio:false, consentiNessuno:true}
];

function opzioniColazioneGruppo(gr, varianti){
  if(gr.chiave==='bibita') return [{id:'te', nome:'Tè'}];
  return (varianti||[]).filter(v=>v.colazioneGruppo===gr.chiave).sort((a,b)=>a.nome.localeCompare(b.nome));
}
function opzioneColazioneValida(gr, id, varianti){
  if(!id) return false;
  if(gr.chiave==='bibita') return id==='te';
  return (varianti||[]).some(v=>v.id===id && v.colazioneGruppo===gr.chiave);
}
function nomeOpzioneColazione(gr, id, varianti){
  if(!id) return null;
  if(gr.chiave==='bibita') return id==='te' ? 'Tè' : null;
  const v=(varianti||[]).find(x=>x.id===id);
  return v ? v.nome : null;
}"""

if old not in s:
    raise SystemExit('COLAZIONE_GRUPPI atteso non trovato; patch interrotta')
s=s.replace(old,new,1)

s=s.replace("varianti.filter(v=>v.colazioneGruppo===g.chiave).sort((a,b)=>a.nome.localeCompare(b.nome))","opzioniColazioneGruppo(g, varianti)")
s=s.replace("varianti.filter(v=>v.colazioneGruppo===gr.chiave).sort((a,b)=>a.nome.localeCompare(b.nome))","opzioniColazioneGruppo(gr, varianti)")
s=s.replace("varianti.filter(v=>v.colazioneGruppo===gr.chiave)","opzioniColazioneGruppo(gr, varianti)")

s=s.replace('${gr.obbligatorio ? \'\' : `<button data-set-col-opt="" class="${!selezionatoId?\'active\':\'\'}">— nessuno —</button>`}','${gr.consentiNessuno ? `<button data-set-col-opt="" class="${!selezionatoId?\'active\':\'\'}">— nessuno —</button>` : \'\'}')
s=s.replace('${g.obbligatorio?\'\':`<button data-col-opt="" class="${!selezionatoId?\'active\':\'\'}">— nessuno —</button>`}','${g.consentiNessuno?`<button data-col-opt="" class="${!selezionatoId?\'active\':\'\'}">— nessuno —</button>`:\'\'}')
s=s.replace('${g.obbligatorio ? \'\' : `<button data-editor-col-opt="" class="active">— nessuno —</button>`}','${g.consentiNessuno ? `<button data-editor-col-opt="" class="active">— nessuno —</button>` : \'\'}')

s=s.replace("const variantePrefValida = idPref && varianti.some(v=>v.id===idPref);","const variantePrefValida = opzioneColazioneValida(gr, idPref, varianti);")

needle="""  let kcal=0, prot=0, carb=0, grassi=0;
  for(const chiave of Object.keys(componenti||{})){
    const id = componenti[chiave];"""
repl="""  let kcal=0, prot=0, carb=0, grassi=0;
  for(const chiave of Object.keys(componenti||{})){
    if(chiave==='bibita') continue; // scelta descrittiva: nessun apporto nutrizionale
    const id = componenti[chiave];"""
if needle not in s:
    raise SystemExit('Blocco nutrizioneColazione non trovato')
s=s.replace(needle,repl,1)

old_desc="""  const nomi=COLAZIONE_GRUPPI
    .map(g=>componenti&&componenti[g.chiave] ? varianti.find(v=>v.id===componenti[g.chiave]) : null)
    .filter(Boolean).map(v=>v.nome);
  return fraseColazioneDaNomi(nomi);"""
new_desc="""  const nomi=COLAZIONE_GRUPPI
    .map(g=>componenti ? nomeOpzioneColazione(g, componenti[g.chiave], varianti) : null)
    .filter(Boolean);
  return fraseColazioneDaNomi(nomi);"""
if old_desc not in s:
    raise SystemExit('Descrizione colazione attesa non trovata')
s=s.replace(old_desc,new_desc,1)

old_detail="""  for(const g of COLAZIONE_GRUPPI){
    const id = componenti[g.chiave];
    if(!id) continue;
    const v = varianti.find(x=>x.id===id);
    if(v) righe += `<li>${g.label}: ${v.nome} — ${formattaQuantita(v, v.porzioneColazione||0)}</li>`;
  }"""
new_detail="""  for(const g of COLAZIONE_GRUPPI){
    const id = componenti&&componenti[g.chiave];
    if(!id) continue;
    if(g.chiave==='bibita'){
      if(id==='te') righe += `<li>${g.label}: Tè</li>`;
      continue;
    }
    const v = varianti.find(x=>x.id===id);
    if(v) righe += `<li>${g.label}: ${v.nome} — ${formattaQuantita(v, v.porzioneColazione||0)}</li>`;
  }"""
if old_detail not in s:
    raise SystemExit('Dettaglio colazione atteso non trovato')
s=s.replace(old_detail,new_detail,1)

old_week="""    const nomi = COLAZIONE_GRUPPI.map(gr=>{
      const id = voce.componenti[gr.chiave];
      if(!id) return null;
      const v = varianti.find(x=>x.id===id);
      return v ? v.nome : null;
    }).filter(Boolean);
    return nomi.length ? prefisso + nomi.join(' · ') : testoVuoto;"""
new_week="""    const descrizione = await descrizioneColazione(voce.componenti, null, varianti);
    return descrizione && descrizione!=='Colazione da configurare' ? prefisso + descrizione : testoVuoto;"""
if old_week in s:
    s=s.replace(old_week,new_week,1)

idx.write_text(s,encoding='utf-8')

m=mot.read_text(encoding='utf-8')
old_m="""          let opz=varianti.filter(v=>v.colazioneGruppo===gr.chiave);
          if(prefId&&opz.some(v=>v.id===prefId)) componenti[gr.chiave]=prefId;"""
new_m="""          let opz=opzioniColazioneGruppo(gr,varianti);
          if(prefId&&opzioneColazioneValida(gr,prefId,varianti)) componenti[gr.chiave]=prefId;"""
if old_m not in m:
    raise SystemExit('Generatore colazione motor-v9-3 atteso non trovato')
m=m.replace(old_m,new_m,1)
mot.write_text(m,encoding='utf-8')

checks=[
    ('bibita gruppo', "chiave:'bibita'" in s),
    ('ordine proteine prima', s.index("chiave:'proteine'") < s.index("chiave:'carboidrati'")),
    ('nessuno proteine/carb', 'consentiNessuno:true' in s),
    ('bibita fuori nutrizione', "if(chiave==='bibita') continue" in s),
    ('helper tè', "return [{id:'te', nome:'Tè'}]" in s),
]
for nome,ok in checks:
    if not ok: raise SystemExit('CHECK FAIL: '+nome)

scripts=re.findall(r'<script(?:\\s[^>]*)?>(.*?)</script>',s,flags=re.S|re.I)
tmp=Path('/tmp/dietaplanner_v13_check'); tmp.mkdir(exist_ok=True)
for i,code in enumerate(scripts):
    f=tmp/f'inline_{i}.js'; f.write_text(code,encoding='utf-8')
    cp=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    if cp.returncode:
        print(cp.stderr); raise SystemExit(f'Syntax error inline {i}')
for name in ['motor-v9-1.js','motor-v9-2.js','motor-v9-3.js','motor-v9-4.js']:
    cp=subprocess.run(['node','--check',name],capture_output=True,text=True)
    if cp.returncode:
        print(cp.stderr); raise SystemExit('Syntax error '+name)

print('PATCH_V13_OK')
