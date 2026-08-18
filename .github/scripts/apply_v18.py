from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

old_swipe='.setting-swipe button{flex:0 0 auto;scroll-snap-align:start;white-space:nowrap;}'
new_swipe='''.setting-swipe button{\n  flex:0 0 auto;scroll-snap-align:start;white-space:nowrap;\n  background:var(--panel-2);border:1px solid var(--border);color:var(--text-dim);\n  padding:6px 10px;border-radius:8px;font-size:0.75rem;cursor:pointer;\n}\n.setting-swipe button.active{background:var(--accent-dim);color:var(--accent);border-color:var(--accent);}'''
if old_swipe not in s:
    raise SystemExit('setting-swipe button block not found')
s=s.replace(old_swipe,new_swipe,1)

old_tempo='#setTempoMenu button{flex:1 1 0;min-width:0;padding:6px 4px;white-space:nowrap;}'
new_tempo='#setTempoMenu button{flex:0 0 auto;min-width:0;padding:6px 8px;white-space:nowrap;}'
if old_tempo not in s:
    raise SystemExit('setTempoMenu button block not found')
s=s.replace(old_tempo,new_tempo,1)

p.write_text(s,encoding='utf-8')
print('v18 corrections applied')
