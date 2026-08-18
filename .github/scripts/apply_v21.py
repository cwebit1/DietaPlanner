from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

marker=".setting-swipe{display:flex;gap:6px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:6px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;}"
css="""/* v21: stile unico per tutti i selettori testuali del Setting */
.setting-swipe button,
.colazione-gruppo-slide button,
.tabgroup button,
.tabgroup-sei button,
#setTempoMenu button{
  background:var(--panel-2)!important;
  border:1px solid #4b5540!important;
  color:var(--text-dim)!important;
  padding:6px 10px!important;
  border-radius:8px!important;
  font-size:0.75rem!important;
  line-height:1.2!important;
  font-family:inherit!important;
  cursor:pointer;
  white-space:nowrap;
}
.setting-swipe button.active,
.colazione-gruppo-slide button.active,
.tabgroup button.active,
.tabgroup-sei button.active,
#setTempoMenu button.active{
  background:var(--accent-dim)!important;
  color:var(--accent)!important;
  border-color:var(--accent)!important;
  font-weight:700;
}
"""
if css.strip() not in s:
    if marker not in s:
        raise SystemExit('selector CSS anchor not found')
    s=s.replace(marker,css+marker,1)

p.write_text(s,encoding='utf-8')
print('v21: unified all textual Setting selectors')
# trigger v21
