from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
anchor='/* v21: stile unico per tutti i selettori testuali del Setting */'
css='''/* v22: quadratini tabella Proteine identici ai quadratini Carboidrati */
.set-carb-celle button,
#setTabellaGiorno td.cella button{
  box-sizing:border-box!important;
  width:24px!important;
  height:24px!important;
  min-width:24px!important;
  max-width:24px!important;
  min-height:24px!important;
  max-height:24px!important;
  padding:0!important;
  margin:0!important;
  border:1px solid #4b5540!important;
  border-radius:6px!important;
  background:var(--panel-2)!important;
}
.set-carb-celle button.active,
#setTabellaGiorno td.cella button.active{
  background:var(--accent)!important;
  border-color:var(--accent)!important;
}
'''
if css.strip() not in s:
    if anchor not in s: raise SystemExit('CSS anchor not found')
    s=s.replace(anchor,css+anchor,1)
p.write_text(s,encoding='utf-8')
print('v22 applied')
