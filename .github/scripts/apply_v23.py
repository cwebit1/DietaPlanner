from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
anchor='/* v22: quadratini tabella Proteine identici ai quadratini Carboidrati */'
css='''/* v23: stesso bordo per i quadratini delle due tabelle */
.set-carb-celle button,
#setTabellaGiorno td.cella button{
  border:1px solid #56604b!important;
}
'''
if css.strip() not in s:
    if anchor not in s: raise SystemExit('anchor not found')
    s=s.replace(anchor,css+anchor,1)
p.write_text(s,encoding='utf-8')
print('v23 border corrected')
# trigger v23
