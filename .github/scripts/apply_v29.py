from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

old="""const gruppi=[['fresco','Freschi'],['fresco_duraturo','Freschi duraturi'],['confezionato','Confezionati'],['surgelato','Surgelati']];let html='';for(const [cat,label] of gruppi){const items=verdure.filter(v=>tierDisponibilitaVerdura(v)===cat).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));if(!items.length)continue;html+=`<div class=\"zona-header\" style=\"margin-top:14px;\">${label}</div><div class=\"setting-swipe\">`;"""
new="""const gruppi=[['fresco','Freschi','#2ecc71'],['fresco_duraturo','Freschi duraturi','#f1c40f'],['confezionato','In scatola','#f39c12'],['surgelato','Surgelati','#54bfe8']];let html='';for(const [cat,label,colore] of gruppi){const items=verdure.filter(v=>tierDisponibilitaVerdura(v)===cat).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));if(!items.length)continue;html+=`<div style=\"margin-top:14px;margin-bottom:8px;display:flex;align-items:center;gap:7px;color:var(--text);font-size:.78rem;font-weight:600;\"><span style=\"width:10px;height:10px;border-radius:50%;background:${colore};display:inline-block;flex:0 0 10px;\"></span><span>${label}</span></div><div class=\"setting-swipe\">`;"""
if old not in s:
    raise SystemExit('availability group header block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('v29 availability vegetable group headers changed to colored dots with plain text')
# v29 ready
