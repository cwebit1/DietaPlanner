from pathlib import Path
import base64, hashlib, re

ROOT=Path('.')
parts=[]
for p in sorted((ROOT/'.github/motor_upload').glob('chunk*.b64')):
    parts.append(p.read_text(encoding='utf-8').strip())
raw=base64.b64decode(''.join(parts),validate=True)
sha=hashlib.sha256(raw).hexdigest()
EXPECTED='84a2959816de9a5f084ff13f133db59c4b9fada03b4f7991f792019dcc26de08'
if sha!=EXPECTED:
    raise SystemExit(f'motor.js hash mismatch: {sha} != {EXPECTED}')
(ROOT/'motor.js').write_bytes(raw)

p=ROOT/'index.html'
s=p.read_text(encoding='utf-8')

old_motor='''<script src="motor-v9-1.js?v=11"></script>
<script src="motor-v9-2.js?v=12"></script>
<script src="motor-v9-3.js?v=12"></script>
<script src="motor-v9-4.js?v=11"></script>
<script>
function tierVerduraMotoreV17(v){return tierDisponibilitaVerdura(v);}
function ordineVerdureGiornoV17(indice){if(indice<=2)return ['fresco','fresco_duraturo','confezionato','surgelato'];if(indice<=4)return ['fresco_duraturo','fresco','confezionato','surgelato'];return ['confezionato','surgelato','fresco_duraturo','fresco'];}
poolDelGiorno=function(i){return ordineVerdureGiornoV17(i);};
contorniAmmessiPerPool=function(contorni,mappaVarianti,pool){for(const tier of (Array.isArray(pool)?pool:[])){const out=(contorni||[]).filter(r=>(r.ingredienti||[]).some(i=>{const v=mappaVarianti[i.variantId];return v&&v.gruppoBase==='verdura'&&tierVerduraMotoreV17(v)===tier;}));if(out.length)return out;}return [];};
motoreInfoVerduraContorno=async function(r,cache){for(const ing of (r.ingredienti||[])){const v=cache.vById.get(ing.variantId);if(!v)continue;const b=cache.bById.get(v.ingredienteId);if(b&&b.gruppo==='verdura')return {variantId:v.id,nome:v.nome,tier:tierVerduraMotoreV17(v)};}return null;};
scegliContornoMotore=async function(giorno,stato,preferenze,escludiId){const ricette=await getAll('ricette'),varianti=await getAll('varianti'),ingredienti=await getAll('ingredienti');const cache={vById:new Map(varianti.map(v=>[v.id,v])),bById:new Map(ingredienti.map(b=>[b.id,b]))};const off=new Set(preferenze.verdureDisattivate||[]),prefIds=new Set(preferenze.verdurePreferiteVariantIds||[]);let candidati=[];for(const r of ricette){if(r.tipoPortata!=='modulare'||r.sottoCategoriaModulare!=='contorno'||r.esclusa||r.id===escludiId)continue;const info=await motoreInfoVerduraContorno(r,cache);if(!info||off.has(info.variantId))continue;candidati.push({r,info});}if(!candidati.length)return null;const idx=(new Date(giorno+'T00:00:00').getDay()+6)%7,ordine=ordineVerdureGiornoV17(idx);let pool=[];for(const t of ordine){pool=candidati.filter(x=>x.info.tier===t);if(pool.length)break;}if(!pool.length)pool=candidati;const preferite=pool.filter(x=>prefIds.has(x.info.variantId));if(preferite.length){const nuove=preferite.filter(x=>!stato.preferiteVerdureUsate.has(x.info.variantId));pool=nuove.length?nuove:preferite;const scelta=scegliMenoRecenteMotore(pool,x=>stato.storico.ultimoVerdura[x.info.variantId]||0,()=>0);stato.preferiteVerdureUsate.add(scelta.info.variantId);return scelta.r;}return motoreMescola(pool)[0].r;};
</script>

<script src="motor-v10.js?v=10"></script>'''
if old_motor not in s:
    raise SystemExit('ABORT: inline v17 / motore block is not exactly the expected live block')
s=s.replace(old_motor,'<script src="motor.js?v=1"></script>',1)

old_days='''  <div class="giorni-riga">
    <div class="giorni" id="selettoreGiorni"></div>
    <div class="btn-calendario" id="btnCalendarioSalto">📅</div>
  </div>

  <div id="blocColazione" class="pasto-block"></div>'''
new_days='''  <div class="giorni-riga">
    <div class="giorni" id="selettoreGiorni"></div>
    <div class="btn-calendario" id="btnCalendarioSalto">📅</div>
  </div>
  <div id="nessunPastoOggi"></div>

  <div id="blocColazione" class="pasto-block"></div>'''
if old_days not in s: raise SystemExit('days block not found')
s=s.replace(old_days,new_days,1)

anchor="""  const bottoneGiornoAttivo = selEl.querySelector('.active');
  bottoneGiornoAttivo?.scrollIntoView({inline:'center', block:'nearest'});

  await renderIndicatoreFrutta();"""
insert="""  const bottoneGiornoAttivo = selEl.querySelector('.active');
  bottoneGiornoAttivo?.scrollIntoView({inline:'center', block:'nearest'});

  // Container \"Nessun pasto programmato\": solo se il giorno selezionato è
  // vuoto E la settimana non è del tutto vuota (in quel caso c'è già il
  // banner benvenutoPrimoUtilizzo più in alto, non serve doppio messaggio).
  const pColazioneCheck = await getOne('piano', giornoSelezionato+'_colazione');
  const pPranzoCheck = await getOne('piano', giornoSelezionato+'_pranzo');
  const pCenaCheck = await getOne('piano', giornoSelezionato+'_cena');
  const giornoVuoto = !(
    (pColazioneCheck && (pColazioneCheck.componenti || pColazioneCheck.colazioneSpecialeId)) ||
    (pPranzoCheck && (pPranzoCheck.ricettaId || pPranzoCheck.primoId || pPranzoCheck.secondoId)) ||
    (pCenaCheck && (pCenaCheck.ricettaId || pCenaCheck.primoId || pCenaCheck.secondoId))
  );
  const nessunPastoEl = document.getElementById('nessunPastoOggi');
  if(esisteAlmenoUnPasto && giornoVuoto){
    nessunPastoEl.innerHTML = `<div class=\"card\" style=\"margin-bottom:12px;text-align:center;\">
      <div class=\"meta\" style=\"margin-bottom:14px;\">Nessun pasto programmato.</div>
      <button class=\"primary\" id=\"btnNessunPastoGeneraMenu\" style=\"width:100%;\">Genera menù settimanale</button>
    </div>`;
    document.getElementById('btnNessunPastoGeneraMenu').addEventListener('click', ()=>{
      mostraVista('set');
    });
  } else {
    nessunPastoEl.innerHTML = '';
  }

  await renderIndicatoreFrutta();"""
if anchor not in s: raise SystemExit('renderPiano anchor not found')
s=s.replace(anchor,insert,1)

start=s.index("  const mostraPremioCostanza = contatorePremioRender >= 5")
end=s.index("\n\n  if(!voce.componenti && !voce.colazioneSpecialeId && !colazioneScaduta){",start)
reward="""  const mostraPremioCostanza = contatorePremioRender >= 5 && !voce.colazioneSpecialeId && !voce.consumato && !colazioneScaduta && giorno === todayISO();
  if(mostraPremioCostanza){
    const tutteRicettePremio = await getAll('ricette');
    const colazioniSpecialiPremio = tutteRicettePremio
      .filter(r=>r.colazioneSpeciale && !r.esclusa)
      .sort((a,b)=>a.nome.localeCompare(b.nome));
    let htmlPremio = elementId ? '' : `<div class=\"pasto-header\">${ICONA_PASTO.colazione} Colazione</div>`;
    htmlPremio += `<div class=\"card\" style=\"border-color:var(--accent);margin-bottom:10px;\">
      <div style=\"font-weight:700;font-size:0.95rem;margin-bottom:6px;\">🎉 Complimenti! ${contatorePremioRender} colazioni regolari consecutive!</div>
      <div class=\"meta\" style=\"margin-bottom:10px;\">Ti meriti una colazione speciale. Scorri e scegli cosa fare oggi:</div>
      <div style=\"display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;\">
        <button data-premio-colazione=\"standard\" class=\"small active\" style=\"flex:0 0 auto;\">☀️ Colazione standard</button>
        ${colazioniSpecialiPremio.map(r=>`<button data-premio-colazione=\"${r.id}\" class=\"small\" style=\"flex:0 0 auto;\">🎁 ${r.nome}</button>`).join('')}
      </div>
    </div>`;
    el.innerHTML = htmlPremio;
    el.querySelectorAll('[data-premio-colazione]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const scelta = b.dataset.premioColazione;
        if(scelta !== 'standard'){
          await put('piano', {id:pianoId, colazioneSpecialeId:scelta, componenti:null, premioCostanza:true});
        }
        await put('impostazioni', {chiave:'contatoreColazioniMorigerate', valore: 0});
        delete draftColazione[pianoId];
        renderColazione(giorno, elementId);
        if(giorno===giornoSelezionato) renderNutrizioneGiorno();
      });
    });
    return;
  }"""
s=s[:start]+reward+s[end:]

# Post-patch invariants
assert s.count('<script src="motor.js?v=1"></script>')==1
assert '<script src="motor-v9-' not in s
assert '<script src="motor-v10.js' not in s
assert 'function tierVerduraMotoreV17(v)' not in s
assert 'id="nessunPastoOggi"' in s
assert 'colazioniSpecialiPremio' in s
text=raw.decode('utf-8')
assert 'if(r.gruppoProteico) continue;' in text
assert 'async function motoreV10ScegliPrimoReale' in text
assert 'async function motoreV10CarboidratoFattibile' in text
p.write_text(s,encoding='utf-8')
print('OK motor.js sha256',sha)
