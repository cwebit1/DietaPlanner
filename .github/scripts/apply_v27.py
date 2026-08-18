from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# Disponibilità verdure: disponibile = verde, disattivata = rosso.
old="""for(const v of items){const off=disattivate.has(v.id);html+=`<button data-verdura-toggle=\"${v.id}\" class=\"${off?'':'active'}\">${v.nome}</button>`;}"""
new="""for(const v of items){const off=disattivate.has(v.id);html+=`<button data-verdura-toggle=\"${v.id}\" class=\"${off?'inactive-red':'active'}\">${v.nome}</button>`;}"""
if old not in s:
    raise SystemExit('vegetable availability selector block not found')
s=s.replace(old,new,1)

anchor=""".setting-swipe button.active{background:var(--accent-dim);color:var(--accent);border-color:var(--accent);}"""
css="""
.setting-swipe button.inactive-red{
  background:rgba(231,76,60,0.18)!important;
  color:#e74c3c!important;
  border-color:#e74c3c!important;
  font-weight:700;
}
"""
if css.strip() not in s:
    if anchor not in s:
        raise SystemExit('setting swipe CSS anchor not found')
    s=s.replace(anchor,anchor+css,1)

p.write_text(s,encoding='utf-8')
print('v27: disabled vegetable availability selectors shown in red')
# trigger v27
