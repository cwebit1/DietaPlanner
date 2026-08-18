from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

old='<div id="setVerdure"><div class="card"><h3 style="margin-bottom:10px;">🥬 Impostazioni Verdure</h3><div id="setVerdurePreferite" style="margin-bottom:16px;"><div class="zona-header">Verdure da favorire</div><div class="meta" style="margin-bottom:8px;">Seleziona una o più verdure stagionali da favorire nella generazione.</div><div class="setting-swipe" id="setVerdurePreferiteLista"></div><div id="setVerdurePreferiteNota" class="meta" style="margin-top:8px;"></div></div><div class="zona-header">Disponibilità verdure</div><div class="meta" style="margin-bottom:10px;">Tocca per attivare/disattivare. Le verdure disattivate non vengono proposte.</div><div id="setVerdureLista"></div><div id="setVerdureRicorrenti" style="margin-top:16px;"><div class="zona-header">Verdure ricorrenti</div><div class="meta" style="margin-bottom:8px;">Una verdura che vuoi ritrovare spesso nel menù.</div><div class="setting-swipe" id="setVerduraRicorrenteScelta"></div><div class="meta" id="setVerduraRicorrenteNota" style="margin-top:8px;"></div></div></div></div>'
new='<div id="setVerdure"><div class="card"><h3 style="margin-bottom:10px;">🥬 Impostazioni Verdure</h3><div id="setVerdurePreferite" style="margin-bottom:16px;"><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #2ecc71;color:#2ecc71;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Verdure da favorire</span></div><div class="meta" style="margin-bottom:8px;">Seleziona una o più verdure stagionali da favorire nella generazione.</div><div class="setting-swipe" id="setVerdurePreferiteLista"></div><div id="setVerdurePreferiteNota" class="meta" style="margin-top:8px;"></div></div><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #f1c40f;color:#f1c40f;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Disponibilità verdure</span></div><div class="meta" style="margin-bottom:10px;">Tocca per attivare/disattivare. Le verdure disattivate non vengono proposte.</div><div id="setVerdureLista"></div><div id="setVerdureRicorrenti" style="margin-top:16px;"><div style="margin:12px 0 9px;"><span style="display:inline-block;border:1px solid #2ecc71;color:#2ecc71;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">Verdure ricorrenti</span></div><div class="meta" style="margin-bottom:8px;">Una verdura che vuoi ritrovare spesso nel menù.</div><div class="setting-swipe" id="setVerduraRicorrenteScelta"></div><div class="meta" id="setVerduraRicorrenteNota" style="margin-top:8px;"></div></div></div></div>'
if old not in s:
    raise SystemExit('vegetable settings HTML block not found')
s=s.replace(old,new,1)

old_note="""  if(nota){
    const vScelta = attiva ? verdure.find(v=>v.id===attiva) : null;
    nota.textContent = vScelta
      ? '✓ '+vScelta.nome+' verrà proposta come contorno ricorrente.'
      : 'Nessuna verdura ricorrente selezionata.';
  }
}"""
new_note="""  if(nota){
    const vScelta = attiva ? verdure.find(v=>v.id===attiva) : null;
    nota.textContent = vScelta
      ? '✓ '+vScelta.nome+' verrà proposta come contorno ricorrente.'
      : 'Nessuna verdura ricorrente selezionata.';
    if(vScelta){
      nota.style.border='1px solid #2ecc71';
      nota.style.background='rgba(46,204,113,0.35)';
      nota.style.borderRadius='8px';
      nota.style.padding='8px 10px';
      nota.style.color='var(--text)';
    }else{
      nota.style.border='none';
      nota.style.background='transparent';
      nota.style.borderRadius='0';
      nota.style.padding='0';
      nota.style.color='';
    }
  }
}"""
if old_note not in s:
    raise SystemExit('recurring vegetable note block not found')
s=s.replace(old_note,new_note,1)

p.write_text(s,encoding='utf-8')
print('v25 vegetable section titles and recurring selection note styling applied')
# trigger v25
