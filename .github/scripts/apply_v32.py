from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="""  // Griglia giorni Lun-Dom, stessa struttura tabella-giorno della configurazione Set
  const rigaIntestazioneCol = NOMI_GIORNI_BREVI.map(g=>`<th style=\"writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;padding:4px 2px;min-width:26px;text-align:center;\">${g}</th>`).join('');
  const celleCol = NOMI_GIORNI_BREVI.map((g, idx)=>{
    const attivo = giorniAttivi.includes(idx);
    return `<td class=\"cella\"><button data-set-colpref-giorno=\"${idx}\" class=\"${attivo?'active':''}\"></button></td>`;
  }).join('');"""
new="""  // Griglia giorni Lun-Dom, stessa struttura tabella-giorno della configurazione Set
  const giorniColazione=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const rigaIntestazioneCol = giorniColazione.map(g=>`<th style=\"writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;padding:4px 2px;min-width:26px;text-align:center;\">${g}</th>`).join('');
  const celleCol = giorniColazione.map((g, idx)=>{
    const attivo = giorniAttivi.includes(idx);
    return `<td class=\"cella\"><button data-set-colpref-giorno=\"${idx}\" class=\"${attivo?'active':''}\"></button></td>`;
  }).join('');"""
if old not in s:
    raise SystemExit('Breakfast day grid target not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('v32: fixed breakfast settings render stop caused by undefined NOMI_GIORNI_BREVI')
