from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# 1) Carboidrati: la v24 aveva perso la classe active; il CSS v21/v22 usa
# proprio .active per mostrare visivamente la selezione.
old='''        html+=`<button data-casella-carb="${tipo.chiave}" data-casella-idx="${i}"
          style="cursor:${cliccabile?'pointer':'not-allowed'};opacity:${cliccabile?'1':'0.35'};transition:background .15s,border-color .15s;"
          ${cliccabile?'':'disabled'}></button>`;'''
new='''        html+=`<button data-casella-carb="${tipo.chiave}" data-casella-idx="${i}" class="${attiva?'active':''}"
          style="cursor:${cliccabile?'pointer':'not-allowed'};opacity:${cliccabile?'1':'0.35'};transition:background .15s,border-color .15s;"
          ${cliccabile?'':'disabled'}></button>`;'''
if old not in s:
    raise SystemExit('carbohydrate selector block not found')
s=s.replace(old,new,1)

# 2) Disponibilita verdure: il vecchio stato era espresso solo da background/color
# inline, ma lo stile unico v21 li sovrascrive con !important. Usiamo la stessa
# classe active degli altri selettori: active = verdura disponibile.
old2='''for(const v of items){const off=disattivate.has(v.id);html+=`<button data-verdura-toggle="${v.id}" style="background:${off?'var(--panel-2)':'var(--accent-dim)'};color:${off?'var(--text-dim)':'var(--accent)'};border:1px solid var(--border);border-radius:20px;padding:6px 12px;font-size:.8rem;cursor:pointer;">${v.nome}</button>`;}'''
new2='''for(const v of items){const off=disattivate.has(v.id);html+=`<button data-verdura-toggle="${v.id}" class="${off?'':'active'}">${v.nome}</button>`;}'''
if old2 not in s:
    raise SystemExit('vegetable availability selector block not found')
s=s.replace(old2,new2,1)

p.write_text(s,encoding='utf-8')
print('v26: restored active-state rendering for carbohydrate and vegetable availability selectors')
