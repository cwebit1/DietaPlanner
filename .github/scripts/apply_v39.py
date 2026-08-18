from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

old="""  if(tipo==='colazione' || tipo==='spuntino'){
    voce.ricettaId = ricetta.id;
  } else if(tipo==='primo' || tipo==='secondo' || tipo==='contorno'){
    voce.modo = 'multi';
    voce.fascia = voce.fascia || ricetta.fascia;
    voce.porzioni = voce.porzioni||1;
    voce[tipo+'Id'] = ricetta.id;
  } else { // unico
    voce.modo = 'unico';
    voce.fascia = ricetta.fascia;
    voce.porzioni = voce.porzioni||1;
    voce.ricettaId = ricetta.id;
    voce.primoId = voce.secondoId = voce.contornoId = null;
  }

  voce.origine = 'utente';
  voce.origine = 'utente';
  await put('piano', voce);
"""
new="""  if(tipo==='colazione' || tipo==='spuntino'){
    voce.ricettaId = ricetta.id;
    if(tipo==='colazione') voce.hardColazione = true;
  } else if(tipo==='primo' || tipo==='secondo' || tipo==='contorno'){
    // La scelta dal Ricettario è HARD solo sulla portata selezionata.
    // Se prima lo slot conteneva un piatto unico HARD, la nuova azione deliberata
    // dell'utente lo trasforma in portate e libera le componenti non scelte.
    voce.modo = 'multi';
    voce.hardPasto = false;
    voce.ricettaId = null;
    voce.colazioneSpecialeId = null;
    voce.fascia = voce.fascia || ricetta.fascia;
    voce.porzioni = voce.porzioni||1;
    voce[tipo+'Id'] = ricetta.id;
    if(tipo==='primo') voce.hardPrimo = true;
    if(tipo==='secondo') voce.hardSecondo = true;
    if(tipo==='contorno') voce.hardContorno = true;
  } else { // unico / speciale
    voce.modo = 'unico';
    voce.fascia = ricetta.fascia;
    voce.porzioni = voce.porzioni||1;
    voce.ricettaId = ricetta.id;
    voce.primoId = voce.secondoId = voce.contornoId = null;
    voce.primoCereale = null;
    voce.primoSugoId = null;
    voce.hardPasto = true;
    voce.hardPrimo = voce.hardSecondo = voce.hardContorno = false;
  }

  voce.origine = 'utente';
  await put('piano', voce);
"""
if old not in s and "voce.hardPasto = false;" not in s:
    raise SystemExit('Ricettario assignment target not found')
if old in s:
    s=s.replace(old,new,1)

# Direct manual whole-meal confirmation should carry the same explicit marker.
old2="voceCommittata.fascia=draft.fascia;voceCommittata.origine='utente';voceCommittata.viaSalvafrigo=draft.viaSalvafrigo||null;"
new2="voceCommittata.fascia=draft.fascia;voceCommittata.origine='utente';voceCommittata.hardPasto=true;voceCommittata.hardPrimo=voceCommittata.hardSecondo=voceCommittata.hardContorno=false;voceCommittata.viaSalvafrigo=draft.viaSalvafrigo||null;"
if old2 in s:s=s.replace(old2,new2,1)

# Cache bump v39: source-level hard markers are in index, force fresh HTML with query link.
p.write_text(s,encoding='utf-8')

p=Path('MOTORE-REGOLE.md')
r=p.read_text(encoding='utf-8')
extra='''\n### Marker HARD scritti alla fonte dal Ricettario (v39)\n\n- L'assegnazione dal Ricettario scrive direttamente il marker HARD nel record `piano`, senza dipendere da inferenze successive dell'interfaccia.\n- `primo`, `secondo`, `contorno` impostano rispettivamente `hardPrimo`, `hardSecondo`, `hardContorno`; le altre componenti restano completabili dal motore.\n- Assegnare una portata a uno slot che prima era un piatto unico HARD è una nuova scelta deliberata dell'utente: lo slot passa a `multi`, `hardPasto` viene rimosso e il vecchio `ricettaId` non resta come stato fantasma.\n- Assegnare un piatto unico/speciale imposta `hardPasto` e azzera i marker granulari.\n- Una colazione assegnata dal Ricettario imposta `hardColazione`.\n- Il wrapper v34 resta solo come compatibilità con record/percorsi precedenti, non è più l'unica fonte dei marker.\n'''
if '### Marker HARD scritti alla fonte dal Ricettario (v39)' not in r:r+=extra
p.write_text(r,encoding='utf-8')
print('v39 applied')
