from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
marker="""function nomeOpzioneColazione(gr, id, varianti){
  if(!id) return null;
  if(gr.chiave==='bibita') return id==='te' ? 'Tè' : null;
  const v=(varianti||[]).find(x=>x.id===id);
  return v ? v.nome : null;
}
"""
insert=r'''

/* Colazioni automatiche coerenti: il motore sceglie una combinazione completa,
   mai elementi indipendenti pescati a caso. Massimo 3 categorie nutrizionali. */
const COLAZIONI_AUTOMATICHE_COHERENTI = [
  {nome:'Latte e biscotti', proteine:'Latte parzialmente scremato', carboidrati:'Biscotti secchi'},
  {nome:'Latte e cereali', proteine:'Latte parzialmente scremato', carboidrati:'Cereali da colazione'},
  {nome:'Latte, fette biscottate e marmellata', proteine:'Latte parzialmente scremato', carboidrati:'Fette biscottate', carboidrati_semplici:'Marmellata'},
  {nome:'Latte, fette biscottate e miele', proteine:'Latte parzialmente scremato', carboidrati:'Fette biscottate', carboidrati_semplici:'Miele'},
  {nome:'Latte, pane integrale e marmellata', proteine:'Latte parzialmente scremato', carboidrati:'Pane integrale', carboidrati_semplici:'Marmellata'},
  {nome:'Latte, pane integrale e miele', proteine:'Latte parzialmente scremato', carboidrati:'Pane integrale', carboidrati_semplici:'Miele'},
  {nome:'Yogurt e cereali', proteine:'Yogurt bianco', carboidrati:'Cereali da colazione'},
  {nome:'Yogurt, cereali e frutta secca', proteine:'Yogurt bianco', carboidrati:'Cereali da colazione', grassi:'Noci e mandorle'},
  {nome:'Yogurt con frutta secca', proteine:'Yogurt bianco', grassi:'Noci e mandorle'},
  {nome:'Yogurt con cioccolato fondente', proteine:'Yogurt bianco', grassi:'Cioccolato fondente'},
  {nome:'Yogurt, cereali e miele', proteine:'Yogurt bianco', carboidrati:'Cereali da colazione', carboidrati_semplici:'Miele'},
  {nome:'Pane fresco e marmellata', carboidrati:'Pane fresco', carboidrati_semplici:'Marmellata'},
  {nome:'Pane integrale e marmellata', carboidrati:'Pane integrale', carboidrati_semplici:'Marmellata'},
  {nome:'Fette biscottate e marmellata', carboidrati:'Fette biscottate', carboidrati_semplici:'Marmellata'},
  {nome:'Pane fresco e miele', carboidrati:'Pane fresco', carboidrati_semplici:'Miele'},
  {nome:'Pane integrale e miele', carboidrati:'Pane integrale', carboidrati_semplici:'Miele'},
  {nome:'Fette biscottate e miele', carboidrati:'Fette biscottate', carboidrati_semplici:'Miele'},
  {nome:'Pane fresco e cioccolato', carboidrati:'Pane fresco', grassi:'Cioccolato fondente'},
  {nome:'Pane integrale e cioccolato', carboidrati:'Pane integrale', grassi:'Cioccolato fondente'},
  {nome:'Pane fresco, burro e marmellata', carboidrati:'Pane fresco', grassi:'Burro', carboidrati_semplici:'Marmellata'},
  {nome:'Pane integrale, burro e marmellata', carboidrati:'Pane integrale', grassi:'Burro', carboidrati_semplici:'Marmellata'},
  {nome:'Fette biscottate, burro e marmellata', carboidrati:'Fette biscottate', grassi:'Burro', carboidrati_semplici:'Marmellata'},
  {nome:'Uova e pane fresco', proteine:'Uova', carboidrati:'Pane fresco'},
  {nome:'Uova e pane integrale', proteine:'Uova', carboidrati:'Pane integrale'},
  {nome:'Uova, pane fresco e avocado', proteine:'Uova', carboidrati:'Pane fresco', grassi:'Avocado'},
  {nome:'Uova, pane integrale e avocado', proteine:'Uova', carboidrati:'Pane integrale', grassi:'Avocado'}
];
function firmaComponentiColazione(componenti){
  return COLAZIONE_GRUPPI.map(g=>(componenti&&componenti[g.chiave])||'').join('|');
}
function componentiColazioneDaSet(prefValore, varianti){
  const componenti={};
  for(const gr of COLAZIONE_GRUPPI){
    const id=prefValore ? prefValore[gr.chiave] : null;
    componenti[gr.chiave]=opzioneColazioneValida(gr,id,varianti) ? id : null;
  }
  return componenti;
}
function componentiDaSchemaColazione(schema, varianti){
  const componenti={};
  for(const gr of COLAZIONE_GRUPPI) componenti[gr.chiave]=null;
  for(const chiave of ['proteine','carboidrati','grassi','carboidrati_semplici']){
    const nome=schema[chiave];
    if(!nome) continue;
    const v=(varianti||[]).find(x=>x.nome&&x.nome.toLowerCase()===nome.toLowerCase() && x.colazioneGruppo===chiave);
    if(!v) return null;
    componenti[chiave]=v.id;
  }
  componenti.bibita=null;
  return componenti;
}
function scegliColazioneAutomaticaCoerente(varianti, firmeDaEvitare){
  const escluse=new Set((firmeDaEvitare||[]).filter(Boolean));
  let pool=COLAZIONI_AUTOMATICHE_COHERENTI.map(schema=>({schema,componenti:componentiDaSchemaColazione(schema,varianti)})).filter(x=>x.componenti);
  const filtrato=pool.filter(x=>!escluse.has(firmaComponentiColazione(x.componenti)));
  if(filtrato.length) pool=filtrato;
  if(!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)].componenti;
}
'''
if 'COLAZIONI_AUTOMATICHE_COHERENTI' not in s:
    if marker not in s: raise SystemExit('helper marker non trovato')
    s=s.replace(marker,marker+insert,1)
start=s.find("      const usaColazionePref = giorniColazionePref.length > 0 && giorniColazionePref.includes(indiceGiornoColazione);")
if start>=0:
    end=s.find("      await put('piano', {id:pianoIdColazione, componenti});",start)
    if end<0: raise SystemExit('legacy end non trovato')
    end += len("      await put('piano', {id:pianoIdColazione, componenti});")
    new=r'''      const giorniPrefNormalizzati=(giorniColazionePref||[]).map(Number);
      const usaColazionePref = !!(colazionePref&&colazionePref.valore) && (giorniPrefNormalizzati.length>=7 || giorniPrefNormalizzati.includes(indiceGiornoColazione));
      let componenti;
      if(usaColazionePref){
        componenti=componentiColazioneDaSet(colazionePref.valore,varianti);
      }else{
        const firmaPref=colazionePref&&colazionePref.valore?firmaComponentiColazione(componentiColazioneDaSet(colazionePref.valore,varianti)):null;
        componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref]);
      }
      if(componenti) await put('piano', {id:pianoIdColazione, componenti});'''
    s=s[:start]+new+s[end:]
p.write_text(s,encoding='utf-8')

p=Path('motor-v9-3.js')
m=p.read_text(encoding='utf-8')
start=m.find("        const idx=giorni.indexOf(g);\n        const usa=giorniPref.includes(idx);")
if start<0: raise SystemExit('motor start non trovato')
end=m.find("        await put('piano',{id:idCol,componenti});",start)
if end<0: raise SystemExit('motor end non trovato')
end += len("        await put('piano',{id:idCol,componenti});")
newm=r'''        const idx=giorni.indexOf(g);
        const giorniPrefNormalizzati=(giorniPref||[]).map(Number);
        const usa=!!(pref&&pref.valore) && (giorniPrefNormalizzati.length>=7 || giorniPrefNormalizzati.includes(idx));
        let componenti;
        if(usa){
          componenti=componentiColazioneDaSet(pref.valore,varianti);
        }else{
          const firmaPref=pref&&pref.valore?firmaComponentiColazione(componentiColazioneDaSet(pref.valore,varianti)):null;
          componenti=scegliColazioneAutomaticaCoerente(varianti,[firmaPref]);
        }
        if(componenti) await put('piano',{id:idCol,componenti});'''
m=m[:start]+newm+m[end:]
p.write_text(m,encoding='utf-8')
print('v15 coherent breakfast matrix applied')
# trigger