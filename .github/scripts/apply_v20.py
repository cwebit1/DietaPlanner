from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

old=""".set-carb-celle button{width:24px!important;height:24px!important;min-width:24px;padding:0!important;}
#setTabellaGiorno .riga-label{text-align:left;padding-right:4px;}
#setTabellaGiorno td.cella button{min-height:28px!important;min-width:28px!important;padding:4px;}"""
new=""".set-carb-celle button{width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;padding:0!important;border-color:#4b5540!important;}
#setTabellaGiorno .riga-label{text-align:left;padding-right:4px;}
#setTabellaGiorno td.cella{text-align:center;}
#setTabellaGiorno td.cella button{width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;padding:0!important;border-color:#4b5540!important;}"""

if old not in s:
    raise SystemExit('CSS target not found; no changes applied')

s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('v20: table selector borders lightened and protein selectors made exactly 24x24 like carbohydrate selectors')
