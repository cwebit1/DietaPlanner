from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
anchor='/* v22: quadratini tabella Proteine identici ai quadratini Carboidrati */'
css='''/* v23: bordo visivo identico per i quadratini delle due tabelle */
.set-carb-celle button,
#setTabellaGiorno td.cella button{
  border-color:#56604b!important;
}
/* Il limite proteico puo attenuare il riempimento, ma non deve cambiare il bordo. */
#setTabellaGiorno td.cella button.al-tetto,
#setTabellaGiorno td.cella button:disabled{
  opacity:1!important;
}
#setTabellaGiorno td.cella button.al-tetto:not(.active),
#setTabellaGiorno td.cella button:disabled:not(.active){
  background:var(--panel-2)!important;
}
'''
if css.strip() not in s:
    if anchor not in s: raise SystemExit('anchor not found')
    s=s.replace(anchor,css+anchor,1)
p.write_text(s,encoding='utf-8')
print('v23 border corrected')
